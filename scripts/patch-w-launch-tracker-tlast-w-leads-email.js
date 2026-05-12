// scripts/patch-w-launch-tracker-tlast-w-leads-email.js
//
// Tlast for W-LEADS-EMAIL: add row to docs/W-LAUNCH-TRACKER.md Section 4
// active-trackers table, append entry to Closed tickets reference list,
// flip L220 Post-P0 backlog hygiene line to CLOSED-with-residual format,
// add v14 status log entry. Target file is LF-only (CRLF=0, LF=221).

const fs   = require('fs');
const path = require('path');

const TRACKER = path.join(__dirname, '..', 'docs', 'W-LAUNCH-TRACKER.md');
const EM      = '\u2014';
const CHECK   = '\u2705';

// ---- timestamp ----
const d   = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ---- backup ----
const backupPath = `${TRACKER}.backup_${stamp}`;
fs.copyFileSync(TRACKER, backupPath);
console.log(`OK backup: ${path.basename(backupPath)}`);

// ---- read + LE detect ----
const buf = fs.readFileSync(TRACKER);
const raw = buf.toString('utf8');
const crlfCount   = (raw.match(/\r\n/g) || []).length;
const lfOnlyCount = (raw.match(/(?<!\r)\n/g) || []).length;
console.log(`OK line endings: CRLF=${crlfCount} LF-only=${lfOnlyCount}`);
if (crlfCount !== 0 || lfOnlyCount === 0) {
  console.error('FATAL: expected pure LF tracker (CRLF=0, LF-only>0)');
  process.exit(1);
}

let text = raw;

// ---- P1: Add W-LEADS-EMAIL row at end of Section 4 active-trackers table ----
const p1Old = `T2b (percentage mode) remains optional/parallel. |\n\n### Closed tickets (reference only)`;
const newRow = `| \`docs/W-LEADS-EMAIL-TRACKER.md\` | CLOSED 2026-05-12 (T7 smoke 25/25 commit \`ddbe1bc\`; v21 close commit \`a614b4f\`) | F55/P2-4 hardcoded admin email literals (defer post-launch hygiene) |`;
const p1New = `T2b (percentage mode) remains optional/parallel. |\n${newRow}\n\n### Closed tickets (reference only)`;

const p1Count = text.split(p1Old).length - 1;
console.log(`P1 match count: ${p1Count}`);
if (p1Count !== 1) { console.error(`FATAL: P1 expected 1, got ${p1Count}`); process.exit(1); }

// ---- P2: Append W-LEADS-EMAIL to Closed tickets reference list ----
const p2Old = `- W-TERRITORY (2026-05-09)\n\n---`;
const p2New = `- W-TERRITORY (2026-05-09)\n- W-LEADS-EMAIL (2026-05-12)\n\n---`;

const p2Count = text.split(p2Old).length - 1;
console.log(`P2 match count: ${p2Count}`);
if (p2Count !== 1) { console.error(`FATAL: P2 expected 1, got ${p2Count}`); process.exit(1); }

// ---- P3: Flip L220 Post-P0 backlog hygiene line ----
const p3Old = `- W-LEADS-EMAIL: F55 / P2-4 ${EM} replace remaining hardcoded admin email literals with env var (hygiene).`;
const p3New = `- W-LEADS-EMAIL: ${CHECK} CLOSED 2026-05-12 (v21 FINAL ${EM} all 8 phases T0-T7 shipped; cross-tenant smoke matrix 25/25 PASS; tracker \`docs/W-LEADS-EMAIL-TRACKER.md\` is now reference-only). F55/P2-4 (replace remaining hardcoded admin email literals with env var) deferred post-launch as known hygiene item.`;

const p3Count = text.split(p3Old).length - 1;
console.log(`P3 match count: ${p3Count}`);
if (p3Count !== 1) { console.error(`FATAL: P3 expected 1, got ${p3Count}`); process.exit(1); }

// ---- P4: Insert v14 status log entry between v13 and Post-P0 backlog ----
const p4Old = `\n\n**Post-P0 backlog** (not blocking launch`;

const v14Parts = [
  `- **2026-05-12 v14** ${EM} **W-LEADS-EMAIL WORKSTREAM CLOSED.**`,
  `All eight phases shipped: T0 recon, T1 OD lock, T2 schema + helpers, T3a/T3b/T3c smoke harness, T4 audit + T5 form coverage, T6a-T6e route refactors + bug fixes, T6f-A/B/C brand-strings + URL refactor across 9 routes + 2 helpers, T7 cross-tenant smoke matrix 25/25 PASS.`,
  `v21 tracker close at commit \`ddbe1bc\` (T7 smoke matrix shipped) + corrective forward-fix at commit \`a614b4f\` (after c16b1fb shipped malformed tracker due to LF anchor matched against CRLF file + missing $LASTEXITCODE gate in surrounding PowerShell paste ${EM} see \`docs/W-LEADS-EMAIL-TRACKER.md\` v21 status log entry for full failure-mode audit trail).`,
  `**Section 4 active-trackers table updated:** W-LEADS-EMAIL row added as CLOSED 2026-05-12 referencing both T7 ship and v21 forward-fix commits.`,
  `**Closed tickets reference list updated:** \`- W-LEADS-EMAIL (2026-05-12)\` appended after W-TERRITORY (2026-05-09).`,
  `**Post-P0 backlog L220 flipped:** prior OPEN-hygiene line replaced with W-TERRITORY-style closed-with-residual-deferred format. F55/P2-4 (hardcoded admin email literals ${EM} env var swap) carried forward as known post-launch hygiene item, non-blocker for first paid customer.`,
  `**Workstream-internal status** (per \`docs/W-LEADS-EMAIL-TRACKER.md\` v21): T8 regression sweep folded into Tlast since T7 shipped pure test infrastructure with zero production-code surface to regress; existing T3b/T3c 9/9 GREEN at T6e close (run_ids \`t3b1778576674179\` + \`t3c1778576719586\`) remain the active regression guard.`,
  `**Lessons logged from c16b1fb failure mode** (preserved in W-LEADS-EMAIL-TRACKER v21 for future workstreams): (a) PowerShell wrappers around Node patch scripts MUST $LASTEXITCODE-gate every step between \`node ...\` and any subsequent \`git add\`; (b) Node patches MUST detect per-file line endings via byte read before matching ${EM} CRLF tracker matched against LF anchor returns indexOf -1 silently; (c) post-write LE-preservation verification is mandatory (CRLF count must match input); (d) JS content delivered via PowerShell MUST use single-quoted here-strings (no PS variable expansion, no escape processing) to avoid PS-expanding JS template literals.`,
  `**W-LEADS-UI-POLISH workstream opens next** ${EM} scope: L1 \`lead_origin_route\` badge swap-in on \`AdminHomesLeadsClient\` L373-376 (T2c-shipped + T6b-wired column currently unused by UI ${EM} Source column still uses raw \`lead.source\` dictionary lookup); L2 hierarchy chain render (currently only \`manager.full_name\` rendered at L388-395; \`area_manager_id\` + \`tenant_admin_id\` columns exist on row but no joins fetch names); L3 activity panel discoverability (currently hidden behind per-row amber Activity button at L443 ${EM} proposal: count badge on row + auto-expand for hot/warm engagement). UI-only polish ${EM} no schema, RPC, or API route changes anticipated. Sized in hours.`
];
const v14Body = v14Parts.join(' ');
const p4New = `\n\n${v14Body}\n\n**Post-P0 backlog** (not blocking launch`;

const p4Count = text.split(p4Old).length - 1;
console.log(`P4 match count: ${p4Count}`);
if (p4Count !== 1) { console.error(`FATAL: P4 expected 1, got ${p4Count}`); process.exit(1); }

// ---- apply all patches ----
text = text.replace(p1Old, p1New);
text = text.replace(p2Old, p2New);
text = text.replace(p3Old, p3New);
text = text.replace(p4Old, p4New);

// ---- post-state validation: each anchor consumed exactly once ----
if (text.split(p1Old).length - 1 !== 0) { console.error('FATAL: P1 post-state expected 0'); process.exit(1); }
if (text.split(p2Old).length - 1 !== 0) { console.error('FATAL: P2 post-state expected 0'); process.exit(1); }
if (text.split(p3Old).length - 1 !== 0) { console.error('FATAL: P3 post-state expected 0'); process.exit(1); }
if (text.split(p4Old).length - 1 !== 1) { console.error('FATAL: P4 post-state expected 1 (p4Old is suffix of p4New by design -- insert-before-anchor pattern)'); process.exit(1); }

// ---- new content marker checks ----
const newRowMarkerCount = text.split('W-LEADS-EMAIL-TRACKER.md`').length - 1;
console.log(`W-LEADS-EMAIL-TRACKER.md backtick refs: ${newRowMarkerCount} (expect >=3: Section 4 row + L220 backlog + v14 entry)`);
if (newRowMarkerCount < 3) { console.error(`FATAL: expected >=3 W-LEADS-EMAIL-TRACKER.md backtick refs, got ${newRowMarkerCount}`); process.exit(1); }

const v14MarkerCount = text.split('**2026-05-12 v14**').length - 1;
console.log(`v14 marker count: ${v14MarkerCount}`);
if (v14MarkerCount !== 1) { console.error(`FATAL: v14 marker expected 1, got ${v14MarkerCount}`); process.exit(1); }

const closedTicketCount = text.split('- W-LEADS-EMAIL (2026-05-12)').length - 1;
console.log(`Closed-ticket entry count: ${closedTicketCount}`);
if (closedTicketCount !== 2) { console.error(`FATAL: closed-ticket entry expected 2 (1 closed-list line + 1 v14 prose reference), got ${closedTicketCount}`); process.exit(1); }

// ---- verify LF-only preserved (no CRLF accidentally introduced) ----
const outCRLF   = (text.match(/\r\n/g) || []).length;
const outLFonly = (text.match(/(?<!\r)\n/g) || []).length;
if (outCRLF !== 0) { console.error(`FATAL: post-write CRLF count = ${outCRLF}, expected 0 (LF-only preserved)`); process.exit(1); }
console.log(`OK post-write: CRLF=${outCRLF} LF-only=${outLFonly}`);

fs.writeFileSync(TRACKER, text, 'utf8');

const postBytes = Buffer.byteLength(text, 'utf8');
const delta = postBytes - buf.length;
console.log(`OK tracker patched: ${buf.length} -> ${postBytes} bytes (delta +${delta})`);
console.log(`OK 4 anchors all matched 1x and consumed cleanly`);
console.log(`OK backup retained at: ${path.basename(backupPath)}`);