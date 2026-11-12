# FAF Caster — Milestone 3 local telemetry bridge

Requires the **.NET 10 SDK** on Windows. The existing Milestone 2 FAF UI mod is unchanged.

## Run

Open PowerShell in this folder:

```powershell
dotnet run -- --log "C:\path\to\replay_28107191(6).log"
```

Use the actual full path to your log. To follow a new replay live, point `--log` at the file FAF is currently writing; the file can be created after the bridge starts.

Then visit:

- http://127.0.0.1:5077/api/health
- http://127.0.0.1:5077/api/players
- ws://127.0.0.1:5077/ws (WebSocket)

The WebSocket sends `{"type":"snapshot","players":[...]}` on connect, followed by `{"type":"player","player":{...}}` per new record. A bounded per-client queue drops oldest records if a client cannot keep up; `/api/players` is the latest-state source of truth.

## Notes

- Binds to loopback only, not the public network.
- Loads the entire existing log on startup and follows appended lines every 500ms.
- Does not modify FAF or its logs.
- Restart the bridge when switching between log files; in-place truncation resets state.
- The initial prototype does not detect same-size file replacement or implement browser CORS. React development may use a Vite proxy.
