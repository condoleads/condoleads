#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v6.js
 *
 * v5 -> v6: T3a CLOSED + T3 phase started + T3b probe context recorded.
 *
 * Lockstep hygiene per v5 lesson — this tracker bump ships in the same
 * working block as the T3a build commit (27fe944), not as a deferred
 * follow-up.
 *
 * 4 patches:
 *   P1: Status line — T3 phase IN PROGRESS, T3a CLOSED
 *   P2: Insert v6 status log entry above v5
 *   P3: T3 section header — IN PROGRESS, T3a closed
 *   P4: Next action — point to T3b with the probe context recorded
 *
 * Pre-flight: requires v5 marker. Idempotent: skip if v6 marker present.
 */

const fs = require('fs')
const path = require('path')

const TRACKER = path.join('docs', 'W-LEADS-EMAIL-TRACKER.md')
if (!fs.existsSync(TRACKER)) { console.error('FAIL: tracker not found'); process.exit(1) }
const original = fs.readFileSync(TRACKER, 'utf8')

const V5_MARKER_PREFIX = '- **2026-05-10 v5 T2 PHASE CLOSED'
const V6_MARKER_PREFIX = '- **2026-05-10 v6 T3a CLOSED'

if (original.indexOf(V5_MARKER_PREFIX) === -1) {
  console.error('FAIL: v5 marker not found in tracker. Apply v5 first.')
  process.exit(1)
}
if (original.indexOf(V6_MARKER_PREFIX) !== -1) {
  console.log('v6 marker already present. No-op.')
  process.exit(0)
}

const v5LineMatch = original.match(/^- \*\*2026-05-10 v5 T2 PHASE CLOSED.*$/m)
if (!v5LineMatch) {
  console.error('FAIL: could not isolate full v5 line for P2 anchor.')
  process.exit(1)
}
const V5_FULL_LINE = v5LineMatch[0]

const V6_ENTRY =
  '- **2026-05-10 v6 T3a CLOSED + T3 PHASE STARTED + T3b CONTEXT RECORDED** — T3a shipped (commit `27fe944`): `lib/admin-homes/log-email-recipients.ts` builds the `logEmailRecipients` audit-log writer helper. 146 lines, TSC clean, pure addition (no callers yet). Helper writes one row per recipient (TO/CC/BCC) into `lead_email_recipients_log`, mapping each email to its `recipient_layer` via the walker\'s `resolved` breakdown (agent / manager / area_manager / tenant_admin / manager_platform / admin_platform / 4 delegate types / unknown fallback). Insert failures log to console but never throw — audit failures must not block lead operations. Default status=\'sent\' + sent_at=now() (caller invokes after `sendTenantEmail` returns successfully). Resend webhook integration for delivered/bounced status transitions is intentionally a separate scope (webhook handler + auth + finder-by-resend_message_id) — schema supports it via the `trg_lerl_status_only_update` trigger, but it is a distinct piece of work, not a T3 deferral. T3b probe context recorded so next session picks up cleanly without re-probing: all 4 LEAD_WRITER + EMAIL routes (`walliam/contact`, `walliam/charlie/vip-request`, `charlie/plan-email`, `lib/actions/leads.ts`) share IDENTICAL outer structure — `let recipients; try { walker } catch (AdminPlatformUnreachable) { recipients = null }; if (recipients) { try { sendTenantEmail({...}) } catch (TenantEmailNotConfigured / TenantEmailFailed) { warn / error } }`. Variable-name differences per file: tenant id is `tenant_id` (snake_case) in walliam/contact vs `tenantId` in walliam/charlie/vip-request vs `tenantId || \'\'` in charlie/plan-email vs `params.tenantId` in lib/actions/leads.ts; agent id is `agent?.id || null` in 3 of 4 sites except lib/actions/leads.ts which uses `resolvedAgentId`; subject/html are local vars in 3 routes, inline template literal subject + `emailHtml` var in walliam/charlie/vip-request. T3b patch design: insert `await logEmailRecipients({...})` inside the existing inner `if (recipients) { try {...} }` block immediately after the `await sendTenantEmail(...)` line. Per-route `templateKey` constants planned: `walliam_contact_lead_capture`, `walliam_charlie_vip_request_lead`, `charlie_plan_email_chain`, `leads_helper_new_lead_notification`. One remaining unknown per file — the `lead_id` variable binding (where the just-inserted lead row\'s id is bound to a local variable) — opens the T3b round with a small targeted probe before the patch script is finalised. Phased plan continuing: T3a ✅ closed, T3b (4 LEAD_WRITER + EMAIL wire-ups), T3c (5 EMAIL_ONLY wire-ups in `charlie/appointment`, `charlie/lead`, `walliam/estimator/{vip-approve, vip-questionnaire, vip-request}`), T3d (T3 phase close + tracker v7). Each phase commits with TSC clean + tracker bump in the same working block, per v5 lockstep-hygiene rule.'

const patches = [
  {
    name: 'P1 status line',
    old: '**Status:** T2 build phase — ✅ CLOSED 2026-05-10. All 8 sub-phases shipped: T2a `b8743a7`, T2b `37b3886`, T2c `ae8454c`, T2d `b74cdd2`, T2e `43ec751`, T2f `8e84040`, T2g `d0c6ca3` + `f1bcf66`, T2h `c826ffd`. Tracker drift discovered + corrected at v5: T2a–T2f shipped 7:54–10:49 AM 2026-05-10 without v3/v4 capturing them. Next phase: T3 — recipient helper extension (BCC fan-out audit logging via lead_email_recipients_log).',
    new: '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS** — T3a shipped 2026-05-10 (commit `27fe944`, `logEmailRecipients` helper, no callers yet). T3b/T3c/T3d remaining: T3b wires 4 LEAD_WRITER + EMAIL routes, T3c wires 5 EMAIL_ONLY routes, T3d closes phase + tracker v7. T3b probe context captured in status log v6 entry — next session picks up cleanly without re-probing.',
  },
  {
    name: 'P2 v6 status log entry',
    old: V5_FULL_LINE,
    new: V6_ENTRY + '\n' + V5_FULL_LINE,
  },
  {
    name: 'P3 T3 section header',
    old: '### T3 — Recipient helper extension (NOT STARTED)',
    new: '### T3 — Recipient helper extension (IN PROGRESS — T3a CLOSED 2026-05-10 commit `27fe944`; T3b/T3c/T3d pending)',
  },
  {
    name: 'P4 Next action update',
    old: 'T2 phase fully closed 2026-05-10. Next phase: **T3 — Recipient helper extension** (wire System 2 BCC fan-out from `lib/admin-homes/lead-email-recipients.ts` walker into `lead_email_recipients_log`, write one row per recipient on every send across the 7 lead routes; depends on T2f schema which is shipped). T2 commit chain captured in status log v5 entry. Per the v5 lesson: every W-LEADS-EMAIL T# substantive commit gets a tracker version bump in the same working block — no more silent shipping that creates drift.',
    new: 'T2 phase ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS.** T3a ✅ CLOSED 2026-05-10 commit `27fe944` (`logEmailRecipients` helper built; no callers yet). **Next: T3b** — wire `logEmailRecipients` into the 4 LEAD_WRITER + EMAIL sites (`walliam/contact`, `walliam/charlie/vip-request`, `charlie/plan-email`, `lib/actions/leads.ts`). Variable-naming context per file captured in status log v6 entry. One small targeted probe needed at the start of T3b round to capture each route\'s `lead_id` variable binding (the local variable holding the just-inserted lead row\'s id) before the patch script can be precise. After T3b: T3c (5 EMAIL_ONLY sites: `charlie/appointment`, `charlie/lead`, `walliam/estimator/{vip-approve, vip-questionnaire, vip-request}`), then T3d (T3 phase close + tracker v7). Lockstep hygiene per v5 lesson — every substantive commit gets a tracker version bump in the same working block.',
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
console.log('Wrote: ' + TRACKER + ' (delta ' + (working.length - original.length) + ' chars)')
console.log('v6 patch applied: ' + applied + '/' + patches.length)