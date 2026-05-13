const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

const TARGETS = [
  { file: 'app/api/walliam/estimator/vip-request/route.ts',       names: ['buildApprovalEmailHtml', 'buildUserApprovalEmailHtml'] },
  { file: 'app/api/walliam/estimator/vip-questionnaire/route.ts', names: ['buildQuestionnaireEmailHtml'] },
  { file: 'app/api/walliam/estimator/vip-approve/route.ts',       names: ['buildUserApprovalEmailHtml'] }
];

const out = [];
const e = s => out.push(s);

for (const t of TARGETS) {
  const abs = path.join(ROOT, t.file);
  const raw = fs.readFileSync(abs, 'utf8');
  const crlf = /\r\n/.test(raw);
  const lines = (crlf ? raw.replace(/\r\n/g, '\n') : raw).split('\n');

  e('===== ' + t.file + ' (' + lines.length + ' lines, ' + (crlf ? 'CRLF' : 'LF') + ') =====');

  for (const n of t.names) {
    // Find decl line first to exclude from call hits
    let declIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp('^function\\s+' + n + '\\b').test(lines[i])) { declIdx = i; break; }
    }
    // Find call sites: lines containing `<name>(` that are NOT the decl
    const calls = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === declIdx) continue;
      if (new RegExp('\\b' + n + '\\s*\\(').test(lines[i])) calls.push(i);
    }
    e('--- ' + n + ' (decl L' + (declIdx + 1) + ', calls at: ' + (calls.length ? calls.map(i => 'L' + (i + 1)).join(',') : 'NONE') + ') ---');
    for (const c of calls) {
      const start = Math.max(0, c - 5);
      const end = Math.min(lines.length - 1, c + 25);
      e('  ~~~ call context L' + (start + 1) + '-L' + (end + 1) + ' ~~~');
      for (let k = start; k <= end; k++) e('  L' + (k + 1) + ': ' + lines[k]);
    }
  }

  // For each file, also find email-send mechanisms (sendTenantEmail, resend.emails.send, sendActivityEmail)
  const sendPatterns = [
    /\bsendTenantEmail\s*\(/,
    /\bresend\.emails\.send\s*\(/,
    /\bsendActivityEmail\s*\(/
  ];
  const sendHits = [];
  for (let i = 0; i < lines.length; i++) {
    for (const p of sendPatterns) if (p.test(lines[i])) { sendHits.push(i); break; }
  }
  e('--- send mechanisms at: ' + (sendHits.length ? sendHits.map(i => 'L' + (i + 1)).join(',') : 'NONE') + ' ---');
  for (const s of sendHits) {
    const start = Math.max(0, s - 2);
    const end = Math.min(lines.length - 1, s + 22);
    e('  ~~~ send context L' + (start + 1) + '-L' + (end + 1) + ' ~~~');
    for (let k = start; k <= end; k++) e('  L' + (k + 1) + ': ' + lines[k]);
  }

  e('');
}

// vip-approve specific: find where vip_request record is read (for sourceUrl source)
const VA = 'app/api/walliam/estimator/vip-approve/route.ts';
const vaRaw = fs.readFileSync(path.join(ROOT, VA), 'utf8');
const vaLines = (/\r\n/.test(vaRaw) ? vaRaw.replace(/\r\n/g, '\n') : vaRaw).split('\n');

e('===== vip-approve: vip_request record read locations =====');
const vrHits = [];
for (let i = 0; i < vaLines.length; i++) {
  if (/\.from\(\s*['"]vip_requests?['"]\s*\)/.test(vaLines[i]) ||
      /\bvipRequest\s*[.,]/.test(vaLines[i]) ||
      /\bvip_request\b/.test(vaLines[i]) ||
      /\bpage_url\b/.test(vaLines[i])) {
    vrHits.push(i);
  }
}
e('vip_request / page_url refs at: ' + (vrHits.length ? vrHits.map(i => 'L' + (i + 1)).join(',') : 'NONE'));
for (const i of vrHits.slice(0, 8)) {
  e('  L' + (i + 1) + ': ' + vaLines[i]);
}

const text = out.join('\n') + '\n';
const odir = path.join(ROOT, 'recon');
const op = path.join(odir, 'W-LEADS-WORKBENCH-W3C-C-RECON-2.txt');
fs.writeFileSync(op, text, 'utf8');
process.stdout.write(text);
process.stdout.write('=== FILE: ' + op + ' (' + Buffer.byteLength(text, 'utf8') + ' bytes) ===\n');