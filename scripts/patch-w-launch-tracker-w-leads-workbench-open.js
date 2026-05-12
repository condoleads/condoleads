// scripts/patch-w-launch-tracker-w-leads-workbench-open.js
//
// W-open: insert W-LEADS-WORKBENCH workstream into master tracker.
//
// 2 anchors:
//   P1: Section 4 row insert (after W-LEADS-UI-POLISH CLOSED row at L185)
//   P2: v18 status log entry insert (before "**Post-P0 backlog**" header)
//
// Master is LF-only (verified by recon R2: 234 LF, 0 CRLF, no BOM).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
console.log('W-open patch stamp: ' + stamp);

const src = path.join(ROOT, 'docs', 'W-LAUNCH-TRACKER.md');
if (!fs.existsSync(src)) throw new Error('master tracker not found');

const inputBytes = fs.readFileSync(src);
console.log('  input bytes: ' + inputBytes.length);

let crlf = 0, lfOnly = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i-1] === 0x0D) crlf++; else lfOnly++;
  }
}
if (crlf > 0) throw new Error('master has CRLF -- expected LF-only');
const inputLfCount = lfOnly;
console.log('  input LF: ' + lfOnly);

let text = inputBytes.toString('utf8');
if (text.indexOf('\r\n') !== -1) throw new Error('CRLF in decoded string');

const dst = src + '.backup_' + stamp;
fs.copyFileSync(src, dst);
console.log('  backup: ' + path.basename(dst));

const EM = '\u2014';

const NEW_SECTION4_ROW = '| `docs/W-LEADS-WORKBENCH-TRACKER.md` | OPEN 2026-05-12 (v1, 16 phases) | W1 recon (Users credit UI shape + plan_data shapes + plan email template + audit tables + status enum + quality writers) ' + EM + ' W2 schema (status enum +do_not_contact/not_interested/disqualified; new lead_admin_actions audit table) ' + EM + ' W3 strip leads-row noise (drop L1 quality buttons, L5 credit chip, L6 grant pill, L7 drawer from AdminHomesLeadsClient) ' + EM + ' W4a..g build /admin-homes/leads/[id] workbench page (7 tabs: Overview, Plan (full buyer+seller render), Credits & Usage (extracted UserCreditPanel reused from /admin-homes/users), Activity (unified visitor+admin timeline), Emails (list + Send composer), VIP Requests (in-page Approve), Notes (list + Add inline)) ' + EM + ' W5a..e enhancements (click-row navigate, in-page Approve VIP, Send Email composer, Assigned Agent reassign, action audit log writes from every admin endpoint, default-view status filter + quality sort) ' + EM + ' W6 local smoke + Wclose. Supersedes W-LEADS-UI-POLISH L1/L5/L6/L7 surfaces (stripped in W3); preserves L2 source badge / L3 hierarchy chain / L4 engagement chip + activity preview. |';

const V18 =
  '- **2026-05-12 v18** ' + EM + ' **W-LEADS-WORKBENCH WORKSTREAM OPENED.** Architectural rework of the leads admin UI superseding the W-LEADS-UI-POLISH drawer + inline-row approach. W-LEADS-UI-POLISH (closed v17, commit `b1a327b`) shipped 7 phases of inline-on-row + drawer features that surfaced thin versions of user-level data. Review found this architecturally wrong: ' +
  '(a) credit management belongs at the user level and was already-working/tested on `/admin-homes/users`; the L5 row credit chip + L6 4-input grant form duplicated and thinned that working surface. ' +
  '(b) L7 drawer Plan Content rendered 4 fields vs the agent-email full `plan_data` JSONB rendering ' + EM + ' information density regressed inside the platform vs the email already going out (the agent gets a richer view in their inbox than in the workbench). ' +
  '(c) L1 Quality 4-button row (Unqualified/Hot/Cold/Disqualified) overlapped conceptually with Status (New/Contacted/Qualified/Closed) and drove zero business behavior ' + EM + ' qualification labels were written to DB but no code path read them for routing/filtering/sorting/email-cadence decisions. ' +
  '(d) Drawer-based detail at `w-[480px]` limits real estate, is not URL-routed, not deep-linkable, not shareable between admins ' + EM + ' wrong vehicle for the agent primary workbench surface. ' +
  '**W-LEADS-WORKBENCH plan:** build `/admin-homes/leads/[id]` as a dedicated server-rendered page (the canonical lead workbench), strip the L1/L5/L6/L7 surfaces from the leads table row, surface the working user credit system in lead context via reusable `<UserCreditPanel>` component (extracted from the Users page where it currently lives), render plans at full email-template richness via reusable `<PlanRenderer>` component for both buyer + seller variants, replace tab-flipping flows (Approve VIP opens a new tab today, admin must refresh to see updated state) with in-page actions backed by new admin-context endpoints, add unified action audit log (`lead_admin_actions` table) writes from every admin endpoint so the activity timeline shows visitor behavior + admin actions interleaved chronologically. ' +
  '**Status enum expansion confirmed by founder:** `do_not_contact`, `not_interested`, `disqualified` added in W2 schema migration. Default leads view filters these out so agents see only active leads by default. ' +
  '**Quality field UI reduced to Hot/Cold binary** with NULL default for new leads (the Unqualified/Disqualified concepts move to Status). Quality drives default-view sort (Hot at top of active leads) but is not used for filtering. ' +
  '**Phase table (16 phases):** W1 recon ' + EM + ' W2 schema ' + EM + ' W3 strip leads-row noise + drawer ' + EM + ' W4a..g page build (7 tabs: Overview, Plan, Credits & Usage, Activity, Emails, VIP Requests, Notes) ' + EM + ' W5a..e enhancements (click-row navigate, in-page Approve VIP, Send Email composer, Assigned Agent reassign, audit log writes, default-view filter + sort) ' + EM + ' W6 local smoke + Wclose. ' +
  '**Sized 10-15 hours of focused work** per founder direction 2026-05-12 ("a day delay in launch will not hurt; we need something solid not a mediocre"). ' +
  '**Multi-tenant safety contract:** every new query / endpoint / UI surface scopes by tenant_id (direct `.eq()` or implicit via already-filtered FK chains); all admin endpoints use `resolveAdminHomesUser` + `can()`; audit log writes include tenant_id; new `lead_admin_actions` table has `tenant_id NOT NULL` from creation (avoids F-LEAD-NOTES-NO-TENANT-ID-COLUMN class of issue). ' +
  '**Recon findings to date (paste 113-recon):** ' +
  '(i) `/admin-homes/users/[id]/page.tsx` does NOT exist ' + EM + ' no dedicated user detail page route; the working user credit system must live on the users list page at `/admin-homes/users/page.tsx` (6387 bytes) ' + EM + ' W1 deep recon reads to discover credit UI shape and extracts the reusable component in W4c. ' +
  '(ii) `components/admin-homes/AdminHomesUsersClient.tsx` does NOT exist by that exact name ' + EM + ' naming may differ or surface may be server-rendered with inline interactive elements. ' +
  '(iii) `app/api/walliam/charlie/plan-email/route.ts` does NOT exist at that path ' + EM + ' plan email route is likely at `app/api/charlie/plan-email/route.ts` or similar; W1 globs to find the actual path and reads the HTML template (richness reference for W4b PlanRenderer). ' +
  '(iv) `app/admin-homes/leads/page.tsx` (8681 bytes) and `components/admin-homes/AdminHomesLeadsClient.tsx` (48066 bytes) confirmed present, ready to receive W3 strip + W5a click-row->navigate patches. ' +
  '(v) `app/api/admin-homes/users/override/route.ts` (4211 bytes) and `app/api/admin-homes/leads/[id]/route.ts` (3220 bytes) confirmed present, ready for reuse / extension. ' +
  '**Approach principle:** if the existing user credit UI is not already a reusable component, W4c extracts it into one; the workbench is built once with the canonical credit panel, the Users page later adopts the same component (zero duplicated implementations consistent with Rule Zero Comprehensive Work). ' +
  '**Tracker created:** `docs/W-LEADS-WORKBENCH-TRACKER.md` v1 with full scope contract (what owned, what NOT owned), outcomes desired, 16-phase table, multi-tenant safety contract, recon findings carried forward, status log skeleton. ' +
  '**Section 4 active-trackers table updated:** new W-LEADS-WORKBENCH OPEN row inserted after the W-LEADS-UI-POLISH CLOSED row (which became closed earlier today at v17). ' +
  '**Phases ship sequentially:** W1 ' + EM + ' W2 ' + EM + ' W3 ' + EM + ' W4a..g ' + EM + ' W5a..e ' + EM + ' W6 ' + EM + ' Wclose. Each shipping phase = probe + patch (timestamped backup) + TSC clean + local smoke at `http://localhost:3000/admin-homes/leads` (and `/admin-homes/leads/<id>` from W4a onward) + commit + push. Master tracker updated only at Wclose (or major milestone) per the established convention from W-TERRITORY/W-LEADS-EMAIL/W-LEADS-UI-POLISH closures. ' +
  '**Lessons carried into this workstream from Lclose (W-LEADS-UI-POLISH v17 lessons 1-5):** LE detection via byte-read before matching; absolute paths to .NET file APIs; line-anchored anchors when text matches prior status log narratives; single-quoted PS here-strings for JS content delivery; pre-write anchor uniqueness validation; post-write LE preservation verification.';

const anchors = [
  {
    name: 'P1: Section 4 row insert after W-LEADS-UI-POLISH closed row',
    old: '| `docs/W-LEADS-UI-POLISH-TRACKER.md` | CLOSED 2026-05-12 (L1 `1e3c049`; L2 `00b85e9`; L3 `57d29d7`; L4 `c425d0a`; L5 `9159fc3`; L6 `e769e98`; L7 `576b770`) | F-LEAD-NOTES-NO-TENANT-ID-COLUMN (`lead_notes` missing `tenant_id` column; implicit `lead_id`-based scoping currently correct, not a blocker) |\n',
    new: '| `docs/W-LEADS-UI-POLISH-TRACKER.md` | CLOSED 2026-05-12 (L1 `1e3c049`; L2 `00b85e9`; L3 `57d29d7`; L4 `c425d0a`; L5 `9159fc3`; L6 `e769e98`; L7 `576b770`) | F-LEAD-NOTES-NO-TENANT-ID-COLUMN (`lead_notes` missing `tenant_id` column; implicit `lead_id`-based scoping currently correct, not a blocker) |\n' + NEW_SECTION4_ROW + '\n',
  },
  {
    name: 'P2: v18 status log entry insert before Post-P0 backlog header',
    old: '**Post-P0 backlog** (not blocking launch ' + EM + ' see Section 3 P1/P2 + Section 4 trackers for detail):',
    new: V18 + '\n\n**Post-P0 backlog** (not blocking launch ' + EM + ' see Section 3 P1/P2 + Section 4 trackers for detail):',
  },
];

for (const a of anchors) {
  const count = text.split(a.old).length - 1;
  console.log('  anchor "' + a.name + '" count: ' + count);
  if (count !== 1) throw new Error('anchor "' + a.name + '" count ' + count + ' != 1');
}

for (const a of anchors) text = text.replace(a.old, a.new);

if (text.indexOf('\r\n') !== -1) throw new Error('CRLF introduced');
if ((text.split('W-LEADS-WORKBENCH-TRACKER.md').length - 1) < 1) throw new Error('Section 4 row missing after patch');
if ((text.split('**2026-05-12 v18**').length - 1) !== 1) throw new Error('v18 entry not present once');

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
if (outCrlf > 0) throw new Error('LE drift');
if (outLf < inputLfCount) throw new Error('LF count dropped');
console.log('  delta bytes:  +' + (outBytes.length - inputBytes.length));
console.log('  delta LF:     +' + (outLf - inputLfCount));
console.log('=== W-open patch APPLIED OK ===');