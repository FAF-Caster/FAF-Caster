# FAF Caster — Milestone 10A (Cloudflare proof of concept)

Cloudflare Worker + SQLite-backed Durable Object, with session creation, one-time linking codes, authenticated telemetry upload, public player/history read endpoints, and WebSocket updates.

## Prerequisites
- Node.js 20+ and npm
- Cloudflare account (for deployment)

## Local development
```powershell
cd src/faf.caster.cloud
npm install
npm run typecheck
npm run dev
```
The default local URL is http://127.0.0.1:8787.

## Manual test (PowerShell)
```powershell
$base = 'http://127.0.0.1:8787'
$s = Invoke-RestMethod -Method Post -Uri "$base/api/sessions"
$s | Format-List
$link = Invoke-RestMethod -Method Post -Uri "$base/api/sessions/$($s.sessionId)/link" -ContentType 'application/json' -Body (@{ code = $s.linkingCode } | ConvertTo-Json)
$player = @{ version=2; update=1; gameTime=10; armyId=1; name='Test Player'; massIncome=2.5; massSpent=2; energyIncome=30; energySpent=25 }
Invoke-RestMethod -Method Post -Uri "$base/api/sessions/$($s.sessionId)/telemetry" -Headers @{ Authorization = "Bearer $($link.uploadToken)" } -ContentType 'application/json' -Body ($player | ConvertTo-Json)
Invoke-RestMethod "$base/api/sessions/$($s.sessionId)/players"
Invoke-RestMethod "$base/api/sessions/$($s.sessionId)/history"
```

## Deploy
```powershell
npx wrangler login
npm run deploy
```
Wrangler prints the deployed workers.dev URL. Use that URL as `$base` and repeat the manual test. Custom domain routing can be configured later.

## API
- `GET /api/health`
- `POST /api/sessions` → `sessionId`, `linkingCode`, expiry
- `POST /api/sessions/{id}/link` JSON `{ "code": "XXXXXX" }` → one-time `uploadToken`
- `POST /api/sessions/{id}/telemetry` Bearer upload token; single v2 record or array of up to 64
- `GET /api/sessions/{id}/players` → latest players
- `GET /api/sessions/{id}/history` → last 300 samples per player
- `GET /api/sessions/{id}/stream` → WebSocket snapshot and `players` updates

## Security and scope
**POC ONLY; do not publish to a large audience yet.** Public session creation and code linking lack IP-based rate limiting, abuse controls and user authentication. Codes expire after 10 minutes; sessions expire after six hours. The one-time code is returned to the session creator and must be kept private. Session IDs are unguessable but are effectively viewer access links. Upload tokens must never be put in URLs or frontend code. For production, add rate limiting, origin restrictions, moderation/quotas, request size enforcement at the edge, and a safer authenticated claim workflow. A six-character linking code has a limited search space and requires brute-force protection before public release. No durable historical archive or replay metadata is included. This Worker does not modify the existing companion or dashboard yet.

## Migration portability
The companion will talk only to HTTP endpoints and a WebSocket endpoint. A future FAF-hosted backend can implement the same protocol without modifying the Lua mod.
