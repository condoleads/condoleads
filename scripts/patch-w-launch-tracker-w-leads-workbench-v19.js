const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

const src = path.join(ROOT, 'docs', 'W-LAUNCH-TRACKER.md');
const inputBytes = fs.readFileSync(src);
let crlf = 0, lfOnly = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i-1] === 0x0D) crlf++; else lfOnly++;
  }
}
if (crlf > 0) throw new Error('master has CRLF');
const inputLf = lfOnly;
let text = inputBytes.toString('utf8');

fs.copyFileSync(src, src + '.backup_' + stamp);
console.log('backup: ' + path.basename(src + '.backup_' + stamp));

const EM = '\u2014';

const V19 =
  '- **2026-05-12 v19** ' + EM + ' **W-LEADS-WORKBENCH SCOPE EXPANDED to v2.** Founder review after v1 open surfaced four substantial gaps: ' +
  '(1) **Lead source completeness audit + 2 confirmed bugs.** Comprehensive lead-capture inventory across the platform missing from v1 scope. Every CTA must be wired, source-correct, URL-bearing, email-flowing. Inventory: Single Property (Home + Condo, 4 CTAs each: Contact Agent / Expert Valuation / Make an Offer / Book a Visit), Building (5 CTAs: Contact Agent / Get in Touch / Whats your unit worth / List your condo with us / Book a Visit), Buyer Plan (Book my viewing), Seller Plan (Book a Consultation), Listing Card (Book a Visit), Home page (Contact). Two confirmed bugs: `testingleads@gmail.com` executed buyer plan but did not receive the plan delivery email; registration flow not setting `source` on the resulting lead. Plus Home property page is missing the Book a Visit CTA that Condo has (parity gap). ' +
  '(2) **Source URL propagation to email.** Every lead-capture event has a context URL (the property page, building page, listing card parent, home page). URL must be captured at lead-write time, stored on `leads` (new `source_url TEXT` column), and rendered as clickable link in every email going to the hierarchy fan-out. Recipient clicks URL ' + EM + ' instantly at the relevant page ' + EM + ' acts in seconds. No exceptions. ' +
  '(3) **Cumulative view architecture.** Lead events are NOT independent. When a user touches multiple CTAs over time, the agent sees the complete journey from a single entry point. `leads` table stays as event log (no shape change); leads list view **collapses by user_id** when present (one row per identified user, anonymous leads stay per-row, "+N earlier events" indicator); workbench page (`/admin-homes/leads/[id]`) is **anchored on user_id** when present, aggregating every leads row that shares that user_id ' + EM + ' timeline interleaves activities across all events, plan tab shows latest buyer + latest seller plan, emails tab unions across all events, VIP/credit/audit-action history unions across all events. Status/Quality/Notes become per-user-journey values when user_id present (latest lead values render as the user current state). ' +
  '(4) **Full 7-role hierarchy with 2 new roles.** Founder corrected the role list from 5 to 7: (a) `platform_admin` (founder, all tenants, all tech); (b) `platform_assistant` NEW (support for platform_admin, all tenants visible, NO destructive/tech actions ' + EM + ' no delete, no bulk_sync, no schema, no tenant_create, no API keys); (c) `tenant_manager` NEW (admin role spanning a subset of tenants via new `tenant_manager_assignments(user_id, tenant_id)` table, full business admin within assigned tenants, NO tech); (d) `tenant_admin` (single tenant, full admin including tech); (e) `area_manager` (within tenant, descendants in hierarchy); (f) `manager` (within tenant, direct reports + self); (g) `agent` (own assigned leads only). ' +
  'Top-bar UI per role: platform_admin/assistant ' + EM + ' Universal/Tenant toggle + tenant dropdown; tenant_manager ' + EM + ' tenant switcher showing only assigned tenants; everyone else ' + EM + ' locked to their tenant. ' +
  'Two scoping mechanisms enforce safety in parallel: **scopeLeadsQuery(user, baseQuery)** applies the tenant + hierarchy scope predicate per role (new file `lib/admin-homes/scope.ts`, every leads read goes through it); **can(user, "action.name")** gates per-action permissions independently of scope (existing helper from P0-5 extended with new role + action constants). ' +
  '**Phase table expanded from 16 to 22 phases across 6 groups** (A Foundation: W1 recon, W2 schema, W2.5 scope+permission helpers; B Strip+Wire: W3a strip noise, W3b Home Book-a-Visit parity, W3c source_url wiring, W3d click-row navigate; C Workbench Page: W4a-g 7 tabs anchored on user_id; D Role-Aware: W5a top-bar+filters, W5b collapse-by-user, W5c per-role action gates; E Enhancements: W6a audit log writes, W6b reassign agent, W6c default filter+sort; F Test+Close: W7 smoke matrix, W8 Wclose). ' +
  '**Sized now: ~25-30 hours of focused work.** Founder mandate 2026-05-12: "I want this done once and for all comprehensively ' + EM + ' efficient and comprehensive ' + EM + ' done once." ' +
  '**Multi-tenant safety contract restated:** every query through scopeLeadsQuery, every action through can(), every new audit table tenant_id NOT NULL from creation (avoids F-LEAD-NOTES-NO-TENANT-ID-COLUMN class of issue). ' +
  '**Testing approach (founder-directed):** "all testing is code based" ' + EM + ' new `scripts/smoke-w-leads-workbench.ts` runner exercises every CTA × every role × cumulative-view variants against fixture tenant + fixture user with transactional rollback (W-LEADS-EMAIL T3b/T3c pattern, which shipped 25/25 PASS). Per-CTA assertions: leads row written with correct source + lead_origin_route + source_url + tenant_id + user_id; lead_email_recipients_log fan-out matches expected hierarchy layers; plan delivery (where applicable) writes plan_data + delivery email row. Per-role assertions: scope predicate matches expected lead visibility set; action permissions match expected enabled/disabled state. `testingleads@gmail.com` buyer plan delivery bug resolves as part of the architecture (Source URL wiring + delivery pipeline correctness), NOT a separate hotfix ' + EM + ' the bug exists because the pipeline has a gap; fixing the pipeline fixes the bug; the smoke matrix proves it stays fixed. ' +
  '**Workstream tracker updated:** `docs/W-LEADS-WORKBENCH-TRACKER.md` v1 ' + EM + ' v2 with full v2 scope expansion section + updated Scope contract + updated Outcomes desired + expanded 22-phase table + multi-tenant safety contract + recon findings + open questions log. ' +
  '**No master tracker Section 4 row change** ' + EM + ' the W-LEADS-WORKBENCH OPEN row at L186 already references "OPEN 2026-05-12" without phase count; v2 scope expansion is captured in this v19 status log entry + the workstream tracker file itself. ' +
  '**Next:** W1 deep recon (no writes, paste 117). Read every CTA file, every lead-capture API route, every email template HTML, locate Users page credit UI shape, SQL probe `leads` table for source/route/status/quality distribution, trace `testingleads@gmail.com` buyer plan history, trace registration flow source-write path, audit existing scope/permission code (`can()`, `resolveAdminHomesUser`, `seeAll` flag). Deliverable at end of W1: comprehensive lead source matrix + views design map + bug RCAs + scope helper implementation plan. THEN W2/W2.5 schema + foundation work begins with verified facts.';

const oldAnchor = '**Post-P0 backlog** (not blocking launch ' + EM + ' see Section 3 P1/P2 + Section 4 trackers for detail):';
const newReplacement = V19 + '\n\n' + oldAnchor;

if ((text.split(oldAnchor).length - 1) !== 1) throw new Error('Post-P0 anchor count != 1');
text = text.replace(oldAnchor, newReplacement);

if ((text.split('**2026-05-12 v19**').length - 1) !== 1) throw new Error('v19 not present once after patch');
if (text.indexOf('\r\n') !== -1) throw new Error('CRLF introduced');

fs.writeFileSync(src, text, 'utf8');

const outBytes = fs.readFileSync(src);
let outCrlf = 0, outLf = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) outCrlf++; else outLf++;
  }
}
if (outCrlf > 0) throw new Error('LE drift');
if (outLf < inputLf) throw new Error('LF count dropped');
console.log('master v19: input ' + inputBytes.length + ' -> output ' + outBytes.length + ' bytes, LF ' + inputLf + ' -> ' + outLf);
console.log('=== v19 patch APPLIED OK ===');