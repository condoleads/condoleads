// scripts/patch-w-leads-workbench-w6b-followup-notify.js
// W-LEADS-WORKBENCH W6b-followup (2026-05-18)
//
// Adds reassign-notification email to app/api/admin-homes/leads/[id]/reassign-agent/route.ts:
//   - On successful reassign, send a "New lead assigned" email to newAgent.notification_email||email
//   - Audit via logEmailRecipients (template_key='lead_reassigned_notification', layer='agent')
//   - Second audit row in lead_admin_actions (action_type='reassign_notification_sent')
//   - Never-throw: email failure does not roll back reassign or change response
//
// 4 anchors:
//   A1: extend import block (add sendTenantEmail/logEmailRecipients/getTenantContext)
//   A2: widen newAgent SELECT to include email + notification_email
//   A3: extend lead SELECT to include source + source_url + intent + geo_name + contact_email + contact_name
//       (already includes contact_email/contact_name; we add source/source_url/intent/geo_name)
//   A4: insert notification block AFTER logLeadAdminAction call, BEFORE return

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REL = 'app/api/admin-homes/leads/[id]/reassign-agent/route.ts';
const ABS = path.join(ROOT, REL);

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate()), '_', pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join('');
}

function applyEdit(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error('Anchor not found: ' + label);
  if (count > 1) throw new Error('Anchor matches ' + count + ' times: ' + label);
  return content.replace(oldStr, newStr);
}

const STAMP = ts();
console.log('[W6b-followup] timestamp:', STAMP);

let c = fs.readFileSync(ABS, 'utf8');

// Idempotency
if (c.indexOf('lead_reassigned_notification') !== -1) {
  console.log('[W6b-followup] already applied -- skipping');
  process.exit(0);
}

fs.copyFileSync(ABS, ABS + '.backup_' + STAMP);
console.log('[W6b-followup] backup:', REL + '.backup_' + STAMP);

// -------------------------------------------------------------------------
// A1: extend imports
// -------------------------------------------------------------------------
const a1Old =
  "import { walkHierarchy } from '@/lib/admin-homes/hierarchy'\n" +
  "import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'\n";
const a1New =
  "import { walkHierarchy } from '@/lib/admin-homes/hierarchy'\n" +
  "import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'\n" +
  "import {\n" +
  "  sendTenantEmail,\n" +
  "  TenantEmailNotConfigured,\n" +
  "  TenantEmailFailed,\n" +
  "  type LeadEmailRecipients,\n" +
  "} from '@/lib/admin-homes/lead-email-recipients'\n" +
  "import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'\n" +
  "import { getTenantContext, buildBaseUrl } from '@/lib/utils/tenant-brand'\n";
c = applyEdit(c, a1Old, a1New, 'A1 imports');
console.log('[W6b-followup] A1 imports OK');

// -------------------------------------------------------------------------
// A2: widen newAgent SELECT to include email + notification_email
// Existing: .select('id, full_name, tenant_id, role, is_active')
// -------------------------------------------------------------------------
const a2Old = ".select('id, full_name, tenant_id, role, is_active')";
const a2New = ".select('id, full_name, tenant_id, role, is_active, email, notification_email')";
c = applyEdit(c, a2Old, a2New, 'A2 newAgent SELECT widen');
console.log('[W6b-followup] A2 newAgent SELECT OK');

// -------------------------------------------------------------------------
// A3: widen lead SELECT to include source/source_url/intent/geo_name (for email body)
// Existing: .select('id, tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id, contact_email, contact_name')
// -------------------------------------------------------------------------
const a3Old = ".select('id, tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id, contact_email, contact_name')";
const a3New = ".select('id, tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id, contact_email, contact_name, source, source_url, intent, geo_name')";
c = applyEdit(c, a3Old, a3New, 'A3 lead SELECT widen');
console.log('[W6b-followup] A3 lead SELECT OK');

// -------------------------------------------------------------------------
// A4: insert notification block AFTER the existing logLeadAdminAction call,
// BEFORE the return NextResponse.json({success:...}) line.
//
// Existing structure ends:
//       notes: oldLabel + ' -> ' + newLabel,
//     })
//
//     return NextResponse.json({
//       success: true,
//       agentId: newAgentId,
// ...
// -------------------------------------------------------------------------
const a4Old =
  "      notes: oldLabel + ' -> ' + newLabel,\n" +
  "    })\n" +
  "\n" +
  "    return NextResponse.json({\n" +
  "      success: true,\n" +
  "      agentId: newAgentId,\n";
const a4New =
  "      notes: oldLabel + ' -> ' + newLabel,\n" +
  "    })\n" +
  "\n" +
  "    // W6b-followup: notify the newly-assigned agent via email (never-throw).\n" +
  "    // Failure here does NOT roll back the reassign or change the response.\n" +
  "    const newAgentEmail = newAgent.notification_email || newAgent.email\n" +
  "    if (newAgentEmail) {\n" +
  "      try {\n" +
  "        const brandCtx = await getTenantContext(supabase, lead.tenant_id)\n" +
  "        const brandName = brandCtx?.brandName || ''\n" +
  "        const domain = brandCtx?.domain || ''\n" +
  "        const baseUrl = domain ? buildBaseUrl(domain) : ''\n" +
  "        const workbenchUrl = baseUrl ? (baseUrl + '/admin-homes/leads/' + lead.id) : '/admin-homes/leads/' + lead.id\n" +
  "        const contactLabel = lead.contact_name || lead.contact_email || lead.id\n" +
  "        const subjectPrefix = brandName ? ('[' + brandName + '] ') : ''\n" +
  "        const subject = subjectPrefix + 'New lead assigned: ' + contactLabel\n" +
  "        const html = buildReassignNotificationHtml({\n" +
  "          newAgentName: newAgent.full_name || 'there',\n" +
  "          contactName: lead.contact_name || null,\n" +
  "          contactEmail: lead.contact_email || null,\n" +
  "          source: lead.source || null,\n" +
  "          sourceUrl: lead.source_url || null,\n" +
  "          intent: lead.intent || null,\n" +
  "          geoName: lead.geo_name || null,\n" +
  "          workbenchUrl,\n" +
  "          brandName,\n" +
  "        })\n" +
  "\n" +
  "        const sendResult = await sendTenantEmail({\n" +
  "          tenantId: lead.tenant_id,\n" +
  "          to: [newAgentEmail],\n" +
  "          subject,\n" +
  "          html,\n" +
  "        })\n" +
  "\n" +
  "        const notificationEnvelope: LeadEmailRecipients = {\n" +
  "          to: [newAgentEmail],\n" +
  "          cc: [],\n" +
  "          bcc: [],\n" +
  "          resolved: {\n" +
  "            agent: newAgentEmail,\n" +
  "            manager: null,\n" +
  "            area_manager: null,\n" +
  "            tenant_admin: null,\n" +
  "            agent_delegates: [],\n" +
  "            manager_delegates: [],\n" +
  "            area_manager_delegates: [],\n" +
  "            tenant_admin_delegates: [],\n" +
  "            manager_platforms: [],\n" +
  "            admin_platforms: [],\n" +
  "          },\n" +
  "        }\n" +
  "        await Promise.all([\n" +
  "          logEmailRecipients({\n" +
  "            supabase,\n" +
  "            tenantId: lead.tenant_id,\n" +
  "            leadId: lead.id,\n" +
  "            agentId: newAgentId,\n" +
  "            recipients: notificationEnvelope,\n" +
  "            subject,\n" +
  "            templateKey: 'lead_reassigned_notification',\n" +
  "            resendMessageId: sendResult.id,\n" +
  "          }),\n" +
  "          logLeadAdminAction({\n" +
  "            supabase,\n" +
  "            tenantId: lead.tenant_id,\n" +
  "            leadId: lead.id,\n" +
  "            actorAgentId: user.agentId || null,\n" +
  "            actorRole,\n" +
  "            actionType: 'reassign_notification_sent',\n" +
  "            targetField: 'agent_id',\n" +
  "            afterValue: {\n" +
  "              new_agent_id: newAgentId,\n" +
  "              new_agent_email: newAgentEmail,\n" +
  "              message_id: sendResult.id,\n" +
  "              subject,\n" +
  "            },\n" +
  "            notes: 'Notification sent to ' + newLabel,\n" +
  "          }),\n" +
  "        ])\n" +
  "      } catch (e: any) {\n" +
  "        if (e instanceof TenantEmailNotConfigured) {\n" +
  "          console.warn('[reassign-agent] notification skipped -- tenant email not configured:', {\n" +
  "            tenantId: lead.tenant_id,\n" +
  "            leadId: lead.id,\n" +
  "            detail: e.message,\n" +
  "          })\n" +
  "        } else if (e instanceof TenantEmailFailed) {\n" +
  "          console.warn('[reassign-agent] notification send failed:', {\n" +
  "            tenantId: lead.tenant_id,\n" +
  "            leadId: lead.id,\n" +
  "            detail: e.message,\n" +
  "          })\n" +
  "        } else {\n" +
  "          console.error('[reassign-agent] unexpected notification error:', e)\n" +
  "        }\n" +
  "      }\n" +
  "    } else {\n" +
  "      console.warn('[reassign-agent] notification skipped -- new agent has no email:', { newAgentId })\n" +
  "    }\n" +
  "\n" +
  "    return NextResponse.json({\n" +
  "      success: true,\n" +
  "      agentId: newAgentId,\n";
c = applyEdit(c, a4Old, a4New, 'A4 notification block');
console.log('[W6b-followup] A4 notification block OK');

// -------------------------------------------------------------------------
// A5: append the buildReassignNotificationHtml helper function at end of file
// -------------------------------------------------------------------------
if (c.indexOf('function buildReassignNotificationHtml') !== -1) {
  throw new Error('A5 unexpected: helper already present mid-patch');
}

const trailingMatch = c.match(/\s+$/);
const trailing = trailingMatch ? trailingMatch[0] : '';
const stripped = trailing ? c.slice(0, -trailing.length) : c;

const helper =
  "\n\n" +
  "function escapeHtml(s: string): string {\n" +
  "  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;')\n" +
  "}\n" +
  "\n" +
  "function buildReassignNotificationHtml(args: {\n" +
  "  newAgentName: string\n" +
  "  contactName: string | null\n" +
  "  contactEmail: string | null\n" +
  "  source: string | null\n" +
  "  sourceUrl: string | null\n" +
  "  intent: string | null\n" +
  "  geoName: string | null\n" +
  "  workbenchUrl: string\n" +
  "  brandName: string\n" +
  "}): string {\n" +
  "  const firstName = (args.newAgentName.split(' ')[0] || args.newAgentName).trim()\n" +
  "  const contactLabel = args.contactName || args.contactEmail || '(no name)'\n" +
  "  const rows: string[] = []\n" +
  "  if (args.contactName) rows.push('<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;\">Contact</td><td style=\"padding:6px 0;\">' + escapeHtml(args.contactName) + '</td></tr>')\n" +
  "  if (args.contactEmail) rows.push('<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;\">Email</td><td style=\"padding:6px 0;\">' + escapeHtml(args.contactEmail) + '</td></tr>')\n" +
  "  if (args.intent) rows.push('<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;\">Intent</td><td style=\"padding:6px 0;\">' + escapeHtml(args.intent) + '</td></tr>')\n" +
  "  if (args.geoName) rows.push('<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;\">Area</td><td style=\"padding:6px 0;\">' + escapeHtml(args.geoName) + '</td></tr>')\n" +
  "  if (args.source) rows.push('<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;\">Source</td><td style=\"padding:6px 0;\">' + escapeHtml(args.source) + '</td></tr>')\n" +
  "  if (args.sourceUrl) rows.push('<tr><td style=\"padding:6px 12px 6px 0;color:#6b7280;\">URL</td><td style=\"padding:6px 0;word-break:break-all;\"><a href=\"' + escapeHtml(args.sourceUrl) + '\" style=\"color:#2563eb;\">' + escapeHtml(args.sourceUrl) + '</a></td></tr>')\n" +
  "  const summaryTable = rows.length > 0\n" +
  "    ? '<table style=\"font-size:14px;margin:16px 0;\">' + rows.join('') + '</table>'\n" +
  "    : ''\n" +
  "  const brandLine = args.brandName ? escapeHtml(args.brandName) : 'the platform'\n" +
  "  return [\n" +
  "    '<!DOCTYPE html>',\n" +
  "    '<html><head><meta charset=\"utf-8\"><title>New lead assigned</title></head>',\n" +
  "    '<body style=\"margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2937;\">',\n" +
  "    '<div style=\"max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;line-height:1.6;font-size:15px;\">',\n" +
  "    '<p style=\"margin:0 0 12px 0;\">Hi ' + escapeHtml(firstName) + ',</p>',\n" +
  "    '<p style=\"margin:0 0 12px 0;\">A lead has been assigned to you on ' + brandLine + ': <strong>' + escapeHtml(contactLabel) + '</strong>.</p>',\n" +
  "    summaryTable,\n" +
  "    '<p style=\"margin:24px 0 0 0;\">',\n" +
  "    '<a href=\"' + escapeHtml(args.workbenchUrl) + '\" style=\"display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;\">Open lead workbench</a>',\n" +
  "    '</p>',\n" +
  "    '<p style=\"margin:24px 0 0 0;color:#6b7280;font-size:13px;\">This is an automated notification. You are receiving it because you were assigned this lead.</p>',\n" +
  "    '</div></body></html>',\n" +
  "  ].join('')\n" +
  "}\n";

c = stripped + helper;
console.log('[W6b-followup] A5 helper appended OK');

fs.writeFileSync(ABS, c, 'utf8');
console.log('[W6b-followup] file written:', REL);
console.log('[W6b-followup] DONE');