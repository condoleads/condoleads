#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v5.js
 *
 * v4 -> v5: T2 PHASE CLOSED + T2a-T2f CLOSURES BACKFILLED + v3/v4 STATUS CORRECTIONS.
 *
 * Discovery this session: T2a-T2f had ALREADY been shipped to production
 * between 7:54 AM and 10:49 AM 2026-05-10, BEFORE T2g+T2h that this session
 * worked on. The v3 and v4 tracker patches captured T2g + T2h closures
 * correctly but inherited the stale "T2a-T2f remaining" status text from
 * v2. This patch corrects the record.
 *
 * 21 patches, atomic (in-memory, file written once at end):
 *   P1:  Status line — T2 phase CLOSED
 *   P2:  Insert v5 status log entry above v4
 *   P3:  T2 section header — CLOSED
 *   P4-P9:   Mark T2a-T2f sub-section headers CLOSED with commit hashes
 *   P10-P20: Close 11 F-* findings cleanly addressed by T2a-T2f migrations
 *   P21: Next action update — T3 next, not T2a
 *
 * Pre-flight: requires v4 marker. Idempotent: skip if v5 marker present.
 */

const fs = require('fs')
const path = require('path')

const TRACKER = path.join('docs', 'W-LEADS-EMAIL-TRACKER.md')
if (!fs.existsSync(TRACKER)) { console.error('FAIL: tracker not found'); process.exit(1) }
const original = fs.readFileSync(TRACKER, 'utf8')

const V4_MARKER_PREFIX = '- **2026-05-10 v4 T2h CLOSED'
const V5_MARKER_PREFIX = '- **2026-05-10 v5 T2 PHASE CLOSED'

if (original.indexOf(V4_MARKER_PREFIX) === -1) {
  console.error('FAIL: v4 marker not found. Apply v4 first.')
  process.exit(1)
}
if (original.indexOf(V5_MARKER_PREFIX) !== -1) {
  console.log('v5 marker already present. No-op.')
  process.exit(0)
}

const v4LineMatch = original.match(/^- \*\*2026-05-10 v4 T2h CLOSED.*$/m)
if (!v4LineMatch) {
  console.error('FAIL: could not isolate full v4 line for P2 anchor.')
  process.exit(1)
}
const V4_FULL_LINE = v4LineMatch[0]

const V5_ENTRY =
  '- **2026-05-10 v5 T2 PHASE CLOSED + T2a–T2f CLOSURES BACKFILLED + v3/v4 STATUS CORRECTIONS** — Discovery this session via deep DB probe (`scripts/probe-t2-reality-check.js`): T2a–T2f had ALREADY been shipped to production between 7:54 AM and 10:49 AM 2026-05-10, after v2 (T1 LOCKED) but before the v3/v4 patches that captured T2g + T2h. The v3 and v4 status lines inherited the stale "T2a–T2f remaining" claim from v2; this entry corrects the record. Actual T2 commit chain: T2a `b8743a7` (4 typed origin geo columns + 4 FKs + 4 partial indexes), T2b `37b3886` (3 perf indexes: tenant_email composite, listing_id partial, source), T2c `ae8454c` (lead_origin_route text NOT NULL DEFAULT \'unknown\' + tenant_origin_route index), T2d `b74cdd2` (CHECK on appointment_status + assignment_source), T2e `43ec751` (vip_requests.tenant_id SET NOT NULL + FK + tenant index + status/request_type SET NOT NULL + 2 CHECKs), T2f `8e84040` (CREATE TABLE lead_email_recipients_log + 4 indexes + 2 append-only triggers), T2g `d0c6ca3` + `f1bcf66` (resolve_agent_for_context tenant-leak fix), T2h `c826ffd` (delete app/actions/createLead.ts dead code). DB state confirmed: all 4 geo cols + FKs present, lead_origin_route present (text NOT NULL), both T2d CHECKs present, vip_requests.tenant_id NOT NULL with 2 CHECKs, lead_email_recipients_log table present. Findings closures backfilled: F-ORIGIN-GEO-IDS-NOT-PERSISTED, F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY, F-LEADS-NO-INDEX-ON-LISTING-ID, F-LEADS-NO-INDEX-ON-SOURCE, F-LEADS-APPOINTMENT-STATUS-NO-CHECK, F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK, F-VIP-REQUESTS-TENANT-ID-NULLABLE, F-VIP-REQUESTS-NO-FK-ON-TENANT-ID, F-VIP-REQUESTS-NO-TENANT-INDEX, F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY, F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN (11 closures). Findings remaining open with caller-wiring or partial-fix annotations: F-VIP-REQUEST-LEAD-LOSES-GEO-CONTEXT, F-ESTIMATOR-VIP-PARTIAL-GEO-CAPTURE, F-APPOINTMENT-LEAD-PARTIAL-GEO-CAPTURE (T5e wires callers to populate geo cols), F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER (T6b replaces LIKE filter with lead_origin_route lookup), F-VIP-REQUESTS-NO-CHECK-CONSTRAINTS (status + request_type CHECKs shipped; request_source CHECK still pending). T3 (recipient helper extension — wire System 2 BCC fan-out into the new lead_email_recipients_log table) is the actual next phase. Lesson logged: tracker hygiene must run in lockstep with shipped commits. T2a–T2f shipping between v2 and this session without tracker updates created 6 hours of drift, only caught by deep probe in this session. Going forward, every W-LEADS-EMAIL T# substantive commit gets a tracker version bump in the same working block.'

const patches = [
  {
    name: 'P1 status line',
    old: '**Status:** T2 build phase — IN PROGRESS. T2g + T2h shipped 2026-05-10 (T2g commits `d0c6ca3` + `f1bcf66`). Remaining: T2a–T2f schema migrations. Next action: T2a `leads` geo columns migration.',
    new: '**Status:** T2 build phase — ✅ CLOSED 2026-05-10. All 8 sub-phases shipped: T2a `b8743a7`, T2b `37b3886`, T2c `ae8454c`, T2d `b74cdd2`, T2e `43ec751`, T2f `8e84040`, T2g `d0c6ca3` + `f1bcf66`, T2h `c826ffd`. Tracker drift discovered + corrected at v5: T2a–T2f shipped 7:54–10:49 AM 2026-05-10 without v3/v4 capturing them. Next phase: T3 — recipient helper extension (BCC fan-out audit logging via lead_email_recipients_log).',
  },
  {
    name: 'P2 v5 status log entry',
    old: V4_FULL_LINE,
    new: V5_ENTRY + '\n' + V4_FULL_LINE,
  },
  {
    name: 'P3 T2 section header',
    old: '### T2 — Schema migrations (IN PROGRESS — T2g + T2h CLOSED 2026-05-10; T2a–T2f pending)',
    new: '### T2 — Schema migrations (✅ CLOSED 2026-05-10 — all 8 sub-phases shipped; see status log v5 for commit chain and findings closures)',
  },
  {
    name: 'P4 T2a sub-header CLOSED',
    old: '**T2a — `leads` typed origin columns**',
    new: '**T2a — `leads` typed origin columns — ✅ CLOSED 2026-05-10 (commit `b8743a7`)**',
  },
  {
    name: 'P5 T2b sub-header CLOSED',
    old: '**T2b — `leads` performance indexes**',
    new: '**T2b — `leads` performance indexes — ✅ CLOSED 2026-05-10 (commit `37b3886`)**',
  },
  {
    name: 'P6 T2c sub-header CLOSED',
    old: '**T2c — `leads.lead_origin_route` for questionnaire LIKE filter fix**',
    new: '**T2c — `leads.lead_origin_route` for questionnaire LIKE filter fix — ✅ CLOSED 2026-05-10 (commit `ae8454c`); T6b application-half pending**',
  },
  {
    name: 'P7 T2d sub-header CLOSED',
    old: '**T2d — `leads` data-quality CHECK constraints**',
    new: '**T2d — `leads` data-quality CHECK constraints — ✅ CLOSED 2026-05-10 (commit `b74cdd2`)**',
  },
  {
    name: 'P8 T2e sub-header CLOSED',
    old: '**T2e — `vip_requests` tenant scoping fix**',
    new: '**T2e — `vip_requests` tenant scoping fix — ✅ CLOSED 2026-05-10 (commit `43ec751`); request_source CHECK still pending as F-VIP-REQUESTS-REQUEST-SOURCE-NO-CHECK**',
  },
  {
    name: 'P9 T2f sub-header CLOSED',
    old: '**T2f — `lead_email_recipients_log` new audit table**',
    new: '**T2f — `lead_email_recipients_log` new audit table — ✅ CLOSED 2026-05-10 (commit `8e84040`); T3 wires callers to write rows**',
  },
  {
    name: 'P10 F-ORIGIN-GEO-IDS-NOT-PERSISTED closure',
    old: '- **F-ORIGIN-GEO-IDS-NOT-PERSISTED** — area_id/muni_id/community_id/neighbourhood_id passed to resolver, discarded. T2a adds typed columns.',
    new: '- **F-ORIGIN-GEO-IDS-NOT-PERSISTED ✅ CLOSED 2026-05-10 (T2a, commit `b8743a7`)** — leads.area_id / municipality_id / community_id / neighbourhood_id columns added with FKs to treb_areas / municipalities / communities / neighbourhoods + 4 partial indexes. Schema half complete; caller wiring (T5e) populates them.',
  },
  {
    name: 'P11 F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY closure',
    old: '- **F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY** — no `(tenant_id, contact_email)` composite index. Sequential scan. T2b.',
    new: '- **F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY ✅ CLOSED 2026-05-10 (T2b, commit `37b3886`)** — `idx_leads_tenant_email (tenant_id, contact_email)` shipped; getOrCreateLead duplicate-detection now index-scans.',
  },
  {
    name: 'P12 F-LEADS-NO-INDEX-ON-LISTING-ID closure',
    old: '- **F-LEADS-NO-INDEX-ON-LISTING-ID** — `idx_leads_building_id` exists; no listing-id sibling. T2b.',
    new: '- **F-LEADS-NO-INDEX-ON-LISTING-ID ✅ CLOSED 2026-05-10 (T2b, commit `37b3886`)** — `idx_leads_listing_id` partial index (WHERE listing_id IS NOT NULL) shipped, sibling to existing `idx_leads_building_id`.',
  },
  {
    name: 'P13 F-LEADS-NO-INDEX-ON-SOURCE closure',
    old: '- **F-LEADS-NO-INDEX-ON-SOURCE** — analytics scan. T2b.',
    new: '- **F-LEADS-NO-INDEX-ON-SOURCE ✅ CLOSED 2026-05-10 (T2b, commit `37b3886`)** — `idx_leads_source` shipped; analytics queries now index-scan.',
  },
  {
    name: 'P14 F-LEADS-APPOINTMENT-STATUS-NO-CHECK closure',
    old: '- **F-LEADS-APPOINTMENT-STATUS-NO-CHECK** — no enum constraint. T2d.',
    new: '- **F-LEADS-APPOINTMENT-STATUS-NO-CHECK ✅ CLOSED 2026-05-10 (T2d, commit `b74cdd2`)** — `leads_appointment_status_check` constraint shipped: pending / confirmed / cancelled / completed / rescheduled.',
  },
  {
    name: 'P15 F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK closure',
    old: '- **F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK** — no enum constraint. T2d.',
    new: '- **F-LEADS-ASSIGNMENT-SOURCE-NO-CHECK ✅ CLOSED 2026-05-10 (T2d, commit `b74cdd2`)** — `leads_assignment_source_check` constraint shipped: geo / admin / manual / override.',
  },
  {
    name: 'P16 F-VIP-REQUESTS-TENANT-ID-NULLABLE closure',
    old: '- **F-VIP-REQUESTS-TENANT-ID-NULLABLE (MAJOR)** — `tenant_id NULL`. T2e.',
    new: '- **F-VIP-REQUESTS-TENANT-ID-NULLABLE (MAJOR) ✅ CLOSED 2026-05-10 (T2e, commit `43ec751`)** — `vip_requests.tenant_id` is now uuid NOT NULL. T2e-pre probe verified 0 existing rows so no backfill was needed.',
  },
  {
    name: 'P17 F-VIP-REQUESTS-NO-FK-ON-TENANT-ID closure',
    old: '- **F-VIP-REQUESTS-NO-FK-ON-TENANT-ID** — no referential integrity. T2e.',
    new: '- **F-VIP-REQUESTS-NO-FK-ON-TENANT-ID ✅ CLOSED 2026-05-10 (T2e, commit `43ec751`)** — `vip_requests_tenant_id_fkey` FK constraint added.',
  },
  {
    name: 'P18 F-VIP-REQUESTS-NO-TENANT-INDEX closure',
    old: '- **F-VIP-REQUESTS-NO-TENANT-INDEX** — every per-tenant query scans. T2e.',
    new: '- **F-VIP-REQUESTS-NO-TENANT-INDEX ✅ CLOSED 2026-05-10 (T2e, commit `43ec751`)** — `idx_vip_requests_tenant` shipped.',
  },
  {
    name: 'P19 F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY closure',
    old: '- **F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY (CONFIRMED)** — System 2 chain BCC fan-out invisible. T2f introduces `lead_email_recipients_log`.',
    new: '- **F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY ✅ CLOSED 2026-05-10 (T2f, commit `8e84040`)** — `lead_email_recipients_log` audit table shipped with append-only semantics (DELETE blocked via trg_lerl_no_delete; UPDATE limited to status / sent_at / delivered_at / bounced_at / resend_message_id via trg_lerl_status_only_update) + 4 indexes (tenant_sent, lead, recipient, resend_msg). Caller wiring at T3.',
  },
  {
    name: 'P20 F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN closure',
    old: '- **F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN (CONFIRMED)** — no recipient enumeration in current log. T2f.',
    new: '- **F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN ✅ CLOSED 2026-05-10 (T2f, commit `8e84040`)** — new `lead_email_recipients_log` table has `recipient_email` per row (one row per layer in the BCC fan-out).',
  },
  {
    name: 'P21 Next action update',
    old: 'T2a estimate: ~30 minutes including probe-then-patch + smoke. Then T2b (indexes), T2c (lead_origin_route), T2d (CHECK constraints), T2e (vip_requests scope), T2f (audit table) — each one ships before the next starts. T2g (RPC tenant-leak fix, commits `d0c6ca3` + `f1bcf66`) and T2h (`createLead.ts` delete) were prioritized and already shipped 2026-05-10; see status log v3 + v4 entries and findings closures.',
    new: 'T2 phase fully closed 2026-05-10. Next phase: **T3 — Recipient helper extension** (wire System 2 BCC fan-out from `lib/admin-homes/lead-email-recipients.ts` walker into `lead_email_recipients_log`, write one row per recipient on every send across the 7 lead routes; depends on T2f schema which is shipped). T2 commit chain captured in status log v5 entry. Per the v5 lesson: every W-LEADS-EMAIL T# substantive commit gets a tracker version bump in the same working block — no more silent shipping that creates drift.',
  },
]

let working = original
let applied = 0

for (const p of patches) {
  const occ = working.split(p.old).length - 1
  if (occ === 0) {
    console.error('FAIL: ' + p.name + ' — old text not found in tracker.')
    console.error('Looking for: ' + p.old.slice(0, 160) + (p.old.length > 160 ? '...' : ''))
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

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
const backupPath = TRACKER + '.backup_' + stamp
fs.writeFileSync(backupPath, original)
console.log('Backup: ' + backupPath)
fs.writeFileSync(TRACKER, working)
const delta = working.length - original.length
console.log('Wrote: ' + TRACKER + ' (delta ' + (delta >= 0 ? '+' : '') + delta + ' chars)')
console.log('')
console.log('v5 patch applied: ' + applied + '/' + patches.length)