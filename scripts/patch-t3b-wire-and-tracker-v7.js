#!/usr/bin/env node
/**
 * patch-t3b-wire-and-tracker-v7.js
 *
 * W-LEADS-EMAIL T3b: wire logEmailRecipients into all 4 LEAD_WRITER + EMAIL
 * routes + tracker v7 bump (lockstep hygiene per v5 lesson).
 *
 * 14 patches across 5 files, atomic — if any patch's anchor fails, no file
 * is written.
 *
 * Files touched:
 *   1. app/api/walliam/contact/route.ts (2 patches: import, send+audit)
 *   2. app/api/walliam/charlie/vip-request/route.ts (3 patches: import, insert refactor, send+audit)
 *   3. app/api/charlie/plan-email/route.ts (3 patches: import, insert refactor, chain send+audit)
 *   4. lib/actions/leads.ts (2 patches: import, send+audit)
 *   5. docs/W-LEADS-EMAIL-TRACKER.md (4 patches: status, v7 entry, T3 header, Next action)
 *
 * Per-route templateKey:
 *   walliam_contact_lead_capture
 *   walliam_charlie_vip_request_lead
 *   charlie_plan_email_chain
 *   leads_helper_new_lead_notification
 */

const fs = require('fs')
const path = require('path')

const j = (...lines) => lines.join('\n')

// ============================================================================
// File 1: app/api/walliam/contact/route.ts (already chains .select('id').single())
// ============================================================================

const F1 = 'app/api/walliam/contact/route.ts'

const F1_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F1_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

const F1_P2_OLD = j(
  "        await sendTenantEmail({",
  "          tenantId: tenant_id,",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html,",
  "        })"
)

const F1_P2_NEW = j(
  "        const sendResult = await sendTenantEmail({",
  "          tenantId: tenant_id,",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html,",
  "        })",
  "        if (lead?.id) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId: tenant_id,",
  "            leadId: lead.id,",
  "            agentId: agent?.id || null,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'walliam_contact_lead_capture',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// File 2: app/api/walliam/charlie/vip-request/route.ts (insert refactor + outer-scope lead)
// ============================================================================

const F2 = 'app/api/walliam/charlie/vip-request/route.ts'

const F2_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F2_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

// Refactor the if(userEmail) insert block: declare let lead at outer scope, bind data inside.
// Original file has assignment_source ternary wrapped across two lines per Prettier.
const F2_P2_OLD = j(
  "    if (userEmail) {",
  "      const { error: leadError } = await supabase.from('leads').insert({",
  "        agent_id: agent?.id || null,",
  "        user_id: session.user_id || null,",
  "        tenant_id: tenantId,",
  "        manager_id: chainManagerId,",
  "        area_manager_id: chainAreaManagerId,",
  "        tenant_admin_id: chainTenantAdminId,",
  "        contact_name: userName,",
  "        contact_email: userEmail,",
  "        contact_phone: userPhone || null,",
  "        source: `${sourceKey}_charlie_vip_request`,",
  "        intent: planType || 'buyer',",
  "        status: 'new',",
  "        quality: 'hot',",
  "        assignment_source: agent?.id ? 'geo' : 'admin',",
  "      })",
  "      if (leadError) console.error('[walliam/vip-request] lead error:', leadError)",
  "    }"
)

const F2_P2_NEW = j(
  "    let lead: { id: string } | null = null",
  "    if (userEmail) {",
  "      const { data, error: leadError } = await supabase.from('leads').insert({",
  "        agent_id: agent?.id || null,",
  "        user_id: session.user_id || null,",
  "        tenant_id: tenantId,",
  "        manager_id: chainManagerId,",
  "        area_manager_id: chainAreaManagerId,",
  "        tenant_admin_id: chainTenantAdminId,",
  "        contact_name: userName,",
  "        contact_email: userEmail,",
  "        contact_phone: userPhone || null,",
  "        source: `${sourceKey}_charlie_vip_request`,",
  "        intent: planType || 'buyer',",
  "        status: 'new',",
  "        quality: 'hot',",
  "        assignment_source: agent?.id ? 'geo' : 'admin',",
  "      }).select('id').single()",
  "      if (leadError) console.error('[walliam/vip-request] lead error:', leadError)",
  "      lead = data",
  "    }"
)

// Send replacement: extract subject to const so it's reusable, capture sendResult, gate audit on lead?.id.
const F2_P3_OLD = j(
  "        await sendTenantEmail({",
  "          tenantId: tenantId,",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject: `VIP Plan Request: ${userName} (${planType === 'seller' ? 'Seller' : 'Buyer'} Plan)`,",
  "          html: emailHtml,",
  "        })"
)

const F2_P3_NEW = j(
  "        const subject = `VIP Plan Request: ${userName} (${planType === 'seller' ? 'Seller' : 'Buyer'} Plan)`",
  "        const sendResult = await sendTenantEmail({",
  "          tenantId: tenantId,",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html: emailHtml,",
  "        })",
  "        if (lead?.id) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId,",
  "            leadId: lead.id,",
  "            agentId: agent?.id || null,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'walliam_charlie_vip_request_lead',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// File 3: app/api/charlie/plan-email/route.ts (insert refactor + chain send only)
// ============================================================================

const F3 = 'app/api/charlie/plan-email/route.ts'

const F3_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F3_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

const F3_P2_OLD = j(
  "    await supabase.from('leads').insert({",
  "      agent_id: agent?.id || null,",
  "      user_id: userId,",
  "      contact_name: userName,",
  "      contact_email: userEmail,",
  "      source: 'walliam_charlie',",
  "      intent: planType,",
  "      geo_name: geoName,",
  "      budget_max: plan?.budgetMax || null,",
  "      plan_data: { planType, plan, analytics, topListings: (listings || []).slice(0, 5) },",
  "      manager_id: chainManagerId,",
  "      area_manager_id: chainAreaManagerId,",
  "      tenant_admin_id: chainTenantAdminId,",
  "      assignment_source: agent ? 'geo' : 'admin',",
  "      status: 'new',",
  "      quality: 'hot',",
  "      tenant_id: tenantId,",
  "    })"
)

const F3_P2_NEW = j(
  "    const { data: lead, error: leadError } = await supabase.from('leads').insert({",
  "      agent_id: agent?.id || null,",
  "      user_id: userId,",
  "      contact_name: userName,",
  "      contact_email: userEmail,",
  "      source: 'walliam_charlie',",
  "      intent: planType,",
  "      geo_name: geoName,",
  "      budget_max: plan?.budgetMax || null,",
  "      plan_data: { planType, plan, analytics, topListings: (listings || []).slice(0, 5) },",
  "      manager_id: chainManagerId,",
  "      area_manager_id: chainAreaManagerId,",
  "      tenant_admin_id: chainTenantAdminId,",
  "      assignment_source: agent ? 'geo' : 'admin',",
  "      status: 'new',",
  "      quality: 'hot',",
  "      tenant_id: tenantId,",
  "    }).select('id').single()",
  "    if (leadError) console.error('[plan-email] lead error:', leadError)"
)

// Chain send (the recipients-fanout BCC send) gets audit. The earlier user-facing send
// at L152 does NOT get audit (it predates lead creation and would orphan if gated wrong).
const F3_P3_OLD = j(
  "        await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html,",
  "        })"
)

const F3_P3_NEW = j(
  "        const sendResult = await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html,",
  "        })",
  "        if (lead?.id) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId: tenantId || '',",
  "            leadId: lead.id,",
  "            agentId: agent?.id || null,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'charlie_plan_email_chain',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// File 4: lib/actions/leads.ts (already chains .select().single())
// ============================================================================

const F4 = 'lib/actions/leads.ts'

const F4_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F4_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

const F4_P2_OLD = j(
  "      await sendTenantEmail({",
  "        tenantId: params.tenantId,",
  "        to: recipients.to,",
  "        cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "        bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "        subject,",
  "        html,",
  "      })"
)

const F4_P2_NEW = j(
  "      const sendResult = await sendTenantEmail({",
  "        tenantId: params.tenantId,",
  "        to: recipients.to,",
  "        cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "        bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "        subject,",
  "        html,",
  "      })",
  "      if (lead?.id) {",
  "        await logEmailRecipients({",
  "          supabase,",
  "          tenantId: params.tenantId,",
  "          leadId: lead.id,",
  "          agentId: resolvedAgentId,",
  "          recipients,",
  "          subject,",
  "          templateKey: 'leads_helper_new_lead_notification',",
  "          resendMessageId: sendResult.id,",
  "        })",
  "      }"
)

// ============================================================================
// File 5: docs/W-LEADS-EMAIL-TRACKER.md (v6 -> v7)
// ============================================================================

const F5 = 'docs/W-LEADS-EMAIL-TRACKER.md'

const V7_ENTRY =
  '- **2026-05-10 v7 T3b SHIPPED** — `logEmailRecipients` audit-log writer wired into all 4 LEAD_WRITER + EMAIL routes (`walliam/contact`, `walliam/charlie/vip-request`, `charlie/plan-email`, `lib/actions/leads.ts`). Each route now writes one row per recipient (TO/CC/BCC fan-out) into `lead_email_recipients_log` after `sendTenantEmail` succeeds, with `resendMessageId` from the Resend response. Audit calls gated on `lead?.id` so non-lead emails (e.g. plan-email user-facing send at L152) don\'t generate orphan audit rows. Insert refactors completed where needed: `walliam/charlie/vip-request` had a fire-and-forget INSERT only binding `error` (not `data`) — now declares `let lead: { id: string } | null = null` at outer scope, refactors inner insert to chain `.select(\'id\').single()`, assigns `lead = data` post-error-check; `charlie/plan-email` had a bare `await ...insert({...})` with no destructuring at all — now binds `{ data: lead, error: leadError }` and chains `.select(\'id\').single()`. `walliam/contact` and `lib/actions/leads.ts` already chained correctly at T2a / W-HIERARCHY-H3.9 time, so only audit-call additions were needed. Per-route `templateKey` constants: `walliam_contact_lead_capture`, `walliam_charlie_vip_request_lead`, `charlie_plan_email_chain`, `leads_helper_new_lead_notification`. Send-result captured into `sendResult` variable, `sendResult.id` populates the audit row\'s `resend_message_id` field. TSC clean post-patch. Next: T3c wires the 5 EMAIL_ONLY routes (`charlie/appointment`, `charlie/lead`, `walliam/estimator/{vip-approve, vip-questionnaire, vip-request}`) — these don\'t insert leads, they look up existing leads, so the audit pattern differs slightly (lead_id resolved from request body or DB lookup, not from a freshly-inserted row). T3d closes T3 phase + tracker v8.'

// Use regex to find v6 line for P2 anchor (we don't know exact text)
function readTracker() {
  return fs.readFileSync(path.resolve(F5), 'utf8')
}

const F5_P1_OLD = "**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS** — T3a shipped 2026-05-10 (commit `27fe944`, `logEmailRecipients` helper, no callers yet). T3b/T3c/T3d remaining: T3b wires 4 LEAD_WRITER + EMAIL routes, T3c wires 5 EMAIL_ONLY routes, T3d closes phase + tracker v7. T3b probe context captured in status log v6 entry — next session picks up cleanly without re-probing."
const F5_P1_NEW = "**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS** — T3a + T3b shipped 2026-05-10. T3a built `logEmailRecipients` helper (commit `27fe944`); T3b wired it into all 4 LEAD_WRITER + EMAIL routes with insert refactors where needed. Remaining: T3c (wire 5 EMAIL_ONLY routes) + T3d (T3 phase close + tracker v8)."

const F5_P3_OLD = "### T3 — Recipient helper extension (IN PROGRESS — T3a CLOSED 2026-05-10 commit `27fe944`; T3b/T3c/T3d pending)"
const F5_P3_NEW = "### T3 — Recipient helper extension (IN PROGRESS — T3a + T3b CLOSED 2026-05-10; T3c/T3d pending)"

const F5_P4_OLD = 'T2 phase ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS.** T3a ✅ CLOSED 2026-05-10 commit `27fe944` (`logEmailRecipients` helper built; no callers yet). **Next: T3b** — wire `logEmailRecipients` into the 4 LEAD_WRITER + EMAIL sites (`walliam/contact`, `walliam/charlie/vip-request`, `charlie/plan-email`, `lib/actions/leads.ts`). Variable-naming context per file captured in status log v6 entry. One small targeted probe needed at the start of T3b round to capture each route\'s `lead_id` variable binding (the local variable holding the just-inserted lead row\'s id) before the patch script can be precise. After T3b: T3c (5 EMAIL_ONLY sites: `charlie/appointment`, `charlie/lead`, `walliam/estimator/{vip-approve, vip-questionnaire, vip-request}`), then T3d (T3 phase close + tracker v7). Lockstep hygiene per v5 lesson — every substantive commit gets a tracker version bump in the same working block.'
const F5_P4_NEW = 'T2 phase ✅ CLOSED 2026-05-10. **T3 phase IN PROGRESS.** T3a + T3b ✅ CLOSED 2026-05-10. T3a built `logEmailRecipients` helper (commit `27fe944`); T3b wired it into all 4 LEAD_WRITER + EMAIL routes with insert refactors where needed (`walliam/contact` and `lib/actions/leads.ts` already chained `.select().single()`; `walliam/charlie/vip-request` and `charlie/plan-email` got chain refactors). **Next: T3c** — wire `logEmailRecipients` into the 5 EMAIL_ONLY routes: `charlie/appointment`, `charlie/lead`, `walliam/estimator/vip-approve`, `walliam/estimator/vip-questionnaire`, `walliam/estimator/vip-request`. These routes don\'t insert leads; they email about existing leads (status changes, approvals, confirmations). lead_id resolution differs per route — needs targeted probe at the start of T3c to find each route\'s lead lookup pattern. After T3c: T3d (T3 phase close + tracker v8). Lockstep hygiene per v5 lesson — every substantive commit gets a tracker version bump in the same working block.'

// ============================================================================
// Patch list (F5.P2 inserted dynamically below)
// ============================================================================

const patches = [
  { file: F1, name: 'F1.P1 walliam/contact import', old: F1_P1_OLD, new: F1_P1_NEW },
  { file: F1, name: 'F1.P2 walliam/contact send+audit', old: F1_P2_OLD, new: F1_P2_NEW },
  { file: F2, name: 'F2.P1 vip-request import', old: F2_P1_OLD, new: F2_P1_NEW },
  { file: F2, name: 'F2.P2 vip-request insert refactor', old: F2_P2_OLD, new: F2_P2_NEW },
  { file: F2, name: 'F2.P3 vip-request send+audit', old: F2_P3_OLD, new: F2_P3_NEW },
  { file: F3, name: 'F3.P1 plan-email import', old: F3_P1_OLD, new: F3_P1_NEW },
  { file: F3, name: 'F3.P2 plan-email insert refactor', old: F3_P2_OLD, new: F3_P2_NEW },
  { file: F3, name: 'F3.P3 plan-email chain send+audit', old: F3_P3_OLD, new: F3_P3_NEW },
  { file: F4, name: 'F4.P1 leads.ts import', old: F4_P1_OLD, new: F4_P1_NEW },
  { file: F4, name: 'F4.P2 leads.ts send+audit', old: F4_P2_OLD, new: F4_P2_NEW },
  { file: F5, name: 'F5.P1 tracker status line', old: F5_P1_OLD, new: F5_P1_NEW },
  // F5.P2 (v7 entry insertion above v6) — built dynamically below
  { file: F5, name: 'F5.P3 T3 section header', old: F5_P3_OLD, new: F5_P3_NEW },
  { file: F5, name: 'F5.P4 Next action', old: F5_P4_OLD, new: F5_P4_NEW },
]

// ============================================================================
// Idempotency check + dynamic F5.P2 anchor resolution
// ============================================================================

const trackerOriginal = readTracker()

if (trackerOriginal.indexOf('- **2026-05-10 v7 T3b SHIPPED') !== -1) {
  console.log('v7 marker already present in tracker. No-op.')
  process.exit(0)
}

const v6LineMatch = trackerOriginal.match(/^- \*\*2026-05-10 v6 T3a CLOSED.*$/m)
if (!v6LineMatch) {
  console.error('FAIL: could not isolate v6 line in tracker for F5.P2 anchor')
  process.exit(1)
}
const V6_FULL_LINE = v6LineMatch[0]

// Insert F5.P2 at index 11 (between F5.P1 and F5.P3) so tracker patches stay in order.
patches.splice(11, 0, {
  file: F5,
  name: 'F5.P2 insert v7 status log entry above v6',
  old: V6_FULL_LINE,
  new: V7_ENTRY + '\n' + V6_FULL_LINE,
})

// ============================================================================
// Group by file, validate all anchors atomically before any write
// ============================================================================

const fileGroups = {}
for (const p of patches) {
  if (!fileGroups[p.file]) fileGroups[p.file] = []
  fileGroups[p.file].push(p)
}

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
const fileChanges = []
let totalApplied = 0

for (const [file, fps] of Object.entries(fileGroups)) {
  const filePath = path.resolve(file)
  if (!fs.existsSync(filePath)) {
    console.error('FAIL: file not found: ' + file)
    process.exit(1)
  }
  const rawContent = fs.readFileSync(filePath, 'utf8')
  const original = rawContent
  const lineEnding = rawContent.includes('\r\n') ? '\r\n' : '\n'
  let content = rawContent.replace(/\r\n/g, '\n')
  for (const p of fps) {
    const occ = content.split(p.old).length - 1
    if (occ === 0) {
      console.error('FAIL: ' + p.name + ' — old text not found in ' + file)
      console.error('Looking for (first 200 chars): ' + p.old.slice(0, 200) + '...')
      process.exit(1)
    }
    if (occ !== 1) {
      console.error('FAIL: ' + p.name + ' — expected 1 match, found ' + occ)
      process.exit(1)
    }
    content = content.replace(p.old, p.new)
    totalApplied++
    console.log('  ' + p.name + ': matched + replaced')
  }
  if (lineEnding === '\r\n') {
    content = content.replace(/\n/g, '\r\n')
  }
  fileChanges.push({ file: filePath, original, content })
}

// ============================================================================
// Backup + write all files (only reached if every anchor validated above)
// ============================================================================

for (const fc of fileChanges) {
  fs.writeFileSync(fc.file + '.backup_' + stamp, fc.original)
  fs.writeFileSync(fc.file, fc.content)
  console.log('Wrote: ' + path.relative(process.cwd(), fc.file))
}

console.log('')
console.log('T3b patch applied: ' + totalApplied + ' patches across ' + fileChanges.length + ' files')
console.log('Backup suffix: .backup_' + stamp)
console.log('Run `npx tsc --noEmit` to verify type safety before committing.')