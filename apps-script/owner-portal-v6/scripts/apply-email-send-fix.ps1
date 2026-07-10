param(
  [string]$ScriptId = "13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o",
  [string]$WorkDir = "h38-owner-portal-apps-script"
)

$ErrorActionPreference = "Stop"

Write-Host "H38 V6 clasp setup starting..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js LTS first: https://nodejs.org/"
}

if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
  Write-Host "Installing clasp globally..."
  npm install -g @google/clasp
}

if (-not (Test-Path $WorkDir)) {
  Write-Host "Cloning Apps Script project..."
  clasp clone $ScriptId --rootDir $WorkDir
} else {
  Write-Host "Using existing folder: $WorkDir"
}

Copy-Item "apps-script/owner-portal-v6/fixes/H38OwnerApprovedEmailSend.gs" "$WorkDir/H38OwnerApprovedEmailSend.gs" -Force

Push-Location $WorkDir
Write-Host "Pushing fix to Apps Script..."
clasp push
Pop-Location

Write-Host "Done. Refresh the Owner Review Portal spreadsheet and run H38 Owner Portal -> Send Approved Email Draft."
