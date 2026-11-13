param([string]$Configuration = "Release", [string]$Runtime = "win-x64")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "artifacts/FAF-Caster-Desktop"
$running = @(Get-Process -Name 'FAF.Caster.Desktop', 'FAFCaster.Bridge' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
  $names = ($running | ForEach-Object { "$($_.ProcessName) (PID $($_.Id))" }) -join ', '
  throw "FAF Caster is still running: $names. Exit the desktop app and Bridge, then retry."
}
if (Test-Path $out) {
  try { Remove-Item $out -Recurse -Force -ErrorAction Stop }
  catch { throw "Unable to clean '$out'. Close FAF Caster and retry. Original error: $($_.Exception.Message)" }
}
New-Item -ItemType Directory -Force -Path $out | Out-Null
Push-Location (Join-Path $root "FAF.Caster.dashboard")
try {
  if (-not (Test-Path 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  } else {
    Write-Host 'Using existing node_modules.'
  }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }
} finally { Pop-Location }

$versionArgs = @()
if ($env:FAF_CASTER_RELEASE_VERSION) {
  $v = $env:FAF_CASTER_RELEASE_VERSION
  if ($v -notmatch '^\d{2}\.\d{2}\.\d+$') { throw "Invalid release version: $v" }
  $versionArgs = @("-p:Version=$v", "-p:AssemblyVersion=$v.0", "-p:FileVersion=$v.0")
  Write-Host "Publishing stable version $v"
}
dotnet publish (Join-Path $root "FAF.Caster.Desktop/FAF.Caster.Desktop.csproj") -c $Configuration -r $Runtime --self-contained true -o $out @versionArgs
if ($LASTEXITCODE -ne 0) { throw "Desktop publish failed" }
$bridgeOut = Join-Path $out "bridge"
dotnet publish (Join-Path $root "FAF.Caster.Bridge") -c $Configuration -r $Runtime --self-contained true -o $bridgeOut @versionArgs
if ($LASTEXITCODE -ne 0) { throw "Bridge publish failed" }
Copy-Item (Join-Path $root "FAF.Caster.dashboard/dist") (Join-Path $out "dashboard") -Recurse -Force
Write-Host "Desktop build ready at $out"
Write-Host "Run FAF.Caster.Desktop.exe from that folder."
