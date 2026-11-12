# FAF Caster Dashboard — Milestone 4

React + TypeScript + Vite frontend for the Milestone 3 .NET 10 bridge.

## Install

Requires Node.js 20.19+ or 22.12+ (Node.js 22 LTS recommended).

From repository root (PowerShell):

```powershell
cd src/faf.caster.dashboard
npm install
npm run dev
```

Open http://127.0.0.1:5173

Start the .NET bridge separately, pointing it to the FAF log:

```powershell
cd src/faf.caster.bridge
dotnet run -- --log "C:\Users\<YOUR_USERNAME>\AppData\Roaming\Forged Alliance Forever\logs\replay_28107191.log"
```

The Vite development server proxies `/api` and `/ws` to `127.0.0.1:5077`, so no CORS configuration is required. If the bridge isn't running, the dashboard will show an offline status.

## API contract

- GET /api/health: `{status,players,records,lastUpdateUtc,source}`
- GET /api/players: array of latest player records
- WS /ws: `{"type":"snapshot","players":[...]}` and `{"type":"player","player":{...}}`

The bridge serves a snapshot of the **end** of a completed replay immediately. To see changing values, run the bridge against a log file while the game is appending telemetry.

## Limitations

- Resource `rate` values are shown as raw Sync.Score values until the correct per-second scaling is verified.
- Unit-category `built` fields are cumulative; they do not represent live category composition.
- The frontend keeps only the latest record per army, not a history suitable for graphs.
- No OBS-specific transparent overlay route yet.
- WebSocket reconnection is supported; after a log reset, old players may remain until the next snapshot or a manual refresh. A bridge reset event will be added in a later milestone.
