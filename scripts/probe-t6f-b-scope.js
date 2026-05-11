#!/usr/bin/env node
/**
 * probe-t6f-b-scope.js
 *
 * T6f-B kickoff: extract anchor-prep data for the 4 estimator routes from
 * the existing T6f-A recon files. Read-only — writes ONE consolidated output
 * to recon/W-LEADS-EMAIL-T6F-B-SCOPE-FROM-EXISTING-RECON.txt
 *
 * Target routes (4):
 *   - app/api/walliam/estimator/vip-request/route.ts
 *   - app/api/walliam/estimator/vip-approve/route.ts
 *   - app/api/walliam/estimator/session/route.ts
 *   - app/api/walliam/estimator/vip-questionnaire/route.ts
 *
 * Strategy: for each existing recon/W-LEADS-EMAIL-T6F-*.txt file, scan for
 * lines referencing any of the 4 target route paths. Capture full line + N
 * lines of context after each hit. Write all hits to one consolidated output
 * file with per-source-file + per-target-route grouping.
 *
 * If totalHits == 0 the existing recon does not cover T6f-B - we run a fresh
 * focused probe against the 4 live route files in the next step.
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const RECON_DIR = path.join(ROOT, 'recon')
const OUT = path.join(RECON_DIR, 'W-LEADS-EMAIL-T6F-B-SCOPE-FROM-EXISTING-RECON.txt')

const TARGET_ROUTES = [
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
]

const CONTEXT_LINES_AFTER = 20

if (!fs.existsSync(RECON_DIR)) {
  console.error('FAIL: recon/ directory not found at ' + RECON_DIR)
  process.exit(1)
}

const t6fFiles = fs.readdirSync(RECON_DIR)
  .filter(f => /^W-LEADS-EMAIL-T6F-.*\.txt$/i.test(f))
  .sort()

if (t6fFiles.length === 0) {
  console.error('FAIL: no recon/W-LEADS-EMAIL-T6F-*.txt files found')
  process.exit(1)
}

console.log('Scanning ' + t6fFiles.length + ' T6F recon files for T6f-B targets...')

const out = []
out.push('=== T6f-B SCOPE EXTRACTION FROM EXISTING T6f-A RECON ===')
out.push('Generated: ' + new Date().toISOString())
out.push('')
out.push('Target routes (' + TARGET_ROUTES.length + '):')
TARGET_ROUTES.forEach(r => out.push('  - ' + r))
out.push('')
out.push('Source recon files scanned (' + t6fFiles.length + '):')
t6fFiles.forEach(f => out.push('  - recon/' + f))
out.push('')
out.push('Context window: ' + CONTEXT_LINES_AFTER + ' lines after each hit.')
out.push('')

let totalHits = 0
const perRouteHits = Object.fromEntries(TARGET_ROUTES.map(r => [r, 0]))
const perFileHits = {}

for (const recon of t6fFiles) {
  const reconPath = path.join(RECON_DIR, recon)
  const lines = fs.readFileSync(reconPath, 'utf8').split(/\r?\n/)
  const fileHits = []

  for (let i = 0; i < lines.length; i++) {
    for (const route of TARGET_ROUTES) {
      if (lines[i].includes(route)) {
        const end = Math.min(i + 1 + CONTEXT_LINES_AFTER, lines.length)
        fileHits.push({
          route,
          lineNo: i + 1,
          block: lines.slice(i, end).join('\n')
        })
        perRouteHits[route]++
        totalHits++
        break
      }
    }
  }

  perFileHits[recon] = fileHits.length

  if (fileHits.length > 0) {
    out.push('========================================================================')
    out.push('FILE: recon/' + recon + ' (' + fileHits.length + ' hits)')
    out.push('========================================================================')
    out.push('')
    for (const h of fileHits) {
      out.push('--- HIT [' + h.route + '] @ L' + h.lineNo + ' ---')
      out.push(h.block)
      out.push('')
    }
    out.push('')
  }
}

out.push('=== SUMMARY ===')
out.push('Total hits: ' + totalHits)
out.push('')
out.push('Per-file:')
for (const f of t6fFiles) {
  out.push('  recon/' + f + ': ' + perFileHits[f])
}
out.push('')
out.push('Per-route:')
for (const r of TARGET_ROUTES) {
  out.push('  ' + r + ': ' + perRouteHits[r])
}
out.push('')

if (totalHits === 0) {
  out.push('NOTE: zero hits. The existing T6F recon does not reference the 4 estimator routes by path.')
  out.push('Recommendation: run a fresh focused probe directly against the 4 live route files for T6f-B.')
} else if (totalHits < 8) {
  out.push('NOTE: sparse coverage (' + totalHits + ' total hits across ' + TARGET_ROUTES.length + ' routes).')
  out.push('May need supplementary fresh probe for the routes with 0 hits.')
} else {
  out.push('NOTE: dense coverage. Existing recon likely sufficient for T6f-B wire patch design.')
}

fs.writeFileSync(OUT, out.join('\n'))
console.log('')
console.log('Wrote: ' + OUT)
console.log('Total hits: ' + totalHits)
console.log('')
console.log('Per-file:')
for (const f of t6fFiles) {
  console.log('  recon/' + f + ': ' + perFileHits[f])
}
console.log('')
console.log('Per-route:')
for (const r of TARGET_ROUTES) {
  console.log('  ' + r + ': ' + perRouteHits[r])
}