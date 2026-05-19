// scripts/patch-w-leads-workbench-w6c-dnc-fix.js
// W6c-DNC recovery: complete the patch run that aborted on the back-arrow anchor.
// Patches only the 2 remaining files; verifies the prior 2 are already patched.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function detectLE(content) { return content.includes('\r\n') ? '\r\n' : '\n'; }
function withLE(text, le) { return text.replace(/\r\n/g, '\n').replace(/\n/g, le); }

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyAnchors(filePath, anchors) {
  const absPath = path.join(ROOT, filePath);
  if (!fs.existsSync(absPath)) throw new Error('FILE NOT FOUND: ' + filePath);
  let content = fs.readFileSync(absPath, 'utf8');
  const le = detectLE(content);

  for (let i = 0; i < anchors.length; i++) {
    const oldN = withLE(anchors[i].old, le);
    const n = countOccurrences(content, oldN);
    if (n !== 1) throw new Error('ANCHOR ' + (i + 1) + '/' + anchors.length + ' on ' + filePath + ' matched ' + n + ' (expected 1). First 80: ' + JSON.stringify(oldN.slice(0, 80)));
  }

  const stamp = nowStamp();
  const backupPath = absPath + '.backup_' + stamp;
  fs.copyFileSync(absPath, backupPath);

  for (let i = 0; i < anchors.length; i++) {
    content = content.replace(withLE(anchors[i].old, le), withLE(anchors[i].new, le));
  }
  fs.writeFileSync(absPath, content, 'utf8');
  console.log('  PATCHED ' + filePath + ' (' + anchors.length + ' anchors, backup: ' + path.basename(backupPath) + ')');
}

function assertAlreadyPatched(filePath, marker, label) {
  const absPath = path.join(ROOT, filePath);
  const content = fs.readFileSync(absPath, 'utf8');
  if (!content.includes(marker)) {
    throw new Error('EXPECTED PRIOR PATCH but marker missing in ' + filePath + ' (looking for: ' + label + ')');
  }
  console.log('  OK prior patch confirmed in ' + filePath + ' (' + label + ')');
}

console.log('[0/2] Verify prior patches landed ...');
assertAlreadyPatched('app/admin-homes/leads/page.tsx',
  'initialShowTerminal = searchParams?.showTerminal',
  'initialShowTerminal computation');
assertAlreadyPatched('components/admin-homes/AdminHomesLeadsClient.tsx',
  'TERMINAL_STATUSES',
  'TERMINAL_STATUSES constant');

console.log('[1/2] Patching app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx ...');
applyAnchors('app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx', [
  {
    // Anchor on the unique <header> tag (single occurrence in the file, the lead header).
    // The back-arrow line directly above is bypassed entirely - no mojibake concerns.
    old:
'      <header className="border-b border-gray-200 pb-4 mb-6">\n',
    new:
'      {(anchorLead as any)?.status === \'do_not_contact\' && (\n' +
'        <div role="alert" className="mb-4 rounded border-2 border-red-600 bg-red-50 p-4">\n' +
'          <div className="text-red-900 font-bold text-sm uppercase tracking-wider">\n' +
'            Do Not Contact \u2014 Outbound Communication Blocked\n' +
'          </div>\n' +
'          <div className="text-red-800 text-sm mt-2">\n' +
'            This lead has requested no further contact. Outbound email is blocked server-side. Phone, SMS, and physical mail outreach are also prohibited under CASL / TCPA. Document any inadvertent contact in the Notes tab immediately.\n' +
'          </div>\n' +
'        </div>\n' +
'      )}\n' +
'\n' +
'      <header className="border-b border-gray-200 pb-4 mb-6">\n',
  },
]);

console.log('[2/2] Patching app/api/admin-homes/leads/[id]/send-email/route.ts ...');
applyAnchors('app/api/admin-homes/leads/[id]/send-email/route.ts', [
  {
    old:
'    const { data: lead } = await supabase\n' +
'      .from(\'leads\')\n' +
'      .select(\'id, tenant_id, agent_id, contact_email, contact_name\')\n' +
'      .eq(\'id\', params.id)\n' +
'      .maybeSingle()\n' +
'\n' +
'    if (!lead) {\n' +
'      return NextResponse.json({ error: \'Lead not found\' }, { status: 404 })\n' +
'    }\n' +
'    if (!lead.contact_email) {\n' +
'      return NextResponse.json({ error: \'Lead has no contact email\' }, { status: 400 })\n' +
'    }\n' +
'\n' +
'    const decision = can(user.permissions, \'lead.write\', {\n' +
'      kind: \'lead\',\n' +
'      leadId: lead.id,\n' +
'      tenantId: lead.tenant_id,\n' +
'      agentId: lead.agent_id,\n' +
'    })\n' +
'    if (!decision.ok) {\n' +
'      return NextResponse.json({ error: decision.reason }, { status: decision.status })\n' +
'    }\n',
    new:
'    const { data: lead } = await supabase\n' +
'      .from(\'leads\')\n' +
'      .select(\'id, tenant_id, agent_id, status, contact_email, contact_name\')\n' +
'      .eq(\'id\', params.id)\n' +
'      .maybeSingle()\n' +
'\n' +
'    if (!lead) {\n' +
'      return NextResponse.json({ error: \'Lead not found\' }, { status: 404 })\n' +
'    }\n' +
'    if (!lead.contact_email) {\n' +
'      return NextResponse.json({ error: \'Lead has no contact email\' }, { status: 400 })\n' +
'    }\n' +
'\n' +
'    const decision = can(user.permissions, \'lead.write\', {\n' +
'      kind: \'lead\',\n' +
'      leadId: lead.id,\n' +
'      tenantId: lead.tenant_id,\n' +
'      agentId: lead.agent_id,\n' +
'    })\n' +
'    if (!decision.ok) {\n' +
'      return NextResponse.json({ error: decision.reason }, { status: decision.status })\n' +
'    }\n' +
'\n' +
'    // W6c-DNC: legal-compliance block. When a lead\'s status is do_not_contact,\n' +
'    // outbound customer-facing email is denied at the server with 409. The\n' +
'    // attempted send is audit-logged (action_type=email_blocked_dnc) so legal\n' +
'    // can produce a trail of suppressed contact attempts under CASL / TCPA.\n' +
'    // Audit write is best-effort (never-throw via logLeadAdminAction); the 409\n' +
'    // response is the legal enforcement, the audit is the evidentiary trail.\n' +
'    if (lead.status === \'do_not_contact\') {\n' +
'      const actorRoleForBlock = user.role || (user.isPlatformAdmin ? \'platform_admin\' : \'admin\')\n' +
'      await logLeadAdminAction({\n' +
'        supabase,\n' +
'        tenantId: lead.tenant_id,\n' +
'        leadId: lead.id,\n' +
'        actorAgentId: user.agentId || null,\n' +
'        actorRole: actorRoleForBlock,\n' +
'        actionType: \'email_blocked_dnc\',\n' +
'        targetField: null,\n' +
'        beforeValue: null,\n' +
'        afterValue: {\n' +
'          attempted_to: lead.contact_email,\n' +
'          reason: \'lead status is do_not_contact\',\n' +
'        },\n' +
'        notes: \'outbound email blocked by DNC status\',\n' +
'      })\n' +
'      return NextResponse.json({\n' +
'        error: \'Outbound email blocked: lead is marked do_not_contact\',\n' +
'        code: \'DNC_BLOCK\',\n' +
'      }, { status: 409 })\n' +
'    }\n',
  },
]);

console.log('');
console.log('Recovery patch complete. Resume pipeline from TSC + smoke.');