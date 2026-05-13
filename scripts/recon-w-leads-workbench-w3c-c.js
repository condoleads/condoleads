const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

const FILES = [
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts'
];

const out = [];
const e = s => out.push(s);

for (const f of FILES) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) { e('=== ' + f + ' === NOT FOUND'); e(''); continue; }
  const raw = fs.readFileSync(abs, 'utf8');
  const crlf = /\r\n/.test(raw);
  const content = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  const lines = content.split('\n');

  e('===== ' + f + ' =====');
  e('lines: ' + lines.length + ', LE: ' + (crlf ? 'CRLF' : 'LF'));

  const hi = lines.findIndex(l => /import\s*\{[^}]*\bheaders\b[^}]*\}\s*from\s*['"]next\/headers['"]/.test(l));
  e('headers import: ' + (hi >= 0 ? 'YES@L' + (hi + 1) : 'NO'));

  const pc = lines.findIndex(l => /headers\(\)\.get\(\s*['"]referer['"]\s*\)/.test(l));
  e('referer capture: ' + (pc >= 0 ? 'YES@L' + (pc + 1) + ' :: ' + lines[pc].trim() : 'NO'));

  const leadsIns = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\.from\(\s*['"]leads['"]\s*\)/.test(lines[i])) leadsIns.push(i);
  }
  e('leads from() at: ' + (leadsIns.length ? leadsIns.map(i => 'L' + (i + 1)).join(',') : 'NONE'));
  for (const i of leadsIns) {
    const end = Math.min(i + 15, lines.length - 1);
    e('--- leads context L' + (i + 1) + '-L' + (end + 1) + ' ---');
    for (let k = i; k <= end; k++) e('  L' + (k + 1) + ': ' + lines[k]);
  }

  const srcUrlIns = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*source_url\s*:/.test(lines[i])) srcUrlIns.push(i);
  }
  e('source_url: in INSERT at: ' + (srcUrlIns.length ? srcUrlIns.map(i => 'L' + (i + 1) + ' :: ' + lines[i].trim()).join(' | ') : 'NONE'));

  const builders = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^function\s+(build\w+)\b/);
    if (m) builders.push({ name: m[1], idx: i });
  }
  e('named builders: ' + (builders.length ? builders.map(b => b.name + '@L' + (b.idx + 1)).join(', ') : 'NONE'));

  for (const b of builders) {
    let state = 'pre-paren', pd = 0, boIdx = -1, bcIdx = -1;
    outer: for (let i = b.idx; i < lines.length; i++) {
      const line = lines[i].replace(/\/\/.*$/, '');
      for (const ch of line) {
        if (state === 'pre-paren') { if (ch === '(') { pd = 1; state = 'in-params'; } }
        else if (state === 'in-params') { if (ch === '(') pd++; else if (ch === ')') { pd--; if (pd === 0) state = 'pre-body'; } }
        else if (state === 'pre-body') { if (ch === '{') { boIdx = i; state = 'in-body'; break outer; } }
      }
    }
    if (boIdx < 0) { e('  [' + b.name + '] body open not found'); continue; }
    let bd = 1;
    outerB: for (let i = boIdx + 1; i < lines.length; i++) {
      const line = lines[i].replace(/\/\/.*$/, '');
      for (const ch of line) {
        if (ch === '{') bd++;
        else if (ch === '}') { bd--; if (bd === 0) { bcIdx = i; break outerB; } }
      }
    }
    let fb = false;
    if (bcIdx < 0) {
      for (let i = lines.length - 1; i > boIdx; i--) if (/^\}\s*$/.test(lines[i])) { bcIdx = i; fb = true; break; }
    }
    if (bcIdx < 0) { e('  [' + b.name + '] body close not found'); continue; }

    const span = bcIdx - b.idx + 1;
    e('--- ' + b.name + ' decl L' + (b.idx + 1) + ', body L' + (boIdx + 1) + '-L' + (bcIdx + 1) + ' (' + span + ' lines' + (fb ? ', FALLBACK' : '') + ') ---');

    const sigStr = lines.slice(b.idx, boIdx + 1).join('\n');
    const bodyStr = lines.slice(boIdx, bcIdx + 1).join('\n');
    e('  sig.sourceUrl: ' + /\bsourceUrl\b/.test(sigStr) + ' | sig.pageUrl: ' + /\bpageUrl\b/.test(sigStr) + ' | sig.page_url: ' + /\bpage_url\b/.test(sigStr));
    e('  body.${sourceUrl: ' + /\$\{sourceUrl/.test(bodyStr) + ' | body.${pageUrl: ' + /\$\{pageUrl/.test(bodyStr) + ' | body.${data.sourceUrl: ' + /\$\{data\.sourceUrl/.test(bodyStr) + ' | body.${data.pageUrl: ' + /\$\{data\.pageUrl/.test(bodyStr));

    e('  HEAD (L' + (b.idx + 1) + '-L' + Math.min(b.idx + 4, bcIdx) + '):');
    for (let k = b.idx; k <= Math.min(b.idx + 4, bcIdx); k++) e('    L' + (k + 1) + ': ' + lines[k]);
    const ts = Math.max(bcIdx - 12, b.idx + 5);
    if (ts > b.idx + 5) e('    ... [' + (ts - b.idx - 5) + ' elided] ...');
    e('  TAIL (L' + (ts + 1) + '-L' + (bcIdx + 1) + '):');
    for (let k = ts; k <= bcIdx; k++) e('    L' + (k + 1) + ': ' + lines[k]);
  }

  const sendBlocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (/resend\.emails\.send\s*\(/.test(lines[i])) sendBlocks.push(i);
  }
  e('resend send blocks: ' + (sendBlocks.length ? sendBlocks.map(i => 'L' + (i + 1)).join(',') : 'NONE'));
  for (const i of sendBlocks) {
    const end = Math.min(i + 15, lines.length - 1);
    e('--- send context L' + (i + 1) + '-L' + (end + 1) + ' ---');
    for (let k = i; k <= end; k++) e('  L' + (k + 1) + ': ' + lines[k]);
  }

  const inlineHtmlBacktick = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\bhtml:\s*`/.test(lines[i])) inlineHtmlBacktick.push(i);
  }
  e('inline `html: \\`` (not from named builder): ' + (inlineHtmlBacktick.length ? inlineHtmlBacktick.map(i => 'L' + (i + 1)).join(',') : 'NONE'));

  e('');
}

const text = out.join('\n') + '\n';
const odir = path.join(ROOT, 'recon');
if (!fs.existsSync(odir)) fs.mkdirSync(odir, { recursive: true });
const op = path.join(odir, 'W-LEADS-WORKBENCH-W3C-C-RECON.txt');
fs.writeFileSync(op, text, 'utf8');
process.stdout.write(text);
process.stdout.write('=== FILE: ' + op + ' (' + Buffer.byteLength(text, 'utf8') + ' bytes) ===\n');