const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const TARGETS = [
  { file: 'app/api/walliam/contact/route.ts',                  name: 'buildContactEmail' },
  { file: 'app/api/charlie/appointment/route.ts',              name: 'buildUserConfirmationEmail' },
  { file: 'app/api/charlie/appointment/route.ts',              name: 'buildAgentNotificationEmail' },
  { file: 'app/api/charlie/lead/route.ts',                     name: 'buildUserPlanEmail' },
  { file: 'app/api/charlie/lead/route.ts',                     name: 'buildAgentLeadEmail' },
  { file: 'app/api/charlie/plan-email/route.ts',               name: 'buildRichPlanEmail' },
  { file: 'app/api/walliam/charlie/vip-request/route.ts',      name: 'buildAgentEmailHtml' },
  { file: 'app/api/walliam/charlie/vip-request/route.ts',      name: 'buildUserApprovalEmailHtml' },
];

const HEAD_N = 5;
const TAIL_N = 12;

function findFunc(content, name) {
  const lines = content.split('\n');
  const declRegex = new RegExp('^function\\s+' + name + '\\b');
  let declIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (declRegex.test(lines[i])) { declIdx = i; break; }
  }
  if (declIdx < 0) return { error: 'decl not found' };

  // Phase 1: state machine to find body open (paren tracking)
  let state = 'pre-paren';
  let parenDepth = 0;
  let bodyOpenIdx = -1;
  let bodyOpenCol = -1;

  outer:
  for (let i = declIdx; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, '');
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (state === 'pre-paren') {
        if (ch === '(') { parenDepth = 1; state = 'in-params'; }
      } else if (state === 'in-params') {
        if (ch === '(') parenDepth++;
        else if (ch === ')') {
          parenDepth--;
          if (parenDepth === 0) state = 'pre-body';
        }
      } else if (state === 'pre-body') {
        if (ch === '{') { bodyOpenIdx = i; bodyOpenCol = j; break outer; }
      }
    }
  }
  if (bodyOpenIdx < 0) return { error: 'body open not found (state=' + state + ')' };

  // Phase 2: brace count for body close
  let braceDepth = 1;
  let bodyCloseIdx = -1;

  outerB:
  for (let i = bodyOpenIdx; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, '');
    const startCol = i === bodyOpenIdx ? bodyOpenCol + 1 : 0;
    for (let j = startCol; j < line.length; j++) {
      const ch = line[j];
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) { bodyCloseIdx = i; break outerB; }
      }
    }
  }

  // Phase 3 (fallback): last `^}\s*$` in file after body open
  // Triggers when phase 2 gets confused by strings/comments containing
  // unbalanced { or }. Correct for the LAST function in the file.
  let usedFallback = false;
  if (bodyCloseIdx < 0) {
    for (let i = lines.length - 1; i > bodyOpenIdx; i--) {
      if (/^\}\s*$/.test(lines[i])) { bodyCloseIdx = i; usedFallback = true; break; }
    }
  }
  if (bodyCloseIdx < 0) {
    return { error: 'body close not found (braceDepth=' + braceDepth + ', no fallback match)' };
  }

  return {
    declLine: declIdx + 1,
    bodyOpenLine: bodyOpenIdx + 1,
    bodyCloseLine: bodyCloseIdx + 1,
    lineCount: bodyCloseIdx - declIdx + 1,
    fallback: usedFallback,
    lines: lines
  };
}

const out = [];
out.push('=== W3c-B2 BUILDER HEAD+TAIL (v2.1 — state machine + fallback, head ' + HEAD_N + ' + tail ' + TAIL_N + ') ===');
out.push('Generated: ' + new Date().toISOString());
out.push('HEAD assumption: be9076c (W3c-B ship commit)');
out.push('Purpose: HEAD = destructure / body opener context | TAIL = insertion point context');
out.push('');

let okCount = 0;
let errCount = 0;
let fallbackCount = 0;

for (const t of TARGETS) {
  const abs = path.join(ROOT, t.file);
  if (!fs.existsSync(abs)) {
    out.push('=== ' + t.name + ' (' + t.file + ') ===');
    out.push('ERROR: file not found');
    out.push('');
    errCount++;
    continue;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const usesCRLF = /\r\n/.test(raw);
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;
  const r = findFunc(content, t.name);
  if (r.error) {
    out.push('=== ' + t.name + ' (' + t.file + ') ===');
    out.push('ERROR: ' + r.error);
    out.push('');
    errCount++;
    continue;
  }

  if (r.fallback) fallbackCount++;
  const tag = r.fallback ? ' [FALLBACK]' : '';
  out.push('=== ' + t.name + ' (' + t.file + ') — decl L' + r.declLine +
           ', body { L' + r.bodyOpenLine +
           ', body } L' + r.bodyCloseLine +
           ' (' + r.lineCount + ' lines, LE=' + (usesCRLF ? 'CRLF' : 'LF') + tag + ') ===');

  const headEnd = Math.min(r.bodyOpenLine + HEAD_N - 1, r.bodyCloseLine);
  out.push('--- HEAD (decl L' + r.declLine + ' through L' + headEnd + ') ---');
  for (let n = r.declLine; n <= headEnd; n++) {
    out.push('L' + n + ': ' + r.lines[n - 1]);
  }

  const tailStart = Math.max(r.bodyCloseLine - TAIL_N + 1, headEnd + 1);
  if (tailStart > headEnd + 1) {
    out.push('... [' + (tailStart - headEnd - 1) + ' lines elided] ...');
  }
  out.push('--- TAIL (L' + tailStart + ' through close L' + r.bodyCloseLine + ') ---');
  for (let n = tailStart; n <= r.bodyCloseLine; n++) {
    out.push('L' + n + ': ' + r.lines[n - 1]);
  }
  out.push('');
  okCount++;
}

out.push('=== SUMMARY ===');
out.push('Targets:    ' + TARGETS.length);
out.push('OK:         ' + okCount);
out.push('Fallbacks:  ' + fallbackCount);
out.push('Errors:     ' + errCount);

const text = out.join('\n') + '\n';
const reconDir = path.join(ROOT, 'recon');
if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true });
const outPath = path.join(reconDir, 'W-LEADS-WORKBENCH-W3C-B2-BODIES.txt');
fs.writeFileSync(outPath, text, 'utf8');
process.stdout.write(text);
process.stdout.write('\n=== FILE WRITTEN: ' + outPath + ' (' + Buffer.byteLength(text, 'utf8') + ' bytes) ===\n');

if (errCount > 0) process.exit(1);