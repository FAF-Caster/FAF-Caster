param([string]$Configuration = "Release", [string]$Runtime = "win-x64")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "artifacts/FAF-Caster-Desktop"
# Refuse to overwrite running binaries. The desktop window may be hidden in the tray.
$running = @(Get-Process -Name 'FAF.Caster.Desktop', 'FAFCaster.Bridge' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
  $names = ($running | ForEach-Object { "$($_.ProcessName) (PID $($_.Id))" }) -join ', '
  throw "FAF Caster is still running: $names. Right-click its system tray icon and choose 'Exit FAF Caster', then retry. If you started the Bridge separately, stop that process too."
}
if (Test-Path $out) {
  try {
    Remove-Item $out -Recurse -Force -ErrorAction Stop
  } catch {
    throw "Unable to clean '$out'. A file may still be locked by a running process (including an old Bridge). Close FAF Caster from the system tray and retry. Original error: $($_.Exception.Message)"
  }
}
New-Item -ItemType Directory -Force -Path $out | Out-Null
Push-Location (Join-Path $root "FAF.Caster.dashboard")
try {
  if (-not (Test-Path 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  } else {
    Write-Host 'Using existing node_modules to avoid replacing locked esbuild.exe.'
  }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }
} finally { Pop-Location }
$versionArgs = @()
if ($env:FAF_CASTER_RELEASE_VERSION) {
  if ($env:FAF_CASTER_RELEASE_VERSION -notmatch '^\d{2}\.\d{2}\.\d+
if ($LASTEXITCODE -ne 0) { throw "Desktop publish failed" }
$bridgeOut = Join-Path $out "bridge"
dotnet publish (Join-Path $root "FAF.Caster.Bridge") -c $Configuration -r $Runtime --self-contained true -o $bridgeOut @versionArgs
if ($LASTEXITCODE -ne 0) { throw "Bridge publish failed" }
Copy-Item (Join-Path $root "FAF.Caster.dashboard/dist") (Join-Path $out "dashboard") -Recurse -Force
Write-Host "Desktop build ready at $out"
Write-Host "Run FAF.Caster.Desktop.exe from that folder."
) {
    throw "Invalid FAF_CASTER_RELEASE_VERSION: $env:FAF_CASTER_RELEASE_VERSION"
  }
  $v = $env:FAF_CASTER_RELEASE_VERSION
  $versionArgs = @("-p:Version=$v", "-p:AssemblyVersion=$v.0", "-p:FileVersion=$v.0")
  Write-Host "Publishing stable version $v"
}
dotnet publish (Join-Path $root "FAF.Caster.Desktop/FAF.Caster.Desktop.csproj") -c $Configuration -r $Runtime --self-contained true -o $out @versionArgs
if ($LASTEXITCODE -ne 0) { throw "Desktop publish failed" }
$bridgeOut = Join-Path $out "bridge"
dotnet publish (Join-Path $root "FAF.Caster.Bridge") -c $Configuration -r $Runtime --self-contained true -o $bridgeOut
if ($LASTEXITCODE -ne 0) { throw "Bridge publish failed" }
Copy-Item (Join-Path $root "FAF.Caster.dashboard/dist") (Join-Path $out "dashboard") -Recurse -Force
Write-Host "Desktop build ready at $out"
Write-Host "Run FAF.Caster.Desktop.exe from that folder."
