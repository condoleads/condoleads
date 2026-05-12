// scripts/patch-w-leads-ui-polish-l1-ui-recovery.js
//
// Recovery patch after paste 94's anchor 4f exact-string match failed
// (other 5 UI anchors + 8 backend patches succeeded; UI write was aborted
// before fs.writeFileSync was called, so the file on disk is untouched).
//
// This script:
//   1. Diagnostic byte dump of L411 region (postmortem: what tripped 4f?)
//   2. Apply UI patch with anchors 4a-4e exact-string (unchanged) and 4f
//      via LINE-PATTERN replacement (indent-agnostic, robust to whitespace)
//   3. Append L1 status log line to W-LEADS-UI-POLISH-TRACKER.md
//
// Does NOT re-run backend patches (already applied in paste 94).

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
  if (count !== 1) {
    throw new Error(label + ': expected 1 match, found ' + count);
  }
  console.log('    OK ' + label);
  return content.replace(oldStr, newStr);
}

// ============================================================
// Diagnostic: byte dump of L411 region (postmortem for 4f failure)
// ============================================================
console.log('');
console.log('=== DIAGNOSTIC: byte dump of AdminHomesLeadsClient.tsx L411-423 ===');
{
  const src = path.join(ROOT, 'components/admin-homes/AdminHomesLeadsClient.tsx');
  const text = fs.readFileSync(src, 'utf8');
  const lines = text.split('\n');

  // Detect line endings
  const crlfCount = (text.match(/\r\n/g) || []).length;
  const lfOnlyCount = (text.match(/(?<!\r)\n/g) || []).length;
  console.log('  Line endings: CRLF=' + crlfCount + ' LF-only=' + lfOnlyCount);
  console.log('  Total lines (split by \\n): ' + lines.length);

  // Dump L411-413 byte-by-byte for postmortem
  for (let lineNum = 411; lineNum <= 413; lineNum++) {
    const line = lines[lineNum - 1];
    if (line === undefined) { console.log('  L' + lineNum + ': (out of range)'); continue; }
    console.log('  L' + lineNum + ' length=' + line.length + ' raw=' + JSON.stringify(line));
    // Detail: count leading whitespace chars and their codes
    let i = 0;
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i > 0) {
      const wsChars = [];
      for (let j = 0; j < i; j++) wsChars.push(line.charCodeAt(j));
      console.log('  L' + lineNum + ' leading-ws-chars: ' + i + ' codes: [' + wsChars.join(',') + ']');
    }
  }
}
console.log('');

// ============================================================
// UI patch: AdminHomesLeadsClient.tsx
// ============================================================
console.log('--- UI patch: AdminHomesLeadsClient.tsx (anchors 4a-4e exact + 4f line-pattern) ---');
{
  const src = backup('components/admin-homes/AdminHomesLeadsClient.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // ---- Anchor 4a: Insert QUALITY_VALUES + QUALITY_LABELS const block ----
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
  text = replaceOnce(
    text,
    "    hot: leads.filter(l => l.quality === 'hot').length,",
    "    qualified_hot: leads.filter(l => l.quality === 'qualified_hot').length,",
    '4c stats counter'
  );

  // ---- Anchor 4d: stats card label ----
  text = replaceOnce(
    text,
    "          { label: 'Hot', value: stats.hot, color: 'text-red-600' },",
    "          { label: 'Hot Leads', value: stats.qualified_hot, color: 'text-red-600' },",
    '4d stats card label'
  );

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

  // ---- Anchor 4f: LINE-PATTERN replacement (robust to indent/whitespace) ----
  console.log('  --- 4f: line-pattern replacement ---');
  {
    const lines = text.split('\n');

    // Unique anchor: the comment line "{/* Inline quality update */}"
    const commentMatches = lines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => line.trim() === '{/* Inline quality update */}');
    if (commentMatches.length !== 1) {
      throw new Error('4f: comment anchor count = ' + commentMatches.length);
    }
    const commentIdx = commentMatches[0].idx;
    const baseIndentMatch = lines[commentIdx].match(/^(\s*)/);
    const baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';
    console.log('    comment at line ' + (commentIdx + 1) + ', baseIndent=' + baseIndent.length + ' chars');

    // Find the matching </td> at the same indent, within next 30 lines
    let tdCloseIdx = -1;
    const searchEnd = Math.min(commentIdx + 30, lines.length);
    for (let i = commentIdx + 1; i < searchEnd; i++) {
      if (lines[i] === baseIndent + '</td>') {
        tdCloseIdx = i;
        break;
      }
    }
    if (tdCloseIdx === -1) {
      throw new Error('4f: matching </td> not found within 30 lines at indent ' + baseIndent.length);
    }
    console.log('    </td> at line ' + (tdCloseIdx + 1) + '; block span = ' + (tdCloseIdx - commentIdx + 1) + ' lines');

    // Sanity: the block must contain the legacy select + lead.quality references
    const blockText = lines.slice(commentIdx, tdCloseIdx + 1).join('\n');
    if (!blockText.includes('value={lead.quality}')) {
      throw new Error('4f: block missing value={lead.quality}');
    }
    if (!blockText.includes('<option value="hot">')) {
      throw new Error('4f: block missing legacy option "hot"');
    }
    console.log('    sanity OK (block contains value={lead.quality} and legacy options)');

    // Build replacement, indented relative to baseIndent
    const i0 = baseIndent;
    const i2 = baseIndent + '  ';
    const i4 = baseIndent + '    ';
    const i6 = baseIndent + '      ';
    const i8 = baseIndent + '        ';
    const i10 = baseIndent + '          ';

    const replacement = [
      i0 + '{/* Inline quality action buttons -- L1 ships 4 state buttons */}',
      i0 + '<td className="px-4 py-3">',
      i2 + '<div className="flex gap-1 flex-wrap">',
      i4 + '{QUALITY_VALUES.map(q => {',
      i6 + 'const isActive = lead.quality === q',
      i6 + 'return (',
      i8 + '<button',
      i10 + 'key={q}',
      i10 + "onClick={() => updateLeadStatus(lead.id, 'quality', q)}",
      i10 + 'disabled={updatingStatus === lead.id}',
      i10 + "className={`text-xs px-2 py-1 rounded-full font-semibold transition-colors ${isActive ? qualityColor(q) : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'} ${updatingStatus === lead.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}",
      i10 + 'title={QUALITY_LABELS[q]}',
      i8 + '>',
      i10 + '{QUALITY_LABELS[q]}',
      i8 + '</button>',
      i6 + ')',
      i4 + '})}',
      i2 + '</div>',
      i0 + '</td>',
    ];

    // Splice: replace [commentIdx..tdCloseIdx] (inclusive) with replacement
    lines.splice(commentIdx, tdCloseIdx - commentIdx + 1, ...replacement);
    text = lines.join('\n');
    console.log('    OK 4f line-pattern replacement (' + replacement.length + ' lines inserted)');
  }

  // ---- Residual checks ----
  if (text.match(/quality\s*===\s*['"]hot['"]/))  throw new Error("UI: residual quality === 'hot'");
  if (text.match(/quality\s*===\s*['"]warm['"]/)) throw new Error("UI: residual quality === 'warm'");
  if (text.match(/quality\s*===\s*['"]cold['"]/)) throw new Error("UI: residual quality === 'cold'");
  if (text.match(/quality\s*:\s*['"](hot|warm|cold)['"]/)) throw new Error("UI: residual quality: legacy write");
  // Positive checks: new const block present, new button structure present
  if (!text.includes('const QUALITY_VALUES = [')) throw new Error("UI: QUALITY_VALUES not inserted");
  if (!text.includes('QUALITY_LABELS[q]')) throw new Error("UI: QUALITY_LABELS reference missing");
  if (!text.includes('{/* Inline quality action buttons')) throw new Error("UI: new comment not present");

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
}

// ============================================================
// Tracker append: docs/W-LEADS-UI-POLISH-TRACKER.md
// ============================================================
console.log('');
console.log('--- Tracker append: W-LEADS-UI-POLISH-TRACKER.md ---');
{
  const src = backup('docs/W-LEADS-UI-POLISH-TRACKER.md');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  const v2Anchor = '**2026-05-12 v2**';
  const v2Count = text.split(v2Anchor).length - 1;
  if (v2Count !== 1) throw new Error('tracker: v2 anchor count = ' + v2Count);

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
    '(All / Unqualified / Hot / Cold / Disqualified); replaced the inline quality `<select>` dropdown with four action buttons, each clickable to set quality ' +
    'via the existing PATCH `/api/admin-homes/leads/[id]` route (no new API endpoints). `calcEngagement` was NOT touched ' + EM + ' its `Hot`/`Warm`/`Active`/`Cold` ' +
    'labels are activity-score display strings, semantically independent of `lead.quality`. ' +
    '**Recovery note:** initial paste 94 patch script applied 8 backend patches + UI anchors 4a-4e successfully but UI anchor 4f (exact-string match on the 14-line ' +
    'inline `<select>` block) returned 0 matches. AdminHomesLeadsClient.tsx was untouched on disk (script threw before write). Recovery paste 95 re-applied anchors ' +
    '4a-4e exact-string + 4f via line-pattern replacement (find unique `{/* Inline quality update */}` comment, find matching `</td>` at same indent, splice the ' +
    'block). Indent-agnostic; robust to whatever whitespace difference tripped the original exact-string anchor. ' +
    'Closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19. L1 row in the phase table stays OPEN until Lclose reconciles all phase commit hashes.\n';

  text = text + l1Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l1MarkerCount = text.split('**2026-05-12 L1**').length - 1;
  if (l1MarkerCount !== 1) throw new Error('tracker: L1 marker count = ' + l1MarkerCount);
  console.log('  L1 marker count: ' + l1MarkerCount);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('');
console.log('=== ALL RECOVERY PATCHES APPLIED OK ===');