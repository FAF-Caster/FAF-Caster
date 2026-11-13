param([string]$Configuration = "Release", [string]$Runtime = "win-x64")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "artifacts/FAF-Caster-Desktop"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null
Push-Location (Join-Path $root "FAF.Caster.dashboard")
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }
} finally { Pop-Location }
dotnet publish (Join-Path $root "FAF.Caster.Desktop/FAF.Caster.Desktop.csproj") -c $Configuration -r $Runtime --self-contained true -o $out
if ($LASTEXITCODE -ne 0) { throw "Desktop publish failed" }
$bridgeOut = Join-Path $out "bridge"
dotnet publish (Join-Path $root "FAF.Caster.Bridge") -c $Configuration -r $Runtime --self-contained true -o $bridgeOut
if ($LASTEXITCODE -ne 0) { throw "Bridge publish failed" }
Copy-Item (Join-Path $root "FAF.Caster.dashboard/dist") (Join-Path $out "dashboard") -Recurse -Force
Write-Host "Desktop build ready at $out"
Write-Host "Run FAF.Caster.Desktop.exe from that folder."
