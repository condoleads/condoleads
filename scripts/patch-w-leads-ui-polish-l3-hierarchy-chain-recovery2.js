// scripts/patch-w-leads-ui-polish-l3-hierarchy-chain-recovery2.js
//
// L3 recovery 2: anchor 7 (page.tsx SELECT extension) failed exact-string
// match in paste 101 -- same pattern as L3-anchor-3 and 4f: multi-line
// anchors containing template literal backticks consistently return "found 0"
// in our PS-Node transport. This script:
//   - Anchor 7: line-pattern replacement on the manager: line in page.tsx
//   - Anchor 8: tracker append (unchanged from paste 101 design)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('Recovery2 patch stamp: ' + stamp);

function backup(rel) {
  const src = path.join(ROOT, rel);
  const dst = src + '.backup_' + stamp;
  fs.copyFileSync(src, dst);
  console.log('  backup: ' + path.basename(dst));
  return src;
}

// ============================================================
// File 1 (skipped): AdminHomesLeadsClient.tsx already patched in paste 101
// ============================================================

// ============================================================
// File 2: app/admin-homes/leads/page.tsx -- anchor 7 LINE-PATTERN
// ============================================================
console.log('--- File 2: page.tsx anchor 7 (line-pattern) ---');
{
  const src = backup('app/admin-homes/leads/page.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;
  const lines = text.split('\n');

  // Find the unique manager: line
  const mIdxs = [];
  lines.forEach((l, i) => {
    if (l.includes('manager:agents!leads_manager_id_fkey')) mIdxs.push(i);
  });
  if (mIdxs.length !== 1) {
    throw new Error('7: manager: line count = ' + mIdxs.length + ' (expected 1)');
  }
  const mIdx = mIdxs[0];
  const managerLine = lines[mIdx];
  const indentMatch = managerLine.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  console.log('  manager line at ' + (mIdx + 1) + ', indent=' + indent.length + ' chars');
  console.log('  raw line: ' + JSON.stringify(managerLine));

  // Sanity: line should NOT end with comma (it's currently the last entry in SELECT)
  if (managerLine.trim().endsWith(',')) {
    throw new Error('7: manager line already has trailing comma -- already patched?');
  }

  // Sanity: line should be inside a template literal (next line should be ` `) `)
  let foundClose = false;
  for (let i = mIdx + 1; i < Math.min(mIdx + 5, lines.length); i++) {
    if (lines[i].includes('`)')) { foundClose = true; break; }
  }
  if (!foundClose) {
    throw new Error('7: template literal close `) not found within 5 lines after manager: line');
  }

  // Build replacement: manager line + comma, then 2 new join lines at same indent
  const newLines = [
    managerLine + ',',
    indent + 'area_manager:agents!leads_area_manager_id_fkey ( id, full_name, email ),',
    indent + 'tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )',
  ];

  lines.splice(mIdx, 1, ...newLines);
  text = lines.join('\n');
  console.log('  OK 7 page SELECT line-pattern (1 line -> 3 lines)');

  // Residual checks
  if (!text.includes('leads_area_manager_id_fkey')) throw new Error('page: area_manager join missing');
  if (!text.includes('leads_tenant_admin_id_fkey')) throw new Error('page: tenant_admin join missing');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// File 3: tracker append (anchor 8)
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
    '- **2026-05-12 L3** ' + EM + ' **Hierarchy chain render shipped (two recovery passes).** ' +
    '`app/admin-homes/leads/page.tsx` SELECT extended with two new Supabase relational joins ' +
    '(`area_manager:agents!leads_area_manager_id_fkey` and `tenant_admin:agents!leads_tenant_admin_id_fkey`); total joins on the leads query are now 4 (agent + manager + area_manager + tenant_admin). ' +
    'All three hierarchy FK constraints verified present on public.leads pre-patch (paste 99 probe). ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx`: Lead type extended with `area_manager_id` / `tenant_admin_id` ID fields and `area_manager?` / `tenant_admin?` joined object fields (parallel to existing `agents?` / `manager?`). ' +
    'Manager column render replaced with multi-level hierarchy chain: three conditional `<div>` blocks for manager / area_manager / tenant_admin, each rendered only when the FK is populated, with `\u2191` / `\u2191\u2191` / `\u2191\u2191\u2191` arrow indicators ' +
    'showing chain depth and `title=` tooltips for hover role disambiguation. Vertical stack via `space-y-0.5`. Graceful degradation: when all three FKs are NULL the cell falls back to the existing em-dash. ' +
    'Table column header `Manager` ' + EM + ' `Hierarchy` (reflects multi-level scope). CSV export expanded with `Area Manager` and `Tenant Admin` columns alongside existing `Manager` column for downstream analysis. ' +
    '**Recovery history (THIRD failure of multi-line anchor with backticks):** paste 100 patch failed at anchor 3 (10-line JSX block with `\u2191` `\u2014` + template literal backticks in className); paste 101 fixed anchor 3 via line-pattern but failed at anchor 7 ' +
    '(5-line page.tsx SELECT template literal with backticks); paste 102 fixed anchor 7 via line-pattern (find unique `manager:` line, capture indent, splice). ' +
    '**Pattern logged:** multi-line anchors containing template literal backticks consistently return "found 0" in our PS-Node transport across multiple files. Hypothesis: a backtick-related encoding quirk somewhere in the pipeline. ' +
    '**New default rule:** for any multi-line anchor whose content contains a backtick `` \u0060 ``, skip exact-string and use line-pattern from the start. Single-line anchors (with or without backticks) continue to work fine. ' +
    '**Data observation:** all 163 existing rows have manager/area_manager/tenant_admin NULL; the chain renders em-dash fallback. New leads post-W-HIERARCHY will populate via walkHierarchy and render the full chain. ' +
    'L3 row in phase table stays OPEN until Lclose.\n';

  text = text + l3Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l3Count = text.split('**2026-05-12 L3**').length - 1;
  if (l3Count !== 1) throw new Error('tracker: L3 marker count = ' + l3Count);
  console.log('  L3 marker count: ' + l3Count);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== L3 RECOVERY2 PATCHES APPLIED OK ===');