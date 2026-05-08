// scripts/r-territory-t4a-1-is-primary-toggle.js
//
// T4a-1: Add is_primary toggle to GeoAssignmentSection + persist via geo POST route
// with auto-reassign on conflict (Shah pick: Option B).
//
// Files touched:
//   1. components/admin-homes/GeoAssignmentSection.tsx
//        - import Star icon
//        - is_primary?: boolean on Assignment interface
//        - new PrimaryToggle component (with `locked` mode for inherited rows)
//        - togglePrimary helper
//        - isPrimary state for new-assignment form
//        - PrimaryToggle wired into all three row renderings:
//            * Inherited (locked, displays badge if true; null otherwise)
//            * "Your Territories" (editable toggle)
//            * "Manual Overrides" (editable toggle)
//        - is_primary checkbox in Add form
//   2. app/api/admin-homes/agents/[id]/geo/route.ts
//        - is_primary persisted in row mapping
//        - auto-reassign loop BEFORE INSERT: for each incoming row claiming
//          primary, UPDATE other agents' rows at same (scope, scope_id) within
//          tenant to is_primary=false. Triggers fire (post-v13) → primary_unset
//          audit rows for displaced agents.
//
// Pre-req: F-APA-PRIMARY-AUDIT-GAP fix already applied (v13 migration). Without
// it, primary toggles produce silent state changes — regression of v11's audit
// coverage philosophy.
//
// Pattern: per-edit anchor-based replacement with alreadyMarker idempotency.
// Atomic per-file (all edits applied in memory; file written once at end if
// all succeed). Timestamped backup before any in-place modification.

const fs = require('fs');
const path = require('path');

const COMPONENT = path.join('components', 'admin-homes', 'GeoAssignmentSection.tsx');
const ROUTE = path.join('app', 'api', 'admin-homes', 'agents', '[id]', 'geo', 'route.ts');

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

function makeStamp() {
  const t = new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()) + '_' +
         pad(t.getHours()) + pad(t.getMinutes()) + pad(t.getSeconds());
}

function backup(p, stamp) {
  const bak = p + '.backup_' + stamp;
  fs.copyFileSync(p, bak);
  return bak;
}

function tryEdit(content, oldStr, newStr, alreadyMarker, label) {
  if (alreadyMarker && content.indexOf(alreadyMarker) !== -1) {
    return { content: content, status: 'SKIP', label: label };
  }
  const firstIdx = content.indexOf(oldStr);
  if (firstIdx === -1) {
    return { content: content, status: 'FAIL', label: label, reason: 'old anchor not found' };
  }
  const secondIdx = content.indexOf(oldStr, firstIdx + 1);
  if (secondIdx !== -1) {
    return { content: content, status: 'FAIL', label: label, reason: 'old anchor not unique' };
  }
  return {
    content: content.slice(0, firstIdx) + newStr + content.slice(firstIdx + oldStr.length),
    status: 'OK',
    label: label
  };
}

function applyEdits(content, edits) {
  // Detect line endings — component .tsx is often CRLF on Windows; route .ts often LF.
  // Normalize anchor newlines to match each file's convention before matching.
  const NL = content.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const results = [];
  let cur = content;
  for (const e of edits) {
    const oldStr = e.old.replace(/\n/g, NL);
    const newStr = e.new.replace(/\n/g, NL);
    const alreadyMarker = e.alreadyMarker ? e.alreadyMarker.replace(/\n/g, NL) : e.alreadyMarker;
    const r = tryEdit(cur, oldStr, newStr, alreadyMarker, e.label);
    results.push({ label: r.label, status: r.status, reason: r.reason });
    cur = r.content;
    if (r.status === 'FAIL') break;
  }
  return { content: cur, results: results };
}

// ===========================================================================
// COMPONENT EDITS
// ===========================================================================

const PRIMARY_TOGGLE_COMPONENT =
  "\n\nfunction PrimaryToggle({ active, onToggle, locked }: { active: boolean; onToggle?: () => void; locked?: boolean }) {\n" +
  "  if (locked) {\n" +
  "    return active ? (\n" +
  "      <span className=\"flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded\">\n" +
  "        <Star className=\"w-3 h-3 fill-amber-500\" /> PRIMARY\n" +
  "      </span>\n" +
  "    ) : null\n" +
  "  }\n" +
  "  return (\n" +
  "    <button\n" +
  "      type=\"button\"\n" +
  "      onClick={onToggle}\n" +
  "      className={\n" +
  "        'flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ' +\n" +
  "        (active\n" +
  "          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'\n" +
  "          : 'bg-gray-50 text-gray-400 hover:bg-amber-50 hover:text-amber-600')\n" +
  "      }\n" +
  "      title={active ? 'Click to unset primary' : 'Click to set as primary'}\n" +
  "    >\n" +
  "      <Star className={'w-3 h-3 ' + (active ? 'fill-amber-500' : 'fill-none')} />\n" +
  "      {active ? 'PRIMARY' : 'set primary'}\n" +
  "    </button>\n" +
  "  )\n" +
  "}";

const componentEdits = [
  {
    label: 'C1: import Star',
    old: "import { MapPin, Plus, X, Check, Info, Lock } from 'lucide-react'",
    new: "import { MapPin, Plus, X, Check, Info, Lock, Star } from 'lucide-react'",
    alreadyMarker: ", Lock, Star }"
  },
  {
    label: 'C2: add is_primary to Assignment interface',
    old: "  buildings_mode: string\n}",
    new: "  buildings_mode: string\n  is_primary?: boolean\n}",
    alreadyMarker: "  is_primary?: boolean"
  },
  {
    label: 'C3: add PrimaryToggle component after AccessBadges',
    old:
      "function AccessBadges({ a }: { a: Assignment }) {\n" +
      "  return (\n" +
      "    <div className=\"flex gap-1.5 flex-wrap\">\n" +
      "      {a.condo_access && <span className=\"bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded\">Condos</span>}\n" +
      "      {a.homes_access && <span className=\"bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded\">Homes</span>}\n" +
      "      {a.buildings_access && <span className=\"bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded\">Buildings ({a.buildings_mode})</span>}\n" +
      "    </div>\n" +
      "  )\n" +
      "}",
    new:
      "function AccessBadges({ a }: { a: Assignment }) {\n" +
      "  return (\n" +
      "    <div className=\"flex gap-1.5 flex-wrap\">\n" +
      "      {a.condo_access && <span className=\"bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded\">Condos</span>}\n" +
      "      {a.homes_access && <span className=\"bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded\">Homes</span>}\n" +
      "      {a.buildings_access && <span className=\"bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded\">Buildings ({a.buildings_mode})</span>}\n" +
      "    </div>\n" +
      "  )\n" +
      "}" + PRIMARY_TOGGLE_COMPONENT,
    alreadyMarker: "function PrimaryToggle({"
  },
  {
    label: 'C4: add isPrimary state',
    old: "  const [buildingsMode, setBuildingsMode] = useState('all')",
    new: "  const [buildingsMode, setBuildingsMode] = useState('all')\n  const [isPrimary, setIsPrimary] = useState(false)",
    alreadyMarker: "const [isPrimary, setIsPrimary] = useState(false)"
  },
  {
    label: 'C5: include is_primary in addAssignment + reset state',
    old:
      "      buildings_mode: buildingsMode,\n" +
      "    }\n" +
      "    setAssignments([...assignments, newA])\n" +
      "    setSelectedAreaId(''); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('')",
    new:
      "      buildings_mode: buildingsMode,\n" +
      "      is_primary: isPrimary,\n" +
      "    }\n" +
      "    setAssignments([...assignments, newA])\n" +
      "    setSelectedAreaId(''); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId(''); setIsPrimary(false)",
    alreadyMarker: "is_primary: isPrimary,"
  },
  {
    label: 'C6: add togglePrimary helper after removeAssignment',
    old:
      "  function removeAssignment(idx: number) {\n" +
      "    setAssignments(assignments.filter((_, i) => i !== idx))\n" +
      "  }",
    new:
      "  function removeAssignment(idx: number) {\n" +
      "    setAssignments(assignments.filter((_, i) => i !== idx))\n" +
      "  }\n\n" +
      "  function togglePrimary(idx: number) {\n" +
      "    setAssignments(assignments.map((a, i) => i === idx ? { ...a, is_primary: !a.is_primary } : a))\n" +
      "  }",
    alreadyMarker: "function togglePrimary(idx: number)"
  },
  {
    label: 'C7: inherited row — show locked PrimaryToggle',
    old:
      "                <div key={i} className=\"flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3\">\n" +
      "                  <span className=\"text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n" +
      "                  <span className=\"text-sm font-medium text-gray-700\">{getDisplayName(a)}</span>\n" +
      "                  <AccessBadges a={a} />\n" +
      "                  <Lock className=\"w-3.5 h-3.5 text-gray-300 ml-auto\" />\n" +
      "                </div>",
    new:
      "                <div key={i} className=\"flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3\">\n" +
      "                  <span className=\"text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n" +
      "                  <span className=\"text-sm font-medium text-gray-700\">{getDisplayName(a)}</span>\n" +
      "                  <PrimaryToggle active={!!a.is_primary} locked />\n" +
      "                  <AccessBadges a={a} />\n" +
      "                  <Lock className=\"w-3.5 h-3.5 text-gray-300 ml-auto\" />\n" +
      "                </div>",
    alreadyMarker: "<PrimaryToggle active={!!a.is_primary} locked />"
  },
  {
    label: 'C8: "Your Territories" row — add toggle',
    old:
      "              <div key={i} className=\"flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3\">\n" +
      "                <div className=\"flex items-center gap-3\">\n" +
      "                  <span className=\"text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n" +
      "                  <span className=\"text-sm font-medium text-gray-900\">{getDisplayName(a)}</span>\n" +
      "                  <AccessBadges a={a} />\n" +
      "                </div>",
    new:
      "              <div key={i} className=\"flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3\">\n" +
      "                <div className=\"flex items-center gap-3\">\n" +
      "                  <span className=\"text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n" +
      "                  <span className=\"text-sm font-medium text-gray-900\">{getDisplayName(a)}</span>\n" +
      "                  <PrimaryToggle active={!!a.is_primary} onToggle={() => togglePrimary(i)} />\n" +
      "                  <AccessBadges a={a} />\n" +
      "                </div>",
    alreadyMarker: "bg-green-100 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n                  <span className=\"text-sm font-medium text-gray-900\">{getDisplayName(a)}</span>\n                  <PrimaryToggle"
  },
  {
    label: 'C9: "Manual Overrides" row — add toggle',
    old:
      "              <div key={i} className=\"flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3\">\n" +
      "                <div className=\"flex items-center gap-3\">\n" +
      "                  <span className=\"text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n" +
      "                  <span className=\"text-sm font-medium text-gray-900\">{getDisplayName(a)}</span>\n" +
      "                  <AccessBadges a={a} />\n" +
      "                </div>",
    new:
      "              <div key={i} className=\"flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3\">\n" +
      "                <div className=\"flex items-center gap-3\">\n" +
      "                  <span className=\"text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n" +
      "                  <span className=\"text-sm font-medium text-gray-900\">{getDisplayName(a)}</span>\n" +
      "                  <PrimaryToggle active={!!a.is_primary} onToggle={() => togglePrimary(i)} />\n" +
      "                  <AccessBadges a={a} />\n" +
      "                </div>",
    alreadyMarker: "bg-amber-100 px-2 py-1 rounded\">{SCOPE_LABELS[a.scope]}</span>\n                  <span className=\"text-sm font-medium text-gray-900\">{getDisplayName(a)}</span>\n                  <PrimaryToggle"
  },
  {
    label: 'C10: Add form — is_primary checkbox',
    old:
      "          {buildingsAccess && (\n" +
      "            <select value={buildingsMode} onChange={e => setBuildingsMode(e.target.value)} className=\"px-2 py-1 border rounded text-sm\">\n" +
      "              <option value=\"all\">All buildings</option>\n" +
      "              <option value=\"selected\">Selected only</option>\n" +
      "              <option value=\"none\">No buildings</option>\n" +
      "            </select>\n" +
      "          )}\n" +
      "        </div>",
    new:
      "          {buildingsAccess && (\n" +
      "            <select value={buildingsMode} onChange={e => setBuildingsMode(e.target.value)} className=\"px-2 py-1 border rounded text-sm\">\n" +
      "              <option value=\"all\">All buildings</option>\n" +
      "              <option value=\"selected\">Selected only</option>\n" +
      "              <option value=\"none\">No buildings</option>\n" +
      "            </select>\n" +
      "          )}\n" +
      "          <label className=\"flex items-center gap-2 text-sm cursor-pointer ml-auto\">\n" +
      "            <input type=\"checkbox\" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} className=\"w-4 h-4\" />\n" +
      "            <Star className={'w-3.5 h-3.5 ' + (isPrimary ? 'fill-amber-500 text-amber-500' : 'text-gray-400')} />\n" +
      "            Primary\n" +
      "          </label>\n" +
      "        </div>",
    alreadyMarker: "<input type=\"checkbox\" checked={isPrimary}"
  }
];

// ===========================================================================
// ROUTE EDITS
// ===========================================================================

const AUTO_REASSIGN_BLOCK =
  "  // T4a-1 auto-reassign: for any incoming row claiming primary, unset OTHER\n" +
  "  // agents' is_primary at same (scope, scope_id) within the same tenant. Avoids\n" +
  "  // partial-unique-index conflict on INSERT and produces clean primary_unset\n" +
  "  // audit rows via handle_apa_update (per F-APA-PRIMARY-AUDIT-GAP fix v13).\n" +
  "  for (const row of rows) {\n" +
  "    if (row.is_primary !== true) continue\n" +
  "    let scopeCol: string | null = null\n" +
  "    let scopeVal: string | null = null\n" +
  "    if (row.scope === 'area') { scopeCol = 'area_id'; scopeVal = row.area_id }\n" +
  "    else if (row.scope === 'municipality') { scopeCol = 'municipality_id'; scopeVal = row.municipality_id }\n" +
  "    else if (row.scope === 'community') { scopeCol = 'community_id'; scopeVal = row.community_id }\n" +
  "    else if (row.scope === 'neighbourhood') { scopeCol = 'neighbourhood_id'; scopeVal = row.neighbourhood_id }\n" +
  "    if (!scopeCol || !scopeVal) continue\n" +
  "    const { error: reassignError } = await supabase\n" +
  "      .from('agent_property_access')\n" +
  "      .update({ is_primary: false })\n" +
  "      .eq('scope', row.scope)\n" +
  "      .eq(scopeCol, scopeVal)\n" +
  "      .eq('is_active', true)\n" +
  "      .eq('is_primary', true)\n" +
  "      .eq('tenant_id', tenantId)\n" +
  "      .neq('agent_id', params.id)\n" +
  "    if (reassignError) {\n" +
  "      return NextResponse.json({ error: 'auto-reassign failed: ' + reassignError.message }, { status: 500 })\n" +
  "    }\n" +
  "  }\n\n";

const routeEdits = [
  {
    label: 'R1: include is_primary in rows mapping',
    old:
      "    buildings_mode: a.buildings_mode || 'all',\n" +
      "    is_active: true,\n" +
      "    tenant_id: tenantId,\n" +
      "  }))",
    new:
      "    buildings_mode: a.buildings_mode || 'all',\n" +
      "    is_primary: a.is_primary === true,\n" +
      "    is_active: true,\n" +
      "    tenant_id: tenantId,\n" +
      "  }))",
    alreadyMarker: "is_primary: a.is_primary === true,"
  },
  {
    label: 'R2: add auto-reassign loop before INSERT',
    old:
      "  const { error: insertError } = await supabase\n" +
      "    .from('agent_property_access')\n" +
      "    .insert(rows)\n" +
      "  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })",
    new:
      AUTO_REASSIGN_BLOCK +
      "  const { error: insertError } = await supabase\n" +
      "    .from('agent_property_access')\n" +
      "    .insert(rows)\n" +
      "  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })",
    alreadyMarker: "T4a-1 auto-reassign:"
  }
];

// ===========================================================================
// APPLY
// ===========================================================================

if (!fs.existsSync(COMPONENT)) fail(COMPONENT + ' not found');
if (!fs.existsSync(ROUTE)) fail(ROUTE + ' not found');

const componentOriginal = fs.readFileSync(COMPONENT, 'utf8');
const routeOriginal = fs.readFileSync(ROUTE, 'utf8');

const compRes = applyEdits(componentOriginal, componentEdits);
const routeRes = applyEdits(routeOriginal, routeEdits);

console.log('\n=== Component edits (' + COMPONENT + ') ===');
for (const r of compRes.results) {
  let line = '  ' + r.status + ': ' + r.label;
  if (r.reason) line += ' — ' + r.reason;
  console.log(line);
}

console.log('\n=== Route edits (' + ROUTE + ') ===');
for (const r of routeRes.results) {
  let line = '  ' + r.status + ': ' + r.label;
  if (r.reason) line += ' — ' + r.reason;
  console.log(line);
}

const compFails = compRes.results.filter(function (r) { return r.status === 'FAIL'; });
const routeFails = routeRes.results.filter(function (r) { return r.status === 'FAIL'; });

if (compFails.length > 0 || routeFails.length > 0) {
  console.error('\nFAIL: ' + (compFails.length + routeFails.length) + ' edit(s) failed. Files untouched.');
  process.exit(1);
}

const compChanged = compRes.content !== componentOriginal;
const routeChanged = routeRes.content !== routeOriginal;

if (!compChanged && !routeChanged) {
  console.log('\nNo-op: both files already at target state.');
  process.exit(0);
}

const stamp = makeStamp();

if (compChanged) {
  const bak = backup(COMPONENT, stamp);
  console.log('\nBackup: ' + bak);
  fs.writeFileSync(COMPONENT, compRes.content);
  console.log('Wrote: ' + COMPONENT + ' (delta ' + (compRes.content.length - componentOriginal.length) + ' chars)');
}

if (routeChanged) {
  const bak = backup(ROUTE, stamp);
  console.log('Backup: ' + bak);
  fs.writeFileSync(ROUTE, routeRes.content);
  console.log('Wrote: ' + ROUTE + ' (delta ' + (routeRes.content.length - routeOriginal.length) + ' chars)');
}

console.log('\nNext steps:');
console.log('  1. npx tsc --noEmit');
console.log('  2. Review diff: git diff -- ' + COMPONENT + ' ' + ROUTE);
console.log('  3. Smoke test: open /admin-homes/agents/[id], toggle a primary, save,');
console.log('     verify in territory_assignment_changes (changed_by, change_type, before_state, after_state)');
console.log('  4. git add ' + COMPONENT + ' "' + ROUTE + '" scripts/r-territory-t4a-1-is-primary-toggle.js');
console.log('  5. git commit -m "feat(W-TERRITORY): T4a-1 — is_primary toggle in GeoAssignmentSection + auto-reassign in geo POST"');
console.log('  6. git push');