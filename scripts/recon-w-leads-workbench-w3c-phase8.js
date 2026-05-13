const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECON_FILE = path.join(ROOT, 'recon', 'W-LEADS-WORKBENCH-W3C-PHASE8.txt');
const out = [];
function emit(s) { console.log(s); out.push(s); }

function dumpRange(absFile, startLine, endLine) {
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING: ' + absFile); return; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  const s = Math.max(0, startLine - 1);
  const e = Math.min(lines.length - 1, endLine - 1);
  for (let i = s; i <= e; i++) emit('  L' + (i + 1) + ': ' + lines[i]);
}

function findInsertBlocks(absFile, table) {
  // Find every '.from("table")' or ".from('table')" and dump 30 surrounding lines
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING: ' + absFile); return; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  const re = new RegExp("\\.from\\([\"'`]" + table + "[\"'`]\\)");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) hits.push(i);
  }
  if (hits.length === 0) { emit("  no .from('" + table + "') hits"); return; }
  emit('  ' + hits.length + " .from('" + table + "') hit(s) at lines: " + hits.map(h => h + 1).join(', '));
  for (const lineIdx of hits) {
    emit('');
    emit('  --- context around L' + (lineIdx + 1) + ' (15 before / 25 after) ---');
    const s = Math.max(0, lineIdx - 15);
    const e = Math.min(lines.length - 1, lineIdx + 25);
    for (let i = s; i <= e; i++) {
      const marker = (i === lineIdx) ? ' >>' : '   ';
      emit(marker + ' L' + (i + 1) + ': ' + lines[i]);
    }
  }
}

emit('=== W3c PHASE 8 RECON ' + new Date().toISOString() + ' ===');
emit('');

// Q1: buildApprovalEmailHtml full body (vip-request)
emit('--- Q1: buildApprovalEmailHtml body — does it render pageUrl? ---');
emit('app/api/walliam/estimator/vip-request/route.ts L410 to L530');
dumpRange(path.join(ROOT, 'app/api/walliam/estimator/vip-request/route.ts'), 410, 530);
emit('');

// Q2: vip-request (walliam/charlie) — does it insert to leads or only vip_requests?
emit('--- Q2: walliam/charlie/vip-request — leads vs vip_requests inserts ---');
emit('  scan for .from(...) tables:');
const f2 = path.join(ROOT, 'app/api/walliam/charlie/vip-request/route.ts');
if (fs.existsSync(f2)) {
  const lines = fs.readFileSync(f2, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\.from\(["'`]([a-z_]+)["'`]\)/i);
    if (m) emit('    L' + (i + 1) + ': table=' + m[1] + ' :: ' + lines[i].trim());
  }
} else {
  emit('  FILE MISSING');
}
emit('');
emit('  --- leads insert context (if any) ---');
findInsertBlocks(f2, 'leads');
emit('');
emit('  --- vip_requests insert context ---');
findInsertBlocks(f2, 'vip_requests');
emit('');

// Q3: leads insert column shape in 3 routes
emit('--- Q3a: charlie/appointment leads insert ---');
findInsertBlocks(path.join(ROOT, 'app/api/charlie/appointment/route.ts'), 'leads');
emit('');

emit('--- Q3b: charlie/lead leads insert ---');
findInsertBlocks(path.join(ROOT, 'app/api/charlie/lead/route.ts'), 'leads');
emit('');

emit('--- Q3c: charlie/plan-email leads insert ---');
findInsertBlocks(path.join(ROOT, 'app/api/charlie/plan-email/route.ts'), 'leads');
emit('');

// BONUS: walliam/contact existing leads insert (already known to NOT capture source_url)
emit('--- Q3d (bonus): walliam/contact leads insert ---');
findInsertBlocks(path.join(ROOT, 'app/api/walliam/contact/route.ts'), 'leads');
emit('');

// Q4: lib/actions/leads.ts — what function holds L183 (source_url write) + L223 (buildLeadEmail call)?
emit('--- Q4: lib/actions/leads.ts L155 to L240 (wrapper around source_url write + buildLeadEmail call) ---');
dumpRange(path.join(ROOT, 'lib/actions/leads.ts'), 155, 240);
emit('');

emit('=== PHASE 8 COMPLETE ===');
emit('Output: recon/W-LEADS-WORKBENCH-W3C-PHASE8.txt');

fs.writeFileSync(RECON_FILE, out.join('\n') + '\n', 'utf8');