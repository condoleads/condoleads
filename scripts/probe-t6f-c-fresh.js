// scripts/probe-t6f-c-fresh.js
//
// Read-only T6f-C scope probe. Targets:
//   1. app/api/walliam/charlie/vip-approve/route.ts (Shape A-adjacent, uses validateSession)
//   2. app/api/walliam/contact/route.ts (NO existing tenant SELECT — needs getTenantContext)
//
// For each file, captures (per the T6f-A complete-identifier-reference lesson):
//   1. File size + line count + line endings + BOM detection
//   2. Imports section (first 30 lines) — for new import insertion design
//   3. Every /walliam/i line (uncapped — no probe filter bug)
//   4. Every BASE_URL / baseUrl / BASE_URL identifier ref (full identifier scan)
//   5. Every inline NEXT_PUBLIC_APP_URL reference
//   6. Tenant SELECT presence (search `.from('tenants')`) + surrounding 10-line context
//   7. validateSession call sites + return-value destructure (for vip-approve)
//   8. Helper function signatures + call sites in file
//   9. POST body opening (first 10 lines after `export async function POST`) — anchor for new tenant load in contact route
//  10. T6c-leftover hits in contact (search `source: source ||`)
//
// Output: recon/W-LEADS-EMAIL-T6F-C-FRESH.txt + stdout summary.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const OUT = path.join('recon', 'W-LEADS-EMAIL-T6F-C-FRESH.txt')

const FILES = [
  'app/api/walliam/charlie/vip-approve/route.ts',
  'app/api/walliam/contact/route.ts',
]

function readFileRaw(p) {
  const abs = path.resolve(ROOT, p)
  if (!fs.existsSync(abs)) return null
  const raw = fs.readFileSync(abs, 'utf8')
  const bytes = fs.readFileSync(abs)
  const hasBOM = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF
  const usesCRLF = raw.includes('\r\n')
  return { raw, bytes: bytes.length, hasBOM, usesCRLF }
}

const out = []
out.push('W-LEADS-EMAIL T6f-C fresh recon probe (read-only)')
out.push('Scope: walliam/charlie/vip-approve + walliam/contact')
out.push('Generated: ' + new Date().toISOString())
out.push('')

for (const F of FILES) {
  out.push('=== FILE: ' + F + ' ===')
  out.push('')

  const fd = readFileRaw(F)
  if (!fd) { out.push('  NOT FOUND'); out.push(''); continue }

  const lines = fd.raw.split(/\r\n|\n/)

  out.push('  bytes: ' + fd.bytes)
  out.push('  lines: ' + lines.length)
  out.push('  line endings: ' + (fd.usesCRLF ? 'CRLF' : 'LF'))
  out.push('  BOM: ' + (fd.hasBOM ? 'YES' : 'no'))
  out.push('')

  // 2. Imports (first 30 lines)
  out.push('  --- SECTION A: Imports (first 30 lines) ---')
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i])
  }
  out.push('')

  // 3. /walliam/i hits (uncapped)
  out.push('  --- SECTION B: Every /walliam/i hit (uncapped) ---')
  let bCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/walliam/i.test(lines[i])) {
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
      bCount++
    }
  }
  out.push('  TOTAL: ' + bCount + ' hits')
  out.push('')

  // 4. BASE_URL / baseUrl identifier scan (no /walliam/ filter — lesson from T6f-A)
  out.push('  --- SECTION C: BASE_URL / baseUrl identifier references (complete) ---')
  let cCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/\bBASE_URL\b|\bbaseUrl\b/.test(lines[i])) {
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
      cCount++
    }
  }
  out.push('  TOTAL: ' + cCount + ' refs')
  out.push('')

  // 5. NEXT_PUBLIC_APP_URL references
  out.push('  --- SECTION D: NEXT_PUBLIC_APP_URL references ---')
  let dCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/NEXT_PUBLIC_APP_URL/.test(lines[i])) {
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
      dCount++
    }
  }
  out.push('  TOTAL: ' + dCount + ' refs')
  out.push('')

  // 6. Tenant SELECT presence
  out.push('  --- SECTION E: Tenant SELECT blocks (.from(\'tenants\') with ±5 line context) ---')
  let eCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/\.from\(['"]tenants['"]\)/.test(lines[i])) {
      eCount++
      const startCtx = Math.max(0, i - 2)
      const endCtx = Math.min(lines.length - 1, i + 6)
      out.push('  -- tenants SELECT #' + eCount + ' at L' + (i + 1) + ' --')
      for (let j = startCtx; j <= endCtx; j++) {
        out.push('  L' + (j + 1).toString().padStart(4) + ': ' + lines[j].trimEnd())
      }
      out.push('')
    }
  }
  out.push('  TOTAL: ' + eCount + ' tenant SELECT blocks')
  out.push('')

  // 7. validateSession call sites + destructure (Shape A indicator)
  out.push('  --- SECTION F: validateSession call sites + destructure (±5 line context) ---')
  let fCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/validateSession\(/.test(lines[i])) {
      fCount++
      const startCtx = Math.max(0, i - 1)
      const endCtx = Math.min(lines.length - 1, i + 10)
      out.push('  -- validateSession call #' + fCount + ' at L' + (i + 1) + ' --')
      for (let j = startCtx; j <= endCtx; j++) {
        out.push('  L' + (j + 1).toString().padStart(4) + ': ' + lines[j].trimEnd())
      }
      out.push('')
    }
  }
  out.push('  TOTAL: ' + fCount + ' validateSession call sites')
  out.push('')

  // 8. Helper signatures + call sites (build*EmailHtml + createHtmlResponse + any other helpers)
  out.push('  --- SECTION G: Helper function signatures (function name(...) at column 0) ---')
  let gCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^function\s+\w+\s*\(/.test(lines[i])) {
      gCount++
      // Capture signature: from this line until ): string {  or ): void {  etc (max 15 lines)
      const sigEnd = Math.min(lines.length - 1, i + 15)
      out.push('  -- helper #' + gCount + ' at L' + (i + 1) + ' --')
      for (let j = i; j <= sigEnd; j++) {
        out.push('  L' + (j + 1).toString().padStart(4) + ': ' + lines[j].trimEnd())
        // Stop at the line that contains '{' alone (likely body start)
        if (/^\)\s*:\s*\w+\s*{\s*$/.test(lines[j].trim()) || lines[j].trim() === '{') break
      }
      out.push('')
    }
  }
  out.push('  TOTAL: ' + gCount + ' function declarations')
  out.push('')

  // 9. POST body opening (first 10 lines after `export async function POST`)
  out.push('  --- SECTION H: POST handler opening (10 lines after export async function POST) ---')
  for (let i = 0; i < lines.length; i++) {
    if (/export\s+async\s+function\s+POST/.test(lines[i])) {
      const endCtx = Math.min(lines.length - 1, i + 12)
      out.push('  -- POST handler @ L' + (i + 1) + ' --')
      for (let j = i; j <= endCtx; j++) {
        out.push('  L' + (j + 1).toString().padStart(4) + ': ' + lines[j].trimEnd())
      }
      out.push('')
      break
    }
  }

  // 10. T6c-leftover (contact route only) — search 'walliam_contact'
  out.push('  --- SECTION I: T6c-leftover (source: source || \'walliam_contact\' literals) ---')
  let iCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (/walliam_contact/.test(lines[i])) {
      iCount++
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
    }
  }
  out.push('  TOTAL: ' + iCount + ' walliam_contact literals')
  out.push('')

  out.push('=== END FILE: ' + F + ' ===')
  out.push('')
}

// Ensure recon dir exists
const reconDir = path.dirname(path.resolve(ROOT, OUT))
if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true })

fs.writeFileSync(path.resolve(ROOT, OUT), out.join('\n'))
console.log('Wrote: ' + OUT)
console.log('Output bytes: ' + Buffer.byteLength(out.join('\n'), 'utf8'))