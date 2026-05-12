// scripts/patch-w-leads-ui-polish-l3-hierarchy-chain-recovery.js
//
// L3 recovery: anchor 3 (multi-line JSX block with unicode arrows + em-dash)
// failed exact-string match in paste 100 -- second occurrence of the same
// "long anchor in this file mysteriously returns 0 matches" pattern (also hit
// 4f in paste 94). Recovery uses line-pattern for anchor 3; other 7 anchors
// stay as exact-string substring matches (they're short or have no unicode).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('Recovery patch stamp: ' + stamp);

function backup(rel) {
  const src = path.join(ROOT, rel);
  const dst = src + '.backup_' + stamp;
  fs.copyFileSync(src, dst);
  console.log('  backup: ' + path.basename(dst));
  return src;
}

function replaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) throw new Error(label + ': expected 1 match, found ' + count);
  console.log('    OK ' + label);
  return content.replace(oldStr, newStr);
}

// ============================================================
// File 1: AdminHomesLeadsClient.tsx (6 anchors; #3 line-pattern)
// ============================================================
console.log('--- File 1: AdminHomesLeadsClient.tsx ---');
{
  const src = backup('components/admin-homes/AdminHomesLeadsClient.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // ---- Anchor 1: Lead type ID fields ----
  text = replaceOnce(
    text,
    "  manager_id: string | null\n  assignment_source: string | null",
    "  manager_id: string | null\n  area_manager_id: string | null\n  tenant_admin_id: string | null\n  assignment_source: string | null",
    '1 Lead type ID fields'
  );

  // ---- Anchor 2: Lead type joined obj fields ----
  text = replaceOnce(
    text,
    "  manager?: { id: string; full_name: string; email: string }\n}",
    "  manager?: { id: string; full_name: string; email: string }\n  area_manager?: { id: string; full_name: string; email: string }\n  tenant_admin?: { id: string; full_name: string; email: string }\n}",
    '2 Lead type joined obj fields'
  );

  // ---- Anchor 3: Hierarchy chain render -- LINE-PATTERN replacement ----
  console.log('  --- 3: hierarchy chain render (line-pattern) ----');
  {
    const lines = text.split('\n');

    // Unique start anchor: the conditional opener line
    const condMatches = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.trim() === '{lead.manager ? (');
    if (condMatches.length !== 1) {
      throw new Error('3: {lead.manager ? ( anchor count = ' + condMatches.length);
    }
    const condIdx = condMatches[0].i;

    // The td open is the line immediately before
    const tdOpenIdx = condIdx - 1;
    if (tdOpenIdx < 0) throw new Error('3: no line before {lead.manager ? (');
    const tdOpenLine = lines[tdOpenIdx];
    const baseIndentMatch = tdOpenLine.match(/^(\s*)/);
    const baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';

    // Sanity check on the td open line
    if (!tdOpenLine.includes('<td className=')) {
      throw new Error('3: line before {lead.manager} is not a <td>: ' + JSON.stringify(tdOpenLine));
    }
    console.log('    td open at line ' + (tdOpenIdx + 1) + ', baseIndent=' + baseIndent.length + ' chars');

    // Find matching </td> at same indent within 20 lines
    let tdCloseIdx = -1;
    for (let i = condIdx + 1; i < Math.min(condIdx + 20, lines.length); i++) {
      if (lines[i] === baseIndent + '</td>') {
        tdCloseIdx = i;
        break;
      }
    }
    if (tdCloseIdx === -1) {
      throw new Error('3: matching </td> not found within 20 lines at indent ' + baseIndent.length);
    }
    console.log('    </td> close at line ' + (tdCloseIdx + 1) + '; block span = ' + (tdCloseIdx - tdOpenIdx + 1) + ' lines');

    // Sanity check on the captured block content
    const blockText = lines.slice(tdOpenIdx, tdCloseIdx + 1).join('\n');
    if (!blockText.includes('lead.manager.full_name')) {
      throw new Error('3: block missing lead.manager.full_name');
    }
    if (!blockText.includes('text-gray-300')) {
      throw new Error('3: block missing em-dash fallback span');
    }
    console.log('    sanity OK');

    // Build replacement using baseIndent
    const i = baseIndent;
    const i2 = i + '  ';
    const i4 = i + '    ';
    const i6 = i + '      ';
    const i8 = i + '        ';
    const i10 = i + '          ';

    const replacement = [
      i + '<td className="px-4 py-3">',
      i2 + '{(lead.manager || lead.area_manager || lead.tenant_admin) ? (',
      i4 + '<div className="text-xs text-gray-500 space-y-0.5">',
      i6 + '{lead.manager && (',
      i8 + '<div title="Manager">',
      i10 + '<span className="text-gray-400 mr-1">\u2191</span>',
      i10 + '{lead.manager.full_name}',
      i8 + '</div>',
      i6 + ')}',
      i6 + '{lead.area_manager && (',
      i8 + '<div title="Area Manager">',
      i10 + '<span className="text-gray-400 mr-1">\u2191\u2191</span>',
      i10 + '{lead.area_manager.full_name}',
      i8 + '</div>',
      i6 + ')}',
      i6 + '{lead.tenant_admin && (',
      i8 + '<div title="Tenant Admin">',
      i10 + '<span className="text-gray-400 mr-1">\u2191\u2191\u2191</span>',
      i10 + '{lead.tenant_admin.full_name}',
      i8 + '</div>',
      i6 + ')}',
      i4 + '</div>',
      i2 + ') : <span className="text-gray-300 text-xs">\u2014</span>}',
      i + '</td>',
    ];

    lines.splice(tdOpenIdx, tdCloseIdx - tdOpenIdx + 1, ...replacement);
    text = lines.join('\n');
    console.log('    OK 3 hierarchy chain render line-pattern (' + replacement.length + ' lines inserted)');
  }

  // ---- Anchor 4: Table header 'Manager' -> 'Hierarchy' ----
  text = replaceOnce(
    text,
    "{['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Manager', 'Status', 'Quality', 'Actions'].map(h => (",
    "{['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Actions'].map(h => (",
    '4 table header rename'
  );

  // ---- Anchor 5: CSV header +Area Manager +Tenant Admin ----
  text = replaceOnce(
    text,
    "const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Status', 'Quality']",
    "const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Area Manager', 'Tenant Admin', 'Status', 'Quality']",
    '5 CSV header'
  );

  // ---- Anchor 6: CSV row +area_manager +tenant_admin ----
  text = replaceOnce(
    text,
    "      l.manager?.full_name || '',\n      l.status || '',",
    "      l.manager?.full_name || '',\n      l.area_manager?.full_name || '',\n      l.tenant_admin?.full_name || '',\n      l.status || '',",
    '6 CSV row'
  );

  // Residual checks
  if (!text.includes('area_manager_id: string | null')) throw new Error('UI: area_manager_id missing');
  if (!text.includes('tenant_admin_id: string | null')) throw new Error('UI: tenant_admin_id missing');
  if (!text.includes('area_manager?: {')) throw new Error('UI: area_manager? missing');
  if (!text.includes('tenant_admin?: {')) throw new Error('UI: tenant_admin? missing');
  if (!text.includes('title="Area Manager"')) throw new Error('UI: Area Manager render missing');
  if (!text.includes('title="Tenant Admin"')) throw new Error('UI: Tenant Admin render missing');
  if (!text.includes("'Hierarchy'")) throw new Error('UI: Hierarchy header missing');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// File 2: app/admin-homes/leads/page.tsx (1 anchor)
// ============================================================
console.log('');
console.log('--- File 2: app/admin-homes/leads/page.tsx ---');
{
  const src = backup('app/admin-homes/leads/page.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  const a7_old =
    "    .select(`\n" +
    "      *,\n" +
    "      agents!leads_agent_id_fkey ( id, full_name, email ),\n" +
    "      manager:agents!leads_manager_id_fkey ( id, full_name, email )\n" +
    "    `)";
  const a7_new =
    "    .select(`\n" +
    "      *,\n" +
    "      agents!leads_agent_id_fkey ( id, full_name, email ),\n" +
    "      manager:agents!leads_manager_id_fkey ( id, full_name, email ),\n" +
    "      area_manager:agents!leads_area_manager_id_fkey ( id, full_name, email ),\n" +
    "      tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )\n" +
    "    `)";
  text = replaceOnce(text, a7_old, a7_new, '7 page SELECT +area_manager +tenant_admin');

  if (!text.includes('leads_area_manager_id_fkey')) throw new Error('page: area_manager join missing');
  if (!text.includes('leads_tenant_admin_id_fkey')) throw new Error('page: tenant_admin join missing');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// File 3: docs/W-LEADS-UI-POLISH-TRACKER.md (append)
// ============================================================
console.log('');
console.log('--- File 3: tracker append ---');
{
  const src = backup('docs/W-LEADS-UI-POLISH-TRACKER.md');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  const l2Anchor = '**2026-05-12 L2**';
  if (text.split(l2Anchor).length - 1 !== 1) throw new Error('tracker: L2 anchor count != 1');

  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l3Entry =
    '- **2026-05-12 L3** ' + EM + ' **Hierarchy chain render shipped.** ' +
    '`app/admin-homes/leads/page.tsx` SELECT extended with two new Supabase relational joins ' +
    '(`area_manager:agents!leads_area_manager_id_fkey` and `tenant_admin:agents!leads_tenant_admin_id_fkey`); total joins on the leads query are now 4 (agent + manager + area_manager + tenant_admin). ' +
    'All three hierarchy FK constraints verified present on public.leads pre-patch (paste 99 probe). ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx`: Lead type extended with `area_manager_id` / `tenant_admin_id` ID fields and `area_manager?` / `tenant_admin?` joined object fields (parallel to existing `agents?` / `manager?`). ' +
    'Manager column render replaced with multi-level hierarchy chain: three conditional `<div>` blocks for manager / area_manager / tenant_admin, each rendered only when the FK is populated, with `\u2191` / `\u2191\u2191` / `\u2191\u2191\u2191` arrow indicators ' +
    'showing chain depth and `title=` tooltips for hover role disambiguation. Vertical stack via `space-y-0.5`. Graceful degradation: when all three FKs are NULL the cell falls back to the existing em-dash. ' +
    'Table column header `Manager` ' + EM + ' `Hierarchy` (reflects multi-level scope). CSV export expanded with `Area Manager` and `Tenant Admin` columns alongside existing `Manager` column for downstream analysis. ' +
    '**Recovery note:** initial paste 100 patch script applied anchors 1-2 in memory but anchor 3 (the 10-line multi-line JSX block with `\u2191` and `\u2014` characters) failed exact-string match with "found 0" ' +
    EM + ' second occurrence of the same pattern that hit anchor 4f in paste 94. AdminHomesLeadsClient.tsx was untouched on disk (script threw before write). Recovery paste 101 used line-pattern replacement for anchor 3 ' +
    '(find unique `{lead.manager ? (` line, walk back 1 line for the `<td>` open, walk forward for matching `</td>` at same indent, splice). All other anchors re-applied as exact-string substring matches. ' +
    '**Lesson logged:** for this file specifically, long multi-line anchors with unicode chars defeat exact-string match in a way that has been mysterious for two occurrences. Line-pattern is now the default strategy for multi-line JSX blocks in AdminHomesLeadsClient.tsx. ' +
    '**Data observation:** all 163 existing rows have manager/area_manager/tenant_admin NULL; the chain renders the em-dash fallback. New leads post-W-HIERARCHY will populate via walkHierarchy and render the full chain. ' +
    'L3 row in phase table stays OPEN until Lclose.\n';

  text = text + l3Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l3Count = text.split('**2026-05-12 L3**').length - 1;
  if (l3Count !== 1) throw new Error('tracker: L3 marker count = ' + l3Count);
  console.log('  L3 marker count: ' + l3Count);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== ALL L3 PATCHES APPLIED OK (recovery) ===');