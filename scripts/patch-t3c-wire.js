#!/usr/bin/env node
/**
 * patch-t3c-wire.js
 *
 * W-LEADS-EMAIL T3c: wire logEmailRecipients into 4 routes (1 of 5 skipped — see below).
 *
 * 10 patches across 4 files, atomic — if any anchor fails, nothing is written.
 *
 * Files touched:
 *   F1 — app/api/charlie/appointment/route.ts                 (2 patches: import, chain send+audit)
 *   F2 — app/api/charlie/lead/route.ts                        (3 patches: import, UPDATE-path leadId-assignment FIX, chain send+audit)
 *   F3 — app/api/walliam/estimator/vip-questionnaire/route.ts (2 patches: import, chain send+audit with leadId-lookup)
 *   F4 — app/api/walliam/estimator/vip-request/route.ts       (3 patches: import, insert refactor, chain send+audit)
 *
 * SKIPPED:
 *   app/api/walliam/estimator/vip-approve/route.ts — user-facing approval email.
 *     TO = vipRequest.email (lead's contact), CC = managerEmail, BCC = helper.bcc.
 *     User-in-TO has no valid recipient_layer in lerl_recipient_layer_check
 *     ('agent','manager','area_manager','tenant_admin','platform_manager',
 *      'platform_admin','tenant_overlay_cc','tenant_overlay_bcc' — no
 *      'lead_contact' or 'tenant_overlay_to'). Forcing it to 'tenant_overlay_bcc'
 *     would be semantically wrong. Documented as T3d-followup: extend schema
 *     to add user-recipient layer for approval/transactional emails.
 *
 * Pre-existing bug FIXED in F2.P2:
 *   charlie/lead UPDATE branch never assigns leadId. Existing code at L238 does
 *   `if (sessionId && leadId)` to link session to lead — silently skipped on UPDATE.
 *   This script adds `leadId = existingLead.id` after the UPDATE error check.
 *   Per Rule Zero (comprehensive): fix the root cause while we're in there.
 *
 * Per-route templateKey constants:
 *   charlie_appointment_chain
 *   charlie_lead_enrichment_chain
 *   walliam_estimator_vip_questionnaire_chain
 *   walliam_estimator_vip_request_chain
 *
 * Line-ending handling: each file detected on read, normalized to LF for
 * matching, restored to original ending on write (T3b lesson).
 *
 * Idempotency: detected via 'charlie_appointment_chain' templateKey marker.
 */

const fs = require('fs')
const path = require('path')

const j = (...lines) => lines.join('\n')

// ============================================================================
// File 1: app/api/charlie/appointment/route.ts
// ============================================================================

const F1 = 'app/api/charlie/appointment/route.ts'

const F1_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F1_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

const F1_P2_OLD = j(
  "      try {",
  "        await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject: `📅 New ${intent === 'buyer' ? 'Viewing' : 'Consultation'} Request — ${name} — ${formattedDate}`,",
  "          html: buildAgentNotificationEmail({",
  "            name, email, phone, intent, formattedDate, appointment_time,",
  "            appointment_properties, geo_name,",
  "          }),",
  "        })"
)

const F1_P2_NEW = j(
  "      try {",
  "        const subject = `📅 New ${intent === 'buyer' ? 'Viewing' : 'Consultation'} Request — ${name} — ${formattedDate}`",
  "        const sendResult = await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html: buildAgentNotificationEmail({",
  "            name, email, phone, intent, formattedDate, appointment_time,",
  "            appointment_properties, geo_name,",
  "          }),",
  "        })",
  "        if (lead?.id) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId: tenantId || '',",
  "            leadId: lead.id,",
  "            agentId,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'charlie_appointment_chain',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// File 2: app/api/charlie/lead/route.ts
// ============================================================================

const F2 = 'app/api/charlie/lead/route.ts'

const F2_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F2_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

// F2.P2 — FIX: UPDATE branch never assigned leadId; this caused the session-link
// at L238 to silently skip on UPDATE path. Add `leadId = existingLead.id` after
// the error check.
const F2_P2_OLD = j(
  "      if (updateError) {",
  "        console.error('[charlie/lead] enrichment update error:', updateError)",
  "        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })",
  "      }",
  "    } else {"
)

const F2_P2_NEW = j(
  "      if (updateError) {",
  "        console.error('[charlie/lead] enrichment update error:', updateError)",
  "        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })",
  "      }",
  "      leadId = existingLead.id",
  "    } else {"
)

// F2.P3 — chain send + audit
const F2_P3_OLD = j(
  "      try {",
  "        await sendTenantEmail({",
  "          tenantId,",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject: `🏠 New ${intent === 'buyer' ? 'Buyer' : 'Seller'} Lead — ${name} — ${profile?.geoName || 'GTA'}`,",
  "          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics }),",
  "        })"
)

const F2_P3_NEW = j(
  "      try {",
  "        const subject = `🏠 New ${intent === 'buyer' ? 'Buyer' : 'Seller'} Lead — ${name} — ${profile?.geoName || 'GTA'}`",
  "        const sendResult = await sendTenantEmail({",
  "          tenantId,",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics }),",
  "        })",
  "        if (leadId) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId,",
  "            leadId,",
  "            agentId,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'charlie_lead_enrichment_chain',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// File 3: app/api/walliam/estimator/vip-questionnaire/route.ts
// ============================================================================

const F3 = 'app/api/walliam/estimator/vip-questionnaire/route.ts'

const F3_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F3_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

// F3.P2 — leadId lookup + chain send + audit. The vip-questionnaire UPDATE
// branch uses existingLead.id locally but doesn't propagate it to send-time
// scope. Rather than refactor the entire upsert block, add a single lookup
// query just before the send (idempotent, ~5ms cost).
const F3_P2_OLD = j(
  "    if (recipients) {",
  "      try {",
  "        await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject: `📋 WALLiam Estimator Questionnaire — ${userName || vipRequest.phone}`,",
  "          html: emailHtml,",
  "        })"
)

const F3_P2_NEW = j(
  "    if (recipients) {",
  "      // T3c — vip-questionnaire enriches an existing walliam_estimator% lead;",
  "      // look it up here for the audit target. Single query, idempotent.",
  "      let leadIdForAudit: string | null = null",
  "      if (userId && tenantId) {",
  "        const { data: latestLead } = await supabase",
  "          .from('leads')",
  "          .select('id')",
  "          .eq('user_id', userId)",
  "          .eq('tenant_id', tenantId)",
  "          .like('source', 'walliam_estimator%')",
  "          .order('created_at', { ascending: false })",
  "          .limit(1)",
  "        leadIdForAudit = latestLead?.[0]?.id || null",
  "      }",
  "      try {",
  "        const subject = `📋 WALLiam Estimator Questionnaire — ${userName || vipRequest.phone}`",
  "        const sendResult = await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html: emailHtml,",
  "        })",
  "        if (leadIdForAudit) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId: tenantId || '',",
  "            leadId: leadIdForAudit,",
  "            agentId: agent?.id || null,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'walliam_estimator_vip_questionnaire_chain',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// File 4: app/api/walliam/estimator/vip-request/route.ts
// ============================================================================

const F4 = 'app/api/walliam/estimator/vip-request/route.ts'

const F4_P1_OLD = "} from '@/lib/admin-homes/lead-email-recipients'"
const F4_P1_NEW = "} from '@/lib/admin-homes/lead-email-recipients'\nimport { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

// F4.P2 — insert refactor: declare let lead at outer scope, chain .select('id').single(),
// capture data, assign to lead post-error-check (same pattern as T3b F2_P2 for the
// other vip-request route).
const F4_P2_OLD = j(
  "    if (userEmail) {",
  "      const { error: leadError } = await supabase",
  "        .from('leads')",
  "        .insert({",
  "          agent_id: agent?.id || null,",
  "          user_id: session.user_id,",
  "          tenant_id: tenantId,",
  "          manager_id: chainManagerId,",
  "          area_manager_id: chainAreaManagerId,",
  "          tenant_admin_id: chainTenantAdminId,",
  "          contact_name: userName || 'WALLiam User',",
  "          contact_email: userEmail,",
  "          contact_phone: phone,",
  "          source: 'walliam_estimator_vip_request',",
  "          source_url: pageUrl,",
  "          building_id: session.current_page_type === 'building' ? session.current_page_id : null,",
  "          message: `WALLiam Estimator VIP Request${buildingName ? ` — ${buildingName}` : ''}`,",
  "          status: 'new',",
  "          quality: 'hot',",
  "          assignment_source: agent?.id ? 'geo' : 'admin',",
  "        })",
  "      if (leadError) console.error('[walliam/estimator/vip-request] lead error:', leadError)",
  "    }"
)

const F4_P2_NEW = j(
  "    let lead: { id: string } | null = null",
  "    if (userEmail) {",
  "      const { data: leadData, error: leadError } = await supabase",
  "        .from('leads')",
  "        .insert({",
  "          agent_id: agent?.id || null,",
  "          user_id: session.user_id,",
  "          tenant_id: tenantId,",
  "          manager_id: chainManagerId,",
  "          area_manager_id: chainAreaManagerId,",
  "          tenant_admin_id: chainTenantAdminId,",
  "          contact_name: userName || 'WALLiam User',",
  "          contact_email: userEmail,",
  "          contact_phone: phone,",
  "          source: 'walliam_estimator_vip_request',",
  "          source_url: pageUrl,",
  "          building_id: session.current_page_type === 'building' ? session.current_page_id : null,",
  "          message: `WALLiam Estimator VIP Request${buildingName ? ` — ${buildingName}` : ''}`,",
  "          status: 'new',",
  "          quality: 'hot',",
  "          assignment_source: agent?.id ? 'geo' : 'admin',",
  "        })",
  "        .select('id')",
  "        .single()",
  "      if (leadError) console.error('[walliam/estimator/vip-request] lead error:', leadError)",
  "      lead = leadData",
  "    }"
)

// F4.P3 — chain send + audit
const F4_P3_OLD = j(
  "      try {",
  "        await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject: `WALLiam Estimator VIP Request: ${phone}`,",
  "          html: emailHtml,",
  "        })"
)

const F4_P3_NEW = j(
  "      try {",
  "        const subject = `WALLiam Estimator VIP Request: ${phone}`",
  "        const sendResult = await sendTenantEmail({",
  "          tenantId: tenantId || '',",
  "          to: recipients.to,",
  "          cc: recipients.cc.length > 0 ? recipients.cc : undefined,",
  "          bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,",
  "          subject,",
  "          html: emailHtml,",
  "        })",
  "        if (lead?.id) {",
  "          await logEmailRecipients({",
  "            supabase,",
  "            tenantId: tenantId || '',",
  "            leadId: lead.id,",
  "            agentId: agent?.id || null,",
  "            recipients,",
  "            subject,",
  "            templateKey: 'walliam_estimator_vip_request_chain',",
  "            resendMessageId: sendResult.id,",
  "          })",
  "        }"
)

// ============================================================================
// Patch list
// ============================================================================

const patches = [
  { file: F1, name: 'F1.P1 charlie/appointment import',       old: F1_P1_OLD, new: F1_P1_NEW },
  { file: F1, name: 'F1.P2 charlie/appointment chain+audit',  old: F1_P2_OLD, new: F1_P2_NEW },
  { file: F2, name: 'F2.P1 charlie/lead import',              old: F2_P1_OLD, new: F2_P1_NEW },
  { file: F2, name: 'F2.P2 charlie/lead UPDATE-path leadId fix', old: F2_P2_OLD, new: F2_P2_NEW },
  { file: F2, name: 'F2.P3 charlie/lead chain+audit',         old: F2_P3_OLD, new: F2_P3_NEW },
  { file: F3, name: 'F3.P1 vip-questionnaire import',         old: F3_P1_OLD, new: F3_P1_NEW },
  { file: F3, name: 'F3.P2 vip-questionnaire chain+audit',    old: F3_P2_OLD, new: F3_P2_NEW },
  { file: F4, name: 'F4.P1 vip-request estimator import',     old: F4_P1_OLD, new: F4_P1_NEW },
  { file: F4, name: 'F4.P2 vip-request estimator insert refactor', old: F4_P2_OLD, new: F4_P2_NEW },
  { file: F4, name: 'F4.P3 vip-request estimator chain+audit', old: F4_P3_OLD, new: F4_P3_NEW },
]

// ============================================================================
// Idempotency check (use F1.P2 templateKey marker — present iff F1.P2 applied)
// ============================================================================

const IDEMPOTENCY_MARKER = "templateKey: 'charlie_appointment_chain'"

let alreadyApplied = false
if (fs.existsSync(F1)) {
  const f1 = fs.readFileSync(F1, 'utf8')
  if (f1.includes(IDEMPOTENCY_MARKER)) {
    alreadyApplied = true
  }
}

if (alreadyApplied) {
  console.log('T3c wire markers already present in ' + F1 + '. No-op.')
  process.exit(0)
}

// ============================================================================
// Group by file, validate all anchors atomically
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
      console.error('  Looking for (first 200 chars): ' + p.old.slice(0, 200) + '...')
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

  if (lineEnding === '\r\n') content = content.replace(/\n/g, '\r\n')
  fileChanges.push({ file: filePath, original, content })
}

// ============================================================================
// Backup + write (only reached if every anchor validated above)
// ============================================================================

for (const fc of fileChanges) {
  fs.writeFileSync(fc.file + '.backup_' + stamp, fc.original)
  fs.writeFileSync(fc.file, fc.content)
  console.log('Wrote: ' + path.relative(process.cwd(), fc.file))
}

console.log('')
console.log('T3c wire applied: ' + totalApplied + ' patches across ' + fileChanges.length + ' files')
console.log('Backup suffix: .backup_' + stamp)
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit                       # confirm no caller breakage')
console.log('  2. Build smoke harness extension (5 tiers: 4 audit + 1 verify-skip for vip-approve)')
console.log('  3. Run smoke; close T3c with tracker v9 patch')