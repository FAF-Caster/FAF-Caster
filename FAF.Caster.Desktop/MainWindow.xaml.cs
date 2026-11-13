using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using System.Net.Http;
using System.ComponentModel;
using System.Drawing;
using Brushes = System.Windows.Media.Brushes;
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
    private System.Windows.Forms.NotifyIcon? _tray;
    private bool _exitRequested;
    private bool _browserReady;
    private bool _bridgeConnected;
    private bool _checkingHealth;
    private string? _bridgeError;
    private readonly string _logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FAF-Caster", "bridge.log");
    private string _page = "/local";
    private bool _showHome = true;
    private bool _splashComplete;
    public MainWindow()
    {
        InitializeComponent();
        SourceInitialized += (_, _) => ApplyWindows11Chrome();
        Loaded += OnLoaded;
        InitializeTray();
        Closed += OnClosed;
        _healthTimer.Tick += async (_, _) => { await CheckHealthAsync(); CheckGameProcess(); };
    }
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    private void ApplyWindows11Chrome()
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 17763)) return;
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;

        // Retain native Windows caption buttons, snapping, resize and accessibility.
        // Dark title bar on supported Windows 10/11 builds.
        int dark = 1;
        int result = DwmSetWindowAttribute(handle, 20, ref dark, sizeof(int));
        if (result != 0)
            DwmSetWindowAttribute(handle, 19, ref dark, sizeof(int));

        if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000))
        {
            // Windows 11: rounded corners and system-managed backdrop.
            int rounded = 2;
            DwmSetWindowAttribute(handle, 33, ref rounded, sizeof(int));
            int backdrop = 2; // DWMSBT_MAINWINDOW (Mica)
            DwmSetWindowAttribute(handle, 38, ref backdrop, sizeof(int));
        }
    }

    private void InitializeTray()
    {
        _tray = new System.Windows.Forms.NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "FAF Caster · starting",
            Visible = true
        };
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("Open FAF Caster", null, (_, _) => Dispatcher.Invoke(ShowFromTray));
        menu.Items.Add("Home", null, (_, _) => Dispatcher.Invoke(() => { ShowFromTray(); ShowHome(); }));
        menu.Items.Add("Companion", null, (_, _) => Dispatcher.Invoke(() => { ShowFromTray(); Navigate("/local"); }));
        menu.Items.Add("Overlay Studio", null, (_, _) => Dispatcher.Invoke(() => { ShowFromTray(); Navigate("/local/studio"); }));
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
        menu.Items.Add("Exit FAF Caster", null, (_, _) => Dispatcher.Invoke(ExitApplication));
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += (_, _) => Dispatcher.Invoke(ShowFromTray);
    }
    private void ShowFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }
    private void ExitApplication()
    {
        _exitRequested = true;
        Close();
    }
    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_exitRequested) return;
        e.Cancel = true;
        Hide();
        if (_tray != null)
        {
            _tray.BalloonTipTitle = "FAF Caster is still running";
            _tray.BalloonTipText = "OBS overlays remain active. Right-click the tray icon to exit.";
            _tray.ShowBalloonTip(2500);
        }
    }
    private void CheckGameProcess()
    {
        try
        {
            // Forged Alliance game process. Presence does not imply observer telemetry.
            bool running = Process.GetProcessesByName("ForgedAlliance").Any();
            GameStatus.Text = running ? "FAF: game running" : "FAF: not running";
            GameIndicator.Fill = running ? Brushes.MediumSeaGreen : Brushes.SlateGray;
        }
        catch { GameStatus.Text = "FAF: status unavailable"; GameIndicator.Fill = Brushes.Goldenrod; }
    }
    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        _ = FinishSplashAfterDelayAsync();
        ShowHomeBehindSplash();
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
            CheckGameProcess();
            await CheckHealthAsync();
        }
        catch (Exception ex) { Status.Text = "Startup failed: " + ex.Message; SplashStatus.Text = "Startup failed: " + ex.Message; }
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
            Status.Text = "Bridge: connected · 5077";
            BridgeIndicator.Fill = Brushes.MediumSeaGreen;
            if (_tray != null) _tray.Text = "FAF Caster · Bridge connected";
            _bridgeConnected = true;
            if (!_showHome && _browserReady && Browser.Source?.AbsolutePath != _page)
                Browser.CoreWebView2.Navigate(BaseUrl + _page);
        }
        catch
        {
            _bridgeConnected = false;
            SplashStatus.Text = "Waiting for the local Bridge…";
            BridgeIndicator.Fill = Brushes.IndianRed;
            if (_tray != null) _tray.Text = "FAF Caster · Bridge disconnected";
            if (_bridge is { HasExited: true })
                Status.Text = $"Bridge exited (code {_bridge.ExitCode}). Check {_logPath}";
            else
                Status.Text = "Waiting for Bridge on port 5077…";
        }
        finally { _checkingHealth = false; }
    }
    private async Task FinishSplashAfterDelayAsync()
    {
        // Give users time to recognise the branding, even when Bridge startup is instant.
        await Task.Delay(TimeSpan.FromMilliseconds(3500));
        _splashComplete = true;
        SplashScreen.Visibility = Visibility.Collapsed;
    }
    private void ShowHomeBehindSplash()
    {
        _showHome = true;
        HomePage.Visibility = Visibility.Visible;
        Browser.Visibility = Visibility.Collapsed;
    }
    private void Home_Click(object sender, RoutedEventArgs e) => ShowHome();
    private void ShowHome()
    {
        _showHome = true;
        HomePage.Visibility = Visibility.Visible;
        Browser.Visibility = Visibility.Collapsed;
        if (_splashComplete) SplashScreen.Visibility = Visibility.Collapsed;
    }
    private void Navigate(string path)
    {
        _page = path;
        _showHome = false;
        HomePage.Visibility = Visibility.Collapsed;
        Browser.Visibility = Visibility.Visible;
        if (_splashComplete) SplashScreen.Visibility = Visibility.Collapsed;
        if (_browserReady && _bridgeConnected) Browser.CoreWebView2.Navigate(BaseUrl + path);
    }
    private void Companion_Click(object sender, RoutedEventArgs e) => Navigate("/local");
    private void Studio_Click(object sender, RoutedEventArgs e) => Navigate("/local/studio");
    private async void Retry_Click(object sender, RoutedEventArgs e)
    {
        if (_bridge is null || _bridge.HasExited) StartBridgeIfNeeded();
        await CheckHealthAsync();
    }
    private void OnClosed(object? sender, EventArgs e)
    {
        _healthTimer.Stop();
        if (_tray != null) { _tray.Visible = false; _tray.Dispose(); _tray = null; }
        if (_ownsBridge && _bridge is { HasExited: false })
        {
            try { _bridge.Kill(entireProcessTree: true); _bridge.WaitForExit(2000); } catch { }
        }
        _bridge?.Dispose();
        _http.Dispose();
    }
}
