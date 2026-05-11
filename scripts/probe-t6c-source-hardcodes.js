#!/usr/bin/env node
/**
 * probe-t6c-source-hardcodes.js
 *
 * W-LEADS-EMAIL T6c recon — source-string hardcoding refactor.
 *
 * For each of 7 candidate route files (T6c scope) + the validateSession
 * helper, this probe dumps:
 *   A. Every line matching /walliam/i (line# + content)
 *   B. Every line declaring or reading sourceKey or tenant.source_key
 *   C. Every line that looks like a lead/session/activity source field
 *      assignment (INSERT/UPDATE source: ..., .eq('source', ...))
 *   D. For the helper: full file content (<=200 lines expected)
 *
 * Output is written to recon/W-LEADS-EMAIL-T6C-RECON.txt and also echoed
 * to stdout. Read-only — does not modify any source files.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const ROUTE_FILES = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
]

const HELPER_FILE = 'lib/utils/validate-session.ts'

const OUT_DIR = 'recon'
const OUT_FILE = path.join(OUT_DIR, 'W-LEADS-EMAIL-T6C-RECON.txt')

function readLines(relPath) {
  const abs = path.resolve(ROOT, relPath)
  if (!fs.existsSync(abs)) {
    return { exists: false, lines: [], rawLength: 0 }
  }
  const raw = fs.readFileSync(abs, 'utf8')
  const lf = raw.replace(/\r\n/g, '\n')
  const lines = lf.split('\n')
  return { exists: true, lines, rawLength: raw.length, usesCRLF: /\r\n/.test(raw) }
}

function findMatches(lines, predicate) {
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i + 1)) {
      hits.push({ lineNum: i + 1, content: lines[i] })
    }
  }
  return hits
}

function isWalliamMatch(line) {
  return /walliam/i.test(line)
}

function isSourceKeyMatch(line) {
  return /(\bconst\s+sourceKey\b|\blet\s+sourceKey\b|\bsourceKey\s*=|\btenant\.source_key\b|\btenants\.source_key\b|'source_key'|"source_key")/.test(line)
}

function isSourceAssignmentMatch(line) {
  return (
    /\bsource\s*:\s*['"`]/.test(line) ||
    /\.eq\(\s*['"]source['"]\s*,/.test(line) ||
    /\brequest_source\s*:\s*['"`]/.test(line) ||
    /\bsource_url\s*:\s*['"`]/.test(line)
  )
}

function formatHits(hits) {
  if (hits.length === 0) return '  (none)\n'
  return hits.map(h => `  L${String(h.lineNum).padStart(4, ' ')}: ${h.content}`).join('\n') + '\n'
}

function section(title) {
  return `\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n`
}

const out = []

out.push('W-LEADS-EMAIL T6c recon — source-string hardcoding survey')
out.push(`Generated: ${new Date().toISOString()}`)
out.push(`Repo root: ${ROOT}`)
out.push('')
out.push('Purpose: enumerate every hardcoded `walliam`/`WALLiam` literal in the')
out.push('7 T6c candidate routes, and identify whether `sourceKey` is already in')
out.push('scope (from a T6a tenant SELECT, a helper return, or otherwise).')
out.push('')
out.push('Sections per file:')
out.push('  A. /walliam/i case-insensitive line hits')
out.push('  B. sourceKey / tenant.source_key declarations & reads')
out.push('  C. source-field assignments / .eq("source", ...) filters / request_source / source_url')

for (const relPath of ROUTE_FILES) {
  out.push(section(`FILE: ${relPath}`))

  const { exists, lines, rawLength, usesCRLF } = readLines(relPath)
  if (!exists) {
    out.push(`  WARN: FILE NOT FOUND`)
    continue
  }
  out.push(`  bytes: ${rawLength}, lines: ${lines.length}, line-endings: ${usesCRLF ? 'CRLF' : 'LF'}`)
  out.push('')

  out.push('  --- A. /walliam/i hits ---')
  out.push(formatHits(findMatches(lines, isWalliamMatch)))

  out.push('  --- B. sourceKey / tenant.source_key hits ---')
  out.push(formatHits(findMatches(lines, isSourceKeyMatch)))

  out.push('  --- C. source-field assignments / filters ---')
  out.push(formatHits(findMatches(lines, isSourceAssignmentMatch)))
}

out.push(section(`HELPER FULL DUMP: ${HELPER_FILE}`))
const helper = readLines(HELPER_FILE)
if (!helper.exists) {
  out.push(`  WARN: HELPER NOT FOUND`)
} else {
  out.push(`  bytes: ${helper.rawLength}, lines: ${helper.lines.length}, line-endings: ${helper.usesCRLF ? 'CRLF' : 'LF'}`)
  out.push('')
  for (let i = 0; i < helper.lines.length; i++) {
    out.push(`  L${String(i + 1).padStart(4, ' ')}: ${helper.lines[i]}`)
  }
}

out.push(section('SUMMARY — files surveyed'))
out.push('')
out.push('Use this report to decide for each route:')
out.push('  - Does it already have `sourceKey` in scope? (Section B hits)')
out.push('  - What hardcoded literals need to become `${sourceKey}_...` templates? (Section A + C)')
out.push('  - Does it need a new tenant SELECT, or can it reuse an existing one?')
out.push('')
out.push('Helper-dump tells us whether `validateSession` returns sourceKey today,')
out.push('or whether we extend it to do so (cleaner for Shape A routes).')

const report = out.join('\n')

fs.mkdirSync(path.resolve(ROOT, OUT_DIR), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, OUT_FILE), report, 'utf8')

process.stdout.write(report + '\n')
process.stdout.write(`\n\n[probe-t6c-source-hardcodes] Report written to ${OUT_FILE}\n`)