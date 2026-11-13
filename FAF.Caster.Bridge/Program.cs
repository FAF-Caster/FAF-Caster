using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using System.Threading.Channels;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5077");
builder.Services.AddSingleton<TelemetryStore>();
builder.Services.AddSingleton<OverlayConfigurationStore>();
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
    // A single route handles the dashboard's client-side pages, avoiding
    // ambiguous /local and /local/ endpoint matches.
    app.MapGet("/local/{**route}", (string? route) =>
    {
        var page = (route ?? "").Trim('/');
        var allowed = page is "" or "overlay" or "studio" ||
            (page.StartsWith("studio/overlay/", StringComparison.Ordinal) &&
             int.TryParse(page["studio/overlay/".Length..], out var id) &&
             id is >= 1 and <= 5);
        return allowed
            ? Results.File(Path.Combine(dashboardPath, "index.html"), "text/html")
            : Results.NotFound();
    });
}
else
{
    app.Logger.LogInformation("Built dashboard not found at {Path}; run npm run build in FAF.Caster.dashboard", dashboardPath);
}
app.MapGet("/local-api/overlay-config", (OverlayConfigurationStore store) => Results.Json(store.Read()));
app.MapGet("/api/overlay-config", (OverlayConfigurationStore store) => Results.Json(store.Read()));
app.MapPut("/local-api/overlay-config", SaveOverlayConfig);
app.MapPut("/api/overlay-config", SaveOverlayConfig);
async Task<IResult> SaveOverlayConfig(HttpContext context, OverlayConfigurationStore store) =>
{
    try
    {
        using var document = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted);
        if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() != 5)
            return Results.BadRequest(new { error = "Exactly five overlay slots are required." });
        var slots = document.RootElement.EnumerateArray().ToArray();
        for (var i = 0; i < slots.Length; i++)
        {
            if (slots[i].ValueKind != JsonValueKind.Object ||
                !slots[i].TryGetProperty("id", out var id) ||
                id.ValueKind != JsonValueKind.Number || id.GetInt32() != i + 1)
                return Results.BadRequest(new { error = "Invalid overlay slot IDs." });
        }
        await store.WriteAsync(document.RootElement, context.RequestAborted);
        return Results.Ok(new { saved = true });
    }
    catch (JsonException) { return Results.BadRequest(new { error = "Invalid JSON." }); }
});
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
    private bool _matchEnded;
    private double? _matchEndedGameTime;
    public void ReadMatchEvent(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("event", out var kind) || kind.GetString() != "ended") return;
            if (!doc.RootElement.TryGetProperty("gameTime", out var time) || !time.TryGetDouble(out var seconds) || !double.IsFinite(seconds) || seconds < 0) return;
            _matchEndedGameTime = seconds;
            _matchEnded = true;
            var message = JsonSerializer.Serialize(new { type = "session", session = SessionSnapshot() });
            foreach (var channel in _clients.Values) channel.Writer.TryWrite(message);
        }
        catch (JsonException) { }
        catch (InvalidOperationException) { }
    }
    public string? Source => _source;
    public object SessionSnapshot()
    {
        var updated = LastUpdateUtc;
        var capturing = updated.HasValue && DateTimeOffset.UtcNow - updated.Value < TimeSpan.FromSeconds(15);
        var matchId = _source is null ? null : Path.GetFileNameWithoutExtension(_source).Split('_').LastOrDefault();
        return new { mode = "local", sessionId = _sessionId, matchId, generation = Interlocked.Read(ref _generation),
            status = _source is null ? "waiting" : _matchEnded ? "ended" : capturing ? "capturing" : Records > 0 ? "idle" : "detected",
            endedGameTime = _matchEndedGameTime,
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
            // Capacity and other metrics can be absent in older UI mod builds.
            // Reject malformed values when supplied, but do not drop the entire player.
            if (!record.TryGetProperty(field, out var value)) continue;
            if (value.ValueKind != JsonValueKind.Number ||
                !value.TryGetDouble(out var number) || !double.IsFinite(number)) return;
        }
        if (!record.TryGetProperty("gameTime", out var gameTime) ||
            gameTime.ValueKind != JsonValueKind.Number || !gameTime.TryGetDouble(out var seconds) ||
            !double.IsFinite(seconds) || seconds < 0) return;
        // Stage 3: defeat must be explicitly reported, never inferred from zero units or missing updates.
        if (record.TryGetProperty("defeated", out var defeated) &&
            defeated.ValueKind != JsonValueKind.True && defeated.ValueKind != JsonValueKind.False) return;
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
        _matchEnded = false;
        _matchEndedGameTime = null;
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
    private const string MatchPrefix = "[FAFCASTER:MATCH] ";
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
                            var matchMarker = line.IndexOf(MatchPrefix, StringComparison.Ordinal);
                            if (matchMarker >= 0) store.ReadMatchEvent(line[(matchMarker + MatchPrefix.Length)..].Trim());
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
    // LastWriteTimeUtc is the reliable indicator of the log FAF is currently
    // updating. CreationTimeUtc may be preserved or changed by replay copying.
    // A small hysteresis prevents bouncing between files with near-equal times.
    private static string? FindLatestLog(string directory, string? current)
    {
        if (!Directory.Exists(directory)) return null;
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

        var latest = files.OrderByDescending(f => f.LastWriteTimeUtc)
            .ThenByDescending(f => f.CreationTimeUtc)
            .First();
        var selected = files.FirstOrDefault(f =>
            string.Equals(f.FullName, current, StringComparison.OrdinalIgnoreCase));
        if (selected is null) return latest.FullName;
        if (string.Equals(selected.FullName, latest.FullName, StringComparison.OrdinalIgnoreCase))
            return selected.FullName;

        // Do not switch for a timestamp tie or tiny incidental touch.
        // A newer actively written log will supersede a stale selection.
        return latest.LastWriteTimeUtc > selected.LastWriteTimeUtc.AddSeconds(2)
            ? latest.FullName
            : selected.FullName;
    }
}

sealed class OverlayConfigurationStore
{
    private readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FAF-Caster", "overlay-config.json");
    private readonly SemaphoreSlim _gate = new(1, 1);

    public JsonElement? Read()
    {
        _gate.Wait();
        try
        {
            if (!File.Exists(_path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(_path));
            return doc.RootElement.Clone();
        }
        catch (IOException) { return null; }
        catch (JsonException) { return null; }
        finally { _gate.Release(); }
    }

    public async Task WriteAsync(JsonElement value, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var temp = _path + ".tmp";
            await File.WriteAllTextAsync(temp, value.GetRawText(), cancellationToken);
            File.Move(temp, _path, true);
        }
        finally { _gate.Release(); }
    }
}
