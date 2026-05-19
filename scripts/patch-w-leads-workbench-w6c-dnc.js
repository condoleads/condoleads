// scripts/patch-w-leads-workbench-w6c-dnc.js
// W6c + DNC: anchored patches across 4 TS files.
//
// Files patched:
//   1. app/admin-homes/leads/page.tsx                                 (searchParams + prop pass)
//   2. components/admin-homes/AdminHomesLeadsClient.tsx               (TERMINAL set, filter, dropdowns, statusColor, toggle button)
//   3. app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx             (DNC warning banner)
//   4. app/api/admin-homes/leads/[id]/send-email/route.ts             (status in SELECT + DNC block + audit)
//
// Discipline:
//   - Per-file timestamped backup (.backup_YYYYMMDD_HHMMSS) before any edit
//   - Per-file line-ending detection (CRLF/LF) preserved via withLE
//   - Each anchor must match exactly once (count enforced)
//   - On any anchor miss, the script aborts WITHOUT writing - leaves the file untouched
//   - UTF-8 read/write via [System.IO.File] equivalent (Node's fs.readFileSync('utf8'))

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---------- helpers ----------

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function detectLE(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function withLE(text, le) {
  // Normalize all line endings in `text` (which we author as \n) to `le`.
  return text.replace(/\r\n/g, '\n').replace(/\n/g, le);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function applyAnchors(filePath, anchors) {
  const absPath = path.join(ROOT, filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error('FILE NOT FOUND: ' + filePath);
  }
  let content = fs.readFileSync(absPath, 'utf8');
  const le = detectLE(content);

  // Pre-validate every anchor BEFORE any mutation. Bail with no writes on any miss.
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const oldNormalized = withLE(a.old, le);
    const occurrences = countOccurrences(content, oldNormalized);
    if (occurrences !== 1) {
      throw new Error(
        'ANCHOR ' + (i + 1) + '/' + anchors.length + ' on ' + filePath +
        ' matched ' + occurrences + ' times (expected exactly 1). ' +
        'First 80 chars of anchor: ' + JSON.stringify(oldNormalized.slice(0, 80))
      );
    }
  }

  // Backup once we know all anchors are valid.
  const stamp = nowStamp();
  const backupPath = absPath + '.backup_' + stamp;
  fs.copyFileSync(absPath, backupPath);

  // Apply each anchor in order.
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const oldNormalized = withLE(a.old, le);
    const newNormalized = withLE(a.new, le);
    content = content.replace(oldNormalized, newNormalized);
  }

  fs.writeFileSync(absPath, content, 'utf8');
  console.log('  PATCHED ' + filePath + ' (' + anchors.length + ' anchors, backup: ' + path.basename(backupPath) + ')');
}

function writeNewFile(filePath, content) {
  const absPath = path.join(ROOT, filePath);
  if (fs.existsSync(absPath)) {
    throw new Error('REFUSING TO OVERWRITE EXISTING FILE: ' + filePath + ' (use patch flow instead)');
  }
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
  console.log('  CREATED ' + filePath + ' (' + content.length + ' bytes)');
}

// ---------- patches ----------

console.log('[1/4] Patching app/admin-homes/leads/page.tsx ...');
applyAnchors('app/admin-homes/leads/page.tsx', [
  {
    // Anchor 1: extend searchParams type + add initialShowTerminal
    old:
'export default async function AdminHomesLeadsPage({ searchParams }: { searchParams: { expanded?: string } }) {\n' +
'  const initialExpanded = searchParams?.expanded === \'1\'\n',
    new:
'export default async function AdminHomesLeadsPage({ searchParams }: { searchParams: { expanded?: string; showTerminal?: string } }) {\n' +
'  const initialExpanded = searchParams?.expanded === \'1\'\n' +
'  // W6c: default-hide of terminal statuses (closed/won/lost/archived/do_not_contact) is opt-out via ?showTerminal=1.\n' +
'  const initialShowTerminal = searchParams?.showTerminal === \'1\'\n',
  },
  {
    // Anchor 2: empty-state early-return prop pass (6-space indent)
    old:
'      <AdminHomesLeadsClient\n' +
'        initialLeads={[]}\n' +
'        initialActivities={{}}\n' +
'        agents={[]}\n' +
'        currentRole={adminUser?.role || \'admin\'}\n' +
'        currentAgentId={adminUser?.agentId || null}\n' +
'        initialExpanded={initialExpanded}\n' +
'      />\n',
    new:
'      <AdminHomesLeadsClient\n' +
'        initialLeads={[]}\n' +
'        initialActivities={{}}\n' +
'        agents={[]}\n' +
'        currentRole={adminUser?.role || \'admin\'}\n' +
'        currentAgentId={adminUser?.agentId || null}\n' +
'        initialExpanded={initialExpanded}\n' +
'        initialShowTerminal={initialShowTerminal}\n' +
'      />\n',
  },
  {
    // Anchor 3: final return prop pass (4-space indent)
    old:
'    <AdminHomesLeadsClient\n' +
'      initialLeads={leads || []}\n' +
'      initialActivities={activitiesByLeadId}\n' +
'      agents={agents || []}\n' +
'      currentRole={adminUser?.role || \'admin\'}\n' +
'      currentAgentId={adminUser?.agentId || null}\n' +
'      initialExpanded={initialExpanded}\n' +
'    />\n',
    new:
'    <AdminHomesLeadsClient\n' +
'      initialLeads={leads || []}\n' +
'      initialActivities={activitiesByLeadId}\n' +
'      agents={agents || []}\n' +
'      currentRole={adminUser?.role || \'admin\'}\n' +
'      currentAgentId={adminUser?.agentId || null}\n' +
'      initialExpanded={initialExpanded}\n' +
'      initialShowTerminal={initialShowTerminal}\n' +
'    />\n',
  },
]);

console.log('[2/4] Patching components/admin-homes/AdminHomesLeadsClient.tsx ...');
applyAnchors('components/admin-homes/AdminHomesLeadsClient.tsx', [
  {
    // Anchor A: insert TERMINAL_STATUSES constant immediately before the default export
    old:
'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId, initialExpanded }: Props) {\n',
    new:
'// W6c: statuses hidden by default in the list view. closed/won/lost/archived are lifecycle-terminal.\n' +
'// do_not_contact is a legal-compliance flag (CASL/TCPA); outbound email is ALSO blocked server-side\n' +
'// in app/api/admin-homes/leads/[id]/send-email/route.ts. The visual hide here is UX defense in depth.\n' +
'const TERMINAL_STATUSES: ReadonlySet<string> = new Set([\'closed\', \'won\', \'lost\', \'archived\', \'do_not_contact\'])\n' +
'\n' +
'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId, initialExpanded, initialShowTerminal }: Props) {\n',
  },
  {
    // Anchor B: extend Props interface
    old:
'interface Props {\n' +
'  initialLeads: Lead[]\n' +
'  initialActivities: Record<string, any[]>\n' +
'  agents: Agent[]\n' +
'  currentRole: \'admin\' | \'manager\' | \'agent\'\n' +
'  currentAgentId: string | null\n' +
'  initialExpanded: boolean\n' +
'}\n',
    new:
'interface Props {\n' +
'  initialLeads: Lead[]\n' +
'  initialActivities: Record<string, any[]>\n' +
'  agents: Agent[]\n' +
'  currentRole: \'admin\' | \'manager\' | \'agent\'\n' +
'  currentAgentId: string | null\n' +
'  initialExpanded: boolean\n' +
'  initialShowTerminal: boolean\n' +
'}\n',
  },
  {
    // Anchor C: add showTerminal state right after expanded state
    old:
'  const [expanded, setExpanded] = useState<boolean>(initialExpanded)\n' +
'  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())\n' +
'  const router = useRouter()\n',
    new:
'  const [expanded, setExpanded] = useState<boolean>(initialExpanded)\n' +
'  const [showTerminal, setShowTerminal] = useState<boolean>(initialShowTerminal)\n' +
'  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())\n' +
'  const router = useRouter()\n',
  },
  {
    // Anchor D: insert toggleShowTerminal right after toggleExpanded
    old:
'  const toggleExpanded = () => {\n' +
'    const next = !expanded\n' +
'    setExpanded(next)\n' +
'    if (typeof window !== \'undefined\') {\n' +
'      const params = new URLSearchParams(window.location.search)\n' +
'      if (next) params.set(\'expanded\', \'1\')\n' +
'      else params.delete(\'expanded\')\n' +
'      const query = params.toString()\n' +
'      router.replace(`/admin-homes/leads${query ? \'?\' + query : \'\'}`, { scroll: false })\n' +
'    }\n' +
'  }\n',
    new:
'  const toggleExpanded = () => {\n' +
'    const next = !expanded\n' +
'    setExpanded(next)\n' +
'    if (typeof window !== \'undefined\') {\n' +
'      const params = new URLSearchParams(window.location.search)\n' +
'      if (next) params.set(\'expanded\', \'1\')\n' +
'      else params.delete(\'expanded\')\n' +
'      const query = params.toString()\n' +
'      router.replace(`/admin-homes/leads${query ? \'?\' + query : \'\'}`, { scroll: false })\n' +
'    }\n' +
'  }\n' +
'\n' +
'  const toggleShowTerminal = () => {\n' +
'    const next = !showTerminal\n' +
'    setShowTerminal(next)\n' +
'    if (typeof window !== \'undefined\') {\n' +
'      const params = new URLSearchParams(window.location.search)\n' +
'      if (next) params.set(\'showTerminal\', \'1\')\n' +
'      else params.delete(\'showTerminal\')\n' +
'      const query = params.toString()\n' +
'      router.replace(`/admin-homes/leads${query ? \'?\' + query : \'\'}`, { scroll: false })\n' +
'    }\n' +
'  }\n',
  },
  {
    // Anchor E: filter logic - replace single-line filterStatus check with if/else default-hide
    old:
'    if (filterAgent !== \'all\') f = f.filter(l => l.agent_id === filterAgent)\n' +
'    if (filterStatus !== \'all\') f = f.filter(l => l.status === filterStatus)\n',
    new:
'    if (filterAgent !== \'all\') f = f.filter(l => l.agent_id === filterAgent)\n' +
'    // W6c: when no explicit status filter, default-hide terminal statuses (showTerminal=true opts out).\n' +
'    if (filterStatus !== \'all\') {\n' +
'      f = f.filter(l => l.status === filterStatus)\n' +
'    } else if (!showTerminal) {\n' +
'      f = f.filter(l => !TERMINAL_STATUSES.has(l.status))\n' +
'    }\n',
  },
  {
    // Anchor F: extend useMemo deps with showTerminal
    old:
'  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterTemperature, filterIntent, filterSource, sortBy, sortOrder])\n',
    new:
'  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterTemperature, filterIntent, filterSource, sortBy, sortOrder, showTerminal])\n',
  },
  {
    // Anchor G: extend statusColor map from 4 to 9 entries
    old:
'  const statusColor = (s: string) => ({\n' +
'    new: \'bg-blue-100 text-blue-800\',\n' +
'    contacted: \'bg-yellow-100 text-yellow-800\',\n' +
'    qualified: \'bg-green-100 text-green-800\',\n' +
'    closed: \'bg-gray-100 text-gray-800\',\n' +
'  }[s] || \'bg-gray-100 text-gray-800\')\n',
    new:
'  const statusColor = (s: string) => ({\n' +
'    new: \'bg-blue-100 text-blue-800\',\n' +
'    contacted: \'bg-yellow-100 text-yellow-800\',\n' +
'    qualified: \'bg-green-100 text-green-800\',\n' +
'    meeting_scheduled: \'bg-purple-100 text-purple-800\',\n' +
'    closed: \'bg-gray-100 text-gray-800\',\n' +
'    won: \'bg-emerald-100 text-emerald-800\',\n' +
'    lost: \'bg-rose-100 text-rose-800\',\n' +
'    archived: \'bg-slate-100 text-slate-600\',\n' +
'    do_not_contact: \'bg-red-600 text-white\',\n' +
'  }[s] || \'bg-gray-100 text-gray-800\')\n',
  },
  {
    // Anchor H: extend status filter dropdown from 4 to 9 options
    old:
'            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Status</label>\n' +
'            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">\n' +
'              <option value="all">All</option>\n' +
'              <option value="new">New</option>\n' +
'              <option value="contacted">Contacted</option>\n' +
'              <option value="qualified">Qualified</option>\n' +
'              <option value="closed">Closed</option>\n' +
'            </select>\n',
    new:
'            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Status</label>\n' +
'            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">\n' +
'              <option value="all">All</option>\n' +
'              <option value="new">New</option>\n' +
'              <option value="contacted">Contacted</option>\n' +
'              <option value="qualified">Qualified</option>\n' +
'              <option value="meeting_scheduled">Meeting Scheduled</option>\n' +
'              <option value="closed">Closed</option>\n' +
'              <option value="won">Won</option>\n' +
'              <option value="lost">Lost</option>\n' +
'              <option value="archived">Archived</option>\n' +
'              <option value="do_not_contact">Do Not Contact</option>\n' +
'            </select>\n',
  },
  {
    // Anchor I: extend inline row status select from 4 to 9 options
    old:
'                      <select\n' +
'                        value={lead.status}\n' +
'                        onChange={e => updateLeadStatus(lead.id, \'status\', e.target.value)}\n' +
'                        disabled={updatingStatus === lead.id}\n' +
'                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${statusColor(lead.status)}`}\n' +
'                      >\n' +
'                        <option value="new">New</option>\n' +
'                        <option value="contacted">Contacted</option>\n' +
'                        <option value="qualified">Qualified</option>\n' +
'                        <option value="closed">Closed</option>\n' +
'                      </select>\n',
    new:
'                      <select\n' +
'                        value={lead.status}\n' +
'                        onChange={e => updateLeadStatus(lead.id, \'status\', e.target.value)}\n' +
'                        disabled={updatingStatus === lead.id}\n' +
'                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${statusColor(lead.status)}`}\n' +
'                      >\n' +
'                        <option value="new">New</option>\n' +
'                        <option value="contacted">Contacted</option>\n' +
'                        <option value="qualified">Qualified</option>\n' +
'                        <option value="meeting_scheduled">Meeting Scheduled</option>\n' +
'                        <option value="closed">Closed</option>\n' +
'                        <option value="won">Won</option>\n' +
'                        <option value="lost">Lost</option>\n' +
'                        <option value="archived">Archived</option>\n' +
'                        <option value="do_not_contact">Do Not Contact</option>\n' +
'                      </select>\n',
  },
  {
    // Anchor J: add Show/Hide terminal toggle button immediately after toggleExpanded button
    old:
'            <button onClick={toggleExpanded} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" title={expanded ? \'Collapse list by user\' : \'Show every event as its own row\'}>\n' +
'              {expanded ? \'Collapse by user\' : \'Show all events\'}\n' +
'            </button>\n',
    new:
'            <button onClick={toggleExpanded} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" title={expanded ? \'Collapse list by user\' : \'Show every event as its own row\'}>\n' +
'              {expanded ? \'Collapse by user\' : \'Show all events\'}\n' +
'            </button>\n' +
'            <button onClick={toggleShowTerminal} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" title={showTerminal ? \'Hide terminal statuses (closed/won/lost/archived/do-not-contact)\' : \'Show all statuses including closed/won/lost/archived/do-not-contact\'}>\n' +
'              {showTerminal ? \'Hide terminal\' : \'Show terminal\'}\n' +
'            </button>\n',
  },
]);

console.log('[3/4] Patching app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx ...');
applyAnchors('app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx', [
  {
    // DNC banner: insert immediately after the back-to-leads Link, before the header.
    // Anchor includes enough surrounding context to be globally unique.
    old:
'      <div className="mb-4">\n' +
'        <Link href="/admin-homes/leads" className="text-blue-600 hover:underline text-sm">\n' +
'          {\'\u00e2\u2020\'} Back to leads\n' +
'        </Link>\n' +
'      </div>\n' +
'\n' +
'      <header className="border-b border-gray-200 pb-4 mb-6">\n',
    new:
'      <div className="mb-4">\n' +
'        <Link href="/admin-homes/leads" className="text-blue-600 hover:underline text-sm">\n' +
'          {\'\u00e2\u2020\'} Back to leads\n' +
'        </Link>\n' +
'      </div>\n' +
'\n' +
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

console.log('[4/4] Patching app/api/admin-homes/leads/[id]/send-email/route.ts ...');
applyAnchors('app/api/admin-homes/leads/[id]/send-email/route.ts', [
  {
    // Anchor: widen lead SELECT to include status, then insert DNC block after the can() gate.
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
console.log('All 4 files patched successfully.');
console.log('Next steps:');
console.log('  1. node scripts/deploy-w6c-dnc-migration.js     # applies SQL migration with rollback snapshot');
console.log('  2. npx tsc --noEmit                              # verify TS clean');
console.log('  3. node scripts/run-w6c-dnc-smoke.js             # transactional schema-level smoke');
console.log('  4. npm run dev + manual UI smoke (see plan)');
console.log('  5. git add ... ; git commit -F <tempfile> ; git push');