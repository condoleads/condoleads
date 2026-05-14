// scripts/patch-w4e9-workbench-tracker-close.js
// W-LEADS-WORKBENCH W4e.9 (2026-05-14)
// Closes W4e in docs/W-LEADS-WORKBENCH-TRACKER.md:
//   - flip W4e phase row from OPEN to SHIPPED
//   - append comprehensive W4e-SHIPPED status log entry

const fs = require('node:fs')
const path = require('node:path')

const TARGET = path.join('docs', 'W-LEADS-WORKBENCH-TRACKER.md')

if (!fs.existsSync(TARGET)) {
  console.error('ABORT: ' + TARGET + ' not found')
  process.exit(1)
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = '' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
              '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
const backupPath = TARGET + '.backup_' + stamp

fs.copyFileSync(TARGET, backupPath)
console.log('BACKUP ' + backupPath + ' (' + fs.statSync(backupPath).size + ' bytes)')

let source = fs.readFileSync(TARGET, 'utf8')
const hasCRLF = source.includes('\r\n')
console.log('LINE_ENDINGS: ' + (hasCRLF ? 'CRLF' : 'LF'))
if (hasCRLF) source = source.replace(/\r\n/g, '\n')

// Patch 1: flip W4e row OPEN -> SHIPPED
const w4eRowBefore = '| W4e | Emails tab + Send composer | OPEN | \u2014 | List + new send-email endpoint with audit logging |'
const w4eRowAfter  = '| W4e | Emails tab + Send composer | SHIPPED | 2026-05-14 | New `lead_contact` recipient_layer + `lead_admin_actions` first writer + EmailsTab list/composer + dual-audit per send. W4e.1 schema + W4e.2 logEmailRecipients extension + W4e.3 logLeadAdminAction helper + W4e.4 POST route + W4e.5 page fetch + W4e.6 EmailsTab component + W4e.7 wire + W4e-followup-A GRANT fix. Threading deferred to `W-EMAIL-THREADING`. |'

const count = source.split(w4eRowBefore).length - 1
if (count !== 1) {
  console.error('ABORT: W4e row anchor matched ' + count + ' times (expected 1)')
  console.error('  anchor: ' + JSON.stringify(w4eRowBefore.slice(0, 100)))
  fs.copyFileSync(backupPath, TARGET)
  console.error('RESTORED from backup; no changes written.')
  process.exit(1)
}
source = source.replace(w4eRowBefore, w4eRowAfter)
console.log('APPLIED p1_w4e_row_open_to_shipped')

// Patch 2: append W4e-SHIPPED status log entry
const newEntry = [
  '- **2026-05-14 W4e-SHIPPED** -- Emails tab + Send composer + `lead_admin_actions` first writer. 7 phases + 1 followup. W4e.1: migration `20260514_w4e1_lerl_recipient_layer_lead_contact.sql` atomic DROP+ADD on `lerl_recipient_layer_check` to add `\'lead_contact\'` (9 labels total); rollback snapshot in header comment. W4e.2: `lib/admin-homes/log-email-recipients.ts` 8-patch extension -- new `\'lead_contact\'` in `EmailRecipientLayer` union + new optional `leadContactEmail` param on `LogEmailRecipientsParams` + new "lead_contact precedes hierarchy" check in `resolveLayer()` + JSDoc updates; backwards-compatible (param optional). W4e.3: new `lib/admin-homes/log-lead-admin-action.ts` audit helper for `lead_admin_actions` (first writer to the table) -- never-throw pattern mirrors `logEmailRecipients`; free-form `actor_role` + `action_type` strings; jsonb `before_value`/`after_value` accept any. W4e.4: new POST `app/api/admin-homes/leads/[id]/send-email/route.ts` -- envelope rewrite (default `getLeadEmailRecipients` returns agent-as-TO; route harvests `resolved.*` to build customer-facing envelope: TO=lead.contact_email, CC=[], BCC=full hierarchy, Reply-To=agent.notification_email); reuses `lead.write` permission action (same gate as PATCH); dual audit via Promise.all; 502 mapping for `TenantEmailNotConfigured` + `TenantEmailFailed`; HTML wrapper with escapeHtml + first-name greeting + line-break preservation. W4e.5: `page.tsx` Promise.all expanded to 3 queries (added `lead_email_recipients_log` fetch for the lead family keyed on `WHERE lead_id IN (familyIds) AND tenant_id = anchor.tenant_id`); `LeadWorkbenchClient.tsx` Props extended with `emailLog: any[]` (tightened to `EmailLogRow[]` in W4e.7). W4e.6: new `components/admin-homes/lead-workbench/EmailsTab.tsx` (461 lines) -- grouping by `resend_message_id` (one card per logical send showing N recipients), status filter chips (all/sent/bounced/failed with live counts), worst-case status surfacing, expand-to-see recipient breakdown by direction (TO/CC/BCC) with layer labels; composer modal with subject + body textarea + (when family.length>1) lead-context selector; POST to send-email endpoint + `router.refresh()` on success; structured error display for 502 + missing-config detail. W4e.7: `LeadWorkbenchClient.tsx` 4-patch wire -- import EmailsTab + EmailLogRow, tighten Props type, destructure emailLog, add `tab === \'emails\'` branch to ternary. W4e-followup-A: missing GRANT on `lead_admin_actions` discovered during W4e.8 smoke -- W2 migration created the table via Supabase Studio SQL editor direct DDL which does NOT auto-grant (sibling `lead_email_recipients_log` was created via Table Editor UI which DOES auto-grant -- hence the asymmetry); fix migration `20260514_w4e_followup_a_lead_admin_actions_grants.sql` adds `GRANT ALL PRIVILEGES ON TABLE public.lead_admin_actions TO service_role`. SMOKE VERIFIED (S1+S2 post-fix): `lead_contact` recipient_layer correctly applied to TO row (3-row audit per send: agent BCC + platform_admin BCC + lead_contact TO); `lead_admin_actions` row writes with `action_type=\'email_sent\'`, `actor_role=\'admin\'` (legacy DB value for tenant-admin tier per `permissions.ts` L127-131; user is both tenant_admin DB role AND platform admin, so user.role wins over isPlatformAdmin path -- captures the more specific identity), `actor_agent_id` populated, tenant_id and lead_id correct, `after_value` JSONB contains `{to, subject, message_id, recipients_total, bcc_count}`. No regression on Activity tab from page.tsx Promise.all 3rd-query addition (manual verification: all 7 workbench tabs render cleanly post-W4e). **NEW finding F-W4E-PRE-FIX-AUDIT-ROW-LOST**: 2 smoke-test sends before the GRANT fix ("W4e smoke test" + "Audit debug") wrote successfully to `lead_email_recipients_log` but failed silently on `lead_admin_actions` (per the never-throw audit pattern); those audit rows are permanently lost (not recoverable retroactively) -- documented limitation, no remediation needed since the verifying "audit fix verify" send post-fix demonstrated the path works end-to-end. **NEW finding F-W4E-RESEND-ACCEPTS-LOCAL-TLD**: Resend\'s API accepts `@*.local` syntactically as a valid recipient address (no MX validation at the API layer); message delivery presumably fails async or gets dropped at the destination, but the route returns 200 and audit rows write -- useful for code-path smoke against `.local` test seed leads but means dev sends to fake TLDs do not surface delivery failures in the workbench. **NEW finding F-W4E-THREADING-ASYMMETRY**: workbench Emails tab is cumulative across all roles; recipient\'s Gmail/Outlook sees fragmented threads (each send is a separate thread because In-Reply-To / References headers are not set); Reply-To routes all replies to the assigned agent\'s personal inbox -- workbench never sees inbound. Logged as DEFERRED tracker `W-EMAIL-THREADING` for activation when customer need surfaces; recommendation locked (do Layer B directly, skip Layer A). **NEW finding F-W4E-LEADS-LIST-STATUS-REVERT**: pre-existing bug on leads LIST page (`app/admin-homes/leads/page.tsx`) -- changing status dropdown reverts after page refresh; not a W4e regression (workbench PATCH via `app/api/admin-homes/leads/[id]/route.ts` works correctly); deferred for separate investigation phase. **NEW finding F-W4E-W2-MIGRATION-DDL-GAP**: any future schema additions via Supabase Studio SQL editor direct DDL must explicitly include `GRANT ALL ... TO service_role` because the SQL editor path does NOT auto-grant (only Table Editor UI does). Add to TRACKER-WORKFLOW.md or as a separate checklist when applicable. NEXT: W4f VIP Requests tab + in-page Approve.',
].join('\n')

source = source.trimEnd() + '\n' + newEntry + '\n'
console.log('APPENDED W4e-SHIPPED status log entry')

if (hasCRLF) source = source.replace(/\n/g, '\r\n')
fs.writeFileSync(TARGET, source, 'utf8')
const finalSize = fs.statSync(TARGET).size
console.log('')
console.log('WROTE ' + TARGET + ' (' + finalSize + ' bytes)')

console.log('')
console.log('=== Verification: W4e row in updated tracker ===')
const updatedLines = fs.readFileSync(TARGET, 'utf8').split(/\r?\n/)
for (const line of updatedLines) {
  if (line.includes('| W4e |')) console.log('  ' + line.slice(0, 200) + (line.length > 200 ? '...' : ''))
}

console.log('')
console.log('=== Verification: last status entry tag ===')
const lastFiveLines = updatedLines.slice(-5)
for (const l of lastFiveLines) {
  if (l.startsWith('- **')) console.log('  ' + l.slice(0, 150) + '...')
}

console.log('')
console.log('Backup: ' + backupPath)