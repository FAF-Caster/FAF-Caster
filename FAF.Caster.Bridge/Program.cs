using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using System.Threading.Channels;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5077");
builder.Services.AddSingleton<TelemetryStore>();
builder.Services.AddHostedService<LogTailService>();
var app = builder.Build();
app.UseWebSockets();
// Serve a built React dashboard on the same loopback origin as the Bridge.
// In development Vite continues to proxy /local-api and /local-ws.
var dashboardPath = builder.Configuration["dashboard"];
if (string.IsNullOrWhiteSpace(dashboardPath))
    dashboardPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "FAF.Caster.dashboard", "dist"));
else
    dashboardPath = Path.GetFullPath(dashboardPath);
if (Directory.Exists(dashboardPath) && File.Exists(Path.Combine(dashboardPath, "index.html")))
{
    var files = new PhysicalFileProvider(dashboardPath);
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
    app.MapGet("/", () => Results.Redirect("/local"));
    app.MapGet("/local", () => Results.File(Path.Combine(dashboardPath, "index.html"), "text/html"));
    app.MapGet("/local/", () => Results.File(Path.Combine(dashboardPath, "index.html"), "text/html"));
    app.MapGet("/local/overlay", () => Results.File(Path.Combine(dashboardPath, "index.html"), "text/html"));
}
else
{
    app.Logger.LogInformation("Built dashboard not found at {Path}; run npm run build in FAF.Caster.dashboard", dashboardPath);
}
app.MapGet("/api/health", (TelemetryStore store) => Results.Ok(new
{
    status = "ok", players = store.Count, records = store.Records,
    lastUpdateUtc = store.LastUpdateUtc, source = store.Source, session = store.SessionSnapshot()
}));
app.MapGet("/local-api/health", (TelemetryStore store) => Results.Ok(new {
    status = "ok", players = store.Count, records = store.Records,
    lastUpdateUtc = store.LastUpdateUtc, source = store.Source, session = store.SessionSnapshot()
}));
app.MapGet("/local-api/session", (TelemetryStore store) => Results.Ok(store.SessionSnapshot()));
app.MapGet("/local-api/metadata", (TelemetryStore store) => Results.Ok(store.MetadataSnapshot()));
app.MapGet("/api/metadata", (TelemetryStore store) => Results.Ok(store.MetadataSnapshot()));
app.MapGet("/local-api/players", (TelemetryStore store) => Results.Ok(store.Snapshot()));
app.MapGet("/local-api/history", (TelemetryStore store) => Results.Ok(store.HistorySnapshot()));
app.MapGet("/api/session", (TelemetryStore store) => Results.Ok(store.SessionSnapshot()));
app.MapGet("/api/players", (TelemetryStore store) => Results.Ok(store.Snapshot()));
app.MapGet("/api/history", (TelemetryStore store) => Results.Ok(store.HistorySnapshot()));
app.Map("/ws", StreamTelemetry);
app.Map("/local-ws", StreamTelemetry);
async Task StreamTelemetry(HttpContext context, TelemetryStore store)
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = 400;
        return;
    }
    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    var (id, updates) = store.Subscribe();
    try
    {
        await Send(socket, JsonSerializer.Serialize(new { type = "snapshot", players = store.Snapshot(), history = store.HistorySnapshot(), source = store.Source, session = store.SessionSnapshot() }), context.RequestAborted);
        await foreach (var message in updates.ReadAllAsync(context.RequestAborted))
        {
            if (socket.State != WebSocketState.Open) break;
            await Send(socket, message, context.RequestAborted);
        }
    }
    catch (OperationCanceledException) { }
    catch (WebSocketException) { }
    finally { store.Unsubscribe(id); }
}
await app.RunAsync();

static Task Send(WebSocket socket, string json, CancellationToken ct) =>
    socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, ct);

sealed class TelemetryStore
{
    private readonly ConcurrentDictionary<int, JsonElement> _players = new();
    private LocalMatchMetadata _metadata = new();
    private readonly object _metadataLock = new();
    public object MetadataSnapshot() { lock(_metadataLock) return _metadata.Snapshot(); }
    public void ReadMetadata(string line) { lock(_metadataLock) _metadata.Read(line); }
    private readonly ConcurrentDictionary<Guid, Channel<string>> _clients = new();
    private long _records;
    private readonly object _historyLock = new();
    private readonly Dictionary<int, List<EconomySample>> _history = new();
    private const int MaxHistory = 300;
    public Dictionary<int, object[]> HistorySnapshot()
    {
        lock (_historyLock) return _history.ToDictionary(p => p.Key, p => p.Value.Select(s => (object)new { time = s.Time, massIncome = s.MassIncome, massSpent = s.MassSpent, energyIncome = s.EnergyIncome, energySpent = s.EnergySpent, massStored = s.MassStored, energyStored = s.EnergyStored }).ToArray());
    }
    public int Count => _players.Count;
    public long Records => Interlocked.Read(ref _records);
    public DateTimeOffset? LastUpdateUtc { get; private set; }
    private string? _source;
    private string? _sessionId;
    private long _generation;
    public string? Source => _source;
    public object SessionSnapshot()
    {
        var updated = LastUpdateUtc;
        var capturing = updated.HasValue && DateTimeOffset.UtcNow - updated.Value < TimeSpan.FromSeconds(15);
        var matchId = _source is null ? null : Path.GetFileNameWithoutExtension(_source).Split('_').LastOrDefault();
        return new { mode = "local", sessionId = _sessionId, matchId, generation = Interlocked.Read(ref _generation),
            status = _source is null ? "waiting" : capturing ? "capturing" : Records > 0 ? "idle" : "detected",
            source = _source, players = Count, records = Records, lastUpdateUtc = updated };
    }
    public void SelectSource(string? source)
    {
        _source = source;
        Reset();
    }
    public JsonElement[] Snapshot() => _players.OrderBy(p => p.Key).Select(p => p.Value).ToArray();
    public void Update(JsonElement record)
    {
        if (!record.TryGetProperty("armyId", out var id) || !id.TryGetInt32(out int armyId) || armyId < 1 || armyId > 1000) return;
        if (!record.TryGetProperty("version", out var version) || !version.TryGetInt32(out int v) || v != 2) return;
        // Reject malformed or non-finite numeric telemetry before it enters player snapshots.
        foreach (var field in new[] { "gameTime", "massIncome", "massSpent", "massStored", "massCapacity", "energyIncome", "energySpent", "energyStored", "energyCapacity", "units", "kills", "losses", "score" })
        {
            if (!record.TryGetProperty(field, out var value) || value.ValueKind != JsonValueKind.Number ||
                !value.TryGetDouble(out var number) || !double.IsFinite(number)) return;
        }
        var copy = record.Clone();
        _players[armyId] = copy;
        Interlocked.Increment(ref _records);
        LastUpdateUtc = DateTimeOffset.UtcNow;
        if (EconomySample.TryFrom(copy, out var sample))
        {
            lock (_historyLock)
            {
                if (!_history.TryGetValue(armyId, out var points)) _history[armyId] = points = new();
                if (points.Count > 0 && sample.Time < points[^1].Time) points.Clear();
                if (points.Count == 0 || sample.Time > points[^1].Time)
                {
                    points.Add(sample);
                    if (points.Count > MaxHistory) points.RemoveAt(0);
                }
            }
        }
        var message = JsonSerializer.Serialize(new { type = "player", player = copy, generation = Interlocked.Read(ref _generation) });
        foreach (var channel in _clients.Values) channel.Writer.TryWrite(message);
    }
    public void Reset()
    {
        _players.Clear();
        lock(_metadataLock) _metadata = new LocalMatchMetadata();
        lock (_historyLock) _history.Clear();
        Interlocked.Exchange(ref _records, 0);
        LastUpdateUtc = null;
        _sessionId = _source is null ? null : Guid.NewGuid().ToString("N");
        Interlocked.Increment(ref _generation);
        var message = JsonSerializer.Serialize(new { type = "snapshot", players = Array.Empty<JsonElement>(), history = HistorySnapshot(), source = Source, session = SessionSnapshot() });
        foreach (var channel in _clients.Values) channel.Writer.TryWrite(message);
    }
    public (Guid, ChannelReader<string>) Subscribe()
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(256)
        {
            FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true, SingleWriter = false
        });
        _clients[id] = channel;
        return (id, channel.Reader);
    }
    public void Unsubscribe(Guid id)
    {
        if (_clients.TryRemove(id, out var channel)) channel.Writer.TryComplete();
    }
}

sealed record EconomySample(double Time, double MassIncome, double MassSpent, double EnergyIncome, double EnergySpent, double MassStored, double EnergyStored)
{
    public static bool TryFrom(JsonElement item, out EconomySample sample)
    {
        sample = default!;
        double Read(string key) => item.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetDouble(out var v) ? v : 0;
        if (!item.TryGetProperty("gameTime", out var time) || !time.TryGetDouble(out var t) || !double.IsFinite(t) || t < 0) return false;
        sample = new EconomySample(t, Read("massIncome"), Read("massSpent"), Read("energyIncome"), Read("energySpent"), Read("massStored"), Read("energyStored"));
        return true;
    }
}

sealed class LogTailService(IConfiguration configuration, TelemetryStore store, ILogger<LogTailService> logger) : BackgroundService
{
    private const string Prefix = "[FAFCASTER:PLAYER] ";
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var explicitPath = configuration["log"];
        var logsDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Forged Alliance Forever", "logs");
        string? path = null;
        logger.LogInformation(string.IsNullOrWhiteSpace(explicitPath)
            ? "Auto-detecting newest game_*.log or replay_*.log in {Directory}"
            : "Watching explicitly selected FAF log in {Directory}", logsDirectory);
        long position = 0;
        string pending = "";
        DateTime lastWrite = DateTime.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // An explicit --log keeps the original fixed-file behaviour.
                // Otherwise, use the same game/replay selection order as the Companion.
                string? candidate = !string.IsNullOrWhiteSpace(explicitPath)
                    ? Path.GetFullPath(explicitPath)
                    : FindLatestLog(logsDirectory, path);
                if (!string.Equals(candidate, path, StringComparison.OrdinalIgnoreCase))
                {
                    path = candidate;
                    position = 0;
                    pending = "";
                    lastWrite = DateTime.MinValue;
                    store.SelectSource(path);
                    if (path is not null) logger.LogInformation("Watching FAF log {Path}", path);
                }
                if (path is not null && File.Exists(path))
                {
                    var info = new FileInfo(path);
                    if (info.Length < position || info.LastWriteTimeUtc < lastWrite)
                    {
                        position = 0;
                        pending = "";
                        store.Reset();
                    }
                    lastWrite = info.LastWriteTimeUtc;
                    using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                    stream.Seek(position, SeekOrigin.Begin);
                    using var memory = new MemoryStream();
                    await stream.CopyToAsync(memory, stoppingToken);
                    position = stream.Position;
                    if (memory.Length > 0)
                    {
                        pending += Encoding.UTF8.GetString(memory.ToArray());
                        int end;
                        while ((end = pending.IndexOf('\n')) >= 0)
                        {
                            var line = pending[..end].TrimEnd('\r');
                            pending = pending[(end + 1)..];
                            store.ReadMetadata(line);
                            var marker = line.IndexOf(Prefix, StringComparison.Ordinal);
                            if (marker < 0) continue;
                            var json = line[(marker + Prefix.Length)..].Trim();
                            try
                            {
                                using var doc = JsonDocument.Parse(json);
                                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                                    store.Update(doc.RootElement);
                            }
                            catch (JsonException ex) { logger.LogWarning("Invalid telemetry JSON: {Error}", ex.Message); }
                        }
                        if (pending.Length > 1_000_000)
                        {
                            logger.LogWarning("Dropping oversized incomplete log line");
                            pending = "";
                        }
                    }
                }
            }
            catch (IOException ex) { logger.LogWarning("Log temporarily unavailable: {Error}", ex.Message); }
            catch (UnauthorizedAccessException ex) { logger.LogWarning("Cannot read log: {Error}", ex.Message); }
            await Task.Delay(500, stoppingToken);
        }
    }
    // Keep following an actively written log. Switching based solely on LastWriteTimeUtc
    // can jump to an old replay that was touched by another process.
    private static string? FindLatestLog(string directory, string? current)
    {
        if (!Directory.Exists(directory)) return null;
        var now = DateTime.UtcNow;
        var files = Directory.EnumerateFiles(directory, "*.log", SearchOption.TopDirectoryOnly)
            .Where(path =>
            {
                var name = Path.GetFileName(path);
                return name.StartsWith("game_", StringComparison.OrdinalIgnoreCase) ||
                       name.StartsWith("replay_", StringComparison.OrdinalIgnoreCase);
            })
            .Select(path => new FileInfo(path))
            .ToArray();
        if (files.Length == 0) return null;

        // New match logs normally have a newer creation timestamp. A new log can
        // supersede an active log, but an older replay cannot steal focus merely
        // because its modification time changes.
        var currentFile = files.FirstOrDefault(f => string.Equals(f.FullName, current, StringComparison.OrdinalIgnoreCase));
        if (currentFile is not null)
        {
            var newer = files.Where(f => f.CreationTimeUtc > currentFile.CreationTimeUtc.AddSeconds(2)
                                      && now - f.LastWriteTimeUtc < TimeSpan.FromSeconds(30))
                .OrderByDescending(f => f.CreationTimeUtc)
                .ThenByDescending(f => f.LastWriteTimeUtc)
                .FirstOrDefault();
            if (newer is not null) return newer.FullName;

            // Stick to the selected match while it is producing log output.
            if (now - currentFile.LastWriteTimeUtc < TimeSpan.FromSeconds(30))
                return currentFile.FullName;

            // If no newer match has appeared, keep the last match selected rather
            // than unexpectedly switching to an older replay.
            return currentFile.FullName;
        }

        // Initial discovery: prefer a recently created, recently active log.
        // CreationTimeUtc is not a perfect match identity, so the explicit --log
        // option remains available for unusual file-copy/replay workflows.
        return files.OrderByDescending(f => f.CreationTimeUtc)
            .ThenByDescending(f => f.LastWriteTimeUtc)
            .ThenByDescending(f => f.Name.StartsWith("game_", StringComparison.OrdinalIgnoreCase))
            .First().FullName;
    }
}
