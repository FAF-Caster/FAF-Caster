# FAF Caster Milestone 5 — Live economy

Copy `src/App.tsx` and `src/styles.css` into your existing `src/faf.caster.dashboard/src/` folder (overwrite those two files only). Or use the full project folder from this archive.

From `src/faf.caster.dashboard`, run `npm install` then `npm run dev`. Keep the .NET bridge running and start a fresh replay to generate new `[FAFCASTER:PLAYER]` log entries.

The bridge only exposes latest player snapshots and forwards *new* player records. This dashboard builds in-memory chart history from those new WebSocket messages; it cannot reconstruct previous historical data from an already-completed log. Each player keeps up to 300 samples. Refreshing the page resets history. Raw score rates are deliberately not labelled /s until units are verified.
