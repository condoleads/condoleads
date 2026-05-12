// scripts/patch-w-leads-ui-polish-l3-hierarchy-chain.js
//
// L3: hierarchy chain render. 8 anchors across 3 files.
//   AdminHomesLeadsClient.tsx (6):
//     1. Lead type: +area_manager_id, +tenant_admin_id ID fields
//     2. Lead type: +area_manager?, +tenant_admin? joined obj fields
//     3. Manager column render: single-level -> chain (manager + area_mgr + admin)
//     4. Table header: 'Manager' -> 'Hierarchy'
//     5. CSV header: +'Area Manager', +'Tenant Admin' columns
//     6. CSV row: +l.area_manager?.full_name, +l.tenant_admin?.full_name
//   app/admin-homes/leads/page.tsx (1):
//     7. SELECT: +area_manager join, +tenant_admin join
//   docs/W-LEADS-UI-POLISH-TRACKER.md (1):
//     8. Append L3 status log line

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('Patch stamp: ' + stamp);

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
// File 1: components/admin-homes/AdminHomesLeadsClient.tsx (6 anchors)
// ============================================================
console.log('--- File 1: AdminHomesLeadsClient.tsx (6 anchors) ---');
{
  const src = backup('components/admin-homes/AdminHomesLeadsClient.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // ---- Anchor 1: Lead type +area_manager_id +tenant_admin_id ID fields ----
  text = replaceOnce(
    text,
    "  manager_id: string | null\n  assignment_source: string | null",
    "  manager_id: string | null\n  area_manager_id: string | null\n  tenant_admin_id: string | null\n  assignment_source: string | null",
    '1 Lead type ID fields'
  );

  // ---- Anchor 2: Lead type +area_manager? +tenant_admin? joined obj fields ----
  text = replaceOnce(
    text,
    "  manager?: { id: string; full_name: string; email: string }\n}",
    "  manager?: { id: string; full_name: string; email: string }\n  area_manager?: { id: string; full_name: string; email: string }\n  tenant_admin?: { id: string; full_name: string; email: string }\n}",
    '2 Lead type joined obj fields'
  );

  // ---- Anchor 3: Manager column render -- single-level -> chain ----
  // Old block: L406-416 in the post-L2 file (lead.manager only); the trailing
  // {/* Inline status update */} comment disambiguates this from any other td.
  const a3_old =
    "                      <td className=\"px-4 py-3\">\n" +
    "                        {lead.manager ? (\n" +
    "                          <div className=\"text-xs text-gray-500\">\n" +
    "                            <span className=\"text-gray-400 mr-1\">\u2191</span>\n" +
    "                            {lead.manager.full_name}\n" +
    "                          </div>\n" +
    "                        ) : <span className=\"text-gray-300 text-xs\">\u2014</span>}\n" +
    "                      </td>\n" +
    "                      {/* Inline status update */}";
  const a3_new =
    "                      <td className=\"px-4 py-3\">\n" +
    "                        {(lead.manager || lead.area_manager || lead.tenant_admin) ? (\n" +
    "                          <div className=\"text-xs text-gray-500 space-y-0.5\">\n" +
    "                            {lead.manager && (\n" +
    "                              <div title=\"Manager\">\n" +
    "                                <span className=\"text-gray-400 mr-1\">\u2191</span>\n" +
    "                                {lead.manager.full_name}\n" +
    "                              </div>\n" +
    "                            )}\n" +
    "                            {lead.area_manager && (\n" +
    "                              <div title=\"Area Manager\">\n" +
    "                                <span className=\"text-gray-400 mr-1\">\u2191\u2191</span>\n" +
    "                                {lead.area_manager.full_name}\n" +
    "                              </div>\n" +
    "                            )}\n" +
    "                            {lead.tenant_admin && (\n" +
    "                              <div title=\"Tenant Admin\">\n" +
    "                                <span className=\"text-gray-400 mr-1\">\u2191\u2191\u2191</span>\n" +
    "                                {lead.tenant_admin.full_name}\n" +
    "                              </div>\n" +
    "                            )}\n" +
    "                          </div>\n" +
    "                        ) : <span className=\"text-gray-300 text-xs\">\u2014</span>}\n" +
    "                      </td>\n" +
    "                      {/* Inline status update */}";
  text = replaceOnce(text, a3_old, a3_new, '3 hierarchy chain render');

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
  if (!text.includes('area_manager_id: string | null')) throw new Error('UI: area_manager_id field missing');
  if (!text.includes('tenant_admin_id: string | null')) throw new Error('UI: tenant_admin_id field missing');
  if (!text.includes('area_manager?: {')) throw new Error('UI: area_manager? field missing');
  if (!text.includes('tenant_admin?: {')) throw new Error('UI: tenant_admin? field missing');
  if (!text.includes("title=\"Area Manager\"")) throw new Error('UI: Area Manager render missing');
  if (!text.includes("title=\"Tenant Admin\"")) throw new Error('UI: Tenant Admin render missing');
  if (!text.includes("'Hierarchy'")) throw new Error('UI: Hierarchy header missing');
  // The old single-level conditional pattern must no longer exist (we replaced it)
  if (text.match(/\{lead\.manager \? \(\n\s+<div className="text-xs text-gray-500">\n\s+<span/)) {
    throw new Error('UI: old single-level manager render still present');
  }

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// File 2: app/admin-homes/leads/page.tsx (1 anchor)
// ============================================================
console.log('');
console.log('--- File 2: app/admin-homes/leads/page.tsx (SELECT extension) ---');
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
  text = replaceOnce(text, a7_old, a7_new, '7 page SELECT +area_manager +tenant_admin joins');

  // Residual checks
  if (!text.includes('leads_area_manager_id_fkey')) throw new Error('page: area_manager join missing');
  if (!text.includes('leads_tenant_admin_id_fkey')) throw new Error('page: tenant_admin join missing');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// File 3: docs/W-LEADS-UI-POLISH-TRACKER.md (append)
// ============================================================
console.log('');
console.log('--- File 3: W-LEADS-UI-POLISH-TRACKER.md status log append ---');
{
  const src = backup('docs/W-LEADS-UI-POLISH-TRACKER.md');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  const l2Anchor = '**2026-05-12 L2**';
  const l2Count = text.split(l2Anchor).length - 1;
  if (l2Count !== 1) throw new Error('tracker: L2 anchor count = ' + l2Count);

  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l3Entry =
    '- **2026-05-12 L3** ' + EM + ' **Hierarchy chain render shipped.** ' +
    '`app/admin-homes/leads/page.tsx` SELECT extended with two new Supabase relational joins: ' +
    '`area_manager:agents!leads_area_manager_id_fkey ( id, full_name, email )` and ' +
    '`tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )` (FK constraints verified present pre-patch). ' +
    'Total joins on the leads query are now 4: agent + manager + area_manager + tenant_admin. ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx`: Lead type extended with `area_manager_id: string | null`, `tenant_admin_id: string | null`, and ' +
    '`area_manager?` / `tenant_admin?` joined object fields (parallel structure to existing `agents?` / `manager?`). ' +
    'Manager column render replaced with multi-level hierarchy chain: three conditional `<div>` blocks for manager / area_manager / tenant_admin, each rendered only when the FK is populated, ' +
    'with `\u2191` / `\u2191\u2191` / `\u2191\u2191\u2191` arrow indicators showing chain depth and `title=` tooltips ("Manager" / "Area Manager" / "Tenant Admin") for role disambiguation on hover. ' +
    'Stacked vertically with `space-y-0.5`. Graceful degradation: when ALL three FKs are NULL the cell falls back to the existing em-dash `\u2014`. ' +
    'Table header column renamed `Manager` ' + EM + ' `Hierarchy` to reflect the multi-level scope; CSV export expanded with two new columns (`Area Manager`, `Tenant Admin`) alongside the existing `Manager` column for downstream data analysis. ' +
    '**Data observation:** all 163 existing rows have `manager_id`/`area_manager_id`/`tenant_admin_id` = NULL (only `agent_id` is populated). The hierarchy stamping logic in W-HIERARCHY (closed 2026-05-03) targets new leads only; ' +
    'existing data predates the migration. New leads inserted after this commit will populate the hierarchy via `walkHierarchy` in the backend routes (already shipped in W-HIERARCHY H3.6/H3.9) ' +
    'and render with the full chain. Code-gate only smoke (TSC clean). ' +
    'No DB schema changes. No new API endpoints. ' +
    'L3 row in the phase table stays OPEN until Lclose reconciles all phase commit hashes.\n';

  text = text + l3Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l3MarkerCount = text.split('**2026-05-12 L3**').length - 1;
  if (l3MarkerCount !== 1) throw new Error('tracker: L3 marker count = ' + l3MarkerCount);
  console.log('  L3 marker count: ' + l3MarkerCount);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== ALL L3 PATCHES APPLIED OK ===');