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
- It closes the Bridge when the desktop app exits; system tray and background mode are planned for Stage 5.2.
- If another process already owns port 5077, startup can conflict. Stop the other Bridge first.
- The desktop shell has no automatic updates yet.
- This code has not yet been built or run in a Windows desktop environment.
