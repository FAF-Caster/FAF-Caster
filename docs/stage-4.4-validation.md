# Stage 4.4 — Local validation

## Build checks

From the repository root on Windows:

```powershell
dotnet build .\FAF.Caster.Bridge
cd .\FAF.Caster.dashboard
npm ci
npm run build
```

Start the Bridge and Vite dashboard in separate terminals, then visit
`http://localhost:5173/local/studio`.

## Test matrix

1. Start a FAF replay or live observer match with at least two players. Verify player names and faction labels appear in a scoreboard widget.
2. Add a scoreboard widget, select a single player under **Players**, and confirm only that army appears. Clear every checkbox to restore all players.
3. Set a maximum player count, then select a team filter. Verify only players assigned to that team appear.
4. Enable **Group by team** and verify headings and aggregated scores. Compare against the main dashboard's team assignments.
5. Add an economy widget. Switch **Mass and energy**, **Mass only**, **Energy only**. Verify income, spending and stored resources update as the game progresses.
6. Apply each preset (1v1, 2v2, Team game, Tournament) to different slots. Verify each produces the expected widgets and that switching slots retains its own settings.
7. Change tournament name, round, score, and available team display names. Verify the tournament widget and grouped scoreboard update.
8. Copy a slot's browser URL into OBS at 1920×1080. Verify transparency, layout and live telemetry; edit the widget while OBS is open and check changes arrive within a few seconds.
9. Restart the Bridge, browser, and OBS. Confirm the five layouts persist and the sources reconnect.
10. Test no active match, a match ending, and a new match starting. Confirm no stale economy values are misrepresented as current.

## Data limitations

All player and economy values come from the existing UI-only FAF telemetry. Team IDs come from match metadata/manual dashboard assignments; unavailable assignments are unassigned. This batch does not add simulation-only unit inspection or commander health.

## Known caveats

- Team overrides currently made in the main dashboard use browser localStorage, which is not automatically shared with OBS. For dependable OBS team grouping, use team IDs supplied by match metadata. A future Bridge-backed team assignment API should unify manual overrides.
- The original Bridge configuration API accepts five slots but does not enforce a schema for each widget. Keep the Bridge bound to localhost and do not expose its configuration API to the internet.
- Browser-source scaling should be checked at 1920×1080 before a live tournament.

If `npm run build` or `dotnet build` fails, capture the complete error before testing OBS.
