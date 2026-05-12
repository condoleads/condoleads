// scripts/patch-w-leads-ui-polish-l1-code-and-ui.js
//
// L1 file patches (no DB changes):
//   1. Remove quality:'<val>' line from 8 System 2 files (7 'hot' + 1 'cold').
//      System 1 chat/* files are NOT touched per System 1 Isolation rule.
//   2. Multi-anchor patch on AdminHomesLeadsClient.tsx (6 anchors).
//   3. Append L1 status log line to W-LEADS-UI-POLISH-TRACKER.md.
//
// All file mods get timestamped backups before write. Each anchor is gated by
// uniqueness assertions: any anchor matches != 1 times -> throw before write.

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

function removeUniqueLine(content, regex, label) {
  const lines = content.split('\n');
  const matches = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => regex.test(line));
  if (matches.length !== 1) {
    throw new Error(label + ': expected 1 line matching ' + regex + ', found ' + matches.length);
  }
  console.log('    removing line ' + (matches[0].idx + 1) + ': ' + matches[0].line);
  lines.splice(matches[0].idx, 1);
  return lines.join('\n');
}

function replaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) {
    throw new Error(label + ': expected 1 match, found ' + count);
  }
  console.log('    OK ' + label);
  return content.replace(oldStr, newStr);
}

// ============================================================
// Backend patches: 8 System 2 files (7 'hot' + 1 'cold')
// ============================================================
const BACKEND_PATCHES = [
  { rel: 'app/api/charlie/plan-email/route.ts',                        value: 'hot'  },
  { rel: 'app/api/charlie/lead/route.ts',                              value: 'hot'  },
  { rel: 'app/api/charlie/appointment/route.ts',                       value: 'hot'  },
  { rel: 'app/api/walliam/charlie/vip-request/route.ts',               value: 'hot'  },
  { rel: 'app/api/walliam/contact/route.ts',                           value: 'hot'  },
  { rel: 'app/api/walliam/estimator/vip-questionnaire/route.ts',       value: 'hot'  },
  { rel: 'app/api/walliam/estimator/vip-request/route.ts',             value: 'hot'  },
  { rel: 'lib/actions/leads.ts',                                       value: 'cold' },
];

for (const p of BACKEND_PATCHES) {
  console.log('--- Backend patch: ' + p.rel + " (quality: '" + p.value + "') ---");
  const src = backup(p.rel);
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // Use string-built regex so the value is interpolated cleanly
  const lineRegex = new RegExp("^\\s+quality: '" + p.value + "',\\s*$");
  text = removeUniqueLine(text, lineRegex, p.rel);

  // Residual check: no remaining quality: '<value>' write in this file
  const residualRegex = new RegExp("quality\\s*:\\s*['\"]" + p.value + "['\"]");
  if (text.match(residualRegex)) {
    throw new Error(p.rel + ": residual quality: '" + p.value + "' after removal");
  }

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// UI patch: components/admin-homes/AdminHomesLeadsClient.tsx (6 anchors)
// ============================================================
console.log('--- UI patch: AdminHomesLeadsClient.tsx (6 anchors) ---');
{
  const src = backup('components/admin-homes/AdminHomesLeadsClient.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // ---- Anchor 4a: Insert QUALITY_VALUES + QUALITY_LABELS const block
  //                 between calcEngagement and the component export ----
  const a4a_old =
    "  return { score, label: 'Cold', color: 'text-gray-400' }\n" +
    "}\n" +
    "\n" +
    "export default function AdminHomesLeadsClient";
  const a4a_new =
    "  return { score, label: 'Cold', color: 'text-gray-400' }\n" +
    "}\n" +
    "\n" +
    "const QUALITY_VALUES = ['unqualified', 'qualified_hot', 'qualified_cold', 'disqualified'] as const\n" +
    "type QualityValue = typeof QUALITY_VALUES[number]\n" +
    "const QUALITY_LABELS: Record<QualityValue, string> = {\n" +
    "  unqualified: 'Unqualified',\n" +
    "  qualified_hot: 'Hot',\n" +
    "  qualified_cold: 'Cold',\n" +
    "  disqualified: 'Disqualified',\n" +
    "}\n" +
    "\n" +
    "export default function AdminHomesLeadsClient";
  text = replaceOnce(text, a4a_old, a4a_new, '4a QUALITY_VALUES + QUALITY_LABELS insert');

  // ---- Anchor 4b: qualityColor map rewrite ----
  const a4b_old =
    "  const qualityColor = (q: string) => ({\n" +
    "    hot: 'bg-red-100 text-red-800',\n" +
    "    warm: 'bg-orange-100 text-orange-800',\n" +
    "    cold: 'bg-blue-100 text-blue-800',\n" +
    "  }[q] || 'bg-gray-100 text-gray-800')";
  const a4b_new =
    "  const qualityColor = (q: string) => ({\n" +
    "    qualified_hot: 'bg-red-100 text-red-800',\n" +
    "    qualified_cold: 'bg-blue-100 text-blue-800',\n" +
    "    unqualified: 'bg-gray-100 text-gray-700',\n" +
    "    disqualified: 'bg-zinc-100 text-zinc-500',\n" +
    "  }[q] || 'bg-gray-100 text-gray-800')";
  text = replaceOnce(text, a4b_old, a4b_new, '4b qualityColor map');

  // ---- Anchor 4c: stats counter ----
  const a4c_old = "    hot: leads.filter(l => l.quality === 'hot').length,";
  const a4c_new = "    qualified_hot: leads.filter(l => l.quality === 'qualified_hot').length,";
  text = replaceOnce(text, a4c_old, a4c_new, '4c stats counter');

  // ---- Anchor 4d: stats card label ----
  const a4d_old = "          { label: 'Hot', value: stats.hot, color: 'text-red-600' },";
  const a4d_new = "          { label: 'Hot Leads', value: stats.qualified_hot, color: 'text-red-600' },";
  text = replaceOnce(text, a4d_old, a4d_new, '4d stats card label');

  // ---- Anchor 4e: filter dropdown options ----
  const a4e_old =
    '            <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">\n' +
    '              <option value="all">All</option>\n' +
    '              <option value="hot">Hot</option>\n' +
    '              <option value="warm">Warm</option>\n' +
    '              <option value="cold">Cold</option>\n' +
    '            </select>';
  const a4e_new =
    '            <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">\n' +
    '              <option value="all">All</option>\n' +
    '              <option value="unqualified">Unqualified</option>\n' +
    '              <option value="qualified_hot">Hot</option>\n' +
    '              <option value="qualified_cold">Cold</option>\n' +
    '              <option value="disqualified">Disqualified</option>\n' +
    '            </select>';
  text = replaceOnce(text, a4e_old, a4e_new, '4e filter dropdown');

  // ---- Anchor 4f: inline <select> dropdown -> 4 action buttons ----
  const a4f_old =
    "                      {/* Inline quality update */}\n" +
    "                      <td className=\"px-4 py-3\">\n" +
    "                        <select\n" +
    "                          value={lead.quality}\n" +
    "                          onChange={e => updateLeadStatus(lead.id, 'quality', e.target.value)}\n" +
    "                          disabled={updatingStatus === lead.id}\n" +
    "                          className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${qualityColor(lead.quality)}`}\n" +
    "                        >\n" +
    "                          <option value=\"hot\">Hot</option>\n" +
    "                          <option value=\"warm\">Warm</option>\n" +
    "                          <option value=\"cold\">Cold</option>\n" +
    "                        </select>\n" +
    "                      </td>";
  const a4f_new =
    "                      {/* Inline quality action buttons -- L1 ships 4 state buttons */}\n" +
    "                      <td className=\"px-4 py-3\">\n" +
    "                        <div className=\"flex gap-1 flex-wrap\">\n" +
    "                          {QUALITY_VALUES.map(q => (\n" +
    "                            <button\n" +
    "                              key={q}\n" +
    "                              onClick={() => updateLeadStatus(lead.id, 'quality', q)}\n" +
    "                              disabled={updatingStatus === lead.id}\n" +
    "                              className={`text-xs px-2 py-1 rounded-full font-semibold transition-colors ${\n" +
    "                                lead.quality === q\n" +
    "                                  ? qualityColor(q)\n" +
    "                                  : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'\n" +
    "                              } ${updatingStatus === lead.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}\n" +
    "                              title={QUALITY_LABELS[q]}\n" +
    "                            >\n" +
    "                              {QUALITY_LABELS[q]}\n" +
    "                            </button>\n" +
    "                          ))}\n" +
    "                        </div>\n" +
    "                      </td>";
  text = replaceOnce(text, a4f_old, a4f_new, '4f inline dropdown -> buttons');

  // Residual checks: no legacy quality comparisons or value writes remain
  if (text.match(/quality\s*===\s*['"]hot['"]/))  throw new Error("UI: residual quality === 'hot'");
  if (text.match(/quality\s*===\s*['"]warm['"]/)) throw new Error("UI: residual quality === 'warm'");
  if (text.match(/quality\s*===\s*['"]cold['"]/)) throw new Error("UI: residual quality === 'cold'");
  if (text.match(/quality\s*:\s*['"](hot|warm|cold)['"]/)) throw new Error("UI: residual quality: legacy write");

  fs.writeFileSync(src, text, 'utf8');
  const delta = text.length - before;
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (delta >= 0 ? '+' : '') + delta + ')');
}

// ============================================================
// Tracker append: docs/W-LEADS-UI-POLISH-TRACKER.md
// ============================================================
console.log('--- Tracker append: W-LEADS-UI-POLISH-TRACKER.md ---');
{
  const src = backup('docs/W-LEADS-UI-POLISH-TRACKER.md');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  const v2Anchor = '**2026-05-12 v2**';
  const v2Count = text.split(v2Anchor).length - 1;
  if (v2Count !== 1) throw new Error('polish tracker: v2 anchor count = ' + v2Count + ', expected 1');

  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l1Entry =
    '- **2026-05-12 L1** ' + EM + ' **Qualification system shipped (expanded scope).** ' +
    'Migration `supabase/migrations/20260512_l1_qualification_system_constraint.sql` expanded `leads_quality_check` to a UNION of legacy values ' +
    '(`hot`, `warm`, `cold`) and new values (`unqualified`, `qualified_hot`, `qualified_cold`, `disqualified`); default changed from `cold` to `unqualified`; ' +
    'backfilled 163 rows (all WALLiam tenant `b16e1039`): 145 `hot` ' + EM + ' `qualified_hot` plus 18 `cold` ' + EM + ' `unqualified`. ' +
    '**Why UNION (not REPLACE):** paste 92 safety grep found 14 `quality:` writes total ' + EM + ' 8 in System 2 (patched here) + 6 in System 1 ' +
    '`app/api/chat/*` (UNTOUCHED per System 1 Isolation rule). A replacement CHECK would 500 every System 1 lead insert post-migration; union CHECK ' +
    'preserves System 1 compatibility while permitting the new System 2 taxonomy. ' +
    '**Backend code patches (8 System 2 files):** `app/api/charlie/plan-email/route.ts`, `app/api/charlie/lead/route.ts`, `app/api/charlie/appointment/route.ts`, ' +
    '`app/api/walliam/charlie/vip-request/route.ts`, `app/api/walliam/contact/route.ts`, `app/api/walliam/estimator/vip-questionnaire/route.ts`, ' +
    '`app/api/walliam/estimator/vip-request/route.ts`, `lib/actions/leads.ts` (writes `cold`, not `hot`). Each `quality:` line removed from the `.insert({...})` ' +
    'payload; new inserts default to `unqualified` via the new DB default. ' +
    '**System 1 chat/* writes preserved (untouched):** 6 writes across 4 files (`chat/vip-approve:142,157`, `chat/vip-questionnaire:215`, `chat/vip-request:230`, ' +
    '`chat/vip-upgrade:67,89`) continue to write `hot` against the union CHECK. ' +
    '**UI patch on `components/admin-homes/AdminHomesLeadsClient.tsx`:** added `QUALITY_VALUES` and `QUALITY_LABELS` consts; rewrote `qualityColor` map with new keys; ' +
    'updated `stats.hot` ' + EM + ' `stats.qualified_hot` counter; relabeled stats card to "Hot Leads"; rebuilt filter dropdown with five options ' +
    '(All / Unqualified / Hot / Cold / Disqualified); replaced the L414-417 inline quality `<select>` dropdown with four action buttons, each clickable to set quality ' +
    'via the existing PATCH `/api/admin-homes/leads/[id]` route (no new API endpoints). `calcEngagement` at L66-72 was NOT touched ' + EM + ' its `Hot`/`Warm`/`Active`/`Cold` ' +
    'labels are activity-score display strings, semantically independent of `lead.quality`. ' +
    'Closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19. L1 row in the phase table stays OPEN until Lclose reconciles all phase commit hashes.\n';

  text = text + l1Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l1MarkerCount = text.split('**2026-05-12 L1**').length - 1;
  if (l1MarkerCount !== 1) throw new Error('polish tracker: L1 marker count = ' + l1MarkerCount);
  console.log('  L1 marker count: ' + l1MarkerCount);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== ALL PATCHES APPLIED OK ===');