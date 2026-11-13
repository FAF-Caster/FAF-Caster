# Development and release workflow

- `main`: tested, stable release code. Do not commit experimental work directly.
- `develop`: integration and QA branch. Desktop `develop` was initially created from `feature/stage-5-desktop` to retain the unmerged desktop work.
- `feature/*` and `fix/*`: branch from `develop`, open a pull request back to `develop`.
- When QA passes, open a pull request from `develop` to `main`, then tag a version on `main`.
- Protect both branches using GitHub repository Settings > Branches or Rulesets: require pull requests and successful CI before merging. Repository rulesets must be configured by an administrator.

## Build artifacts

The desktop workflow packages the self-contained Windows x64 application, Bridge and compiled dashboard as a portable ZIP. This is not yet an installer. The UI mod repository has a separate workflow that validates metadata and packages a folder containing `mod_info.lua` into a ZIP for Mod Vault testing.

GitHub Actions artifacts are CI outputs, not automatic Mod Vault submissions. Download and test the mod ZIP before manually uploading it to the FAF Mod Vault. Do not publish development/test UID builds as stable releases.

## Release gates

- Confirm Windows desktop builds and starts on a clean Windows 11 machine with WebView2 runtime available.
- Test Bridge startup, reconnect, tray exit and locked-file cleanup.
- Test live observer telemetry, replay-to-live switching and OBS overlays.
- Verify the UI mod's name, UID, version and metadata before Mod Vault submission; do not reuse a test UID for the public release without deciding on a stable identity.
- Tag only verified releases from `main`.
