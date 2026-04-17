# Footer Readability Fix
# Brightens 4 opacity values in bottom row of Footer.tsx
# Does NOT touch nav links, borders, or Powered-by text

cd C:\Condoleads\project
$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$footerFile = "C:\Condoleads\project\app\zerooneleads\components\Footer.tsx"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Footer Readability Fix" -ForegroundColor Cyan
Write-Host " Timestamp: $timestamp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# STEP 1 - Backup
Write-Host "`n[Step 1] Creating backup..." -ForegroundColor Yellow
$backup = "$footerFile.backup_$timestamp"
Copy-Item -LiteralPath $footerFile -Destination $backup -Force
if (Test-Path -LiteralPath $backup) {
  $size = (Get-Item -LiteralPath $backup).Length
  Write-Host "  OK: Backup created ($size bytes)" -ForegroundColor Green
  Write-Host "  Path: $backup" -ForegroundColor Gray
} else {
  throw "BACKUP FAILED"
}

# Helper
function Replace-InFile {
  param([string]$Path, [string]$Old, [string]$New, [string]$Label)
  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $occurrences = ([regex]::Matches($content, [regex]::Escape($Old))).Count
  if ($occurrences -eq 0) { throw "[$Label] OLD STRING NOT FOUND" }
  if ($occurrences -gt 1) { throw "[$Label] OLD STRING FOUND $occurrences TIMES" }
  $newContent = $content.Replace($Old, $New)
  [System.IO.File]::WriteAllText($Path, $newContent, [System.Text.Encoding]::UTF8)
  Write-Host "  [$Label] Replaced" -ForegroundColor Green
}

# STEP 2 - Copyright (fontSize 13, no fontFamily)
Write-Host "`n[Step 2] Brightening copyright (0.18 -> 0.40)..." -ForegroundColor Yellow
$copyOld = "<span style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)' }}>"
$copyNew = "<span style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>"
Replace-InFile -Path $footerFile -Old $copyOld -New $copyNew -Label "Copyright"

# STEP 3 - Email (fontSize 13, fontFamily monospace)
Write-Host "`n[Step 3] Brightening email (0.18 -> 0.55)..." -ForegroundColor Yellow
$emailOld = "<span style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>"
$emailNew = "<span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>"
Replace-InFile -Path $footerFile -Old $emailOld -New $emailNew -Label "Email"

# STEP 4 - Address (fontSize 12)
Write-Host "`n[Step 4] Brightening address (0.15 -> 0.45)..." -ForegroundColor Yellow
$addrOld = "<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>"
$addrNew = "<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>"
Replace-InFile -Path $footerFile -Old $addrOld -New $addrNew -Label "Address"

# STEP 5 - LINKA disclosure (fontSize 11)
Write-Host "`n[Step 5] Brightening LINKA disclosure (0.12 -> 0.35)..." -ForegroundColor Yellow
$linkaOld = "<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)' }}>"
$linkaNew = "<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>"
Replace-InFile -Path $footerFile -Old $linkaOld -New $linkaNew -Label "LINKA disclosure"

# STEP 6 - Verification grep
Write-Host "`n[Step 6] Verification..." -ForegroundColor Yellow
$content = [System.IO.File]::ReadAllText($footerFile, [System.Text.Encoding]::UTF8)

$checks = @(
  @{ Pattern = "fontSize: 13, color: 'rgba\(255,255,255,0\.40\)' \}\}>© 2026"; Label = "Copyright -> 0.40" },
  @{ Pattern = "fontSize: 13, color: 'rgba\(255,255,255,0\.55\)', fontFamily: 'monospace' \}\}>contact@01leads"; Label = "Email -> 0.55" },
  @{ Pattern = "fontSize: 12, color: 'rgba\(255,255,255,0\.45\)' \}\}>Georgia, Tbilisi"; Label = "Address -> 0.45" },
  @{ Pattern = "fontSize: 11, color: 'rgba\(255,255,255,0\.35\)' \}\}>Operated by Individual"; Label = "LINKA -> 0.35" }
)

$allOk = $true
foreach ($check in $checks) {
  if ($content -match $check.Pattern) {
    Write-Host "  OK: $($check.Label)" -ForegroundColor Green
  } else {
    Write-Host "  FAIL: $($check.Label) - pattern not found" -ForegroundColor Red
    $allOk = $false
  }
}

if (-not $allOk) { throw "Verification failed - review file manually" }

# STEP 7 - TypeScript check
Write-Host "`n[Step 7] TypeScript check..." -ForegroundColor Yellow
Write-Host "  (takes 30-60 seconds)" -ForegroundColor Gray
$ErrorActionPreference = "Continue"
$tscOutput = npx tsc --noEmit 2>&1
$tscExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($tscExit -ne 0) {
  Write-Host "  TYPESCRIPT ERRORS:" -ForegroundColor Red
  $tscOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  Write-Host "`n  RESTORE: Copy-Item -LiteralPath '$backup' -Destination '$footerFile' -Force" -ForegroundColor Yellow
  throw "TypeScript check failed"
}
Write-Host "  OK: TypeScript check passed" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " FOOTER READABILITY FIX COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nNEXT STEPS (manual):" -ForegroundColor Yellow
Write-Host "  1. git diff app/zerooneleads/components/Footer.tsx" -ForegroundColor White
Write-Host "  2. npm run dev -> check http://localhost:3000" -ForegroundColor White
Write-Host "  3. git add app/zerooneleads/components/Footer.tsx" -ForegroundColor White
Write-Host "  4. git commit -m 'style(01leads): brighten footer business info for readability'" -ForegroundColor White
Write-Host "  5. git push origin main" -ForegroundColor White
Write-Host "`nROLLBACK (if needed):" -ForegroundColor Yellow
Write-Host "  Copy-Item -LiteralPath '$backup' -Destination '$footerFile' -Force" -ForegroundColor White