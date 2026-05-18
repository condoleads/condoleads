// scripts/patch-w-leads-workbench-w6b-reassign-fix.js
// W-LEADS-WORKBENCH W6b FIX (2026-05-18)
//
// Fixes the failed-anchor-3 issue from the original patch script.
// Patches only LeadWorkbenchClient.tsx (page.tsx already shipped).
//
// Verified bytes from W6b-FIX-PROBE2:
//   L9   useState import (LF, no leading spaces)
//   L80  Props closing brace `}` (LF, no leading spaces)
//   L82  destructure on single line ending `}: Props) {`
//   L128 `        {tab === 'overview' ? (`  (8 spaces)
//   L129 `          <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />`  (10 spaces)
//   L256 OverviewTab signature single-line
//   L287 `        <h2 ...>Hierarchy</h2>`  (8 spaces)
//   L293 `        </dl>`  (8 spaces)
//   L294 `      </section>`  (6 spaces)
//
// File LE: LF only. No CRLF normalization needed.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REL = 'app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx';
const ABS = path.join(ROOT, REL);

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate()),
    '_', pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds()),
  ].join('');
}

function applyAnchorEdit(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error('Anchor not found: ' + label);
  if (count > 1) throw new Error('Anchor matches ' + count + ' times (must be unique): ' + label);
  return content.replace(oldStr, newStr);
}

const STAMP = ts();
console.log('[W6b-fix] timestamp:', STAMP);

let content = fs.readFileSync(ABS, 'utf8');

// Idempotency
if (content.indexOf('ReassignAgentControl') !== -1) {
  console.log('[W6b-fix] already applied (ReassignAgentControl found) -- skipping');
  process.exit(0);
}

// Backup
fs.copyFileSync(ABS, ABS + '.backup_' + STAMP);
console.log('[W6b-fix] backup written:', REL + '.backup_' + STAMP);

// -------------------------------------------------------------------------
// Anchor 1: useRouter import (L9 area)
// -------------------------------------------------------------------------
const a1Old = "import { useState } from 'react'\n";
const a1New =
  "import { useState } from 'react'\n" +
  "import { useRouter } from 'next/navigation'\n";
content = applyAnchorEdit(content, a1Old, a1New, 'A1 useRouter import');
console.log('[W6b-fix] A1 useRouter import OK');

// -------------------------------------------------------------------------
// Anchor 2: Props interface -- extend with reassignCandidates field
// L78-80:  vipRequests: VipRequestRow[]\n  notes: NoteRow[]\n}\n
// -------------------------------------------------------------------------
const a2Old =
  "  vipRequests: VipRequestRow[]\n" +
  "  notes: NoteRow[]\n" +
  "}\n";
const a2New =
  "  vipRequests: VipRequestRow[]\n" +
  "  notes: NoteRow[]\n" +
  "  reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }>\n" +
  "}\n";
content = applyAnchorEdit(content, a2Old, a2New, 'A2 Props extension');
console.log('[W6b-fix] A2 Props extension OK');

// -------------------------------------------------------------------------
// Anchor 3: Function destructure -- single line at L82
// Need to add reassignCandidates to the destructure
// L82: export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests, notes }: Props) {
// -------------------------------------------------------------------------
const a3Old =
  "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests, notes }: Props) {";
const a3New =
  "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests, notes, reassignCandidates }: Props) {";
content = applyAnchorEdit(content, a3Old, a3New, 'A3 LeadWorkbenchClient destructure');
console.log('[W6b-fix] A3 destructure OK');

// -------------------------------------------------------------------------
// Anchor 4: OverviewTab invocation -- multi-line replacement of single-line call
// L128: ........{tab === 'overview' ? (
// L129: ..........<OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />
// (8 dots = 8 spaces; 10 dots = 10 spaces)
// -------------------------------------------------------------------------
const a4Old =
  "        {tab === 'overview' ? (\n" +
  "          <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />\n";
const a4New =
  "        {tab === 'overview' ? (\n" +
  "          <OverviewTab\n" +
  "            anchorLead={anchorLead}\n" +
  "            leadFamily={leadFamily}\n" +
  "            currentRole={currentRole}\n" +
  "            reassignCandidates={reassignCandidates}\n" +
  "            anchorLeadId={anchorLead.id}\n" +
  "          />\n";
content = applyAnchorEdit(content, a4Old, a4New, 'A4 OverviewTab invocation');
console.log('[W6b-fix] A4 OverviewTab invocation OK');

// -------------------------------------------------------------------------
// Anchor 5: OverviewTab signature -- single-line replacement
// L256: function OverviewTab({ anchorLead, leadFamily }: { anchorLead: any; leadFamily: any[] }) {
// -------------------------------------------------------------------------
const a5Old =
  "function OverviewTab({ anchorLead, leadFamily }: { anchorLead: any; leadFamily: any[] }) {";
const a5New =
  "function OverviewTab({\n" +
  "  anchorLead,\n" +
  "  leadFamily,\n" +
  "  currentRole,\n" +
  "  reassignCandidates,\n" +
  "  anchorLeadId,\n" +
  "}: {\n" +
  "  anchorLead: any\n" +
  "  leadFamily: any[]\n" +
  "  currentRole: string\n" +
  "  reassignCandidates: Array<{ id: string; full_name: string | null; role: string | null }>\n" +
  "  anchorLeadId: string\n" +
  "}) {";
content = applyAnchorEdit(content, a5Old, a5New, 'A5 OverviewTab signature');
console.log('[W6b-fix] A5 OverviewTab signature OK');

// -------------------------------------------------------------------------
// Anchor 6: Inject ReassignAgentControl render inside Hierarchy section.
// Place it AFTER </dl> (L293) but BEFORE </section> (L294) -- inside Hierarchy.
// L293: ........</dl>     (8 spaces)
// L294: ......</section>  (6 spaces)
// Unique combination: </dl>\n      </section> appears for Lead Info too but
// Lead Info ends with </div></div></section> wrapping. Hierarchy ends with
// </dl></section> directly. Verify uniqueness by including a discriminator:
// the Hierarchy section's </dl> is immediately followed by </section>.
// To make this unique, anchor on the </dl> + </section> pair specifically
// in the Hierarchy block by including the line above it ("Tenant Admin").
// -------------------------------------------------------------------------
const a6Old =
  '          <Field label="Tenant Admin" value={anchorLead.tenant_admin?.full_name} />\n' +
  "        </dl>\n" +
  "      </section>\n";
const a6New =
  '          <Field label="Tenant Admin" value={anchorLead.tenant_admin?.full_name} />\n' +
  "        </dl>\n" +
  "        {currentRole !== 'agent' && (\n" +
  "          <ReassignAgentControl\n" +
  "            anchorLeadId={anchorLeadId}\n" +
  "            currentAgentId={(anchorLead as any).agent_id || null}\n" +
  "            currentAgentName={(anchorLead as any).agents?.full_name || null}\n" +
  "            candidates={reassignCandidates}\n" +
  "          />\n" +
  "        )}\n" +
  "      </section>\n";
content = applyAnchorEdit(content, a6Old, a6New, 'A6 Hierarchy section ReassignAgentControl render');
console.log('[W6b-fix] A6 Hierarchy render OK');

// -------------------------------------------------------------------------
// Anchor 7: Append ReassignAgentControl function at end of file.
// L365 ends with `}` (closing PlaceholderTab). Append after, preserving any trailing newlines.
// -------------------------------------------------------------------------
if (content.indexOf('function ReassignAgentControl') !== -1) {
  throw new Error('A7 unexpected: ReassignAgentControl already in file mid-patch');
}

// Strip trailing whitespace/newlines, append component, restore single trailing \n
const trailingMatch = content.match(/\s+$/);
const trailing = trailingMatch ? trailingMatch[0] : '';
const stripped = trailing ? content.slice(0, -trailing.length) : content;

const reassignComponent =
  "\n\n" +
  "function ReassignAgentControl({\n" +
  "  anchorLeadId,\n" +
  "  currentAgentId,\n" +
  "  currentAgentName,\n" +
  "  candidates,\n" +
  "}: {\n" +
  "  anchorLeadId: string\n" +
  "  currentAgentId: string | null\n" +
  "  currentAgentName: string | null\n" +
  "  candidates: Array<{ id: string; full_name: string | null; role: string | null }>\n" +
  "}) {\n" +
  "  const router = useRouter()\n" +
  "  const [selectedId, setSelectedId] = useState<string>('')\n" +
  "  const [submitting, setSubmitting] = useState(false)\n" +
  "  const [error, setError] = useState<string | null>(null)\n" +
  "\n" +
  "  const eligible = candidates.filter((c) => c.id !== currentAgentId)\n" +
  "\n" +
  "  if (eligible.length === 0) {\n" +
  "    return (\n" +
  "      <div className=\"mt-3 mb-3 text-xs text-gray-400\">\n" +
  "        No other agents available to reassign to.\n" +
  "      </div>\n" +
  "    )\n" +
  "  }\n" +
  "\n" +
  "  const handleSubmit = async () => {\n" +
  "    if (!selectedId) return\n" +
  "    setSubmitting(true)\n" +
  "    setError(null)\n" +
  "    try {\n" +
  "      const url = '/api/admin-homes/leads/' + anchorLeadId + '/reassign-agent'\n" +
  "      const res = await fetch(url, {\n" +
  "        method: 'POST',\n" +
  "        headers: { 'Content-Type': 'application/json' },\n" +
  "        body: JSON.stringify({ newAgentId: selectedId }),\n" +
  "      })\n" +
  "      const json = await res.json().catch(() => ({}))\n" +
  "      if (!res.ok) {\n" +
  "        setError(json?.error || ('Reassign failed (status ' + res.status + ')'))\n" +
  "        setSubmitting(false)\n" +
  "        return\n" +
  "      }\n" +
  "      setSelectedId('')\n" +
  "      router.refresh()\n" +
  "    } catch (e: any) {\n" +
  "      setError(e?.message || 'Network error')\n" +
  "    } finally {\n" +
  "      setSubmitting(false)\n" +
  "    }\n" +
  "  }\n" +
  "\n" +
  "  return (\n" +
  "    <div className=\"mt-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded\">\n" +
  "      <div className=\"text-xs font-semibold text-blue-900 mb-2\">Reassign agent</div>\n" +
  "      <div className=\"text-xs text-gray-600 mb-2\">\n" +
  "        Currently assigned: <span className=\"font-medium\">{currentAgentName || '(unassigned)'}</span>\n" +
  "      </div>\n" +
  "      <div className=\"flex flex-wrap items-center gap-2\">\n" +
  "        <select\n" +
  "          value={selectedId}\n" +
  "          onChange={(e) => setSelectedId(e.target.value)}\n" +
  "          disabled={submitting}\n" +
  "          className=\"text-sm border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50\"\n" +
  "        >\n" +
  "          <option value=\"\">Select new agent...</option>\n" +
  "          {eligible.map((c) => (\n" +
  "            <option key={c.id} value={c.id}>\n" +
  "              {c.full_name || '(unnamed)'}{c.role ? ' (' + c.role + ')' : ''}\n" +
  "            </option>\n" +
  "          ))}\n" +
  "        </select>\n" +
  "        <button\n" +
  "          type=\"button\"\n" +
  "          onClick={handleSubmit}\n" +
  "          disabled={submitting || !selectedId}\n" +
  "          className=\"text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed\"\n" +
  "        >\n" +
  "          {submitting ? 'Reassigning...' : 'Reassign'}\n" +
  "        </button>\n" +
  "      </div>\n" +
  "      {error && (\n" +
  "        <div className=\"mt-2 text-xs text-red-600\">{error}</div>\n" +
  "      )}\n" +
  "    </div>\n" +
  "  )\n" +
  "}\n";

content = stripped + reassignComponent;
console.log('[W6b-fix] A7 ReassignAgentControl appended OK');

fs.writeFileSync(ABS, content, 'utf8');
console.log('[W6b-fix] file written:', REL);
console.log('[W6b-fix] DONE');