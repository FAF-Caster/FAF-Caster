# FAF Caster Companion v2 — source update

## Installation (Windows / .NET 10 SDK)

1. Back up your existing `src\faf.caster.companion` folder.
2. Copy the five project files from this ZIP into that folder, replacing the existing files.
3. Open PowerShell in the folder and run `dotnet build` followed by `dotnet run`.
4. Create a new cloud session, enter the six-character code, and start a fresh observer match.

## Changes
- Detects both `game_*.log` and `replay_*.log` under `%APPDATA%\Forged Alliance Forever\logs`.
- Follows the newest modified matching log and handles truncation/replacement heuristically.
- Shows current file, inferred match ID, mode, upload status and recent activity.
- Keeps the existing `/api/link` and telemetry upload API contract.
- Suppresses cloud upload when opening an old log (older than 15 seconds) to avoid uploading an old replay's history as live data.

## Caveats
- **Not compiled or runtime-tested here**: build on Windows with the .NET 10 SDK and report any errors.
- Detection uses file modification time, not a guaranteed process-to-log association. A background replay log written more recently can still take priority.
- In-game observer is inferred from a `game_` filename; the actual Lua mod is responsible for validating observer status.
- The old project stores session credentials in memory only; linking is needed after each restart.
- If switching matches mid-upload, the in-flight HTTP request may already have been accepted by the server; server-side game/session separation is a future hardening step.
