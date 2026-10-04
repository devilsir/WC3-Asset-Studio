$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$targets = @(
  (Join-Path $root 'tools\effects-lab\effects-runtime.exe'),
  (Join-Path $root 'tools\effects-lab\cfxlib'),
  (Join-Path $root 'tools\effects-lab\effect-designer')
)
Write-Host 'WC3 Asset Studio - remove unverified Effects Lab third-party tools' -ForegroundColor Cyan
foreach ($target in $targets) {
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed: $target" -ForegroundColor Yellow
  } else {
    Write-Host "Already absent: $target" -ForegroundColor DarkGray
  }
}
Write-Host 'Done. The packaged app does not require these files. Configure an external PKB CLI from Effects Lab when needed.' -ForegroundColor Green
