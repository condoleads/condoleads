// scripts/patch-w-leads-ui-polish-v2-scope-expansion.js
//
// Updates W-LEADS-UI-POLISH-TRACKER v1 -> v2 (scope expansion to 7 phases).
// Two outputs:
//   (1) Overwrites docs/W-LEADS-UI-POLISH-TRACKER.md with v2 content.
//   (2) Patches docs/W-LAUNCH-TRACKER.md:
//        P1 -- Section 4 row Open-items column update.
//        P2 -- v16 status log entry inserted between v15 and Post-P0 backlog.

const fs   = require('fs');
const path = require('path');

const POLISH = path.join(__dirname, '..', 'docs', 'W-LEADS-UI-POLISH-TRACKER.md');
const MASTER = path.join(__dirname, '..', 'docs', 'W-LAUNCH-TRACKER.md');
const EM     = '\u2014';

// ---- timestamp + backups (both files) ----
const d   = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const polishBackup = `${POLISH}.backup_${stamp}`;
const masterBackup = `${MASTER}.backup_${stamp}`;
fs.copyFileSync(POLISH, polishBackup);
fs.copyFileSync(MASTER, masterBackup);
console.log(`OK polish backup: ${path.basename(polishBackup)}`);
console.log(`OK master backup: ${path.basename(masterBackup)}`);

// ===================================================================
// PART A — Overwrite docs/W-LEADS-UI-POLISH-TRACKER.md with v2 content
// ===================================================================

const polishV2 = [
  `# W-LEADS-UI-POLISH-TRACKER`,
  ``,
  `**Version:** v2 ${EM} OPEN ${EM} scope expanded from 3-phase rendering polish to 7-phase qualified-leads system`,
  ``,
  `**Started:** 2026-05-12  `,
  `**Owner:** Shah (sole dev)  `,
  `**Status:** OPEN ${EM} seven UI/data phases that together produce the working qualified-leads management system. Sized 6-8 hours of focused work; ships in one block today.`,
  ``,
  `## Why this exists`,
  ``,
  `Original v1 scope was three rendering polish items (Source badge, hierarchy chain, activity discoverability) on the existing leads table. After design review the workstream expanded to address the actual goal: a working qualified-leads system where the agent can see one row and immediately know what to do.`,
  ``,
  `The leads admin UI today is a flat table where every row has equal visual weight. The data needed for triage exists across multiple tables (\`leads\`, \`user_activities\`, \`user_credit_overrides\`, \`vip_requests\`) but is scattered across the page or hidden behind interactions. To answer "who do I call right now?" the agent has to mentally cross-reference. That's the problem.`,
  ``,
  `The expanded scope produces a unified lead view with four signals per lead:`,
  ``,
  `1. **Qualification** ${EM} agent-set: \`unqualified\` / \`qualified_hot\` / \`qualified_cold\` / \`disqualified\``,
  `2. **VIP form status** ${EM} yes/no, did they fill the questionnaire (basic profile is always complete since email + phone are mandatory at signup)`,
  `3. **Engagement** ${EM} computed: activity count + recency (logic already exists at \`calcEngagement\` L66-67)`,
  `4. **Credit posture** ${EM} computed: usage + blocked state + pending VIP request`,
  ``,
  `Plus inline actions (approve VIP, grant credits, mark qualified) and a detail drawer with the buyer/seller plan content (which the agent already receives in email but cannot see inline today).`,
  ``,
  `## Scope contract`,
  ``,
  `**In scope:**`,
  ``,
  `- **L1 (qualification system):** \`leads.quality\` becomes agent-only with values \`unqualified\` / \`qualified_hot\` / \`qualified_cold\` / \`disqualified\`. Schema migration to expand CHECK constraint and change default to \`unqualified\`. Backfill existing rows (map \`hot\` ${EM} \`qualified_hot\`, \`cold\` ${EM} \`unqualified\`). Remove all code-set \`quality\` writes (closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19: \`charlie/plan-email\` L144 + \`charlie/lead\` L229 currently hardcode \`'hot'\` while DB default is \`'cold'\`). Replace existing dropdown at L414-417 with inline action buttons.`,
  `- **L2 (source badge swap-in):** Source column at L373-376 uses \`deriveLeadOriginRoute(source)\` helper from \`lib/utils/lead-origin-route.ts\` (shipped W-LEADS-EMAIL T6b) with per-route badge labels and colors.`,
  `- **L3 (hierarchy chain render):** Page query at \`app/admin-homes/leads/page.tsx\` L31-35 extends with \`area_manager:agents!leads_area_manager_id_fkey(...)\` + \`tenant_admin:agents!leads_tenant_admin_id_fkey(...)\` joins. Client renders conditional hierarchy chain at L388-395 with arrow indicators between levels.`,
  `- **L4 (engagement inline + activity):** Engagement count badge always visible on row (using existing \`calcEngagement\` at L66-67). Last 2 activities visible inline beneath each row. Full timeline moves to detail drawer (L7). The amber Activity expand button at L443 is removed.`,
  `- **L5 (credit posture chip):** Page query joins \`user_credit_overrides\` + \`vip_requests\` by \`lead.user_id\`. Compact chip on row showing consumption summary. Prominent "VIP pending" / "blocked at zero credits" badge when applicable.`,
  `- **L6 (inline action buttons):** Three buttons on the lead row ${EM} Approve VIP (when pending), Grant credits, Mark qualified (cycles through quality states). Reuses existing routes: \`app/api/admin-homes/users/override/route.ts\` for credit grants, \`app/api/admin-homes/leads/[id]/route.ts\` for quality updates.`,
  `- **L7 (lead detail drawer):** Click row ${EM} drawer opens with full lead context: complete activity timeline, all emails sent (from \`lead_email_recipients_log\`), the buyer/seller plan content (already stored in \`chat_sessions.plan_data\` or \`leads.plan_data\`, currently only delivered via email), full credit history, hierarchy chain, notes from prior calls.`,
  ``,
  `**Out of scope:**`,
  ``,
  `- New API routes or RPCs (all reuse existing).`,
  `- Schema changes beyond the \`leads.quality\` CHECK constraint expansion in L1.`,
  `- New data sync paths (\`/api/admin-homes/activities\` contract unchanged).`,
  `- Mobile-specific responsive polish (separate workstream if surfaced).`,
  `- The action-queue / grouped-list table redesign (separate W-LEADS-UX-V2 if needed post-launch).`,
  ``,
  `## Outcomes Desired`,
  ``,
  `- **OD-1:** Agent can mark a lead as qualified (hot/cold/disqualified) directly from the row in one click. Quality is set only by human action; code never writes \`leads.quality\`.`,
  `- **OD-2:** Source column displays categorized \`lead_origin_route\` value with per-route labels and colors. The raw \`source\` column remains the underlying truth but is no longer the primary display field.`,
  `- **OD-3:** Hierarchy column renders the full known chain (manager ${EM} area_manager ${EM} tenant_admin) with graceful degradation when levels are missing.`,
  `- **OD-4:** Engagement state visible at-a-glance per row; no per-row click needed for triage. Agent can scan 50 leads and identify hot ones in seconds.`,
  `- **OD-5:** Credit posture visible per row including a prominent badge for pending VIP requests or blocked-at-zero-credits states ${EM} the agent sees "this lead needs my action" without leaving the page.`,
  `- **OD-6:** Approve VIP and Grant credits actions executable inline without leaving the leads page.`,
  `- **OD-7:** Full lead context (complete activity timeline + buyer/seller plan + credit history + emails sent) viewable in a drawer without navigation away from the leads list.`,
  ``,
  `## Phases`,
  ``,
  `| Phase | Title | Status | Estimated size | Notes |`,
  `|---|---|---|---|---|`,
  `| L1 | Qualification system | OPEN | 60-90 min | Schema migration (CHECK + default + backfill) + code cleanup (remove \`quality\` writes from \`charlie/plan-email\` L144 + \`charlie/lead\` L229) + UI inline buttons replacing L414-417 dropdown. |`,
  `| L2 | Source badge swap-in | OPEN | 30-45 min | Helper already imported by \`lib/actions/leads.ts\`; client-side L373-376 substitution + label/color map. |`,
  `| L3 | Hierarchy chain render | OPEN | 45-60 min | Page query extension (2 new \`agents!fk\` joins) + client conditional render at L388-395 with arrow indicators. |`,
  `| L4 | Engagement inline + activity | OPEN | 45-60 min | Surface \`calcEngagement\` (L66-67) as always-visible badge; inline last 2 activities; remove L443 expand button (full timeline ${EM} drawer in L7). |`,
  `| L5 | Credit posture chip | OPEN | 45-60 min | Page query joins \`user_credit_overrides\` + \`vip_requests\` by \`lead.user_id\`. Chip render + blocked-state badge. |`,
  `| L6 | Inline action buttons | OPEN | 45-60 min | Approve VIP + Grant credits + Mark qualified buttons on row. Reuses existing API routes. |`,
  `| L7 | Lead detail drawer | OPEN | 60-90 min | Drawer component with full activity timeline + buyer/seller plan content + credit history + emails sent + notes. Plan content already stored; just needs to be surfaced. |`,
  `| Lclose | Workstream close + W-LAUNCH-TRACKER row flip | OPEN | 10 min | 4-anchor patch on master tracker, same pattern as W-LEADS-EMAIL Tlast. |`,
  ``,
  `## Phase workflow`,
  ``,
  `Each phase ships independently in sequence: L1 ${EM} L2 ${EM} L3 ${EM} L4 ${EM} L5 ${EM} L6 ${EM} L7 ${EM} Lclose. Per Rule Zero ${EM} Comprehensive: each phase = probe ${EM} patch (with timestamped backup) ${EM} TSC clean (\`npx tsc --noEmit\`) ${EM} local smoke at \`http://localhost:3000/admin-homes/leads\` (with \`DEV_TENANT_DOMAIN=walliam.ca\` in \`.env.local\`) ${EM} git commit ${EM} git push to origin/main. Lclose flips this tracker's Section 4 row in \`docs/W-LAUNCH-TRACKER.md\` to CLOSED with phase ship hashes referenced.`,
  ``,
  `## Status log`,
  ``,
  `- **2026-05-12 v1** ${EM} Tracker created with three rendering polish phases (L1 source badge, L2 hierarchy, L3 activity). Scope locked from W-LEADS-EMAIL closure recon at \`components/admin-homes/AdminHomesLeadsClient.tsx\`. Master tracker \`docs/W-LAUNCH-TRACKER.md\` Section 4 OPEN row + v15 status log entry shipped in same commit.`,
  `- **2026-05-12 v2** ${EM} **Scope expanded after design conversation.** The original three phases (now L2/L3/L4) are necessary but not sufficient ${EM} the actual goal is a working qualified-leads management system where the agent sees one row and immediately knows what to do. **Four new phases added:** L1 (qualification system: agent-set \`leads.quality\` with values \`unqualified\`/\`qualified_hot\`/\`qualified_cold\`/\`disqualified\`, closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19); L5 (credit posture chip: joins \`user_credit_overrides\` and \`vip_requests\` to surface consumption + blocked states ${EM} credit system lives under user but surfaces inline on the lead row); L6 (inline action buttons: Approve VIP / Grant credits / Mark qualified, all reusing existing API routes); L7 (lead detail drawer: surfaces the buyer/seller plan content the agent already receives in email but cannot see inline today). **Original phases renumbered:** L1 (source badge) ${EM} L2; L2 (hierarchy) ${EM} L3; L3 (activity) ${EM} L4. Total seven phases + Lclose, sized 6-8 hours of focused work. Ships in one block today. No new API routes; only one schema migration (L1 CHECK constraint expansion). Master tracker Section 4 row Open-items column updated to reflect new scope; v16 status log entry added.`,
  ``
].join('\n');

fs.writeFileSync(POLISH, polishV2, 'utf8');
const polishBytes = Buffer.byteLength(polishV2, 'utf8');
console.log(`OK polish tracker overwritten v1 -> v2: ${polishBytes} bytes`);

// Verify LF-only
const pBuf = fs.readFileSync(POLISH);
const pRaw = pBuf.toString('utf8');
const pCRLF = (pRaw.match(/\r\n/g) || []).length;
if (pCRLF !== 0) { console.error('FATAL: polish tracker has CRLF'); process.exit(1); }

// ===================================================================
// PART B — Patch docs/W-LAUNCH-TRACKER.md
// ===================================================================

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

// ---- P1: Replace the Section 4 W-LEADS-UI-POLISH row's Open-items column ----
const p1Old = `| \`docs/W-LEADS-UI-POLISH-TRACKER.md\` | OPEN 2026-05-12 (v1; scope locked) | L1 lead_origin_route badge swap-in + L2 hierarchy chain render (area_manager + tenant_admin) + L3 activity panel discoverability |`;
const p1New = `| \`docs/W-LEADS-UI-POLISH-TRACKER.md\` | OPEN 2026-05-12 (v2; scope expanded to 7 phases) | L1 qualification system (agent-set quality) + L2 source badge swap-in + L3 hierarchy chain render + L4 engagement inline + L5 credit posture chip + L6 inline action buttons (Approve VIP, Grant credits) + L7 lead detail drawer with plan content |`;

const p1Count = text.split(p1Old).length - 1;
console.log(`P1 match count: ${p1Count}`);
if (p1Count !== 1) { console.error(`FATAL: P1 expected 1 match, got ${p1Count}`); process.exit(1); }

// ---- P2: Insert v16 status log entry between v15 and Post-P0 backlog ----
const p2Old = `\n\n**Post-P0 backlog** (not blocking launch`;

const v16Parts = [
  `- **2026-05-12 v16** ${EM} **W-LEADS-UI-POLISH scope expanded to 7-phase qualified-leads system.**`,
  `After design conversation, the workstream expanded from three rendering polish phases (Source badge, hierarchy, activity) to seven phases that together produce a working qualified-leads management system.`,
  `**New phases added:** L1 (qualification system ${EM} agent-set \`leads.quality\` with values \`unqualified\` / \`qualified_hot\` / \`qualified_cold\` / \`disqualified\`, closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19 by removing code-set quality writes at \`charlie/plan-email\` L144 + \`charlie/lead\` L229); L5 (credit posture chip ${EM} joins \`user_credit_overrides\` and \`vip_requests\` by \`lead.user_id\` to surface consumption + blocked states inline on the lead row); L6 (inline action buttons ${EM} Approve VIP / Grant credits / Mark qualified, all reusing existing routes \`app/api/admin-homes/users/override/route.ts\` and \`app/api/admin-homes/leads/[id]/route.ts\`); L7 (lead detail drawer ${EM} surfaces the buyer/seller plan content the agent already receives via \`charlie/plan-email\` route in W-LEADS-EMAIL but cannot see inline on the leads page today).`,
  `**Original phases renumbered:** L1 (source badge) ${EM} L2; L2 (hierarchy) ${EM} L3; L3 (activity) ${EM} L4.`,
  `**Sized 6-8 hours of focused work**, ships in one block today. No new API routes (all reuse existing). One schema migration (\`leads.quality\` CHECK constraint expansion + default change + backfill).`,
  `**Section 4 active-trackers table updated:** W-LEADS-UI-POLISH row Open-items column rewritten to reflect new 7-phase scope.`,
  `**Tracker bumped:** \`docs/W-LEADS-UI-POLISH-TRACKER.md\` v1 ${EM} v2 with full scope contract + outcomes desired + phase table.`
];
const v16Body = v16Parts.join(' ');

const p2New = `\n\n${v16Body}${p2Old}`;

const p2Count = text.split(p2Old).length - 1;
console.log(`P2 match count: ${p2Count}`);
if (p2Count !== 1) { console.error(`FATAL: P2 expected 1 match, got ${p2Count}`); process.exit(1); }

// ---- apply ----
text = text.replace(p1Old, p1New);
text = text.replace(p2Old, p2New);

// ---- post-state ----
const p1Post = text.split(p1Old).length - 1;
if (p1Post !== 0) { console.error(`FATAL: P1 post-state expected 0, got ${p1Post}`); process.exit(1); }

// P2 is insert-before-anchor: p2New ends with p2Old, post-state count == 1
const p2Post = text.split(p2Old).length - 1;
if (p2Post !== 1) { console.error(`FATAL: P2 post-state expected 1 (insert-before-anchor), got ${p2Post}`); process.exit(1); }

// markers
const v16MarkerCount = text.split('**2026-05-12 v16**').length - 1;
console.log(`v16 marker count: ${v16MarkerCount}`);
if (v16MarkerCount !== 1) { console.error(`FATAL: v16 marker expected 1, got ${v16MarkerCount}`); process.exit(1); }

const newRowMatches = text.match(/^\| `docs\/W-LEADS-UI-POLISH-TRACKER\.md` \| OPEN 2026-05-12 \(v2;/gm) || [];
console.log(`Section 4 v2 row count: ${newRowMatches.length}`);
if (newRowMatches.length !== 1) { console.error(`FATAL: Section 4 v2 row expected 1, got ${newRowMatches.length}`); process.exit(1); }

const oldRowMatches = text.match(/^\| `docs\/W-LEADS-UI-POLISH-TRACKER\.md` \| OPEN 2026-05-12 \(v1;/gm) || [];
console.log(`Section 4 v1 row count (should be 0): ${oldRowMatches.length}`);
if (oldRowMatches.length !== 0) { console.error(`FATAL: old v1 row still present, got ${oldRowMatches.length}`); process.exit(1); }

// LE preservation
const outCRLF   = (text.match(/\r\n/g) || []).length;
const outLFonly = (text.match(/(?<!\r)\n/g) || []).length;
if (outCRLF !== 0) { console.error(`FATAL: post-write CRLF count = ${outCRLF}`); process.exit(1); }
console.log(`OK master post-write: CRLF=${outCRLF} LF-only=${outLFonly}`);

fs.writeFileSync(MASTER, text, 'utf8');

const postBytes = Buffer.byteLength(text, 'utf8');
const delta = postBytes - buf.length;
console.log(`OK master patched: ${buf.length} -> ${postBytes} bytes (delta +${delta})`);
console.log(`OK polish tracker v2: ${polishBytes} bytes`);
console.log(`OK 2 master anchors matched 1x and consumed cleanly`);