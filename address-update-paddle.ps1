# Address Update — Sync website to Paddle KYC
# Old: Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela
# New: 14 V. Tabakhmela, Tabakhmela, Mtatsminda district, Tbilisi 0114, Georgia

cd C:\Condoleads\project
$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Address Update for Paddle Compliance" -ForegroundColor Cyan
Write-Host " Timestamp: $timestamp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$oldAddr = "Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela"
$newAddr = "14 V. Tabakhmela, Tabakhmela, Mtatsminda district, Tbilisi 0114, Georgia"

Write-Host "`nOLD: $oldAddr" -ForegroundColor Yellow
Write-Host "NEW: $newAddr" -ForegroundColor Green

$files = @(
  "C:\Condoleads\project\app\zerooneleads\components\Footer.tsx",
  "C:\Condoleads\project\app\zerooneleads\privacy-policy\page.tsx",
  "C:\Condoleads\project\app\zerooneleads\terms-of-service\page.tsx",
  "C:\Condoleads\project\app\zerooneleads\contact\page.tsx"
)

# STEP 1 - Backup all files
Write-Host "`n[Step 1] Creating backups..." -ForegroundColor Yellow
foreach ($file in $files) {
  $backup = "$file.backup_$timestamp"
  if (-not (Test-Path -LiteralPath $file)) {
    throw "SOURCE MISSING: $file"
  }
  Copy-Item -LiteralPath $file -Destination $backup -Force
  if (Test-Path -LiteralPath $backup) {
    $size = (Get-Item -LiteralPath $backup).Length
    Write-Host "  OK ($size bytes): $(Split-Path $file -Leaf)" -ForegroundColor Green
  } else {
    throw "BACKUP FAILED: $file"
  }
}

# Helper function
function Replace-InFile {
  param([string]$Path, [string]$Old, [string]$New, [string]$Label)
  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $occurrences = ([regex]::Matches($content, [regex]::Escape($Old))).Count
  if ($occurrences -eq 0) { throw "[$Label] OLD STRING NOT FOUND in $Path" }
  if ($occurrences -gt 1) { throw "[$Label] OLD STRING FOUND $occurrences TIMES in $Path" }
  $newContent = $content.Replace($Old, $New)
  [System.IO.File]::WriteAllText($Path, $newContent, [System.Text.Encoding]::UTF8)
  Write-Host "  [$Label] Replaced" -ForegroundColor Green
}

# STEP 2 - Update Footer
Write-Host "`n[Step 2] Editing Footer.tsx..." -ForegroundColor Yellow
Replace-InFile -Path $files[0] -Old $oldAddr -New $newAddr -Label "Footer"

# STEP 3 - Update Privacy Policy
Write-Host "`n[Step 3] Editing privacy-policy..." -ForegroundColor Yellow
Replace-InFile -Path $files[1] -Old $oldAddr -New $newAddr -Label "Privacy"

# STEP 4 - Update Terms of Service
Write-Host "`n[Step 4] Editing terms-of-service..." -ForegroundColor Yellow
Replace-InFile -Path $files[2] -Old $oldAddr -New $newAddr -Label "Terms"

# STEP 5 - Update Contact page
Write-Host "`n[Step 5] Editing contact/page.tsx..." -ForegroundColor Yellow
Replace-InFile -Path $files[3] -Old $oldAddr -New $newAddr -Label "Contact"

# STEP 6 - Global verification
Write-Host "`n[Step 6] Verification..." -ForegroundColor Yellow

$oldRemaining = Get-ChildItem -Recurse -Include *.tsx,*.ts -Path "C:\Condoleads\project\app\zerooneleads" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike "*.backup_*" } |
  Select-String -Pattern ([regex]::Escape($oldAddr))

if ($oldRemaining) {
  Write-Host "  WARNING: Old address still found:" -ForegroundColor Red
  $oldRemaining | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber)" -ForegroundColor Red }
  throw "Old address still present somewhere"
}
Write-Host "  OK: No occurrences of old address remain" -ForegroundColor Green

$newCount = (Get-ChildItem -Recurse -Include *.tsx,*.ts -Path "C:\Condoleads\project\app\zerooneleads" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike "*.backup_*" } |
  Select-String -Pattern ([regex]::Escape($newAddr))).Count
Write-Host "  OK: New address found $newCount times (expected: 4)" -ForegroundColor Green

if ($newCount -ne 4) {
  Write-Host "  WARNING: Expected exactly 4 matches, found $newCount" -ForegroundColor Red
  throw "New address count mismatch"
}

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
  Write-Host "`n  Restore from backups with timestamp: $timestamp" -ForegroundColor Yellow
  throw "TypeScript check failed"
}
Write-Host "  OK: TypeScript check passed" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " ADDRESS UPDATE COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nBackup timestamp: $timestamp" -ForegroundColor Yellow
Write-Host "`nNEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. git diff                          (review changes)" -ForegroundColor White
Write-Host "  2. git add app/zerooneleads/         (stage)" -ForegroundColor White
Write-Host "  3. git commit -m 'fix: sync website address to Paddle KYC (14 V. Tabakhmela 0114)'" -ForegroundColor White
Write-Host "  4. git push origin main              (deploy via Vercel)" -ForegroundColor White
Write-Host "`nROLLBACK: Restore from .backup_$timestamp files" -ForegroundColor Yellow