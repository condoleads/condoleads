// scripts/patch-w-leads-ui-polish-open.js
//
// Opens W-LEADS-UI-POLISH workstream. Two outputs:
//   (1) Creates docs/W-LEADS-UI-POLISH-TRACKER.md (new file, LF-only)
//   (2) Patches docs/W-LAUNCH-TRACKER.md (LF-only):
//        P1 -- Section 4 row insert (after W-LEADS-EMAIL CLOSED row)
//        P2 -- v15 status log entry (between v14 and Post-P0 backlog)
//
// All em-dashes via \u2014 escape -- no PS heredoc em-dash exposure.

const fs   = require('fs');
const path = require('path');

const NEW_TRACKER = path.join(__dirname, '..', 'docs', 'W-LEADS-UI-POLISH-TRACKER.md');
const MASTER      = path.join(__dirname, '..', 'docs', 'W-LAUNCH-TRACKER.md');
const EM          = '\u2014';

// ---- timestamp + master backup ----
const d   = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const backupPath = `${MASTER}.backup_${stamp}`;
fs.copyFileSync(MASTER, backupPath);
console.log(`OK master backup: ${path.basename(backupPath)}`);

// ---- Refuse to overwrite existing new tracker ----
if (fs.existsSync(NEW_TRACKER)) {
  console.error(`FATAL: ${NEW_TRACKER} already exists -- refusing to overwrite`);
  process.exit(1);
}

// ---- Build new tracker file content ----
const newTrackerContent = [
  `# W-LEADS-UI-POLISH-TRACKER`,
  ``,
  `**Version:** v1 ${EM} OPEN ${EM} scope locked, L1/L2/L3 phases unstarted`,
  ``,
  `**Started:** 2026-05-12  `,
  `**Owner:** Shah (sole dev)  `,
  `**Status:** OPEN ${EM} three UI-only polish phases identified during W-LEADS-EMAIL closure recon. Sized in hours; no schema, RPC, or API route changes anticipated.`,
  ``,
  `## Why this exists`,
  ``,
  `During W-LEADS-EMAIL closure recon at the leads admin UI (\`components/admin-homes/AdminHomesLeadsClient.tsx\`), three UX/render gaps surfaced that affect agent usability but are NOT data-plumbing bugs:`,
  ``,
  `1. The categorized \`lead_origin_route\` column shipped in W-LEADS-EMAIL T2c and wired in T6b is not used by the leads UI at all. Source rendering still uses a \`SOURCE_LABELS[lead.source]\` dictionary lookup against the raw \`source\` column at L373-376. Any source string not in the dict shows up as a stripped raw value via the fallback \`lead.source?.replace('walliam_', '')\`.`,
  ``,
  `2. Only the immediate \`manager\` is rendered in the hierarchy column at L388-395. The \`area_manager_id\` and \`tenant_admin_id\` columns exist on the row (page query uses \`select('*')\`) but the page join doesn't fetch their names, and the client doesn't render them. A lead handled by a managed agent shows only one level of the chain.`,
  ``,
  `3. The Activity panel exists and works (L455-486 renders engagement score + timeline correctly) but is hidden behind a per-row amber Activity button at L443. Clicking toggles \`expandedLead === lead.id + '-activity'\` and fetches via \`/api/admin-homes/activities\`. The discoverability problem: an agent has to click every row to see engagement state ${EM} hot/warm leads aren't surfaced at-a-glance.`,
  ``,
  `These are UI polish items, not schema/route bugs. Bundled as a single short workstream rather than scattered across post-launch tickets.`,
  ``,
  `## Scope contract`,
  ``,
  `**In scope:**`,
  ``,
  `- **L1:** lead_origin_route badge swap-in on \`AdminHomesLeadsClient\` L373-376 (use \`deriveLeadOriginRoute(source)\` helper from \`lib/utils/lead-origin-route.ts\` shipped in W-LEADS-EMAIL T6b, plus per-route badge labels and color coding).`,
  `- **L2:** hierarchy chain render extending L388-395 to render area_manager and tenant_admin levels when present. Requires page join extension (add \`area_manager:agents!leads_area_manager_id_fkey(...)\` and \`tenant_admin:agents!leads_tenant_admin_id_fkey(...)\` joins in the page query) plus client-side conditional rendering with arrow indicators between levels.`,
  `- **L3:** activity panel discoverability. Two sub-changes: (a) engagement count badge on row (count of activities per lead, fetched in bulk on page load); (b) auto-expand activity panel for leads with hot/warm engagement at top of list.`,
  ``,
  `**Out of scope:**`,
  ``,
  `- Any schema migration (columns already exist).`,
  `- Any new API routes or RPCs.`,
  `- Any change to \`/api/admin-homes/activities\` endpoint contract.`,
  `- Any change to data sync, lead capture, or email flow (all owned by W-LEADS-EMAIL, now closed at v21).`,
  `- Mobile-specific responsive polish (separate workstream if surfaced).`,
  ``,
  `## Outcomes Desired`,
  ``,
  `- **OD-1:** Source column displays the categorized \`lead_origin_route\` value with per-route labels and colors. The raw \`source\` column remains the underlying truth but is no longer the primary display field.`,
  `- **OD-2:** Hierarchy column renders the full known chain (manager ${EM} area_manager ${EM} tenant_admin) when those rows exist on the lead. Missing levels degrade gracefully (only what exists is shown).`,
  `- **OD-3:** At-a-glance engagement state via a count badge on each row + auto-expand for hot/warm leads. Agent can triage 50+ leads without per-row clicks for the high-priority ones.`,
  ``,
  `## Phases`,
  ``,
  `| Phase | Title | Status | Estimated size | Notes |`,
  `|---|---|---|---|---|`,
  `| L1 | lead_origin_route badge swap-in | OPEN | 30-45 min | Helper already imported by \`lib/actions/leads.ts\`; client-side substitution + label/color map. |`,
  `| L2 | hierarchy chain render | OPEN | 1-2 hr | Page join extension (2 new \`agents!fk\` joins) + client conditional render with arrow indicators. |`,
  `| L3 | activity panel discoverability | OPEN | 1-2 hr | Engagement count fetch (bulk in page server component) + auto-expand logic for top-of-list hot/warm leads. |`,
  `| Lclose | Workstream close + W-LAUNCH-TRACKER row flip | OPEN | 10 min | After L1/L2/L3 ship. Mirrors W-LEADS-EMAIL Tlast pattern. |`,
  ``,
  `## Phase workflow`,
  ``,
  `Each phase ships independently in sequence: L1 ${EM} L2 ${EM} L3 ${EM} Lclose. Per Rule Zero ${EM} Comprehensive: each phase = probe ${EM} patch (with timestamped backup) ${EM} TSC clean (\`npx tsc --noEmit\`) ${EM} local smoke at \`http://localhost:3000/admin-homes/leads\` (with \`DEV_TENANT_DOMAIN=walliam.ca\` in \`.env.local\`) ${EM} git commit ${EM} git push to origin/main. Lclose flips this tracker's Section 4 row in \`docs/W-LAUNCH-TRACKER.md\` to CLOSED with phase ship hashes referenced.`,
  ``,
  `## Status log`,
  ``,
  `- **2026-05-12 v1** ${EM} Tracker created. Scope locked from W-LEADS-EMAIL closure recon at \`components/admin-homes/AdminHomesLeadsClient.tsx\`. Three UI polish phases identified: L1 (Source badge swap-in at L373-376), L2 (hierarchy chain render at L388-395), L3 (Activity panel discoverability at L443/L455-486). All sized in hours; no schema/RPC/API changes anticipated. Master tracker \`docs/W-LAUNCH-TRACKER.md\` Section 4 has corresponding OPEN row + v15 status log entry shipped in the same commit.`,
  ``
].join('\n');

fs.writeFileSync(NEW_TRACKER, newTrackerContent, 'utf8');
const newBytes = Buffer.byteLength(newTrackerContent, 'utf8');
console.log(`OK new tracker file written: ${newBytes} bytes`);

// Verify LF-only on new file
const ntBuf = fs.readFileSync(NEW_TRACKER);
const ntRaw = ntBuf.toString('utf8');
const ntCRLF = (ntRaw.match(/\r\n/g) || []).length;
const ntLF   = (ntRaw.match(/(?<!\r)\n/g) || []).length;
console.log(`OK new tracker LE: CRLF=${ntCRLF} LF=${ntLF}`);
if (ntCRLF !== 0) { console.error('FATAL: new tracker has CRLF'); process.exit(1); }

// ---- Read + patch master tracker ----
const buf = fs.readFileSync(MASTER);
const raw = buf.toString('utf8');
const crlfCount   = (raw.match(/\r\n/g) || []).length;
const lfOnlyCount = (raw.match(/(?<!\r)\n/g) || []).length;
console.log(`OK master LE: CRLF=${crlfCount} LF-only=${lfOnlyCount}`);
if (crlfCount !== 0 || lfOnlyCount === 0) {
  console.error('FATAL: expected pure LF master tracker');
  process.exit(1);
}

let text = raw;

// ---- P1: Insert W-LEADS-UI-POLISH row after W-LEADS-EMAIL row ----
const p1Old = `F55/P2-4 hardcoded admin email literals (defer post-launch hygiene) |\n\n### Closed tickets (reference only)`;
const newRow = `| \`docs/W-LEADS-UI-POLISH-TRACKER.md\` | OPEN 2026-05-12 (v1; scope locked) | L1 lead_origin_route badge swap-in + L2 hierarchy chain render (area_manager + tenant_admin) + L3 activity panel discoverability |`;
const p1New = `F55/P2-4 hardcoded admin email literals (defer post-launch hygiene) |\n${newRow}\n\n### Closed tickets (reference only)`;

const p1Count = text.split(p1Old).length - 1;
console.log(`P1 match count: ${p1Count}`);
if (p1Count !== 1) { console.error(`FATAL: P1 expected 1 match, got ${p1Count}`); process.exit(1); }

// ---- P2: Insert v15 status log entry between v14 and Post-P0 backlog ----
const p2Old = `\n\n**Post-P0 backlog** (not blocking launch`;

const v15Parts = [
  `- **2026-05-12 v15** ${EM} **W-LEADS-UI-POLISH WORKSTREAM OPENED.**`,
  `New short workstream tracker created at \`docs/W-LEADS-UI-POLISH-TRACKER.md\` covering three UI polish items surfaced during W-LEADS-EMAIL closure recon at the leads admin UI (\`components/admin-homes/AdminHomesLeadsClient.tsx\`).`,
  `**L1 (lead_origin_route badge swap-in):** Source column at L373-376 currently does a \`SOURCE_LABELS[lead.source]\` dict lookup against the raw \`source\` column. The categorized \`lead_origin_route\` column (shipped W-LEADS-EMAIL T2c, wired write-time T6b) is unused by the UI. Substitute the badge to use \`deriveLeadOriginRoute(source)\` from \`lib/utils/lead-origin-route.ts\` with per-route labels and colors. Sized 30-45 min.`,
  `**L2 (hierarchy chain render):** Currently only \`manager.full_name\` rendered at L388-395 with an arrow indicator. \`area_manager_id\` and \`tenant_admin_id\` columns exist on the row (page query uses \`select('*')\`) but no joins fetch their names. Extend page join with \`area_manager:agents!leads_area_manager_id_fkey(...)\` + \`tenant_admin:agents!leads_tenant_admin_id_fkey(...)\` and render conditional hierarchy chain client-side with arrow indicators. Sized 1-2 hr.`,
  `**L3 (activity panel discoverability):** Activity panel exists and works at L455-486 (engagement score + timeline) but is hidden behind a per-row amber Activity button at L443. Two sub-changes: (a) engagement count badge on row (bulk-fetch on page load); (b) auto-expand panel for hot/warm engagement leads at top of list. Sized 1-2 hr.`,
  `**Scope guarantees:** zero schema migrations (columns already exist), zero new API routes, zero changes to \`/api/admin-homes/activities\` contract, zero changes to data sync / lead capture / email flow (all owned by W-LEADS-EMAIL, now closed at v21).`,
  `**Section 4 active-trackers table updated:** new W-LEADS-UI-POLISH OPEN row inserted after the W-LEADS-EMAIL CLOSED row.`,
  `**Phases ship in sequence:** L1 ${EM} L2 ${EM} L3 ${EM} Lclose. Each phase = probe ${EM} patch (timestamped backup) ${EM} TSC clean ${EM} local smoke at http://localhost:3000/admin-homes/leads ${EM} commit ${EM} push. Lclose flips this Section 4 row to CLOSED with phase ship hashes referenced.`
];
const v15Body = v15Parts.join(' ');

const p2New = `\n\n${v15Body}${p2Old}`;

const p2Count = text.split(p2Old).length - 1;
console.log(`P2 match count: ${p2Count}`);
if (p2Count !== 1) { console.error(`FATAL: P2 expected 1 match, got ${p2Count}`); process.exit(1); }

// ---- apply ----
text = text.replace(p1Old, p1New);
text = text.replace(p2Old, p2New);

// ---- post-state ----
const p1Post = text.split(p1Old).length - 1;
if (p1Post !== 0) { console.error(`FATAL: P1 post-state expected 0, got ${p1Post}`); process.exit(1); }

// P2 is insert-before-anchor: p2New ends with p2Old, post-state count == 1 by design
const p2Post = text.split(p2Old).length - 1;
if (p2Post !== 1) { console.error(`FATAL: P2 post-state expected 1 (p2Old is suffix of p2New by design), got ${p2Post}`); process.exit(1); }

// ---- markers ----
const v15Count = text.split('**2026-05-12 v15**').length - 1;
console.log(`v15 marker count: ${v15Count}`);
if (v15Count !== 1) { console.error(`FATAL: v15 marker expected 1, got ${v15Count}`); process.exit(1); }

// Section 4 row line-anchored
const newRowMatches = text.match(/^\| `docs\/W-LEADS-UI-POLISH-TRACKER\.md` \| OPEN 2026-05-12/gm) || [];
console.log(`Section 4 W-LEADS-UI-POLISH OPEN row count: ${newRowMatches.length}`);
if (newRowMatches.length !== 1) { console.error(`FATAL: Section 4 row expected 1, got ${newRowMatches.length}`); process.exit(1); }

// LE preservation
const outCRLF   = (text.match(/\r\n/g) || []).length;
const outLFonly = (text.match(/(?<!\r)\n/g) || []).length;
if (outCRLF !== 0) { console.error(`FATAL: post-write CRLF count = ${outCRLF}`); process.exit(1); }
console.log(`OK post-write master: CRLF=${outCRLF} LF-only=${outLFonly}`);

fs.writeFileSync(MASTER, text, 'utf8');

const postBytes = Buffer.byteLength(text, 'utf8');
const delta = postBytes - buf.length;
console.log(`OK master patched: ${buf.length} -> ${postBytes} bytes (delta +${delta})`);
console.log(`OK 2 anchors all matched 1x and consumed cleanly`);
console.log(`OK new tracker file: ${path.basename(NEW_TRACKER)} (${newBytes} bytes)`);
console.log(`OK master backup at: ${path.basename(backupPath)}`);