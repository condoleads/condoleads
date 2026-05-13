const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECON_FILE = path.join(ROOT, 'recon', 'W-LEADS-WORKBENCH-W3C-PHASE9-FIX.txt');
const out = [];
function emit(s) { console.log(s); out.push(s); }

function dumpFnBody(absFile, fnName) {
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING'); return; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  let declStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('function ' + fnName + '(')) { declStart = i; break; }
  }
  if (declStart < 0) { emit('  DECL NOT FOUND'); return; }

  // Find body-open: the `{` that follows `): TYPE` (skip past params type literal entirely)
  let bodyOpenLine = -1, bodyOpenCol = -1;
  for (let i = declStart; i < Math.min(declStart + 60, lines.length); i++) {
    const m = lines[i].match(/\):\s*\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*\s*\{/);
    if (m) { bodyOpenLine = i; bodyOpenCol = m.index + m[0].length - 1; break; }
  }
  if (bodyOpenLine < 0) {
    emit('  BODY OPEN NOT FOUND -- falling back to +200 lines');
    const end = Math.min(declStart + 200, lines.length - 1);
    for (let i = declStart; i <= end; i++) emit('  L' + (i + 1) + ': ' + lines[i]);
    emit('  (FALLBACK: L' + (declStart + 1) + '-L' + (end + 1) + ')');
    return;
  }

  // Track braces from immediately after body-open `{`, depth=1
  let depth = 1, endLine = -1;
  let inTemplate = false, exprDepth = 0;

  outer: for (let i = bodyOpenLine; i < lines.length; i++) {
    const line = lines[i];
    const startCol = (i === bodyOpenLine) ? bodyOpenCol + 1 : 0;
    for (let j = startCol; j < line.length; j++) {
      const ch = line[j];
      const next = j < line.length - 1 ? line[j + 1] : '';
      if (!inTemplate) {
        if (ch === '`') inTemplate = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { endLine = i; break outer; }
        }
      } else {
        if (ch === '`' && exprDepth === 0) inTemplate = false;
        else if (ch === '$' && next === '{' && exprDepth === 0) { exprDepth = 1; j++; }
        else if (ch === '{' && exprDepth > 0) exprDepth++;
        else if (ch === '}' && exprDepth > 0) exprDepth--;
      }
    }
  }

  if (endLine < 0) endLine = Math.min(declStart + 200, lines.length - 1);

  for (let i = declStart; i <= endLine; i++) emit('  L' + (i + 1) + ': ' + lines[i]);
  emit('  (function spans L' + (declStart + 1) + '-L' + (endLine + 1) + ', ' + (endLine - declStart + 1) + ' lines)');
}

const targets = [
  { file: 'app/api/walliam/contact/route.ts',                     fn: 'buildContactEmail' },
  { file: 'app/api/charlie/appointment/route.ts',                 fn: 'buildUserConfirmationEmail' },
  { file: 'app/api/charlie/appointment/route.ts',                 fn: 'buildAgentNotificationEmail' },
  { file: 'app/api/charlie/lead/route.ts',                        fn: 'buildUserPlanEmail' },
  { file: 'app/api/charlie/lead/route.ts',                        fn: 'buildAgentLeadEmail' },
  { file: 'app/api/charlie/plan-email/route.ts',                  fn: 'buildRichPlanEmail' },
  { file: 'app/api/walliam/charlie/vip-request/route.ts',         fn: 'buildAgentEmailHtml' },
  { file: 'app/api/walliam/charlie/vip-request/route.ts',         fn: 'buildUserApprovalEmailHtml' },
  { file: 'app/api/walliam/estimator/vip-request/route.ts',       fn: 'buildApprovalEmailHtml' },
  { file: 'app/api/walliam/estimator/vip-approve/route.ts',       fn: 'buildUserApprovalEmailHtml' },
  { file: 'app/api/walliam/estimator/vip-questionnaire/route.ts', fn: 'buildQuestionnaireEmailHtml' }
];

emit('=== W3c PHASE 9-FIX ' + new Date().toISOString() + ' ===');
emit('');

for (const t of targets) {
  emit('--- ' + t.fn + ' :: ' + t.file + ' ---');
  dumpFnBody(path.join(ROOT, t.file), t.fn);
  emit('');
}

emit('=== PHASE 9-FIX COMPLETE ===');
emit('Output: recon/W-LEADS-WORKBENCH-W3C-PHASE9-FIX.txt');

if (!fs.existsSync(path.dirname(RECON_FILE))) fs.mkdirSync(path.dirname(RECON_FILE), { recursive: true });
fs.writeFileSync(RECON_FILE, out.join('\n') + '\n', 'utf8');