#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v3.js
 *
 * Updates docs/W-LEADS-EMAIL-TRACKER.md from v2 (T0 recon complete + T1 locked)
 * to v3 (T2g CLOSED — out-of-order security priority shipment).
 *
 * Patches (atomic, in-memory, file written once at end):
 *   P1: Status line update
 *   P2: Insert v3 status log entry above v2
 *   P3: T2 section header update
 *   P4: T2g sub-header CLOSED marker
 *   P5a: F-RESOLVE-AGENT-P1-P2 closure
 *   P5b: F-RESOLVE-AGENT-P8 closure
 *   P6: Next action chain update (remove T2g from sequence)
 *
 * Pre-flight: requires v2 status-log marker. Idempotent: skip if v3 marker present.
 * Backup: timestamped .backup_<stamp> before write.
 */

const fs = require('fs')
const path = require('path')

const TRACKER = path.join('docs', 'W-LEADS-EMAIL-TRACKER.md')

if (!fs.existsSync(TRACKER)) {
  console.error('FAIL: ' + TRACKER + ' not found at ' + path.resolve(TRACKER))
  process.exit(1)
}

const original = fs.readFileSync(TRACKER, 'utf8')

const V2_MARKER = '- **2026-05-10 v2 T0 RECON COMPLETE + T1 LOCKED**'
const V3_MARKER_PREFIX = '- **2026-05-10 v3 T2g CLOSED'

if (original.indexOf(V2_MARKER) === -1) {
  console.error('FAIL: v2 status-log marker not found in tracker. Aborting.')
  process.exit(1)
}

if (original.indexOf(V3_MARKER_PREFIX) !== -1) {
  console.log('v3 marker already present. No-op.')
  process.exit(0)
}

const V3_ENTRY =
  '- **2026-05-10 v3 T2g CLOSED (out-of-order, security priority)** — `resolve_agent_for_context` RPC tenant-leak fix shipped (commit `d0c6ca3` initial migration + commit `f1bcf66` followup with verification regex fix). Live function body grew 82 → 105 lines; 7 occurrences of `tenant_id = p_tenant_id` in production vs 1 pre-T2g baseline (P10 preserved tier only). Closes F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER and F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK. Followup batch addressed false-positive P10 verification: runner\'s brittle `.includes(literal)` check replaced with regex `.test()` + `\\s+` whitespace tolerance after v1 (multi-line literal) and v2 (single-line literal) substring approaches both failed against the file\'s actual whitespace. Lessons logged: (a) future apply runners should run verification INSIDE a Node-managed transaction so verification failures roll back the migration rather than leave the DB in a half-applied state; (b) regex matching should be the default for in-place source-code patches — literal-substring matching is fragile against whitespace/CRLF drift on Windows. Next action: resume T2a `leads` geo columns migration; remaining sequence T2a→T2b→T2c→T2d→T2e→T2f→T2h.'

const patches = [
  {
    name: 'P1 status line',
    old: '**Status:** T2 build phase — NOT STARTED',
    new: '**Status:** T2 build phase — IN PROGRESS. T2g shipped 2026-05-10 (out-of-order, security priority — commits `d0c6ca3` + `f1bcf66`). Remaining: T2a–T2f schema migrations + T2h cleanup. Next action: T2a `leads` geo columns migration.',
  },
  {
    name: 'P2 insert v3 status log entry above v2',
    old: V2_MARKER,
    new: V3_ENTRY + '\n' + V2_MARKER,
  },
  {
    name: 'P3 T2 section header',
    old: '### T2 — Schema migrations (NEXT, NOT STARTED)',
    new: '### T2 — Schema migrations (IN PROGRESS — T2g CLOSED 2026-05-10; T2a–T2f and T2h pending)',
  },
  {
    name: 'P4 T2g sub-header CLOSED marker',
    old: '**T2g — `resolve_agent_for_context` RPC tenant-leak fix**',
    new: '**T2g — `resolve_agent_for_context` RPC tenant-leak fix — ✅ CLOSED 2026-05-10 (commits `d0c6ca3` + `f1bcf66`)**',
  },
  {
    name: 'P5a F-RESOLVE-AGENT-P1-P2 closure',
    old: "- **F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER (MAJOR)** — P1 (`agent_listing_assignments`) and P2 (`agent_geo_buildings`) lookups don't filter by tenant. Cross-tenant data leak possible.",
    new: "- **F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER (MAJOR) ✅ CLOSED 2026-05-10 (commits `d0c6ca3` + `f1bcf66`)** — P1 (`agent_listing_assignments`) and P2 (`agent_geo_buildings`) lookups now filter by `a.tenant_id = p_tenant_id`. Cross-tenant data leak vector eliminated. Verified via DB-truth probe: 7 occurrences of `tenant_id = p_tenant_id` in live function body (vs 1 pre-T2g baseline = P10 only).",
  },
  {
    name: 'P5b F-RESOLVE-AGENT-P8 closure',
    old: '- **F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK (MAJOR)** — P8 reads `user_profiles.assigned_agent_id` without tenant filter.',
    new: '- **F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK (MAJOR) ✅ CLOSED 2026-05-10 (commits `d0c6ca3` + `f1bcf66`)** — P8 now joins via `tenant_users` with explicit `(user_id, tenant_id)` scoping. Cross-tenant agent assignment leak via stale `user_profiles.assigned_agent_id` eliminated.',
  },
  {
    name: 'P6 Next action chain (remove T2g from sequence)',
    old: 'T2a estimate: ~30 minutes including probe-then-patch + smoke. Then T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table), T2g (RPC fix), T2h (createLead.ts delete) — each one ships before the next starts.',
    new: 'T2a estimate: ~30 minutes including probe-then-patch + smoke. Then T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table), T2h (createLead.ts delete) — each one ships before the next starts. T2g (RPC tenant-leak fix) was prioritized and already shipped 2026-05-10 (commits `d0c6ca3` + `f1bcf66`); see status log v3 entry and findings closures for detail.',
  },
]

let working = original
let applied = 0

for (const p of patches) {
  const occ = working.split(p.old).length - 1
  if (occ === 0) {
    console.error('FAIL: ' + p.name + ' — old text not found in tracker.')
    console.error('Looking for: ' + p.old.slice(0, 140) + (p.old.length > 140 ? '...' : ''))
    process.exit(1)
  }
  if (occ !== 1) {
    console.error('FAIL: ' + p.name + ' — expected 1 match, found ' + occ)
    process.exit(1)
  }
  working = working.replace(p.old, p.new)
  applied++
  console.log('  ' + p.name + ': matched + replaced')
}

if (applied !== patches.length) {
  console.error('FAIL: applied ' + applied + '/' + patches.length + '; not writing.')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
const backupPath = TRACKER + '.backup_' + stamp
fs.writeFileSync(backupPath, original)
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)')

fs.writeFileSync(TRACKER, working)
const delta = working.length - original.length
console.log('Wrote: ' + TRACKER + ' (' + working.length + ' chars, delta ' + (delta >= 0 ? '+' : '') + delta + ')')
console.log('')
console.log('v3 patch applied: ' + applied + '/' + patches.length + ' patches.')