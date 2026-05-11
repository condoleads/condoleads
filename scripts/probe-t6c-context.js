#!/usr/bin/env node
/**
 * probe-t6c-context.js
 *
 * Dumps line-context windows around the T6c key sites identified by
 * probe-t6c-source-hardcodes. Read-only.
 *
 * For Shape A routes (charlie/lead, charlie/plan-email, charlie/appointment):
 *   - Grep validateSession; dump 12-line context window (lineNum-2 to lineNum+10)
 *
 * For estimator/vip-request:
 *   - L70-130: tenant load region (covers T6a's tenant.source_key check at L98)
 *   - L155-215: lead/vip_request INSERT region (covers L169, L198)
 *   - L260-295: user_activities INSERT region (covers L280)
 *
 * For estimator/vip-questionnaire:
 *   - L1-50: imports/top of POST handler (to find insertion point for new tenant SELECT)
 *   - L130-200: lead UPDATE + defensive INSERT region (covers L182)
 *   - L260-285: user_activities INSERT region (covers L272)
 *
 * Output: recon/W-LEADS-EMAIL-T6C-CONTEXT.txt + stdout.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const OUT_FILE = path.join('recon', 'W-LEADS-EMAIL-T6C-CONTEXT.txt')

function readLines(relPath) {
  const abs = path.resolve(ROOT, relPath)
  if (!fs.existsSync(abs)) return { exists: false, lines: [] }
  const raw = fs.readFileSync(abs, 'utf8')
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  return { exists: true, lines, usesCRLF: /\r\n/.test(raw) }
}

function dumpRange(lines, from, to) {
  const out = []
  const start = Math.max(1, from)
  const end = Math.min(lines.length, to)
  for (let i = start; i <= end; i++) {
    out.push(`  L${String(i).padStart(4, ' ')}: ${lines[i - 1]}`)
  }
  return out.join('\n')
}

function section(title) {
  return `\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n`
}

const out = []
out.push('W-LEADS-EMAIL T6c context windows')
out.push(`Generated: ${new Date().toISOString()}`)
out.push('')

// Shape A routes: grep validateSession + 12-line window per hit
const SHAPE_A = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
]

for (const f of SHAPE_A) {
  out.push(section(`SHAPE A: ${f} — validateSession call sites`))
  const { exists, lines, usesCRLF } = readLines(f)
  if (!exists) { out.push('  WARN: not found'); continue }
  out.push(`  line-endings: ${usesCRLF ? 'CRLF' : 'LF'}, lines: ${lines.length}`)

  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (/validateSession/.test(lines[i])) hits.push(i + 1)
  }
  if (hits.length === 0) { out.push('  (no validateSession references found)'); continue }

  for (const h of hits) {
    out.push(`\n  --- hit at L${h}, window L${Math.max(1, h - 4)}..L${h + 10} ---`)
    out.push(dumpRange(lines, h - 4, h + 10))
  }
}

// vip-request: 3 explicit windows
out.push(section('app/api/walliam/estimator/vip-request/route.ts — 3 explicit windows'))
{
  const { exists, lines, usesCRLF } = readLines('app/api/walliam/estimator/vip-request/route.ts')
  if (exists) {
    out.push(`  line-endings: ${usesCRLF ? 'CRLF' : 'LF'}, lines: ${lines.length}`)
    out.push('\n  --- window L70..L130 (tenant load region + T6a source_key check) ---')
    out.push(dumpRange(lines, 70, 130))
    out.push('\n  --- window L155..L215 (vip_request INSERT + lead INSERT region: L169, L198) ---')
    out.push(dumpRange(lines, 155, 215))
    out.push('\n  --- window L260..L295 (user_activities INSERT region: L280) ---')
    out.push(dumpRange(lines, 260, 295))
  } else { out.push('  WARN: not found') }
}

// vip-questionnaire: 3 explicit windows
out.push(section('app/api/walliam/estimator/vip-questionnaire/route.ts — 3 explicit windows'))
{
  const { exists, lines, usesCRLF } = readLines('app/api/walliam/estimator/vip-questionnaire/route.ts')
  if (exists) {
    out.push(`  line-endings: ${usesCRLF ? 'CRLF' : 'LF'}, lines: ${lines.length}`)
    out.push('\n  --- window L1..L60 (imports + POST handler top — insertion point for new tenant SELECT) ---')
    out.push(dumpRange(lines, 1, 60))
    out.push('\n  --- window L125..L200 (lead UPDATE + defensive INSERT region: L182) ---')
    out.push(dumpRange(lines, 125, 200))
    out.push('\n  --- window L260..L285 (user_activities INSERT region: L272) ---')
    out.push(dumpRange(lines, 260, 285))
  } else { out.push('  WARN: not found') }
}

const report = out.join('\n')
fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, OUT_FILE), report, 'utf8')

process.stdout.write(report + '\n\n')
process.stdout.write(`[probe-t6c-context] Report written to ${OUT_FILE}\n`)