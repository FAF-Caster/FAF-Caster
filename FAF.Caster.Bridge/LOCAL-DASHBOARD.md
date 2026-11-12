# Local Windows dashboard (Stage 2.5)

The Bridge can now serve the **built** React dashboard, its local APIs and its OBS overlay on one loopback-only origin. Vite is not needed after building the dashboard.

## Build and run (PowerShell)

From the repository root:

```powershell
cd FAF.Caster.dashboard
npm install
npm run build
cd ..
dotnet run --project FAF.Caster.Bridge
```

Open:
- Dashboard: http://127.0.0.1:5077/local
- OBS browser source: http://127.0.0.1:5077/local/overlay
- Session status: http://127.0.0.1:5077/api/session

The Bridge looks for `FAF.Caster.dashboard/dist` relative to its project folder. You can override this with `--dashboard "C:\\path\\to\\dist"` when launching the Bridge.

The Vite development server on port 5173 remains supported. Cloud sessions and six-character linking codes are unchanged.

**Limitations:** This is a single-process browser-hosting milestone, not yet the packaged WPF/WebView2 shell. The Bridge must still be started manually; WebView2 embedding, managed startup, installer, and automated live/replay regression tests remain follow-up tasks. OBS browser sources must run on the same Windows machine, because the Bridge binds only to 127.0.0.1.
