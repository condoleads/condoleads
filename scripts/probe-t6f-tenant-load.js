// probe-t6f-tenant-load.js
//
// For each T6f-scope file, dump:
//   A. All .from('tenants') call regions (15-line context per match) — shows
//      what tenant columns are currently selected, which the wire patch needs
//      to extend with brand_name + domain.
//   B. All BASE_URL / baseUrl / NEXT_PUBLIC_APP_URL declaration regions
//      (6-line context) — shows the URL fallback pattern to swap.
//   C. All validateSession call regions (10-line context) for Shape A routes
//      (charlie/lead, charlie/plan-email, charlie/appointment) — confirms
//      destructure shape post-T6c so wire patch can extend it.
//
// Read-only. Outputs to recon/W-LEADS-EMAIL-T6F-TENANT-LOAD.txt + stdout.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const REPORT = path.join('recon', 'W-LEADS-EMAIL-T6F-TENANT-LOAD.txt')

const FILES = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/walliam/charlie/vip-approve/route.ts',
  'app/api/walliam/contact/route.ts',
]

const HELPER = 'lib/utils/validate-session.ts'

function readLines(p) {
  const abs = path.resolve(ROOT, p)
  if (!fs.existsSync(abs)) return null
  return fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n')
}

function dumpRange(lines, from, to) {
  const out = []
  const start = Math.max(1, from)
  const end = Math.min(lines.length, to)
  for (let i = start; i <= end; i++) {
    out.push('    L' + String(i).padStart(4) + ': ' + lines[i - 1])
  }
  return out.join('\n')
}

const all = []
function emit(s) { all.push(s); process.stdout.write(s + '\n') }

emit('W-LEADS-EMAIL T6f tenant-load + BASE_URL recon')
emit('Generated: ' + new Date().toISOString())

// --- Helper context first (will need extension for Shape A) ---
emit('\n' + '='.repeat(78))
emit('HELPER: ' + HELPER + ' (will need extension to return brandName + domain)')
emit('='.repeat(78))
const helperLines = readLines(HELPER)
if (helperLines) {
  emit('  L1-' + helperLines.length + ' (full file):')
  emit(dumpRange(helperLines, 1, helperLines.length))
}

for (const f of FILES) {
  emit('\n' + '='.repeat(78))
  emit('FILE: ' + f)
  emit('='.repeat(78))

  const lines = readLines(f)
  if (lines === null) { emit('  MISSING'); continue }
  emit('  total lines: ' + lines.length)

  // A. .from('tenants') regions
  const tenantHits = []
  for (let i = 0; i < lines.length; i++) {
    if (/\.from\(['"]tenants['"]\)/.test(lines[i])) tenantHits.push(i + 1)
  }
  emit('\n  --- A. .from("tenants") matches: ' + (tenantHits.length === 0 ? '(none)' : 'L' + tenantHits.join(', L')) + ' ---')
  for (const ln of tenantHits) {
    emit('\n  context for L' + ln + ' (L' + Math.max(1, ln-2) + '..L' + (ln+12) + '):')
    emit(dumpRange(lines, ln - 2, ln + 12))
  }

  // B. BASE_URL / baseUrl / NEXT_PUBLIC_APP_URL fallback declarations
  const urlHits = []
  for (let i = 0; i < lines.length; i++) {
    if (/\b(BASE_URL|baseUrl)\s*=/.test(lines[i]) ||
        /NEXT_PUBLIC_APP_URL.*walliam\.ca/.test(lines[i])) {
      urlHits.push(i + 1)
    }
  }
  emit('\n  --- B. BASE_URL / baseUrl / inline-NEXT_PUBLIC_APP_URL matches: ' + (urlHits.length === 0 ? '(none)' : 'L' + urlHits.join(', L')) + ' ---')
  for (const ln of urlHits) {
    emit('\n  context for L' + ln + ' (L' + Math.max(1, ln-1) + '..L' + (ln+3) + '):')
    emit(dumpRange(lines, ln - 1, ln + 3))
  }

  // C. validateSession call regions (Shape A files only)
  const isShapeA = /\/(lead|plan-email|appointment)\//.test(f)
  if (isShapeA) {
    const vsHits = []
    for (let i = 0; i < lines.length; i++) {
      if (/_sessionCheck\.session/.test(lines[i])) vsHits.push(i + 1)
    }
    emit('\n  --- C. _sessionCheck.session destructure context (Shape A) ---')
    for (const ln of vsHits) {
      emit('\n  context for L' + ln + ' (L' + Math.max(1, ln-3) + '..L' + (ln+5) + '):')
      emit(dumpRange(lines, ln - 3, ln + 5))
    }
  }
}

fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, REPORT), all.join('\n'), 'utf8')
emit('\n[probe-t6f-tenant-load] Report: ' + REPORT)