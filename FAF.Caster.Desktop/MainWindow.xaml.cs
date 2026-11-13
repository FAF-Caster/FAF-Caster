using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
namespace FAF.Caster.Desktop;
public partial class MainWindow : Window
{
    private const string BaseUrl = "http://127.0.0.1:5077";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _healthTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private Process? _bridge;
    private bool _ownsBridge;
    private bool _browserReady;
    private bool _bridgeConnected;
    private bool _checkingHealth;
    private string? _bridgeError;
    private readonly string _logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FAF-Caster", "bridge.log");
    private string _page = "/local";
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closed += OnClosed;
        _healthTimer.Tick += async (_, _) => await CheckHealthAsync();
    }
    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await Browser.EnsureCoreWebView2Async();
            _browserReady = true;
            Browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            Browser.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (!args.Uri.StartsWith(BaseUrl + "/", StringComparison.OrdinalIgnoreCase))
                {
                    args.Cancel = true;
                    try { Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true }); } catch { }
                }
            };
            StartBridgeIfNeeded();
            _healthTimer.Start();
            await CheckHealthAsync();
        }
        catch (Exception ex) { Status.Text = "Startup failed: " + ex.Message; }
    }
    private void StartBridgeIfNeeded()
    {
        // Deployment: publish output contains bridge/FAFCaster.Bridge.exe and dashboard/index.html.
        var bridgeExe = Path.Combine(AppContext.BaseDirectory, "bridge", "FAFCaster.Bridge.exe");
        var dashboard = Path.Combine(AppContext.BaseDirectory, "dashboard");
        if (!File.Exists(bridgeExe))
        {
            Status.Text = "Bridge executable missing. Run scripts/publish-desktop.ps1.";
            return;
        }
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_logPath)!);
            File.AppendAllText(_logPath, $"{Environment.NewLine}--- Bridge started {DateTimeOffset.Now:O} ---{Environment.NewLine}");
            var info = new ProcessStartInfo(bridgeExe)
            {
                WorkingDirectory = Path.GetDirectoryName(bridgeExe)!,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                Arguments = "--dashboard \"" + dashboard + "\""
            };
            _bridge = new Process { StartInfo = info, EnableRaisingEvents = true };
            _bridge.OutputDataReceived += (_, e) => AppendBridgeLog(e.Data);
            _bridge.ErrorDataReceived += (_, e) => { AppendBridgeLog(e.Data); if (!string.IsNullOrWhiteSpace(e.Data)) _bridgeError = e.Data; };
            _bridge.Start();
            _bridge.BeginOutputReadLine();
            _bridge.BeginErrorReadLine();
            _ownsBridge = true;
        }
        catch (Exception ex) { Status.Text = "Unable to launch Bridge: " + ex.Message; }
    }
    private void AppendBridgeLog(string? line)
    {
        if (line is null) return;
        try { File.AppendAllText(_logPath, line + Environment.NewLine); } catch { }
    }
    private async Task CheckHealthAsync()
    {
        if (_checkingHealth) return;
        _checkingHealth = true;
        try
        {
            using var response = await _http.GetAsync(BaseUrl + "/api/health");
            response.EnsureSuccessStatusCode();
            Status.Text = "Bridge connected · OBS port 5077";
            _bridgeConnected = true;
            if (_browserReady && Browser.Source?.AbsolutePath != _page)
                Browser.CoreWebView2.Navigate(BaseUrl + _page);
        }
        catch
        {
            _bridgeConnected = false;
            if (_bridge is { HasExited: true })
                Status.Text = $"Bridge exited (code {_bridge.ExitCode}). Check {_logPath}";
            else
                Status.Text = "Waiting for Bridge on port 5077…";
        }
        finally { _checkingHealth = false; }
    }
    private void Navigate(string path)
    {
        _page = path;
        if (_browserReady && _bridgeConnected) Browser.CoreWebView2.Navigate(BaseUrl + path);
    }
    private void Companion_Click(object sender, RoutedEventArgs e) => Navigate("/local");
    private void Studio_Click(object sender, RoutedEventArgs e) => Navigate("/local/studio");
    private void Obs_Click(object sender, RoutedEventArgs e)
    {
        try { Process.Start(new ProcessStartInfo(BaseUrl + "/local/studio/overlay/1") { UseShellExecute = true }); } catch { }
    }
    private async void Retry_Click(object sender, RoutedEventArgs e)
    {
        if (_bridge is null || _bridge.HasExited) StartBridgeIfNeeded();
        await CheckHealthAsync();
    }
    private void OnClosed(object? sender, EventArgs e)
    {
        _healthTimer.Stop();
        if (_ownsBridge && _bridge is { HasExited: false })
        {
            try { _bridge.Kill(entireProcessTree: true); _bridge.WaitForExit(2000); } catch { }
        }
        _bridge?.Dispose();
        _http.Dispose();
    }
}
