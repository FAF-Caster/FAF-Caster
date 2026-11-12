using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Windows;
using System.Windows.Threading;

namespace FAFCaster.Companion;

public partial class MainWindow : Window
{
    private const string Prefix = "[FAFCASTER:PLAYER]";
    private readonly string _logsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Forged Alliance Forever", "logs");
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(750) };
    private string? _currentFile;
    private FileStream? _stream;
    private StreamReader? _reader;
    private long _records;
    private readonly HashSet<int> _armies = new();
    private double _gameTime;
    private DateTime _lastReceivedUtc;
    private bool _scanning;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private readonly List<string> _pending = new();
    private string? _sessionId;
    private string? _uploadToken;
    private string _apiBase = "";
    private long _uploaded;
    private bool _uploading;
    private int _generation;
    private DateTime _retryAfterUtc = DateTime.MinValue;
    private DateTime _lastFileWriteUtc;
    private long _lastFileLength;
    private bool _readingBacklog;
    private readonly Queue<string> _events = new();
    private MatchMetadata _metadata = new();
    private int _sentMetadataRevision = -1;
    private DateTime _metadataRetryUtc = DateTime.MinValue;
    private bool _sendingMetadata;


    private void AddActivity(string message)
    {
        _events.Enqueue($"{DateTime.Now:HH:mm:ss}  {message}");
        while (_events.Count > 7) _events.Dequeue();
        ActivityText.Text = string.Join(Environment.NewLine, _events.Reverse());
    }

    private static bool IsTelemetryLog(string path) =>
        Path.GetFileName(path).StartsWith("game_", StringComparison.OrdinalIgnoreCase) ||
        Path.GetFileName(path).StartsWith("replay_", StringComparison.OrdinalIgnoreCase);

    private string? FindNewestLog()
    {
        if (!Directory.Exists(_logsDirectory)) return null;
        return Directory.EnumerateFiles(_logsDirectory, "*.log")
            .Where(IsTelemetryLog)
            .Select(path => new FileInfo(path))
            .OrderByDescending(file => file.LastWriteTimeUtc)
            .ThenByDescending(file => file.CreationTimeUtc)
            .ThenByDescending(file => Path.GetFileName(file.Name).StartsWith("game_", StringComparison.OrdinalIgnoreCase))
            .FirstOrDefault()?.FullName;
    }

    public MainWindow()
    {
        InitializeComponent();
        _timer.Tick += async (_, _) => await ScanAsync();
        _timer.Start();
        Closed += (_, _) => { _timer.Stop(); CloseReader(); _http.Dispose(); };
        _ = ScanAsync();
    }

    private async Task ScanAsync()
    {
        if (_scanning) return;
        _scanning = true;
        try
        {
            var newest = FindNewestLog();

            if (newest is null)
            {
                LogPathText.Text = _logsDirectory;
                LogStatusText.Text = "No game_*.log or replay_*.log files found";
                if (_currentFile is not null) ResetFile(null);
                return;
            }

            if (!string.Equals(newest, _currentFile, StringComparison.OrdinalIgnoreCase))
            {
                ResetFile(newest);
                AddActivity($"Following {Path.GetFileName(newest)}");
            }

            var file = new FileInfo(newest);
            // A truncated or replaced file must be reopened; otherwise StreamReader can remain at EOF.
            if (_stream is not null &&
                (file.Length < _lastFileLength || file.LastWriteTimeUtc < _lastFileWriteUtc ||
                 (_reader?.EndOfStream == true && file.Length < _stream.Position)))
            {
                CloseReader();
                _pending.Clear();
                _generation++;
                _armies.Clear();
                _records = 0;
                _gameTime = 0;
                AddActivity("Log reset detected; reopening");
            }
            _lastFileLength = file.Length;
            _lastFileWriteUtc = file.LastWriteTimeUtc;

            if (_stream is null)
            {
                _stream = new FileStream(newest, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                _reader = new StreamReader(_stream);
                // Historical data is displayed but must not be sent as a fresh live upload.
                _readingBacklog = file.LastWriteTimeUtc < DateTime.UtcNow.AddSeconds(-15);
            }

            // A single scan reads at most 500 lines to keep the WPF UI responsive.
            var read = 0;
            while (read++ < 500 && _reader is not null)
            {
                var line = await _reader.ReadLineAsync();
                if (line is null) break;
                _metadata.Read(line);
                var marker = line.IndexOf(Prefix, StringComparison.Ordinal);
                if (marker < 0) continue;
                var payload = line[(marker + Prefix.Length)..].Trim();
                try
                {
                    using var doc = JsonDocument.Parse(payload);
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("armyId", out var id) || !id.TryGetInt32(out var army)) continue;
                    _armies.Add(army);
                    if (root.TryGetProperty("gameTime", out var time) && time.TryGetDouble(out var seconds))
                        _gameTime = Math.Max(_gameTime, seconds);
                    _records++;
                    if (_uploadToken is not null && !_readingBacklog && _pending.Count < 5000)
                        _pending.Add(payload);
                    _lastReceivedUtc = DateTime.UtcNow;
                }
                catch (JsonException) { /* Ignore incomplete/non-telemetry lines. */ }
            }
            if (_reader is not null && _reader.EndOfStream) _readingBacklog = false;
            LogPathText.Text = newest;
            MatchText.Text = Path.GetFileNameWithoutExtension(newest).Replace("game_", "#").Replace("replay_", "#");
            ModeText.Text = Path.GetFileName(newest).StartsWith("game_", StringComparison.OrdinalIgnoreCase)
                ? "In-game observer / game log" : "Replay log";
            RecordsText.Text = _records.ToString("N0");
            PlayersText.Text = _armies.Count.ToString();
            GameTimeText.Text = TimeSpan.FromSeconds(_gameTime).ToString(@"hh\:mm\:ss");
            var age = DateTime.UtcNow - _lastReceivedUtc;
            var fileAge = DateTime.UtcNow - file.LastWriteTimeUtc;
            LogStatusText.Text = _records == 0 ? "Waiting for FAF Caster telemetry" :
                age < TimeSpan.FromSeconds(8) && fileAge < TimeSpan.FromSeconds(10) ? "Receiving telemetry" :
                "Monitoring log · waiting for new records";
            StatusText.Text = fileAge < TimeSpan.FromSeconds(10) ? "LIVE LOG" : "IDLE";
            QueueText.Text = $"{_pending.Count:N0} queued";
            await FlushMetadataAsync();
            await FlushAsync();
            LastUpdateText.Text = _records == 0 ? "No telemetry received yet" : $"Last record received locally: {_lastReceivedUtc.ToLocalTime():HH:mm:ss}";
        }
        catch (IOException ex) { LogStatusText.Text = $"Log access issue: {ex.Message}"; CloseReader(); }
        catch (UnauthorizedAccessException ex) { LogStatusText.Text = $"Access denied: {ex.Message}"; CloseReader(); }
        finally { _scanning = false; }
    }

    private void ResetFile(string? path)
    {
        CloseReader();
        _currentFile = path;
        _metadata = new MatchMetadata();
        _sentMetadataRevision = -1;
        _lastFileLength = 0;
        _lastFileWriteUtc = DateTime.MinValue;
        _readingBacklog = false;
        _records = 0;
        _pending.Clear();
        _generation++;
        _armies.Clear();
        _gameTime = 0;
        _lastReceivedUtc = DateTime.MinValue;
        RecordsText.Text = "0";
        PlayersText.Text = "0";
        GameTimeText.Text = "—";
    }

    private void CloseReader()
    {
        _reader?.Dispose();
        _reader = null;
        _stream?.Dispose();
        _stream = null;
    }

    private async void Link_Click(object sender, RoutedEventArgs e)
    {
        var code = SessionCodeText.Text.Trim().ToUpperInvariant();
        var api = ApiUrlText.Text.Trim().TrimEnd('/');
        if (code.Length != 6 || !Uri.TryCreate(api, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback)))
        { CloudStatusText.Text = "Enter a six-character code and an HTTPS API URL (HTTP allowed for localhost only)."; return; }
        LinkButton.IsEnabled = false;
        CloudStatusText.Text = "Linking...";
        try
        {
            using var response = await _http.PostAsync(api + "/api/link", new StringContent(JsonSerializer.Serialize(new { code }), Encoding.UTF8, "application/json"));
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new Exception($"Link failed ({(int)response.StatusCode}): {body}");
            using var doc = JsonDocument.Parse(body);
            var id = doc.RootElement.GetProperty("sessionId").GetString();
            var token = doc.RootElement.GetProperty("uploadToken").GetString();
            if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(token)) throw new Exception("Invalid link response");
            _apiBase = api;
            _sessionId = id;
            _uploadToken = token;
            _pending.Clear();
            _generation++;
            _uploaded = 0;
            _sentMetadataRevision = -1;
            CloudStatusText.Text = "Linked — awaiting new telemetry";
            AddActivity("Cloud session linked");
            SessionCodeText.Text = "";
        }
        catch (Exception ex) { CloudStatusText.Text = ex.Message; }
        finally { LinkButton.IsEnabled = true; }
    }

    private void Disconnect_Click(object sender, RoutedEventArgs e)
    {
        _uploadToken = null; _sessionId = null; _pending.Clear(); _generation++;
        CloudStatusText.Text = "Disconnected";
        AddActivity("Cloud session disconnected");
    }

    private async Task FlushMetadataAsync()
    {
        if (_sendingMetadata || _uploadToken is null || _sessionId is null ||
            _metadata.Revision == 0 || _sentMetadataRevision == _metadata.Revision ||
            DateTime.UtcNow < _metadataRetryUtc || _readingBacklog) return;
        _sendingMetadata = true;
        var generation = _generation;
        var revision = _metadata.Revision;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/api/sessions/{_sessionId}/metadata");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _uploadToken);
            request.Content = new StringContent(_metadata.ToJson(), Encoding.UTF8, "application/json");
            using var response = await _http.SendAsync(request);
            if (generation != _generation) return;
            if (response.IsSuccessStatusCode) _sentMetadataRevision = revision;
            else { AddActivity($"Match metadata: HTTP {(int)response.StatusCode}"); _metadataRetryUtc = DateTime.UtcNow.AddSeconds(10); }
        }
        catch (Exception ex) { if(generation == _generation) { AddActivity($"Metadata upload: {ex.Message}"); _metadataRetryUtc = DateTime.UtcNow.AddSeconds(10); } }
        finally { _sendingMetadata = false; }
    }

    private async Task FlushAsync()
    {
        if (_uploading || _uploadToken is null || _sessionId is null || _pending.Count == 0 || DateTime.UtcNow < _retryAfterUtc) return;
        _uploading = true;
        var generation = _generation;
        var batch = _pending.Take(32).ToArray();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/api/sessions/{_sessionId}/telemetry");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _uploadToken);
            request.Content = new StringContent("[" + string.Join(",", batch) + "]", Encoding.UTF8, "application/json");
            using var response = await _http.SendAsync(request);
            if (generation != _generation) return;
            if (!response.IsSuccessStatusCode)
            {
                CloudStatusText.Text = $"Upload error: HTTP {(int)response.StatusCode}";
                _retryAfterUtc = DateTime.UtcNow.AddSeconds(5);
                return;
            }
            _pending.RemoveRange(0, batch.Length);
            _uploaded += batch.Length;
            UploadedText.Text = $"Uploaded: {_uploaded:N0} · Queued: {_pending.Count:N0}";
            CloudStatusText.Text = "Streaming telemetry";
            QueueText.Text = $"{_pending.Count:N0} queued";
        }
        catch (Exception ex)
        {
            if (generation == _generation) { CloudStatusText.Text = $"Network issue: {ex.Message}"; _retryAfterUtc = DateTime.UtcNow.AddSeconds(5); AddActivity("Cloud upload retry scheduled"); }
        }
        finally { _uploading = false; }
    }

    private void OpenFolder_Click(object sender, RoutedEventArgs e)
    {
        if (!Directory.Exists(_logsDirectory)) { MessageBox.Show("FAF logs folder was not found."); return; }
        Process.Start(new ProcessStartInfo { FileName = _logsDirectory, UseShellExecute = true });
    }

    private async void Rescan_Click(object sender, RoutedEventArgs e) => await ScanAsync();
}
