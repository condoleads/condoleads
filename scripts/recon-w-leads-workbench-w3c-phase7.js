const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECON_DIR = path.join(ROOT, 'recon');
const RECON_FILE = path.join(RECON_DIR, 'W-LEADS-WORKBENCH-W3C-PHASE7.txt');
if (!fs.existsSync(RECON_DIR)) fs.mkdirSync(RECON_DIR, { recursive: true });

const out = [];
function emit(s) { console.log(s); out.push(s); }

function dumpFromDecl(absFile, headerRe, linesAfter) {
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING'); return false; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i; break; }
  }
  if (start < 0) { emit('  HEADER NOT MATCHED: ' + headerRe.source); return false; }
  const end = Math.min(start + linesAfter, lines.length - 1);
  for (let i = start; i <= end; i++) emit('  L' + (i + 1) + ': ' + lines[i]);
  return true;
}

function dumpAround(absFile, lineNum, before, after) {
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING'); return; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  const s = Math.max(0, lineNum - 1 - before);
  const e = Math.min(lines.length - 1, lineNum - 1 + after);
  for (let i = s; i <= e; i++) {
    const marker = (i === lineNum - 1) ? ' >>' : '   ';
    emit(marker + ' L' + (i + 1) + ': ' + lines[i]);
  }
}

function dumpRange(absFile, startLine, endLine) {
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING'); return; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  const s = Math.max(0, startLine - 1);
  const e = Math.min(lines.length - 1, endLine - 1);
  for (let i = s; i <= e; i++) emit('  L' + (i + 1) + ': ' + lines[i]);
}

emit('=== W3c PHASE 7 RECON ' + new Date().toISOString() + ' ===');
emit('');

// --- submitLeadFromForm wrapper ---
emit('--- submitLeadFromForm (lib/actions/leads.ts) signature + body window ---');
dumpFromDecl(
  path.join(ROOT, 'lib/actions/leads.ts'),
  /(?:export\s+)?(?:async\s+)?function\s+submitLeadFromForm\b/,
  60
);
emit('');

// --- 11 builders ---
const targets = [
  { label: 'buildContactEmail',           file: 'app/api/walliam/contact/route.ts',                       declRe: /function\s+buildContactEmail\b/,           callLine: 135 },
  { label: 'buildUserConfirmationEmail',  file: 'app/api/charlie/appointment/route.ts',                   declRe: /function\s+buildUserConfirmationEmail\b/,  callLine: 184 },
  { label: 'buildAgentNotificationEmail', file: 'app/api/charlie/appointment/route.ts',                   declRe: /function\s+buildAgentNotificationEmail\b/, callLine: 224 },
  { label: 'buildUserPlanEmail',          file: 'app/api/charlie/lead/route.ts',                          declRe: /function\s+buildUserPlanEmail\b/,          callLine: 254 },
  { label: 'buildAgentLeadEmail',         file: 'app/api/charlie/lead/route.ts',                          declRe: /function\s+buildAgentLeadEmail\b/,         callLine: 288 },
  { label: 'buildRichPlanEmail',          file: 'app/api/charlie/plan-email/route.ts',                    declRe: /function\s+buildRichPlanEmail\b/,          callLine: 160 },
  { label: 'buildAgentEmailHtml',         file: 'app/api/walliam/charlie/vip-request/route.ts',           declRe: /function\s+buildAgentEmailHtml\b/,         callLine: 204 },
  { label: 'buildUserApprovalEmailHtml',  file: 'app/api/walliam/charlie/vip-request/route.ts',           declRe: /function\s+buildUserApprovalEmailHtml\b/,  callLine: 340 },
  { label: 'buildApprovalEmailHtml',      file: 'app/api/walliam/estimator/vip-request/route.ts',         declRe: /function\s+buildApprovalEmailHtml\b/,      callLine: 221 },
  { label: 'buildQuestionnaireEmailHtml', file: 'app/api/walliam/estimator/vip-questionnaire/route.ts',   declRe: /function\s+buildQuestionnaireEmailHtml\b/, callLine: 208 }
];

for (const t of targets) {
  emit('--- ' + t.label + ' (' + t.file + ') ---');
  emit('Declaration + first 25 lines:');
  const ok = dumpFromDecl(path.join(ROOT, t.file), t.declRe, 25);
  if (ok) {
    emit('');
    emit('Call-site context (line ' + t.callLine + ' ± 12 before / 6 after):');
    dumpAround(path.join(ROOT, t.file), t.callLine, 12, 6);
  }
  emit('');
}

// --- vip-approve route: full first 250 lines (no named builder found in Phase 3) ---
emit('--- vip-approve route email pattern (full first 250 lines) ---');
emit('app/api/walliam/estimator/vip-approve/route.ts');
dumpRange(path.join(ROOT, 'app/api/walliam/estimator/vip-approve/route.ts'), 1, 250);
emit('');

// --- Where pageUrl-style variables originate in each route file ---
emit('--- pageUrl / page_url variable origin search ---');
const routeFiles = [
  'app/api/walliam/contact/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts'
];
for (const rf of routeFiles) {
  const abs = path.join(ROOT, rf);
  if (!fs.existsSync(abs)) { emit(rf + ': MISSING'); continue; }
  emit(rf + ':');
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const re = /pageUrl|page_url|req\.headers\.get\(['"`]referer['"`]\)|headersList\.get\(['"`]referer['"`]\)|await\s+req\.json|body\s*=\s*await/i;
  let hit = false;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) { emit('  L' + (i + 1) + ': ' + lines[i].trim()); hit = true; }
  }
  if (!hit) emit('  (no pageUrl / referer / body-parse hits)');
}
emit('');

emit('=== PHASE 7 COMPLETE ===');
emit('Output: recon/W-LEADS-WORKBENCH-W3C-PHASE7.txt');

fs.writeFileSync(RECON_FILE, out.join('\n') + '\n', 'utf8');