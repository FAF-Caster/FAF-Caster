# Stage 5.1 Desktop foundation

The Windows WPF shell embeds the existing React Companion and Overlay Studio in WebView2, starts the existing .NET 10 Bridge, and keeps the Bridge listening on loopback port 5077 for OBS.

## Build on Windows

Prerequisites: .NET 10 SDK, Node.js/npm, Windows, WebView2 Runtime (installed on most modern Windows machines).

```powershell
cd C:\Github\FAF-Caster
powershell -ExecutionPolicy Bypass -File .\scripts\publish-desktop.ps1
.\artifacts\FAF-Caster-Desktop\FAF.Caster.Desktop.exe
```

The script creates a portable self-contained folder (not an installer). Keep the `bridge` and `dashboard` directories alongside the desktop executable. You should no longer need to launch Vite or the Bridge manually.

## Test

1. Close existing Bridge and Vite instances before launch; ensure port 5077 is free.
2. Run the publish script and start the desktop executable.
3. Confirm Companion loads in the embedded window, then navigate to Overlay Studio.
4. Confirm OBS URL `http://127.0.0.1:5077/local/studio/overlay/1` works while the desktop window is open.
5. Start FAF observer telemetry and confirm player data updates.
6. Close the desktop application and confirm its child Bridge process stops.

## Scope and known limitations

- Stage 5.1 is a **portable desktop prototype**, not an installer.
- Stage 5.2: Closing the window hides it to the Windows notification area and keeps the Bridge running for OBS. Right-click the tray icon and choose **Exit FAF Caster** to stop the Bridge and exit.
- The desktop header checks for the `ForgedAlliance` process every three seconds; this only indicates the game process is present, not that live telemetry is available.
- If another process already owns port 5077, startup can conflict. Stop the other Bridge first.
- The desktop shell has no automatic updates yet.
- This code has not yet been built or run in a Windows desktop environment.

## Stage 5.2 validation

1. Launch FAF Caster; confirm Companion and Overlay Studio open.
2. Start a game; confirm the header detects `ForgedAlliance` when running.
3. Close the main window; confirm the tray icon remains and OBS overlay URL still loads.
4. Double-click the tray icon to restore the application.
5. Right-click the tray icon and choose **Exit FAF Caster**; confirm the Bridge exits and port 5077 closes.
6. Verify startup after relaunch and no orphaned Bridge process.

Stage 5.2 has been committed but not yet compiled or tested on Windows.
