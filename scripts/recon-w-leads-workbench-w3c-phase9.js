const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECON_FILE = path.join(ROOT, 'recon', 'W-LEADS-WORKBENCH-W3C-PHASE9.txt');
const out = [];
function emit(s) { console.log(s); out.push(s); }

function dumpFnBody(absFile, fnName) {
  if (!fs.existsSync(absFile)) { emit('  FILE MISSING'); return; }
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('function ' + fnName + '(')) { startIdx = i; break; }
  }
  if (startIdx < 0) { emit('  DECL NOT FOUND: function ' + fnName + '('); return; }

  // Brace counting with template-literal + nested-expression awareness
  let depth = 0, inFn = false, endIdx = -1;
  let inTemplate = false, exprDepth = 0;

  outer: for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const next = j < line.length - 1 ? line[j+1] : '';
      if (!inTemplate) {
        if (ch === '`') {
          inTemplate = true;
        } else if (ch === '{') {
          depth++; inFn = true;
        } else if (ch === '}') {
          depth--;
          if (inFn && depth === 0) { endIdx = i; break outer; }
        }
      } else {
        if (ch === '`' && exprDepth === 0) {
          inTemplate = false;
        } else if (ch === '$' && next === '{' && exprDepth === 0) {
          exprDepth = 1; j++;
        } else if (ch === '{' && exprDepth > 0) {
          exprDepth++;
        } else if (ch === '}' && exprDepth > 0) {
          exprDepth--;
        }
      }
    }
  }

  if (endIdx < 0) {
    emit('  BRACE TRACKING FAILED -- falling back to +200 lines');
    endIdx = Math.min(startIdx + 200, lines.length - 1);
  }

  for (let i = startIdx; i <= endIdx; i++) emit('  L' + (i + 1) + ': ' + lines[i]);
  emit('  (function spans L' + (startIdx + 1) + '-L' + (endIdx + 1) + ', ' + (endIdx - startIdx + 1) + ' lines)');
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

emit('=== W3c PHASE 9 ' + new Date().toISOString() + ' ===');
emit('');

for (const t of targets) {
  emit('--- ' + t.fn + ' :: ' + t.file + ' ---');
  dumpFnBody(path.join(ROOT, t.file), t.fn);
  emit('');
}

const files = [...new Set(targets.map(t => t.file))];
emit('--- Imports (L1-25 of each affected file) ---');
for (const f of files) {
  emit('');
  emit(f + ':');
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) { emit('  FILE MISSING'); continue; }
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  for (let i = 0; i < Math.min(25, lines.length); i++) emit('  L' + (i + 1) + ': ' + lines[i]);
}

emit('');
emit('=== PHASE 9 COMPLETE ===');
emit('Output: recon/W-LEADS-WORKBENCH-W3C-PHASE9.txt');

if (!fs.existsSync(path.dirname(RECON_FILE))) fs.mkdirSync(path.dirname(RECON_FILE), { recursive: true });
fs.writeFileSync(RECON_FILE, out.join('\n') + '\n', 'utf8');