// probe-t6f-residual.js
//
// Three remaining data points for the T6f wire-patch design:
//   A. Tenant SELECT context in walliam/estimator/session/route.ts (omitted
//      from anchor-prep FILE_HELPERS map).
//   B. Split-tag wordmark sites across all 9 T6f-scope files. Pattern:
//      `WALL</span>` (case-insensitive). The /walliam/i filter missed these
//      because the literal "walliam" never appears on the line.
//   C. Confirm walliam/contact/route.ts has zero tenant load (the wire patch
//      will add one). Also dump the full POST body opening (first 40 lines
//      from `export async function POST(`) so the new tenant load has a
//      clean anchor point.
//
// Read-only. Output: recon/W-LEADS-EMAIL-T6F-RESIDUAL.txt + stdout.

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const REPORT = path.join('recon', 'W-LEADS-EMAIL-T6F-RESIDUAL.txt')

const ALL_FILES = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/charlie/vip-approve/route.ts',
  'app/api/walliam/contact/route.ts',
]

const out = []
function emit(s) { out.push(s); process.stdout.write(s + '\n') }

emit('W-LEADS-EMAIL T6f residual recon')
emit('Generated: ' + new Date().toISOString())

// ============================================================================
// SECTION A — session.ts tenant SELECT context
// ============================================================================
emit('\n' + '='.repeat(78))
emit('SECTION A — walliam/estimator/session/route.ts tenant SELECT context')
emit('='.repeat(78))

{
  const file = 'app/api/walliam/estimator/session/route.ts'
  const abs = path.resolve(ROOT, file)
  if (!fs.existsSync(abs)) {
    emit('  MISSING: ' + file)
  } else {
    const content = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
    const lines = content.split('\n')
    const tenantSelectRe = /\.from\(['"]tenants['"]\)/
    const sites = []
    for (let i = 0; i < lines.length; i++) {
      if (tenantSelectRe.test(lines[i])) sites.push(i + 1)
    }
    if (sites.length === 0) {
      emit('  (none found — recon contradicts T6c memory; check file state)')
    } else {
      for (const ln of sites) {
        emit('')
        emit('  SELECT @ L' + ln)
        const from = Math.max(1, ln - 3)
        const to = Math.min(lines.length, ln + 20)
        for (let i = from; i <= to; i++) {
          const marker = (i === ln) ? '>>' : '  '
          emit('    ' + marker + ' L' + String(i).padStart(4) + ': ' + lines[i - 1])
        }
      }
    }
  }
}

// ============================================================================
// SECTION B — split-tag wordmark sites across all files
// ============================================================================
emit('\n' + '='.repeat(78))
emit('SECTION B — split-tag wordmark sites (pattern: WALL</span>)')
emit('='.repeat(78))

const wordmarkRe = /WALL<\/span>/i
let totalWordmarkHits = 0

for (const file of ALL_FILES) {
  const abs = path.resolve(ROOT, file)
  if (!fs.existsSync(abs)) { emit('\n  MISSING: ' + file); continue }
  const content = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
  const lines = content.split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (wordmarkRe.test(lines[i])) hits.push(i + 1)
  }
  if (hits.length === 0) continue
  totalWordmarkHits += hits.length
  emit('\n  FILE: ' + file + '  (' + hits.length + ' wordmark hit' + (hits.length > 1 ? 's' : '') + ')')
  for (const ln of hits) {
    emit('')
    emit('    WORDMARK @ L' + ln)
    const from = Math.max(1, ln - 2)
    const to = Math.min(lines.length, ln + 4)
    for (let i = from; i <= to; i++) {
      const marker = (i === ln) ? '>>' : '  '
      emit('      ' + marker + ' L' + String(i).padStart(4) + ': ' + lines[i - 1])
    }
  }
}

emit('\n  TOTAL wordmark sites across 9 files: ' + totalWordmarkHits)

// ============================================================================
// SECTION C — contact route POST body opening (40 lines from POST decl)
// ============================================================================
emit('\n' + '='.repeat(78))
emit('SECTION C — walliam/contact POST body opening (for new-tenant-load anchor)')
emit('='.repeat(78))

{
  const file = 'app/api/walliam/contact/route.ts'
  const abs = path.resolve(ROOT, file)
  if (!fs.existsSync(abs)) {
    emit('  MISSING: ' + file)
  } else {
    const content = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
    const lines = content.split('\n')
    const declRe = /^export\s+async\s+function\s+POST\s*\(/
    let declLine = -1
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i])) { declLine = i; break }
    }
    if (declLine < 0) {
      emit('  POST handler not found at module level')
    } else {
      emit('\n  POST declaration at L' + (declLine + 1))
      const from = declLine + 1
      const to = Math.min(lines.length, declLine + 40)
      for (let i = from; i <= to; i++) {
        emit('    L' + String(i).padStart(4) + ': ' + lines[i - 1])
      }
    }

    // Also confirm zero tenant SELECTs.
    const tenantSelectRe = /\.from\(['"]tenants['"]\)/
    let count = 0
    for (let i = 0; i < lines.length; i++) {
      if (tenantSelectRe.test(lines[i])) count++
    }
    emit('\n  CONFIRMATION: .from(\'tenants\').select( call count in contact route = ' + count)
    emit('    Expected: 0 (this is the structural gap the T6f-C patch fills)')
  }
}

emit('')

fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, REPORT), out.join('\n'), 'utf8')
emit('[probe-t6f-residual] Report: ' + REPORT)