# FAF Caster — Development Roadmap

> **Status:** Proposed roadmap · **Stable baseline:** `v26.11.2` · **Cadence:** Release when ready (no fixed deadlines)
>
> This is a planning document, not a promise of delivery dates or confirmed telemetry capabilities. Release names and version numbers after the current stable release are **provisional** and will be assigned or adjusted when releases are prepared.

FAF Caster is a Windows casting companion for Forged Alliance Forever (FAF), combining a desktop application, local telemetry bridge, Companion dashboard, and OBS browser overlays. This roadmap focuses on dependable casting sessions, straightforward setup, useful statistics, and tournament-ready workflows.

## Contents

- [Release philosophy](#release-philosophy)
- [Roadmap at a glance](#roadmap-at-a-glance)
- [Release plans](#release-plans)
- [Bug prioritisation](#bug-prioritisation)
- [Release quality gates](#release-quality-gates)
- [GitHub milestone and issue structure](#github-milestone-and-issue-structure)
- [Branching, versioning and release process](#branching-versioning-and-release-process)
- [Future backlog](#future-backlog)
- [Roadmap maintenance](#roadmap-maintenance)

## Release philosophy

Each planned feature release aims to include:

| Work type | Release scope |
| --- | --- |
| **New features** | **1–2** user-facing capabilities |
| **Quality of life (QoL)** | **2–4** smaller usability improvements |
| **Bug fixes** | Confirmed issues prioritised by severity; no arbitrary quota |
| **Testing** | Automated checks, regression tests, and relevant real FAF/replay/observer tests |
| **Timing** | **When ready**; no fixed deadlines |

**Guiding principles**

1. Keep the published Windows application stable. `main` is the stable release branch; feature work targets `develop` via pull requests.
2. Prefer smaller, testable improvements to large, open-ended releases.
3. Freeze a release's planned scope once implementation starts; new requests enter the backlog unless they are release-blocking.
4. Never describe telemetry metrics as supported until access, accuracy, and observer behaviour have been validated.
5. Distinguish **planned**, **in development**, **tested**, and **released**. Merged code is not automatically a released feature.
6. Allow urgent security or critical reliability **hotfixes** to ship independently of the feature cadence.
7. Preserve existing OBS overlay URLs/configurations where practical; document migrations when breaking changes are unavoidable.

## Roadmap at a glance

| Provisional version | Theme | New features | QoL items | Main release outcome |
| --- | --- | ---: | ---: | --- |
| **v26.11.3** | Session Stability & Recovery | 2 | 4 | Reliable source switching and connection recovery |
| **v26.12.1** | Installation & Onboarding | 2 | 4 | Clean setup with guided verification |
| **v26.12.2** | OBS Overlay Studio | 2 | 4 | Customisable, reusable OBS overlays |
| **v27.1.1** | Economy Analytics | 2 | 4 | Trustworthy economy comparisons and trends |
| **v27.1.2** | Military & Combat Analytics | 2 | 4 | Validated army composition and combat data |
| **v27.2.1** | Tournament & Broadcast Tools | 2 | 4 | Reusable tournament casting setup |
| **v27.2.2** | Match History & Export | 2 | 4 | Review and export completed sessions |

**Sequencing:** The next release is the only one intended to have a *locked* scope after review. Later releases are directional plans and can be reordered, reduced, or renamed. Version identifiers are placeholders if release timing changes.

---

## Release plans

### v26.11.3 — Session Stability & Recovery

**Goal:** The caster can move between games/replays and recover from interrupted connections without restarting the desktop application.

**New features (2)**

- [ ] **Automatic match/replay switching:** Detect when a newer valid session becomes active, avoid remaining pinned to an old replay, and show the chosen source.
- [ ] **Connection health dashboard:** Display independent health indicators for FAF/session detection, telemetry bridge, Companion, and telemetry freshness.

**QoL improvements (4)**

- [ ] Manual **Reconnect / Rescan** action with clear feedback.
- [ ] Show last detected match identifier, session type, and data timestamp where available.
- [ ] Actionable error messages for missing mod, unavailable bridge, and stale telemetry.
- [ ] Remember desktop window size and position between launches.

**Bug-fix priorities**

- Investigate and fix stale replay selection when a new session starts.
- Investigate connection drops and recovery after FAF or bridge restarts.
- Triage startup, permissions, and routing regressions reported against the stable installer.

**Acceptance criteria / release gate**

- [ ] Sequential Replay A → Replay B transitions to the correct source, without manually deleting old replay files.
- [ ] Switching from a replay to an observer session selects the intended active source, where supported.
- [ ] FAF and bridge restarts produce a visible disconnected state and recover without a desktop-app restart.
- [ ] Stale data is visibly labelled, not presented as live.
- [ ] Existing Companion and overlay functionality passes regression tests.

**Dependencies / risks:** Match detection must distinguish live observer data from replay logs; test real observer sessions separately from replay playback.

### v26.12.1 — Installation & Onboarding

**Goal:** New users can install and validate FAF Caster without needing to troubleshoot paths and dependencies manually.

**New features (2)**

- [ ] **First-run setup wizard:** Guided configuration of the app, FAF integration, bridge, and Companion.
- [ ] **Automatic mod installation and verification:** Install/update the compatible UI-only mod into the correct location and report version mismatches.

**QoL improvements (4)**

- [ ] Setup checklist with pass/warn/fail indicators.
- [ ] Shortcuts to open relevant FAF/mod/configuration directories.
- [ ] One-click diagnostics export with sensitive paths/tokens reviewed or redacted.
- [ ] Clearer settings navigation and explanatory help text.

**Bug-fix priorities**

- Installer and file-system permission problems.
- Incorrect mod locations or version detection.
- Missing runtime/dependency error handling.

**Acceptance criteria / release gate**

- [ ] Clean Windows installation reaches a verified Companion connection using the documented wizard.
- [ ] Setup reports missing or incompatible prerequisites accurately.
- [ ] Mod installation does not overwrite unrelated user files or mods.
- [ ] Diagnostics are useful and do not unintentionally expose credentials or private information.

**Dependencies / risks:** Verify FAF mod folder conventions and permissions across supported installations; mod updates must be reversible or safely repeatable.

### v26.12.2 — OBS Overlay Studio

**Goal:** Casters can customise and reuse OBS overlays without manually editing files or URLs.

**New features (2)**

- [ ] **Visual overlay appearance editor:** Configure supported fonts, colours, spacing, visibility, and layout options with preview.
- [ ] **Overlay presets:** Save, name, load, and manage reusable overlay configurations.

**QoL improvements (4)**

- [ ] Copy OBS Browser Source URL in one click.
- [ ] Reset an overlay or preset to safe defaults.
- [ ] Improve live preview, including empty/disconnected states.
- [ ] Rename and organise saved overlay presets.

**Bug-fix priorities**

- Configuration not persisting across app restarts.
- Browser Source scaling, layout, or rendering issues.
- Broken or inconsistent overlay URL behaviour.

**Acceptance criteria / release gate**

- [ ] Configure an overlay, save it, restart the app, and reload an identical result.
- [ ] A copied URL opens correctly as an OBS Browser Source.
- [ ] Overlays handle unavailable/stale telemetry gracefully.
- [ ] Existing overlay links continue to work, or a documented migration is provided.

**Dependencies / risks:** Keep a versioned preset schema to support future configuration changes.

### v27.1.1 — Economy Analytics

**Goal:** Give casters reliable, readable economy comparisons instead of just raw values.

**New features (2)**

- [ ] **Advanced economy comparison:** Compare players and teams using verified economy metrics.
- [ ] **Configurable economy trend charts:** Select metrics and time windows supported by the telemetry stream.

**QoL improvements (4)**

- [ ] Sortable economy tables.
- [ ] Clear chart tooltips with metric names and units.
- [ ] Quick player/team comparison selector.
- [ ] Compact statistics view for smaller screens.

**Bug-fix priorities**

- Incorrect or stale economy figures.
- Player/team mapping errors.
- Chart performance during long sessions.

**Acceptance criteria / release gate**

- [ ] Validate economy metrics against known replay scenarios and observer-visible data.
- [ ] Distinguish zero, unknown, unavailable, and stale values.
- [ ] Charts remain responsive during extended matches.
- [ ] Team aggregation is correct for supported team configurations.

**Dependencies / risks:** Verify economy access through the FAF observer UI and bridge; do not infer unavailable data.

### v27.1.2 — Military & Combat Analytics

**Goal:** Show meaningful army composition and combat changes when the FAF observer API reliably supports the underlying data.

**New features (2)**

- [ ] **Army composition:** Unit counts grouped by land/air/naval and tech level, based on validated classification rules.
- [ ] **Combat and loss statistics:** Show supported loss/kill metrics with clearly defined calculations.

**QoL improvements (4)**

- [ ] Quick player comparison shortcuts.
- [ ] Collapsible military panels.
- [ ] Filters for unit domains and tech levels.
- [ ] Clear legends and definitions for derived metrics.

**Bug-fix priorities**

- Incorrect unit classification or double-counting.
- Missing values during observer focus changes.
- Performance problems in large matches.

**Acceptance criteria / release gate**

- [ ] Complete a technical feasibility audit before feature implementation.
- [ ] Verify counts and categories against controlled test matches.
- [ ] Confirm acceptable update frequency and performance in large games.
- [ ] Omit or mark unsupported metrics rather than presenting guesses.

**Dependencies / risks:** This release is **conditional on telemetry feasibility**. If observer-safe unit enumeration or loss metrics are unavailable, substitute another validated feature rather than bypassing game restrictions.

### v27.2.1 — Tournament & Broadcast Tools

**Goal:** Make repeated tournament casting sessions fast to configure and consistent on stream.

**New features (2)**

- [ ] **Tournament profiles:** Save tournament/event name, display preferences, team colours, and overlay selections.
- [ ] **Team scoreboard overlays:** Present verified player/team information in a broadcast-friendly layout.

**QoL improvements (4)**

- [ ] Custom player display names.
- [ ] Save and reuse team colour assignments.
- [ ] Pre-broadcast readiness checklist.
- [ ] Quick profile switching between rounds/events.

**Bug-fix priorities**

- Incorrect team assignment or player order.
- Observer-session interruptions.
- Inconsistent appearance between preview and OBS.

**Acceptance criteria / release gate**

- [ ] Complete a tournament-style observer casting test with overlays enabled.
- [ ] Profiles persist and load without leaking settings across events.
- [ ] Scoreboard handles FFA and team games as supported.
- [ ] No unintended access to or display of hidden gameplay information.

**Dependencies / risks:** Real observer-session validation is mandatory; a replay-only test is insufficient.

### v27.2.2 — Match History & Export

**Goal:** Let casters revisit completed sessions and export data for post-match analysis.

**New features (2)**

- [ ] **Local match history:** Store and browse completed casting sessions and available summary statistics.
- [ ] **CSV/JSON export:** Export supported statistics with a documented schema and units.

**QoL improvements (4)**

- [ ] Recent-match shortcuts.
- [ ] Search and filter history.
- [ ] Configurable export folder.
- [ ] Clear individual/all stored match records with confirmation.

**Bug-fix priorities**

- Duplicate or incomplete session records.
- Invalid export formatting or file errors.
- Slow history loading with large data sets.

**Acceptance criteria / release gate**

- [ ] Match history survives application restart.
- [ ] Duplicate detection works for supported session identifiers.
- [ ] Exported CSV/JSON parses correctly and includes metric definitions or schema version.
- [ ] Users can find, export, and delete local records.

**Dependencies / risks:** Define storage limits, schema migrations, and a clear privacy/retention policy for local data.

---

## Bug prioritisation

| Priority | Definition | Response |
| --- | --- | --- |
| **P0 — Blocker** | App cannot launch for affected supported users; serious security/data issue; release fundamentally unusable | Stop release; investigate immediately; hotfix as appropriate |
| **P1 — High** | Core casting, telemetry, or recovery flow fails without a reasonable workaround | Fix before the next stable release when release-blocking |
| **P2 — Medium** | Partial feature failure with a usable workaround | Schedule into the nearest suitable release |
| **P3 — Low** | Cosmetic issue, minor usability defect, rare edge case | Maintain in backlog; batch with QoL work |

Every bug report should record: affected version, environment/Windows version, FAF mode (replay, observer, etc.), reproduction steps, expected versus actual behaviour, relevant logs, severity, and verification steps.

**Carry-over policy:** No known unresolved P0 or release-blocking P1 issues at publication. P2/P3 issues may be carried forward with explicit documentation.

## Release quality gates

Use this checklist for **every** stable release:

- [ ] Scope reviewed: 1–2 features, 2–4 QoL items, confirmed bug fixes.
- [ ] Each included issue has measurable acceptance criteria and test evidence.
- [ ] CI build, automated tests, and static checks pass.
- [ ] Windows installer builds successfully and passes clean-install/launch smoke tests.
- [ ] Bridge, Companion, desktop navigation, and existing overlays pass regression tests.
- [ ] Relevant replay, local observer, and live observer scenarios are tested or explicitly marked not applicable with justification.
- [ ] FAF restart, bridge restart, stale-data handling, and recovery are tested where affected.
- [ ] OBS Browser Source rendering is tested if overlays or configuration changed.
- [ ] No unresolved P0 or release-blocking P1 issues.
- [ ] Release notes document **Added**, **Improved**, **Fixed**, and **Known Issues**.
- [ ] Release candidate reviewed and approved before merging/tagging stable.
- [ ] Published installer and download link verified after release.

### Recommended telemetry regression matrix

| Scenario | Expected behaviour |
| --- | --- |
| Replay A starts | Correct session and data source detected |
| Replay A → Replay B | New source selected; old replay not treated as active |
| Replay → live observer | Correct active source selected, if supported |
| FAF closes/restarts | Clear disconnected state and automatic recovery |
| Bridge closes/restarts | Companion displays interruption and recovers |
| No active match | No misleading live data; clear idle state |
| Long / large match | Acceptable memory use, update frequency, and responsiveness |
| OBS overlay with missing data | Graceful placeholder rather than broken layout |

**Telemetry safety:** Do not assume a UI-only mod can access arbitrary simulation state or make outbound HTTP/WebSocket calls. Verify the actual observer APIs and use the approved local bridge design.

## GitHub milestone and issue structure

### Milestones

Create **one GitHub milestone per release**, with **no due date**. Suggested milestone names:

1. `v26.11.3 — Session Stability & Recovery`
2. `v26.12.1 — Installation & Onboarding`
3. `v26.12.2 — OBS Overlay Studio`
4. `v27.1.1 — Economy Analytics`
5. `v27.1.2 — Military & Combat Analytics`
6. `v27.2.1 — Tournament & Broadcast Tools`
7. `v27.2.2 — Match History & Export`

Milestone descriptions should link to the relevant section of this document and state the release goal and exit criteria. **Only lock the next release's scope**; keep later milestones flexible. Do not assign release dates until there is a genuine scheduling need.

### Suggested issue labels

| Label group | Labels |
| --- | --- |
| Type | `type:feature`, `type:bug`, `type:qol`, `type:maintenance` |
| Priority | `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3` |
| Component | `area:desktop`, `area:bridge`, `area:companion`, `area:overlay`, `area:mod`, `area:installer`, `area:ci` |
| Workflow | `status:needs-triage`, `status:blocked`, `status:testing` |

### Suggested GitHub Project workflow

`Backlog → Ready → In Progress → Review → Testing → Done`

**Milestones** track what belongs in a release; the **Project board** tracks work status. GitHub issues should be independently testable and linked to the appropriate milestone.

### Issue template

```md
## Summary
What needs to change and why?

## Type / component / priority
Feature, QoL, bug, or maintenance; affected component; P0–P3 where applicable.

## Acceptance criteria
- [ ] Observable outcome 1
- [ ] Observable outcome 2

## Test plan
- [ ] Automated or unit tests, where applicable
- [ ] Relevant FAF replay/observer/manual validation
- [ ] Regression test of related existing functionality

## Dependencies / risks
What must be validated or completed first?

## Release milestone
Target version, or Backlog if not yet scheduled.
```

## Branching, versioning and release process

1. **Plan:** Review confirmed bugs, select 1–2 features and 2–4 QoL improvements, document dependencies and acceptance criteria.
2. **Implement:** Work on short-lived `feature/*`, `fix/*`, or `chore/*` branches; open PRs targeting `develop`.
3. **Integrate:** Require review and passing CI before merging to `develop`.
4. **Test:** Produce a release candidate and run the release quality gates, including actual FAF tests where applicable.
5. **Publish:** Merge the tested release to `main`, tag the stable version, build/publish the Windows installer, and verify the release assets.
6. **Communicate:** Publish release notes and update website documentation or screenshots if affected.
7. **Review:** Move unfinished nonblocking work to a future milestone and capture lessons learned.

**Versioning note:** The existing date-oriented version scheme is retained, but future version numbers in this document are provisional. If a release occurs in a different month/year, adjust the version at release time rather than treating the roadmap as a deadline.

**Hotfixes:** A critical fix may bypass the 1–2 feature rule. Apply it to the stable branch through an appropriately reviewed fix process, then ensure the change is also present in `develop`.

## Future backlog

These are **ideas**, not committed release features:

- Commander health/status overlays, subject to verified observer-safe telemetry.
- Match-event timeline and noteworthy changes in match momentum.
- Advanced map-control metrics, subject to telemetry feasibility.
- More flexible custom dashboard widgets.
- OBS scene integration and streamlined broadcast switching.
- Additional overlay layouts and accessibility improvements.
- Export schema documentation and optional external integrations.
- Localisation / multi-language UI.
- Community extension or plugin support, after a stable interface is designed.
- Build pipeline improvements, including NuGet caching and avoiding unnecessary installer packaging on routine PR checks.

Backlog ideas should receive a feasibility assessment before being assigned to a release.

## Roadmap maintenance

- **After each stable release:** Mark delivered work complete, document deferred work, and review the next milestone.
- **Before starting a milestone:** Audit current implementation to avoid duplicating features that already exist; identify confirmed bugs and telemetry constraints.
- **During development:** Keep scope stable; route newly discovered noncritical requests to Backlog.
- **When dependencies fail:** Replace or defer a feature rather than ship unreliable or misleading data.
- **Public communication:** Treat this document as a statement of intent, not a guarantee of dates or feature availability.

---

**Current status:** Planning only. This document does not create GitHub issues, milestones, labels, branches, or releases.
