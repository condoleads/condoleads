#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v4.js
 *
 * v3 -> v4: T2h CLOSED (app/actions/createLead.ts deleted, zero callers).
 * Patches:
 *   P1: Status line (T2g + T2h shipped, T2a-T2f remaining)
 *   P2: Insert v4 status log entry above v3
 *   P3: T2 section header (T2g + T2h CLOSED)
 *   P4: T2h sub-header CLOSED marker
 *   P5: F-CREATELEAD-IS-DEAD-CODE closure
 *   P6: Lead writer inventory entry update
 *   P7: Next action chain update (remove T2h)
 */

const fs = require('fs')
const path = require('path')

const TRACKER = path.join('docs', 'W-LEADS-EMAIL-TRACKER.md')
if (!fs.existsSync(TRACKER)) { console.error('FAIL: tracker not found'); process.exit(1) }
const original = fs.readFileSync(TRACKER, 'utf8')

const V3_MARKER_PREFIX = '- **2026-05-10 v3 T2g CLOSED'
const V4_MARKER_PREFIX = '- **2026-05-10 v4 T2h CLOSED'

if (original.indexOf(V3_MARKER_PREFIX) === -1) {
  console.error('FAIL: v3 marker not found. Apply v3 first.')
  process.exit(1)
}
if (original.indexOf(V4_MARKER_PREFIX) !== -1) {
  console.log('v4 marker already present. No-op.')
  process.exit(0)
}

// Find the FULL v3 line for P2 anchor (everything from "- **2026-05-10 v3" up to the next newline)
const v3LineMatch = original.match(/^- \*\*2026-05-10 v3 T2g CLOSED.*$/m)
if (!v3LineMatch) {
  console.error('FAIL: could not isolate full v3 line for P2 anchor.')
  process.exit(1)
}
const V3_FULL_LINE = v3LineMatch[0]

const V4_ENTRY =
  '- **2026-05-10 v4 T2h CLOSED** — `app/actions/createLead.ts` deleted. Zero callers re-verified in-session before delete via repo-wide grep: the only `createLead`-named function in the codebase is the one defined locally in `lib/actions/leads.ts` L128, which is unrelated to this dead-code file\'s exported `createLeadFromRegistration` symbol (zero matches anywhere). TSC clean post-deletion. Closes F-CREATELEAD-IS-DEAD-CODE. T2 phase progress: 2 of 8 sub-phases shipped (T2g + T2h); remaining T2a (leads geo columns), T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table). Next action: T2a probe + apply.'

const patches = [
  {
    name: 'P1 status line',
    old: '**Status:** T2 build phase — IN PROGRESS. T2g shipped 2026-05-10 (out-of-order, security priority — commits `d0c6ca3` + `f1bcf66`). Remaining: T2a–T2f schema migrations + T2h cleanup. Next action: T2a `leads` geo columns migration.',
    new: '**Status:** T2 build phase — IN PROGRESS. T2g + T2h shipped 2026-05-10 (T2g commits `d0c6ca3` + `f1bcf66`). Remaining: T2a–T2f schema migrations. Next action: T2a `leads` geo columns migration.',
  },
  {
    name: 'P2 v4 status log entry',
    old: V3_FULL_LINE,
    new: V4_ENTRY + '\n' + V3_FULL_LINE,
  },
  {
    name: 'P3 T2 section header',
    old: '### T2 — Schema migrations (IN PROGRESS — T2g CLOSED 2026-05-10; T2a–T2f and T2h pending)',
    new: '### T2 — Schema migrations (IN PROGRESS — T2g + T2h CLOSED 2026-05-10; T2a–T2f pending)',
  },
  {
    name: 'P4 T2h sub-header CLOSED',
    old: '**T2h — Cleanup: delete `app/actions/createLead.ts`**',
    new: '**T2h — Cleanup: delete `app/actions/createLead.ts` — ✅ CLOSED 2026-05-10**',
  },
  {
    name: 'P5 F-CREATELEAD-IS-DEAD-CODE closure',
    old: '- **F-CREATELEAD-IS-DEAD-CODE (CONFIRMED)** — `app/actions/createLead.ts` zero callers. T2h deletes.',
    new: '- **F-CREATELEAD-IS-DEAD-CODE ✅ CLOSED 2026-05-10** — `app/actions/createLead.ts` deleted. Zero callers re-verified in-session before delete (only `createLead`-named function in repo is the local one in `lib/actions/leads.ts` L128, which exports a different symbol).',
  },
  {
    name: 'P6 lead writer inventory entry',
    old: '| – | `app/actions/createLead.ts::createLeadFromRegistration` | DEAD CODE | n/a | T2h delete |',
    new: '| – | `app/actions/createLead.ts::createLeadFromRegistration` | DELETED 2026-05-10 | n/a | T2h CLOSED |',
  },
  {
    name: 'P7 Next action chain',
    old: 'T2a estimate: ~30 minutes including probe-then-patch + smoke. Then T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table), T2h (createLead.ts delete) — each one ships before the next starts. T2g (RPC tenant-leak fix) was prioritized and already shipped 2026-05-10 (commits `d0c6ca3` + `f1bcf66`); see status log v3 entry and findings closures for detail.',
    new: 'T2a estimate: ~30 minutes including probe-then-patch + smoke. Then T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table) — each one ships before the next starts. T2g (RPC tenant-leak fix, commits `d0c6ca3` + `f1bcf66`) and T2h (`createLead.ts` delete) were prioritized and already shipped 2026-05-10; see status log v3 + v4 entries and findings closures.',
  },
]

let working = original
let applied = 0

for (const p of patches) {
  const occ = working.split(p.old).length - 1
  if (occ === 0) { console.error('FAIL: ' + p.name + ' — old text not found'); process.exit(1) }
  if (occ !== 1) { console.error('FAIL: ' + p.name + ' — expected 1 match, found ' + occ); process.exit(1) }
  working = working.replace(p.old, p.new)
  applied++
  console.log('  ' + p.name + ': matched + replaced')
}

const stampJs = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
const backupPath = TRACKER + '.backup_' + stampJs
fs.writeFileSync(backupPath, original)
console.log('Backup: ' + backupPath)
fs.writeFileSync(TRACKER, working)
console.log('Wrote: ' + TRACKER + ' (delta ' + (working.length - original.length) + ' chars)')
console.log('v4 patch applied: ' + applied + '/' + patches.length)