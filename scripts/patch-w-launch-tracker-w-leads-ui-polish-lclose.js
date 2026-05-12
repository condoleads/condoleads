// scripts/patch-w-launch-tracker-w-leads-ui-polish-lclose.js
//
// Lclose: flip docs/W-LAUNCH-TRACKER.md to reflect W-LEADS-UI-POLISH workstream closure.
//
// 4 anchors:
//   P1: Section 4 row OPEN -> CLOSED  (single-line exact-string)
//   P2: Closed tickets list append    (line-anchored via trailing \n -- disambiguates
//                                       from inline-code occurrence in v14 narrative)
//   P3: Post-P0 backlog insert        (single-line exact-string after W-TERRITORY closed line)
//   P4: v17 status log entry insert   (single-line exact-string before Post-P0 backlog header)
//
// File is LF-only (verified by R11 in recon-2: 230 LF, 0 CRLF, no BOM).
// JS content uses string concatenation + EM constant for em-dashes.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
console.log('Lclose patch stamp: ' + stamp);

const src = path.join(ROOT, 'docs', 'W-LAUNCH-TRACKER.md');
if (!fs.existsSync(src)) throw new Error('master tracker not found: ' + src);

const inputBytes = fs.readFileSync(src);
console.log('  input bytes: ' + inputBytes.length);

let crlf = 0, lfOnly = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i-1] === 0x0D) crlf++; else lfOnly++;
  }
}
console.log('  input CRLF: ' + crlf);
console.log('  input LF:   ' + lfOnly);
if (crlf > 0) throw new Error('Lclose: master tracker has CRLF -- expected LF-only');
const inputLfCount = lfOnly;

let text = inputBytes.toString('utf8');
if (text.indexOf('\r\n') !== -1) throw new Error('Lclose: CRLF detected in decoded string');

const dst = src + '.backup_' + stamp;
fs.copyFileSync(src, dst);
console.log('  backup: ' + path.basename(dst));

const EM = '\u2014';

const V17 =
  '- **2026-05-12 v17** ' + EM + ' **W-LEADS-UI-POLISH WORKSTREAM CLOSED.** All seven phases shipped in one working block 2026-05-12: ' +
  'L1 qualification system (`1e3c049` ' + EM + ' agent-set `leads.quality` CHECK constraint expansion + 8 System 2 patches removing code-set quality writes + UI button row; closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19); ' +
  'L2 source badge swap-in (`00b85e9` ' + EM + ' replaced raw `SOURCE_LABELS` dict lookup with `deriveLeadOriginRoute` from `lib/utils/lead-origin-route.ts`, surfacing the W-LEADS-EMAIL T2c-shipped + T6b-wired `lead_origin_route` column); ' +
  'L3 hierarchy chain render (`57d29d7` ' + EM + ' added `area_manager` + `tenant_admin` joins to page query; Manager column replaced with multi-level hierarchy chain rendering manager / area_manager / tenant_admin with arrow indicators; CSV export expanded; three recovery passes needed for the multi-line JSX block containing arrow + backtick content, logged as recovery2-locked rule); ' +
  'L4 engagement inline + activity preview (`c425d0a` ' + EM + ' server-side `user_activities` prefetch, always-visible engagement chip in Contact column, always-visible last-2-activity preview row replacing the old expand button); ' +
  'L5 credit posture chip + VIP pending badge (`9159fc3` ' + EM + ' server-side `user_credit_overrides` + `vip_requests` prefetch, credit chip in Quality column with 5-state semantics (no user_id / no override / blocked / default / partial), animated `animate-pulse` VIP pending badge in Contact column with defensive expiry filter); ' +
  'L6 inline action buttons (`e769e98` ' + EM + ' Approve VIP `<a target="_blank">` link routing chat/plan to `walliam/charlie/vip-approve` and estimator to `walliam/estimator/vip-approve` per existing token-based routes, Grant credits inline form posting to existing `/api/admin-homes/users/override` route with optimistic state update); ' +
  'L7 lead detail drawer (`576b770` ' + EM + ' server-side `lead_email_recipients_log` + `lead_notes` prefetch, right-side slide-out drawer at `w-[480px]` with 8 sections: Lead Info, Hierarchy, Credit Posture, VIP Requests, Plan Content, full Activity Timeline, Emails Sent (W-LEADS-EMAIL T2f audit), Notes (structured + legacy free-text); ESC + backdrop + X close, ARIA dialog role, click-row trigger with `closest(\'button, input, select, a, label\')` interactive-descendant guard). ' +
  '**Architecture-as-shipped:** zero new API routes (all 7 phases reuse existing endpoints ' + EM + ' `app/api/admin-homes/leads/[id]/route.ts` for quality + delete, `app/api/admin-homes/users/override/route.ts` for credit grants, `app/api/walliam/{charlie,estimator}/vip-approve` token-based GET handlers); one schema migration (L1 `leads.quality` CHECK constraint expansion + default change + backfill); five new server-side prefetch queries on the leads page (user_activities, user_credit_overrides, vip_requests, lead_email_recipients_log, lead_notes) all multi-tenant scoped via `.eq(\'tenant_id\', scopedTenantId)` when `!seeAll`, or implicit via `lead_id IN leadIds` for `lead_notes` which has no `tenant_id` column (F-LEAD-NOTES-NO-TENANT-ID-COLUMN logged below). ' +
  '**Multi-tenant safety verified across all 7 phases:** every new query and every new admin action explicitly tenant-scoped or implicitly safe via the already-tenant-filtered leads result set; drawer renders only the clicked lead data; no cross-tenant leakage path exists. ' +
  '**Section 4 active-trackers table updated:** W-LEADS-UI-POLISH row flipped from OPEN (v2; scope expanded to 7 phases) to CLOSED 2026-05-12 with all 7 phase commit hashes referenced inline. ' +
  '**Closed tickets reference list updated:** `- W-LEADS-UI-POLISH (2026-05-12)` appended after W-LEADS-EMAIL (2026-05-12). ' +
  '**Post-P0 backlog updated:** new closed-with-residual line inserted after the W-TERRITORY closed line, mirroring W-TERRITORY/W-LEADS-EMAIL format, carrying F-LEAD-NOTES-NO-TENANT-ID-COLUMN forward as post-launch hygiene item. ' +
  '**Workstream-internal status** (per `docs/W-LEADS-UI-POLISH-TRACKER.md` L1-L7 entries): all 7 per-phase entries are present in the workstream tracker (verified by R12 in recon-2: L1-L7 markers all return 1); per-phase rows in that tracker phase table stay reflective of the per-phase commit hashes above (no per-row close needed since the master Section 4 row carries the close state). ' +
  '**Known hygiene items deferred post-launch (documented, non-blocking):** ' +
  '(a) F-LEAD-NOTES-NO-TENANT-ID-COLUMN ' + EM + ' `lead_notes` lacks a `tenant_id` column; implicit scoping via `lead_id IN leadIds` (filtered through tenant-scoped leads query upstream) is currently correct but architecturally weaker than direct `.eq(\'tenant_id\', ...)` scoping; future migration adds `tenant_id` column + backfill + NOT NULL + index. ' +
  '(b) Drawer is read-only ' + EM + ' no inline add-note / edit-note action; future polish. ' +
  '(c) After L6 Approve VIP or Grant credits action runs, drawer does not auto-update `vipRequests` / `creditOverrides` state; admin must close + reopen drawer (or refresh page). ' +
  '(d) L6 Approve VIP opens new tab; admin must manually refresh leads tab to see updated VIP request state. ' +
  '(e) `lead_email_recipients_log.delivered_at` and `.bounced_at` are uniformly NULL ' + EM + ' Resend webhook integration not wired (logged for future webhook wiring workstream). ' +
  '(f) Browser `alert()` for L6 grant errors ' + EM + ' replace with toast in a UI polish follow-up. ' +
  '**None of these block first paid customer onboarding.** ' +
  '**Patch design lessons logged for future workstreams:** ' +
  '(1) recovery2-locked rule from W-LEADS-EMAIL v19 ' + EM + ' multi-line anchors operating on content with template literal backticks consistently return indexOf -1 in the PS-to-Node pipeline; default to line-pattern walks for those cases (re-confirmed by L3 paste 100/101/102 recovery sequence ' + EM + ' three failed attempts on a 10-line JSX block with arrow characters + backticks). ' +
  '(2) Single-line anchors with backticks work fine ' + EM + ' the failure mode is multi-line + backticks specifically. ' +
  '(3) Schema probes BEFORE writing prefetch queries are mandatory ' + EM + ' L5 caught `user_credit_overrides` has no `created_at` (only `granted_at` + `updated_at`); L7 caught `lead_notes` has no `tenant_id` column via SQL-C probe failure. Both probes saved a deploy-time TypeError. ' +
  '(4) JS content inside PS @\'...\'@ here-strings preserves JS backticks/template-literal markers since PS single-quoted here-strings do zero substitution; the JS patch file then writes its content to disk with explicit UTF-8 encoding to avoid any LE drift. ' +
  '(5) Anchor uniqueness validation MUST account for inline-code occurrences in prior status log narratives ' + EM + ' Lclose first attempt 2026-05-12 15:31 failed with P2 anchor count = 2 because v14 narrative at L220 contained ``- W-LEADS-EMAIL (2026-05-12)`` as inline code; fixed by switching to `\\n`-suffixed line-anchored old/new strings. Lesson: any anchor whose text matches a pattern documented in a prior v(N) status log narrative needs line-ending disambiguation. ' +
  '**Tracker maintenance lessons logged:** master tracker is LF-only (verified by R11 byte-count: 230 LF newlines, 0 CRLF, no BOM); all patches must read bytes via absolute path (PS `Set-Location` does NOT sync .NET `CurrentDirectory` ' + EM + ' R3 in recon-1 initially failed exactly this way; recon-2 corrected with absolute path) and validate LE preservation post-write. ' +
  '**Tracker workstream sequence so far in May 2026:** W-LEADS-EMAIL (closed v14, commits `ddbe1bc` + `a614b4f`) ' + EM + ' W-LEADS-UI-POLISH (this v17 entry, all 7 phase commits above). ' +
  '**Total state of master tracker after this v17:** P0 closed; W-HIERARCHY closed (v17 final 2026-05-03); W-TERRITORY closed (v21 final 2026-05-09); W-LEADS-EMAIL closed (v21 final 2026-05-12); W-LEADS-UI-POLISH closed (v17 / this entry 2026-05-12). ' +
  'Remaining product work: W-ROLES-DELEGATION R5/R6/R8 (deferred per cohesion review); F55/P2-4 hygiene (deferred post-launch); F-LEAD-NOTES-NO-TENANT-ID-COLUMN (deferred post-launch); scripts cleanup. ' +
  '**First paid customer launch unblocked end-to-end** modulo external Paddle KYC; the leads admin UI now has every read + write surface needed to manage qualified leads, surface engagement signal, manage credits/VIP state, and review full lead context (timeline + emails + plan content + notes). ' +
  '**Tenant onboarding readiness:** the entire leads + email + UI surface ships zero hardcoded tenant strings ' + EM + ' multi-tenant Rule Zero respected end-to-end across all 7 phases.';

const anchors = [
  {
    name: 'P1: Section 4 row flip OPEN -> CLOSED',
    old: '| `docs/W-LEADS-UI-POLISH-TRACKER.md` | OPEN 2026-05-12 (v2; scope expanded to 7 phases) | L1 qualification system (agent-set quality) + L2 source badge swap-in + L3 hierarchy chain render + L4 engagement inline + L5 credit posture chip + L6 inline action buttons (Approve VIP, Grant credits) + L7 lead detail drawer with plan content |',
    new: '| `docs/W-LEADS-UI-POLISH-TRACKER.md` | CLOSED 2026-05-12 (L1 `1e3c049`; L2 `00b85e9`; L3 `57d29d7`; L4 `c425d0a`; L5 `9159fc3`; L6 `e769e98`; L7 `576b770`) | F-LEAD-NOTES-NO-TENANT-ID-COLUMN (`lead_notes` missing `tenant_id` column; implicit `lead_id`-based scoping currently correct, not a blocker) |',
  },
  {
    name: 'P2: Closed tickets list append (LINE-ANCHORED with trailing \\n)',
    old: '- W-LEADS-EMAIL (2026-05-12)\n',
    new: '- W-LEADS-EMAIL (2026-05-12)\n- W-LEADS-UI-POLISH (2026-05-12)\n',
  },
  {
    name: 'P3: Post-P0 backlog closed-with-residual line insert',
    old: '- W-TERRITORY: \u2705 CLOSED 2026-05-09 (v21 FINAL -- all 7 phases T1-T7 shipped; tracker `docs/W-TERRITORY-TRACKER.md` is now reference-only). Tenant-2 onboarding unblocked.',
    new: '- W-TERRITORY: \u2705 CLOSED 2026-05-09 (v21 FINAL -- all 7 phases T1-T7 shipped; tracker `docs/W-TERRITORY-TRACKER.md` is now reference-only). Tenant-2 onboarding unblocked.\n- W-LEADS-UI-POLISH: \u2705 CLOSED 2026-05-12 (all 7 phases L1-L7 shipped: L1 qualification system `1e3c049`, L2 source badge `00b85e9`, L3 hierarchy chain `57d29d7`, L4 engagement inline `c425d0a`, L5 credit posture chip `9159fc3`, L6 inline action buttons `e769e98`, L7 8-section lead detail drawer `576b770`; tracker `docs/W-LEADS-UI-POLISH-TRACKER.md` is now reference-only). F-LEAD-NOTES-NO-TENANT-ID-COLUMN (lead_notes missing tenant_id column; implicit lead_id-based scoping currently correct) deferred post-launch as known hygiene item.',
  },
  {
    name: 'P4: v17 status log entry insert before Post-P0 backlog header',
    old: '**Post-P0 backlog** (not blocking launch ' + EM + ' see Section 3 P1/P2 + Section 4 trackers for detail):',
    new: V17 + '\n\n**Post-P0 backlog** (not blocking launch ' + EM + ' see Section 3 P1/P2 + Section 4 trackers for detail):',
  },
];

for (const a of anchors) {
  const count = text.split(a.old).length - 1;
  console.log('  anchor "' + a.name + '" count: ' + count);
  if (count !== 1) throw new Error('Lclose anchor "' + a.name + '" appears ' + count + ' times -- expected exactly 1');
}

for (const a of anchors) {
  text = text.replace(a.old, a.new);
}

if (text.indexOf('\r\n') !== -1) throw new Error('Lclose: CRLF introduced in output');
if ((text.split('OPEN 2026-05-12 (v2; scope expanded').length - 1) !== 0) throw new Error('Lclose: Section 4 OPEN row still present after patch');
if ((text.split('| CLOSED 2026-05-12 (L1 `1e3c049`').length - 1) !== 1) throw new Error('Lclose: Section 4 CLOSED row not present after patch');
// Output validation uses \n suffix because V17 narrative contains the same inline-code phrase
if ((text.split('- W-LEADS-UI-POLISH (2026-05-12)\n').length - 1) !== 1) throw new Error('Lclose: closed tickets list entry (line-anchored) not present exactly once after patch');
if ((text.split('- W-LEADS-UI-POLISH: \u2705 CLOSED 2026-05-12').length - 1) !== 1) throw new Error('Lclose: Post-P0 closed line not present after patch');
if ((text.split('**2026-05-12 v17**').length - 1) !== 1) throw new Error('Lclose: v17 entry not present after patch');

fs.writeFileSync(src, text, 'utf8');

const outBytes = fs.readFileSync(src);
let outCrlf = 0, outLf = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) outCrlf++; else outLf++;
  }
}
console.log('  output bytes: ' + outBytes.length);
console.log('  output CRLF:  ' + outCrlf);
console.log('  output LF:    ' + outLf);
if (outCrlf > 0) throw new Error('Lclose: CRLF detected in output -- LE drift');
if (outLf < inputLfCount) throw new Error('Lclose: LF count dropped from ' + inputLfCount + ' to ' + outLf);
console.log('  delta bytes:  +' + (outBytes.length - inputBytes.length));
console.log('  delta LF:     +' + (outLf - inputLfCount));
console.log('=== Lclose patch APPLIED OK ===');