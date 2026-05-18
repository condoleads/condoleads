// scripts/patch-w-leads-workbench-w6b-reassign.js
// W-LEADS-WORKBENCH W6b (2026-05-18) -- reassign-agent UI + server fetch wire-up.
//
// Modifies 2 files via exact-string anchors with per-file LE detection and
// timestamped backups:
//   1. app/admin-homes/leads/[id]/page.tsx       (1 anchor: insert reassignCandidates fetch + prop pass)
//   2. app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx  (5 anchors)
//
// Idempotent: detects an already-applied marker and exits 0.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function detectLE(content) {
  const crlf = (content.match(/\r\n/g) || []).length;
  const lfOnly = (content.match(/(?<!\r)\n/g) || []).length;
  if (crlf > 0 && lfOnly === 0) return '\r\n';
  if (lfOnly > 0 && crlf === 0) return '\n';
  if (crlf === 0 && lfOnly === 0) return '\n';
  // Mixed -- pick majority and warn
  console.warn('  [WARN] mixed line endings detected; using majority');
  return crlf >= lfOnly ? '\r\n' : '\n';
}

function withLE(s, LE) {
  if (LE === '\r\n') return s.replace(/\r?\n/g, '\r\n');
  return s.replace(/\r\n/g, '\n');
}

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function readFileBytes(absPath) {
  const buf = fs.readFileSync(absPath);
  return buf.toString('utf8');
}

function writeFileBytes(absPath, content) {
  fs.writeFileSync(absPath, content, { encoding: 'utf8' });
}

function applyAnchorEdit(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    throw new Error(`Anchor not found: ${label}`);
  }
  if (count > 1) {
    throw new Error(`Anchor matches ${count} times (must be unique): ${label}`);
  }
  return content.replace(oldStr, newStr);
}

const STAMP = ts();
console.log(`[W6b patch] timestamp: ${STAMP}`);

// ---------------------------------------------------------------------------
// FILE 1: app/admin-homes/leads/[id]/page.tsx
// ---------------------------------------------------------------------------
const pageRel = 'app/admin-homes/leads/[id]/page.tsx';
const pageAbs = path.join(ROOT, pageRel);
let pageContent = readFileBytes(pageAbs);
const pageLE = detectLE(pageContent);
console.log(`[W6b patch] ${pageRel} LE=${pageLE === '\r\n' ? 'CRLF' : 'LF'}`);

// Idempotency check
if (pageContent.includes('reassignCandidates')) {
  console.log(`[W6b patch] ${pageRel} already contains 'reassignCandidates' -- skipping`);
} else {
  // Backup
  fs.copyFileSync(pageAbs, `${pageAbs}.backup_${STAMP}`);

  // Anchor: insert reassignCandidates fetch + prop pass.
  // We anchor on the existing `return (` followed by `<LeadWorkbenchClient` block.
  // We inject (a) the fetch block before the return, (b) the prop line in the
  // <LeadWorkbenchClient ... /> invocation. Two sub-edits via two unique anchors.

  // Sub-edit 1a: insert reassignCandidates fetch before `return (`
  const pa1Old = withLE(
    `  return (\n` +
    `    <LeadWorkbenchClient\n`,
    pageLE
  );
  const pa1New = withLE(
    `  // W6b: server-side fetch of reassign candidates, role-scoped.\n` +
    `  let reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }> = []\n` +
    `  if (user.role !== 'agent' && (anchorLead as any).tenant_id) {\n` +
    `    let q = supabase\n` +
    `      .from('agents')\n` +
    `      .select('id, full_name, role')\n` +
    `      .eq('tenant_id', (anchorLead as any).tenant_id)\n` +
    `      .eq('is_active', true)\n` +
    `      .order('full_name', { ascending: true })\n` +
    `    if (user.role === 'manager' && user.agentId) {\n` +
    `      const allowed = Array.from(new Set([user.agentId, ...(user.managedAgentIds || [])]))\n` +
    `      q = q.in('id', allowed)\n` +
    `    }\n` +
    `    const { data: cands } = await q\n` +
    `    reassignCandidates = (cands as any[]) || []\n` +
    `  }\n` +
    `\n` +
    `  return (\n` +
    `    <LeadWorkbenchClient\n`,
    pageLE
  );
  pageContent = applyAnchorEdit(pageContent, pa1Old, pa1New, 'page.tsx insert reassignCandidates fetch');

  // Sub-edit 1b: add reassignCandidates prop to <LeadWorkbenchClient> invocation
  const pa2Old = withLE(
    `      vipRequests={vipRequests}\n` +
    `      notes={notes}\n` +
    `    />\n`,
    pageLE
  );
  const pa2New = withLE(
    `      vipRequests={vipRequests}\n` +
    `      notes={notes}\n` +
    `      reassignCandidates={reassignCandidates}\n` +
    `    />\n`,
    pageLE
  );
  pageContent = applyAnchorEdit(pageContent, pa2Old, pa2New, 'page.tsx add reassignCandidates prop');

  writeFileBytes(pageAbs, pageContent);
  console.log(`[W6b patch] ${pageRel} patched (2 anchors)`);
}

// ---------------------------------------------------------------------------
// FILE 2: app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx
// ---------------------------------------------------------------------------
const clientRel = 'app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx';
const clientAbs = path.join(ROOT, clientRel);
let clientContent = readFileBytes(clientAbs);
const clientLE = detectLE(clientContent);
console.log(`[W6b patch] ${clientRel} LE=${clientLE === '\r\n' ? 'CRLF' : 'LF'}`);

// Idempotency
if (clientContent.includes('ReassignAgentControl')) {
  console.log(`[W6b patch] ${clientRel} already contains 'ReassignAgentControl' -- skipping`);
} else {
  // Backup
  fs.copyFileSync(clientAbs, `${clientAbs}.backup_${STAMP}`);

  // Anchor 1: add useRouter import after `import { useState } from 'react'`
  const ca1Old = withLE(`import { useState } from 'react'\n`, clientLE);
  const ca1New = withLE(
    `import { useState } from 'react'\n` +
    `import { useRouter } from 'next/navigation'\n`,
    clientLE
  );
  clientContent = applyAnchorEdit(clientContent, ca1Old, ca1New, 'client useRouter import');

  // Anchor 2: extend Props interface (after notes: NoteRow[] line)
  const ca2Old = withLE(`  notes: NoteRow[]\n}\n`, clientLE);
  const ca2New = withLE(
    `  notes: NoteRow[]\n` +
    `  reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }>\n` +
    `}\n`,
    clientLE
  );
  clientContent = applyAnchorEdit(clientContent, ca2Old, ca2New, 'client Props extension');

  // Anchor 3: extend OverviewTab call site at line ~129
  const ca3Old = withLE(
    `{tab === 'overview' ? (\n` +
    `        <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />`,
    clientLE
  );
  const ca3New = withLE(
    `{tab === 'overview' ? (\n` +
    `        <OverviewTab\n` +
    `          anchorLead={anchorLead}\n` +
    `          leadFamily={leadFamily}\n` +
    `          currentRole={currentRole}\n` +
    `          reassignCandidates={reassignCandidates}\n` +
    `          anchorLeadId={anchorLead.id}\n` +
    `        />`,
    clientLE
  );
  clientContent = applyAnchorEdit(clientContent, ca3Old, ca3New, 'client OverviewTab invocation');

  // Anchor 4: extend OverviewTab signature to accept new props
  const ca4Old = withLE(
    `function OverviewTab({ anchorLead, leadFamily }: { anchorLead: any; leadFamily: any[] }) {`,
    clientLE
  );
  const ca4New = withLE(
    `function OverviewTab({\n` +
    `  anchorLead,\n` +
    `  leadFamily,\n` +
    `  currentRole,\n` +
    `  reassignCandidates,\n` +
    `  anchorLeadId,\n` +
    `}: {\n` +
    `  anchorLead: any\n` +
    `  leadFamily: any[]\n` +
    `  currentRole: string\n` +
    `  reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }>\n` +
    `  anchorLeadId: string\n` +
    `}) {`,
    clientLE
  );
  clientContent = applyAnchorEdit(clientContent, ca4Old, ca4New, 'client OverviewTab signature');

  // Anchor 5: inject ReassignAgentControl after the Hierarchy <h2>
  // We anchor on the closing destructure of Props which is unique in file.
  // Strategy: insert the entire ReassignAgentControl function definition
  // after the existing destructure. Then have the OverviewTab Hierarchy
  // section render it conditionally. Two parts:
  //   (5a) the new function component (added after Props destructure)
  //   (5b) the conditional render inside the Hierarchy section

  // (5b first -- inject inside Hierarchy <h2> block. Anchor on the Hierarchy h2)
  const ca5bOld = withLE(
    `        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hierarchy</h2>`,
    clientLE
  );
  const ca5bNew = withLE(
    `        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hierarchy</h2>\n` +
    `        {currentRole !== 'agent' && (\n` +
    `          <ReassignAgentControl\n` +
    `            anchorLeadId={anchorLeadId}\n` +
    `            currentAgentId={(anchorLead as any).agent_id || null}\n` +
    `            currentAgentName={(anchorLead as any).agents?.full_name || null}\n` +
    `            candidates={reassignCandidates}\n` +
    `          />\n` +
    `        )}`,
    clientLE
  );
  clientContent = applyAnchorEdit(clientContent, ca5bOld, ca5bNew, 'client Hierarchy section render');

  // (5a -- inject the ReassignAgentControl function at end of file).
  // Anchor on last closing brace of OverviewTab's last } -- but safer to append.
  // We append after the entire file -- robust to formatting changes.
  // Strip trailing newline if any, append component, restore newline.
  const trailingMatch = clientContent.match(/(\r?\n)+$/);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const stripped = trailing ? clientContent.slice(0, -trailing.length) : clientContent;

  const reassignComponent = withLE(
    `\n` +
    `function ReassignAgentControl({\n` +
    `  anchorLeadId,\n` +
    `  currentAgentId,\n` +
    `  currentAgentName,\n` +
    `  candidates,\n` +
    `}: {\n` +
    `  anchorLeadId: string\n` +
    `  currentAgentId: string | null\n` +
    `  currentAgentName: string | null\n` +
    `  candidates: Array<{ id: string; full_name: string | null; role: string | null }>\n` +
    `}) {\n` +
    `  const router = useRouter()\n` +
    `  const [selectedId, setSelectedId] = useState<string>('')\n` +
    `  const [submitting, setSubmitting] = useState(false)\n` +
    `  const [error, setError] = useState<string | null>(null)\n` +
    `\n` +
    `  const eligible = candidates.filter((c) => c.id !== currentAgentId)\n` +
    `\n` +
    `  if (eligible.length === 0) {\n` +
    `    return (\n` +
    `      <div className="mt-3 mb-3 text-xs text-gray-400">\n` +
    `        No other agents available to reassign to.\n` +
    `      </div>\n` +
    `    )\n` +
    `  }\n` +
    `\n` +
    `  const handleSubmit = async () => {\n` +
    `    if (!selectedId) return\n` +
    `    setSubmitting(true)\n` +
    `    setError(null)\n` +
    `    try {\n` +
    `      const res = await fetch(` +
    "`/api/admin-homes/leads/${anchorLeadId}/reassign-agent`" +
    `, {\n` +
    `        method: 'POST',\n` +
    `        headers: { 'Content-Type': 'application/json' },\n` +
    `        body: JSON.stringify({ newAgentId: selectedId }),\n` +
    `      })\n` +
    `      const json = await res.json().catch(() => ({}))\n` +
    `      if (!res.ok) {\n` +
    `        setError(json?.error || ` + "`Reassign failed (status ${res.status})`" + `)\n` +
    `        setSubmitting(false)\n` +
    `        return\n` +
    `      }\n` +
    `      setSelectedId('')\n` +
    `      router.refresh()\n` +
    `    } catch (e: any) {\n` +
    `      setError(e?.message || 'Network error')\n` +
    `    } finally {\n` +
    `      setSubmitting(false)\n` +
    `    }\n` +
    `  }\n` +
    `\n` +
    `  return (\n` +
    `    <div className="mt-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded">\n` +
    `      <div className="text-xs font-semibold text-blue-900 mb-2">Reassign agent</div>\n` +
    `      <div className="text-xs text-gray-600 mb-2">\n` +
    `        Currently assigned: <span className="font-medium">{currentAgentName || '(unassigned)'}</span>\n` +
    `      </div>\n` +
    `      <div className="flex flex-wrap items-center gap-2">\n` +
    `        <select\n` +
    `          value={selectedId}\n` +
    `          onChange={(e) => setSelectedId(e.target.value)}\n` +
    `          disabled={submitting}\n` +
    `          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"\n` +
    `        >\n` +
    `          <option value="">Select new agent...</option>\n` +
    `          {eligible.map((c) => (\n` +
    `            <option key={c.id} value={c.id}>\n` +
    `              {c.full_name || '(unnamed)'}{c.role ? ' (' + c.role + ')' : ''}\n` +
    `            </option>\n` +
    `          ))}\n` +
    `        </select>\n` +
    `        <button\n` +
    `          type="button"\n` +
    `          onClick={handleSubmit}\n` +
    `          disabled={submitting || !selectedId}\n` +
    `          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"\n` +
    `        >\n` +
    `          {submitting ? 'Reassigning...' : 'Reassign'}\n` +
    `        </button>\n` +
    `      </div>\n` +
    `      {error && (\n` +
    `        <div className="mt-2 text-xs text-red-600">{error}</div>\n` +
    `      )}\n` +
    `    </div>\n` +
    `  )\n` +
    `}\n`,
    clientLE
  );

  clientContent = stripped + reassignComponent + trailing;

  writeFileBytes(clientAbs, clientContent);
  console.log(`[W6b patch] ${clientRel} patched (5 anchors + component appended)`);
}

console.log('[W6b patch] DONE');