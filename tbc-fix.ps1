# TBC Compliance Fix Script
# Timestamp of backups: 20260417_114448

cd C:\Condoleads\project
$timestamp = "20260417_114448"
$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " TBC Compliance Fixes - Starting" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# STEP 0: Ensure Hero.tsx backup exists
$heroFile = "C:\Condoleads\project\app\zerooneleads\components\Hero.tsx"
$heroBackup = "$heroFile.backup_$timestamp"
if (-not (Test-Path -LiteralPath $heroBackup)) {
  Copy-Item -LiteralPath $heroFile -Destination $heroBackup -Force
  Write-Host "[Step 0] Hero.tsx backup CREATED" -ForegroundColor Green
} else {
  Write-Host "[Step 0] Hero.tsx backup already exists" -ForegroundColor Green
}

# STEP 1: Verify all required backups
Write-Host "`n[Step 1] Verifying backups..." -ForegroundColor Yellow
$requiredBackups = @(
  "C:\Condoleads\project\app\zerooneleads\components\Hero.tsx.backup_$timestamp",
  "C:\Condoleads\project\app\zerooneleads\components\Footer.tsx.backup_$timestamp",
  "C:\Condoleads\project\app\zerooneleads\privacy-policy\page.tsx.backup_$timestamp",
  "C:\Condoleads\project\app\zerooneleads\terms-of-service\page.tsx.backup_$timestamp",
  "C:\Condoleads\project\app\zerooneleads\contact\page.tsx.backup_$timestamp"
)
foreach ($bk in $requiredBackups) {
  if (Test-Path -LiteralPath $bk) {
    Write-Host "  OK: $(Split-Path $bk -Leaf)" -ForegroundColor Green
  } else {
    throw "BACKUP MISSING: $bk"
  }
}

# Helper
function Replace-InFile {
  param([string]$Path, [string]$Old, [string]$New, [string]$Label)
  $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $occurrences = ([regex]::Matches($content, [regex]::Escape($Old))).Count
  if ($occurrences -eq 0) { throw "[$Label] OLD STRING NOT FOUND in $Path" }
  if ($occurrences -gt 1) { throw "[$Label] OLD STRING FOUND $occurrences TIMES in $Path" }
  $newContent = $content.Replace($Old, $New)
  [System.IO.File]::WriteAllText($Path, $newContent, [System.Text.Encoding]::UTF8)
  Write-Host "  [$Label] Replaced successfully" -ForegroundColor Green
}

$emDash = [char]0x2014

# STEP 2: Hero.tsx
Write-Host "`n[Step 2] Editing Hero.tsx..." -ForegroundColor Yellow
$heroOld = ">Get Started " + $emDash + " `$500 Setup</a>"
$heroNew = ">Book Discovery Call</a>"
Replace-InFile -Path $heroFile -Old $heroOld -New $heroNew -Label "Hero CTA"

# STEP 3: Footer.tsx
Write-Host "`n[Step 3] Editing Footer.tsx..." -ForegroundColor Yellow
$footerFile = "C:\Condoleads\project\app\zerooneleads\components\Footer.tsx"
$footerOld = "<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>Kote Marjanishvili St. 30, Tbilisi, Georgia</span>"
$footerNew = "<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela</span>`n          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)' }}>Operated by Individual Entrepreneur LINKA" + " " + [char]0x00B7 + " ID: 304805726</span>"
Replace-InFile -Path $footerFile -Old $footerOld -New $footerNew -Label "Footer address + LINKA"

# STEP 4: Privacy Policy
Write-Host "`n[Step 4] Editing privacy-policy..." -ForegroundColor Yellow
$privacyFile = "C:\Condoleads\project\app\zerooneleads\privacy-policy\page.tsx"
Replace-InFile -Path $privacyFile -Old "Kote Marjanishvili St. 30, Tbilisi, Georgia" -New "Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela" -Label "Privacy address"

# STEP 5: Terms of Service
Write-Host "`n[Step 5] Editing terms-of-service..." -ForegroundColor Yellow
$termsFile = "C:\Condoleads\project\app\zerooneleads\terms-of-service\page.tsx"
$termsOld = "01leads " + $emDash + " Kote Marjanishvili St. 30, Tbilisi, Georgia<br />"
$termsNew = "01leads (Individual Entrepreneur LINKA, ID: 304805726)<br />`n          Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela<br />"
Replace-InFile -Path $termsFile -Old $termsOld -New $termsNew -Label "Terms address + LINKA"

# STEP 6: Contact page - insert Reach Us block
Write-Host "`n[Step 6] Editing contact page..." -ForegroundColor Yellow
$contactFile = "C:\Condoleads\project\app\zerooneleads\contact\page.tsx"
$contactRaw = [System.IO.File]::ReadAllText($contactFile, [System.Text.Encoding]::UTF8)
$useCrlf = $contactRaw.Contains("`r`n")
$nl = if ($useCrlf) { "`r`n" } else { "`n" }

$contactOld = "        )}" + $nl + "      </div>" + $nl + "    </div>"

$reachUsBlock = @(
  "        )}",
  "",
  "        <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)' }}>",
  "          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Reach Us</h3>",
  "          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, margin: 0 }}>",
  "            <strong style={{ color: 'rgba(255,255,255,0.8)' }}>01leads</strong><br />",
  "            Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela<br />",
  "            Email: <a href=`"mailto:contact@01leads.com`" style={{ color: '#3b82f6' }}>contact@01leads.com</a><br />",
  "            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Response time: Within 24 hours</span>",
  "          </p>",
  "          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 16 }}>",
  "            Operated by Individual Entrepreneur LINKA " + [char]0x00B7 + " ID: 304805726",
  "          </p>",
  "        </div>",
  "      </div>",
  "    </div>"
) -join $nl

Replace-InFile -Path $contactFile -Old $contactOld -New $reachUsBlock -Label "Contact Reach Us block"

# STEP 7: Verify no old strings remain
Write-Host "`n[Step 7] Final verification..." -ForegroundColor Yellow
$rem1 = Get-ChildItem -Recurse -Include *.tsx,*.ts -Path "C:\Condoleads\project\app\zerooneleads" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "*.backup_*" } | Select-String -Pattern "Marjanishvili"
$rem2 = Get-ChildItem -Recurse -Include *.tsx,*.ts -Path "C:\Condoleads\project\app\zerooneleads" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "*.backup_*" } | Select-String -Pattern '\$500 Setup'

if ($rem1) { Write-Host "  WARNING: Marjanishvili still found" -ForegroundColor Red; $rem1 | ForEach-Object { Write-Host "    $_" } } else { Write-Host "  OK: No Marjanishvili remaining" -ForegroundColor Green }
if ($rem2) { Write-Host "  WARNING: `$500 Setup still found" -ForegroundColor Red; $rem2 | ForEach-Object { Write-Host "    $_" } } else { Write-Host "  OK: No `$500 Setup remaining" -ForegroundColor Green }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " ALL EDITS COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nNEXT: Review changes with 'git diff', then test with 'npm run dev'" -ForegroundColor Yellow