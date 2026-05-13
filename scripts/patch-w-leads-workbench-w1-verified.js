const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md');

if (!fs.existsSync(src)) throw new Error('tracker not found: ' + src);

const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

const inputBytes = fs.readFileSync(src);
const inputSize = inputBytes.length;
let crlfIn = 0, lfOnlyIn = 0;
for (let i = 0; i < inputBytes.length; i++) {
  if (inputBytes[i] === 0x0A) {
    if (i > 0 && inputBytes[i-1] === 0x0D) crlfIn++; else lfOnlyIn++;
  }
}
const isLfOnly = lfOnlyIn > 0 && crlfIn === 0;
if (!isLfOnly) throw new Error('expected LF-only file; got crlf=' + crlfIn + ' lfOnly=' + lfOnlyIn);
console.log('LE: LF-only (lfOnly=' + lfOnlyIn + ')');
console.log('Input size: ' + inputSize + ' bytes');

const backupPath = src + '.backup_' + stamp;
fs.copyFileSync(src, backupPath);
console.log('BACKUP: ' + path.basename(backupPath));

let text = inputBytes.toString('utf8');

// Patch 1: header v2 -> v3
const oldHeader = "**Version:** v2 \u2014 OPEN 2026-05-12 \u2014 Scope expanded to full 7-role hierarchy (platform_admin / platform_assistant / tenant_manager / tenant_admin / area_manager / manager / agent) + cumulative-view architecture (workbench anchored on user_id, leads list collapsed by user) + source_url propagation to email recipients + Home property Book a Visit CTA parity.";
const newHeader = "**Version:** v3 \u2014 OPEN 2026-05-13 \u2014 W1 deep recon CLOSED (10/10 sub-targets verified, all 4 prior PENDING items now disk-verified). Scope per v2: full 7-role hierarchy (platform_admin / platform_assistant / tenant_manager / tenant_admin / area_manager / manager / agent) + cumulative-view architecture (workbench anchored on user_id, leads list collapsed by user) + source_url propagation to email recipients + Home property Book a Visit CTA parity. Next: W2 schema migrations.";
const c1 = text.split(oldHeader).length - 1;
if (c1 !== 1) throw new Error('Patch 1 anchor count = ' + c1 + ' != 1');
text = text.replace(oldHeader, newHeader);
console.log('Patch 1 OK: header v2 -> v3');

// Patch 2: W1 row PARTIAL -> VERIFIED
const oldW1 = "| W1 | Deep recon (Group A) | PARTIAL | 2026-05-13 | 6/10 sub-targets VERIFIED from disk+DB. VERIFIED: (1) lead-capture surface \u2014 10 paths (9 `submitLeadFromForm` callers + `WalliamContactForm` + `VIPAIAccess` SiteHeaderClient L139/L242); (2) property page CTAs \u2014 `PropertyPageClient.tsx` + `HomePropertyPageClient.tsx` full dumps, dual-branch isWalliam/agent, OfferInquiryModal P1 bug at L300/L266 `{agent && ...}` guard; (3) 5 API routes \u2014 `walliam/contact` P0 body-trust tenant_id, `charlie/{appointment,lead,plan-email}` + `walliam/charlie/vip-request` header-correct, `walliam/estimator/vip-request` L204 writes source_url:pageUrl (50% partial); (4) `leads` schema 47 cols `source_url TEXT` EXISTS \u2014 no W2 column-add \u2014 + `tenants` schema; (5) distributions Q3-Q8 + testingleads history + King Shah tenant_admin no parent; (6) `deriveLeadOriginRoute` at `lib/utils/lead-origin-route.ts`. 4/10 PENDING (verify in next probes, not silent absorption): (a) `can()` permission code; (b) Users page credit UI shape (W4c extraction source); (c) email template renderers across 5 API routes; (d) cumulative-view data model (union leads by user_id). |";
const newW1 = "| W1 | Deep recon (Group A) | VERIFIED | 2026-05-13 | 10/10 sub-targets verified from disk+DB. W1-PARTIAL pass (1-6): lead-capture surface 10 paths; property page CTAs dual-branch isWalliam/agent with OfferInquiryModal P1 bug at L300/L266; 5 API routes audited (`walliam/contact` P0 body-trust tenant_id; charlie/{appointment,lead,plan-email} + walliam/charlie/vip-request header-correct; walliam/estimator/vip-request L204 source_url partial); `leads` schema 47 cols `source_url TEXT` already exists; distributions + testingleads history + King Shah no-parent; `deriveLeadOriginRoute`. W1-VERIFIED pass (7-10): (7) `can()` at `lib/admin-homes/permissions.ts` 20,167 B \u2014 15 PermAction literals, 5 TargetSpec kinds, 38 caller sites, pure function, cross-tenant gate, delegation overlay universal except `delegation.grant`; (8) Users credit UI \u2014 `users/page.tsx` 6,387 B + `UsersClient.tsx` 12,477 B + `override/route.ts` 4,211 B, 5-source data bundle, 3-pool resolved-limit algorithm, multi-tenant safe; (9) email renderers \u2014 `lib/actions/leads.ts buildLeadEmail` + 8 inline builders across 5 routes; `sourceUrl` already accepted by `CreateLeadParams` and writes `source_url` to row but NOT rendered in any email body; (10) cumulative-view \u2014 `leads/page.tsx` 8,681 B 6-table parallel pre-fetcher fully tenant-scoped, `[id]/route.ts` 3,220 B uses `can('lead.write')` for PATCH+DELETE, `[id]/` UI directory absent (W4a clean start), `AdminHomesLeadsClient.tsx` 48,066 B (F-W3-NEEDS-PROBE). NEW findings: F-USERS-NO-SELLER-PLAN-INPUT, F-W3C-LIB-ACTIONS-LEADS-EMAIL-NO-SOURCE-URL, F-W3C-WALLIAM-CONTACT-REFERER-CAPTURED-BUT-DISCARDED, F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED, F-W3C-EVERY-ROUTE-OWNS-ITS-OWN-BUILDER, F-W3-NEEDS-ADMINHOMESLEADSCLIENT-PROBE, F-LEADS-PAGE-NO-PAGINATION, F-NO-LEADS-GET-API, F-LEAD-OWNERSHIP-CHANGES-ALSO-NEVER-READ. W2.5 decision LOCKED: lead.write covers PATCH-style mutations per existing [id]/route.ts precedent. |";
const c2 = text.split(oldW1).length - 1;
if (c2 !== 1) throw new Error('Patch 2 anchor count = ' + c2 + ' != 1');
text = text.replace(oldW1, newW1);
console.log('Patch 2 OK: W1 row PARTIAL -> VERIFIED');

// Patch 3: insert W1-VERIFIED status log entry above W1-PARTIAL (line-splice per Lesson 6)
const lines = text.split('\n');
const partialAnchorPrefix = '- **2026-05-13 Group A / W1-PARTIAL** \u2014';
const insertIdx = lines.findIndex(l => l.startsWith(partialAnchorPrefix));
if (insertIdx === -1) throw new Error('Patch 3 anchor (W1-PARTIAL status log line) not found');
const partialCount = lines.filter(l => l.startsWith(partialAnchorPrefix)).length;
if (partialCount !== 1) throw new Error('Patch 3 anchor count = ' + partialCount + ' != 1');

const w1VerifiedEntry = "- **2026-05-13 W1-VERIFIED** \u2014 All 4 remaining Group A / W1 sub-targets verified from disk. Probe 1 `can()` permission code: `lib/admin-homes/permissions.ts` 20,167 B; 15 PermAction literals (`agent.{read,write,promote,demote,reassignParent,adminMutate}`, `lead.{read,write}`, `tenant.{read,write}`, `delegation.{grant,revoke}`, `platform.{read,write}`); 5 TargetSpec kinds (agent/lead/tenant/delegation/platform); 38 caller sites use `can(user.permissions, action, { kind, ... })`; pure function (no I/O, no async, no throws); cross-tenant gate in `evaluateTenantScoped`; delegation overlay universal except `delegation.grant`. W2.5 decision LOCKED: `lead.write` already covers PATCH-style mutations (status/quality) \u2014 `app/api/admin-homes/leads/[id]/route.ts` proves this works; admin actions (archive/reassign/hardDelete) reuse `lead.write` + inline tier check (matches existing DELETE branch precedent that adds `roleDb==='agent'` 403 check); only ADD discrete PermAction if a workbench action needs different semantics. Probe 2 Users credit UI: `app/admin-homes/users/page.tsx` 6,387 B server component does ALL fetching; `UsersClient.tsx` 12,477 B is `'use client'` table + modal; `app/api/admin-homes/users/override/route.ts` 4,211 B POST+DELETE; data bundle = `user_profiles` + `chat_sessions` (most-recent only) + `user_credit_overrides` (4 limit cols: ai_chat_limit/buyer_plan_limit/seller_plan_limit/estimator_limit) + 17-column `tenants` cap config + `agents` for display names; resolved-limit algorithm `min(override[col], tenant.X_hard_cap) | tenant.X_free`; 3 pools rendered (AI Chat / AI Plans / Estimator). Multi-tenant safety: 4/4 supabase queries `.eq('tenant_id', scopedTenantId)` when `!seeAll`. NEW finding F-USERS-NO-SELLER-PLAN-INPUT \u2014 override API accepts `seller_plan_limit` (route L48) but UsersClient modal has no input for it; W4c decision call: expose 4th input or preserve 3-pool simplicity. Probe 3 email renderers: `lib/actions/leads.ts` 15,301 B central authority \u2014 `CreateLeadParams.sourceUrl?` declared (L57), `createLead()` INSERT writes `source_url: params.sourceUrl || null` (L168), BUT `buildLeadEmail()` (L211-249) signature has NO `sourceUrl` parameter and renders NO row for it. 5 routes have 8 distinct inline email builders: `walliam/contact buildContactEmail`, `charlie/appointment buildUserConfirmationEmail + buildAgentNotificationEmail`, `charlie/lead buildUserPlanEmail + buildAgentLeadEmail`, `charlie/plan-email buildRichPlanEmail`, `walliam/charlie/vip-request emailHtml + buildUserApprovalEmailHtml`. NEW findings: F-W3C-LIB-ACTIONS-LEADS-EMAIL-NO-SOURCE-URL (builder defect at central authority); F-W3C-WALLIAM-CONTACT-REFERER-CAPTURED-BUT-DISCARDED (L191 reads referer only for trackUserActivity, never threads to lead row or email); F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED (walliam/estimator/{vip-request,vip-approve,vip-questionnaire} ship 16 sendTenantEmail hits combined, not in W1 5-missing-source_url list; per Rule Zero Comprehensive, folded into W3c scope); F-W3C-EVERY-ROUTE-OWNS-ITS-OWN-BUILDER (8 builder signatures need sourceUrl param; consolidation deferred to potential future W-EMAIL-CONSOLIDATION). Probe 4 cumulative-view: `app/admin-homes/leads/page.tsx` 8,681 B is 6-table parallel pre-fetcher fully tenant-scoped (leads + 4 hierarchy joins, user_activities by contact_email, user_credit_overrides by user_id, vip_requests by lead_id, lead_email_recipients_log by lead_id, lead_notes by lead_id via implicit JOIN scoping); `app/api/admin-homes/leads/[id]/route.ts` 3,220 B uses `can(user.permissions, 'lead.write', {kind:'lead', leadId, tenantId, agentId})` for PATCH + DELETE (DELETE adds inline `roleDb==='agent'` 403 check \u2014 establishes lead.write-plus-extra-tier-check pattern); `app/admin-homes/leads/[id]/` UI directory does NOT exist \u2014 W4a clean start. `AdminHomesLeadsClient.tsx` is 48,066 bytes \u2014 far larger than initially scoped; W3 strip phase needs dedicated probe before delete-vs-preserve decisions. NEW findings: F-W3-NEEDS-ADMINHOMESLEADSCLIENT-PROBE; F-LEADS-PAGE-NO-PAGINATION (`.limit(10000)` at page.tsx L37, out of workbench scope); F-NO-LEADS-GET-API (W4a server-component pattern matches list page; mutations refresh via router.refresh()); F-LEAD-OWNERSHIP-CHANGES-ALSO-NEVER-READ (table both write-orphaned from W-LEADS-EMAIL T0 AND read-orphaned; W4 surface-or-sunset call). Cumulative-view aggregation pattern LOCKED: anchorLead by id+tenant_id \u2192 can('lead.read') gate \u2192 leadFamily by user_id (fallback contact_email) within same tenant_id \u2192 fan-out vip_requests/email_log/notes/activities across leadFamily.ids using page.tsx patterns verbatim \u2192 credit panel by single anchorLead.user_id reusing Probe 2 5-source bundle. Multi-tenant safety preserved: every sibling query scoped by anchorLead.tenant_id (trusted source); cross-tenant aggregation blocked by design. NEXT: W2 schema migrations \u2014 status enum +3 values (TBD W2.1 decision-lock); `lead_admin_actions` audit table; `tenant_manager_assignments` table; `leads.source_url` ALREADY EXISTS (no column-add). Then W2.5 scope helper + permission expansion (additive only). Then W3c source-URL wiring (~80-100 min: lib/actions/leads.ts + 5 main routes + 3 estimator routes; 8 builder-signature changes). Then W3a/b/d, then W4 group, then W5/W6, then W7 smoke matrix, then W8 close.";

lines.splice(insertIdx, 0, w1VerifiedEntry);
text = lines.join('\n');
console.log('Patch 3 OK: W1-VERIFIED status log entry inserted at index ' + insertIdx);

if (text.indexOf('\r\n') !== -1) throw new Error('CRLF in LF-only output');

fs.writeFileSync(src, text, 'utf8');
const outBytes = fs.readFileSync(src);
let crlfOut = 0, lfOnlyOut = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) crlfOut++; else lfOnlyOut++;
  }
}
if (crlfOut > 0) throw new Error('LE drift: CRLF in output (crlfOut=' + crlfOut + ')');
if (lfOnlyOut < lfOnlyIn) throw new Error('LF count dropped: in=' + lfOnlyIn + ' out=' + lfOnlyOut);

console.log('');
console.log('=== PATCH SUCCESS ===');
console.log('Output size: ' + outBytes.length + ' bytes (delta: ' + (outBytes.length - inputSize) + ')');
console.log('Output LE: LF-only (lfOnly=' + lfOnlyOut + ')');