// scripts/patch-w-leads-email-tracker-v21-fix.js
//
// Corrective forward-fix for c16b1fb which claimed to update
// docs/W-LEADS-EMAIL-TRACKER.md from v20 to v21 but its anchor
// used \n (LF) while the tracker is CRLF -> indexOf returned -1
// -> process.exit(1) -> PS paste had no $LASTEXITCODE gate
// -> commit shipped misleadingly with only the script file.

const fs   = require('fs');
const path = require('path');

const TRACKER = path.join(__dirname, '..', 'docs', 'W-LEADS-EMAIL-TRACKER.md');
const EM      = '\u2014';

// ---- timestamp ----
const d   = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ---- Step 1: backup ----
const backupPath = `${TRACKER}.backup_${stamp}`;
fs.copyFileSync(TRACKER, backupPath);
console.log(`OK backup: ${path.basename(backupPath)}`);

// ---- Step 2: read + LE detect ----
const buf = fs.readFileSync(TRACKER);
const raw = buf.toString('utf8');
const crlfCount   = (raw.match(/\r\n/g) || []).length;
const lfOnlyCount = (raw.match(/(?<!\r)\n/g) || []).length;
console.log(`OK line endings: CRLF=${crlfCount} LF-only=${lfOnlyCount}`);
if (crlfCount === 0 || lfOnlyCount !== 0) {
  console.error('FATAL: expected pure CRLF tracker (CRLF>0, LF-only=0)');
  process.exit(1);
}

// Normalise for matching
const lf = raw.replace(/\r\n/g, '\n');

// ---- P1: version header at L3 ----
const p1Old = `**Version:** v20 ${EM} T6e CLOSED 2026-05-12 (T6e-1 + T6e-2 + T6e-3 single-commit close) ${EM} T6 phase FULLY CLOSED`;
const p1New = `**Version:** v21 ${EM} T7 CLOSED 2026-05-12 (cross-tenant smoke matrix 25/25 PASS, commit \`ddbe1bc\`) ${EM} T7 phase FULLY CLOSED`;

const p1Count = lf.split(p1Old).length - 1;
console.log(`P1 match count: ${p1Count}`);
if (p1Count !== 1) {
  console.error(`FATAL: P1 expected 1 match, got ${p1Count}`);
  process.exit(1);
}

// ---- P2: insert v21 entry BEFORE the v20 entry ----
const p2Old = `\n- **2026-05-12 v20 T6e CLOSED ${EM} plan integration verification`;

const v21Parts = [
  `- **2026-05-12 v21 T7 CLOSED ${EM} cross-tenant smoke matrix 25/25 PASS (commit \`ddbe1bc\`)** ${EM} T7 phase complete per OD-6=(c).`,
  `Four sub-phases shipped: T7c=8 (chain coverage), T7e=7 (audit coverage), T7f=6 (cross-tenant isolation), T7g=4 (backward-compat).`,
  `Test infrastructure only ${EM} zero touch to production code surface.`,
  `Architecture mirrors W-TERRITORY T6 smoke pattern: \`BEGIN; setup TEMP tables; per-test DO blocks; final SELECT; ROLLBACK;\` ${EM} production data untouched (full transaction rolls back on every run).`,
  `**Workstream status:** T0-T7 all CLOSED. Only Tlast remains (W-LAUNCH-TRACKER Section 4 row add + W-LEADS-UI-POLISH open).`,
  `**T8 regression sweep folds into Tlast** since T7 shipped pure test infrastructure with zero production-code surface to regress. Existing T3b/T3c 9/9 GREEN at T6e close (run_ids \`t3b1778576674179\` + \`t3c1778576719586\`) remain the active regression guard.`,
  `**Audit-trail note:** Predecessor commit \`c16b1fb\` claimed this exact tracker change but shipped only \`scripts/patch-w-leads-email-tracker-v21.js\`. The original JS patch failed silently because its P2 anchor used \\n (LF) while this tracker is CRLF, indexOf returned -1, and the surrounding PowerShell paste had no $LASTEXITCODE gate to abort the commit on script non-zero exit. This commit is the corrective forward-fix per Rule Zero ${EM} No Regressions + Comprehensive. The original broken script remains in repo at \`scripts/patch-w-leads-email-tracker-v21.js\` for audit traceability.`,
  `**Lessons logged for future patches:** (a) all PowerShell wrappers around Node patch scripts MUST include "if ($LASTEXITCODE -ne 0) { return }" between the "node ..." line and any subsequent "git add" line ${EM} no implicit success assumption; (b) all multi-file patch scripts MUST detect per-file line endings via byte read (CRLF vs LF) and either normalise for matching + re-encode for write OR match against the file native ending ${EM} never assume LF; (c) post-write CRLF/LF count verification is mandatory ${EM} round-tripping must preserve original encoding byte-for-byte except at intentional insertion sites; (d) when writing Node patch scripts from PowerShell, use single-quoted here-strings (no PS variable expansion, no escape processing) ${EM} never use double-quoted strings or expandable here-strings for JS content containing template literals.`,
  `**Files in v21 scope:** \`docs/W-LEADS-EMAIL-TRACKER.md\` (v20 -> v21 ${EM} actual diff this time), \`scripts/patch-w-leads-email-tracker-v21-fix.js\` (this corrective CRLF-aware Node patch).`,
  `**Next:** Tlast ${EM} two-row add to \`docs/W-LAUNCH-TRACKER.md\` Section 4 active-trackers table: (1) W-LEADS-EMAIL row CLOSED 2026-05-12 v21; (2) W-LEADS-UI-POLISH row OPEN scoping L1 lead_origin_route badge swap-in + L2 hierarchy chain render (area_manager + tenant_admin) + L3 activity panel discoverability.`
];
const v21Body = v21Parts.join(' ');

const p2New = `\n${v21Body}${p2Old}`;

const p2Count = lf.split(p2Old).length - 1;
console.log(`P2 match count: ${p2Count}`);
if (p2Count !== 1) {
  console.error(`FATAL: P2 expected 1 match, got ${p2Count}`);
  process.exit(1);
}

// ---- apply patches ----
let patched = lf.replace(p1Old, p1New);
patched = patched.replace(p2Old, p2New);

// ---- post-state validation ----
const p1Post = patched.split(p1Old).length - 1;
if (p1Post !== 0) { console.error(`FATAL: P1 post-state expected 0, got ${p1Post}`); process.exit(1); }

const p2Post = patched.split(p2Old).length - 1;
if (p2Post !== 1) { console.error(`FATAL: P2 post-state expected 1 (v20 unchanged), got ${p2Post}`); process.exit(1); }

const v21Marker = `**2026-05-12 v21 T7 CLOSED`;
const v21Count  = patched.split(v21Marker).length - 1;
if (v21Count !== 1) { console.error(`FATAL: v21 marker expected 1, got ${v21Count}`); process.exit(1); }

const v21VersionMarker = `**Version:** v21`;
const v21VersionCount  = patched.split(v21VersionMarker).length - 1;
if (v21VersionCount !== 1) { console.error(`FATAL: v21 version marker expected 1, got ${v21VersionCount}`); process.exit(1); }

// ---- re-encode LF -> CRLF ----
const out = patched.replace(/\n/g, '\r\n');
const outCRLF   = (out.match(/\r\n/g) || []).length;
const outLFonly = (out.match(/(?<!\r)\n/g) || []).length;
if (outLFonly !== 0) { console.error(`FATAL: post-encode LF-only count = ${outLFonly}, expected 0`); process.exit(1); }
console.log(`OK post-encode CRLF=${outCRLF} LF-only=${outLFonly}`);

fs.writeFileSync(TRACKER, out, 'utf8');

const postBytes = Buffer.byteLength(out, 'utf8');
const delta = postBytes - buf.length;
console.log(`OK tracker patched: ${buf.length} -> ${postBytes} bytes (delta +${delta})`);
console.log(`OK v21 marker inserted exactly once`);
console.log(`OK backup retained at: ${path.basename(backupPath)}`);