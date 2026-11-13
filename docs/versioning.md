# Versioning policy

FAF Caster uses calendar versioning: **YY.MM.N**.

- `YY`: last two digits of release year (e.g. `26` for 2026).
- `MM`: two-digit release month (e.g. `11` for November).
- `N`: sequential release number **within that month**, starting at `0`.

Examples: `26.11.0` (first November 2026 release), `26.11.1` (second November release), `26.12.0` (first December release).

Stable Git tags should be prefixed with `v`, for example `v26.11.0`. Tag stable commits on `main` only. Desktop and UI mod versions may be released separately, but use the same naming convention.

## 26.11.0 scope

- Local Windows Companion, Bridge and OBS Overlay Studio.
- UI mod distributed separately.
- Cloud session linking **excluded** from 26.11.0; keep a future placeholder in desktop Settings. Do not expose cloud-session controls in the local Companion.
- Cloud infrastructure and authenticated linking are not part of this release.
