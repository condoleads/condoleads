const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECON_DIR = path.join(ROOT, 'recon');
const RECON_FILE = path.join(RECON_DIR, 'W-LEADS-WORKBENCH-W3C-RECON.txt');
if (!fs.existsSync(RECON_DIR)) fs.mkdirSync(RECON_DIR, { recursive: true });

const out = [];
function emit(s) { console.log(s); out.push(s); }
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }
function exists(rp) { return fs.existsSync(path.join(ROOT, rp)); }
function sizeOf(rp) { return fs.statSync(path.join(ROOT, rp)).size; }

function walkTs(absDir) {
  const r = [];
  if (!fs.existsSync(absDir)) return r;
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      r.push(...walkTs(full));
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      r.push(full);
    }
  }
  return r;
}

function grepLines(absFile, regex) {
  const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

emit('=== W3c RECON ' + new Date().toISOString() + ' ===');
emit('');

// PHASE 1
emit('--- PHASE 1: lib/actions/leads.ts ---');
const p1 = 'lib/actions/leads.ts';
if (exists(p1)) {
  const abs = path.join(ROOT, p1);
  emit('Path: ' + p1 + ' (' + sizeOf(p1) + ' bytes)');
  emit('');
  emit('buildLeadEmail line hits:');
  grepLines(abs, /buildLeadEmail/).forEach(h => emit('  L' + h.line + ': ' + h.text));
  emit('');
  emit('source_url / referer hits in file:');
  const sh = grepLines(abs, /source_url|sourceUrl|referer/i);
  if (sh.length) sh.forEach(h => emit('  L' + h.line + ': ' + h.text)); else emit('  (none)');
  emit('');
  emit('buildLeadEmail body (60-line window from declaration):');
  const allLines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (/function\s+buildLeadEmail|buildLeadEmail\s*=\s*(?:async\s*)?\(/.test(allLines[i])) { start = i; break; }
  }
  if (start >= 0) {
    const end = Math.min(start + 60, allLines.length - 1);
    for (let i = start; i <= end; i++) emit('  L' + (i + 1) + ': ' + allLines[i]);
  } else {
    emit('  declaration not matched by regex');
  }
  emit('');
  emit('buildLeadEmail callsites across app/ + lib/:');
  const allCallers = walkTs(path.join(ROOT, 'app')).concat(walkTs(path.join(ROOT, 'lib')));
  let cc = 0;
  for (const f of allCallers) {
    const hits = grepLines(f, /buildLeadEmail\s*\(/);
    for (const h of hits) { emit('  ' + rel(f) + ':L' + h.line + ': ' + h.text); cc++; }
  }
  if (cc === 0) emit('  (no call-site hits)');
} else {
  emit('MISSING: ' + p1);
}
emit('');

// PHASE 2
emit('--- PHASE 2: 8 inline builders in 5 routes ---');
const builders = [
  { name: 'buildContactEmail',           route: 'app/api/walliam/contact' },
  { name: 'buildUserConfirmationEmail',  route: 'app/api/charlie/appointment' },
  { name: 'buildAgentNotificationEmail', route: 'app/api/charlie/appointment' },
  { name: 'buildUserPlanEmail',          route: 'app/api/charlie/lead' },
  { name: 'buildAgentLeadEmail',         route: 'app/api/charlie/lead' },
  { name: 'buildRichPlanEmail',          route: 'app/api/charlie/plan-email' },
  { name: 'emailHtml',                   route: 'app/api/walliam/charlie/vip-request' },
  { name: 'buildUserApprovalEmailHtml',  route: 'app/api/walliam/charlie/vip-request' }
];
for (const b of builders) {
  emit('');
  emit('Builder: ' + b.name + '  (expected in ' + b.route + ')');
  const abs = path.join(ROOT, b.route);
  if (!fs.existsSync(abs)) { emit('  ROUTE DIR MISSING: ' + b.route); continue; }
  const files = walkTs(abs);
  const re = new RegExp('\\b' + b.name + '\\b');
  let found = false;
  for (const f of files) {
    const hits = grepLines(f, re);
    if (hits.length) {
      found = true;
      emit('  In ' + rel(f) + ' (' + fs.statSync(f).size + ' bytes):');
      hits.forEach(h => emit('    L' + h.line + ': ' + h.text));
    }
  }
  if (!found) emit('  NOT FOUND in route tree');
}
emit('');

// PHASE 3
emit('--- PHASE 3: 3 estimator routes (F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED) ---');
const estRoutes = [
  'app/api/walliam/estimator/vip-request',
  'app/api/walliam/estimator/vip-approve',
  'app/api/walliam/estimator/vip-questionnaire'
];
for (const r of estRoutes) {
  emit('');
  emit('Route: ' + r);
  const abs = path.join(ROOT, r);
  if (!fs.existsSync(abs)) { emit('  MISSING: ' + r); continue; }
  const files = walkTs(abs);
  for (const f of files) {
    emit('  ' + rel(f) + ' (' + fs.statSync(f).size + ' bytes)');
    emit('    email hits (resend|sendEmail|emailHtml|Resend|buildLeadEmail|@resend):');
    const eh = grepLines(f, /resend|sendEmail|emailHtml|Resend|buildLeadEmail|@resend/);
    if (eh.length) eh.forEach(h => emit('      L' + h.line + ': ' + h.text)); else emit('      (no email hits)');
    emit('    source_url / referer hits:');
    const sh = grepLines(f, /source_url|sourceUrl|referer/i);
    if (sh.length) sh.forEach(h => emit('      L' + h.line + ': ' + h.text)); else emit('      (none)');
    emit('    leads-table / leads-insert hits:');
    const ih = grepLines(f, /from\(['"`]leads['"`]\)|insert.*lead|leads.*insert/i);
    if (ih.length) ih.forEach(h => emit('      L' + h.line + ': ' + h.text)); else emit('      (no leads-table hits)');
  }
}
emit('');

// PHASE 4
emit('--- PHASE 4: source_url corpus-wide ---');
const allSrc = walkTs(path.join(ROOT, 'app')).concat(walkTs(path.join(ROOT, 'lib')));
const srcHits = [];
for (const f of allSrc) {
  const hits = grepLines(f, /source_url|sourceUrl/);
  for (const h of hits) srcHits.push('  ' + rel(f) + ':L' + h.line + ': ' + h.text);
}
emit('Total source_url hits: ' + srcHits.length + ' across ' + allSrc.length + ' .ts files');
srcHits.forEach(s => emit(s));
emit('');

// PHASE 5
emit('--- PHASE 5: referer captures ---');
let refCount = 0;
for (const f of allSrc) {
  const hits = grepLines(f, /referer/i);
  for (const h of hits) { emit('  ' + rel(f) + ':L' + h.line + ': ' + h.text); refCount++; }
}
if (refCount === 0) emit('  (none)');
emit('');

// PHASE 6
emit('--- PHASE 6: leads.source_url in generated types ---');
const typeFiles = [
  'types/database.types.ts',
  'lib/database.types.ts',
  'lib/supabase/database.types.ts',
  'lib/admin-homes/database.types.ts'
];
let anyType = false;
for (const tf of typeFiles) {
  if (exists(tf)) {
    anyType = true;
    emit('  ' + tf + ' exists (' + sizeOf(tf) + ' bytes)');
    const sh = grepLines(path.join(ROOT, tf), /source_url/);
    if (sh.length) sh.forEach(h => emit('    L' + h.line + ': ' + h.text)); else emit('    source_url: NOT in this types file');
  }
}
if (!anyType) emit('  (none of the candidate type files exist)');
emit('');

emit('=== RECON COMPLETE ===');
emit('Output: recon/W-LEADS-WORKBENCH-W3C-RECON.txt');

fs.writeFileSync(RECON_FILE, out.join('\n') + '\n', 'utf8');