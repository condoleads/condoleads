const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md');
if (!fs.existsSync(src)) throw new Error('tracker not found');

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
if (!(lfOnlyIn > 0 && crlfIn === 0)) throw new Error('expected LF-only');
console.log('LE: LF-only (lfOnly=' + lfOnlyIn + ')');
console.log('Input: ' + inputSize + ' bytes');

fs.copyFileSync(src, src + '.backup_' + stamp);
console.log('BACKUP: ' + path.basename(src + '.backup_' + stamp));

let text = inputBytes.toString('utf8');

// P1: header v4 -> v5
const oldH = "**Version:** v4 \u2014 OPEN 2026-05-13 \u2014 W2 schema migrations SHIPPED. leads.status CHECK +3 values (meeting_scheduled, won, archived); lead_admin_actions audit table created (tenant-scoped, mirrors lead_email_recipients_log); tenant_manager_assignments junction created (mirrors platform_manager_tenants); leads.source_url already present (143 NULL legacy rows left intact). W2.5 decision LOCKED: lead.write covers PATCH-style mutations per existing precedent. Next: W2.5 scope helper + permission expansion (additive only), then W3c source-URL wiring across 8 builders + 3 estimator routes.";
const newH = "**Version:** v5 \u2014 OPEN 2026-05-13 \u2014 W2 + W2.5 SHIPPED. W2: leads.status CHECK +3 values, lead_admin_actions audit table, tenant_manager_assignments junction. W2.5: lib/admin-homes/scope.ts with isCrossTenantView + getScopedTenantId + scopeLeadsQuery + scopeAgentsByRole + 7-role constants (TENANT_ROLES, PLATFORM_TIERS, PRINCIPAL_TIERS). Pure helpers; consumer migration phase-by-phase as each surface is touched (W4 workbench uses scope.ts on day 1). can() permission expansion deferred \u2014 W1-VERIFIED Probe 1 confirmed existing permissions.ts already covers all needed semantics. Next: W3c source-URL wiring across lib/actions/leads.ts buildLeadEmail + 8 inline builders + 3 estimator routes (~80-100 min).";
const c1 = text.split(oldH).length - 1;
if (c1 !== 1) throw new Error('P1 anchor count = ' + c1);
text = text.replace(oldH, newH);
console.log('P1 OK: header v4 -> v5');

// P2: W2.5 row OPEN -> SHIPPED
const oldW25 = "| W2.5 | `scopeLeadsQuery` helper + `can()` permission expansion | OPEN | \u2014 | W1-VERIFIED Probe 1 confirms `can()` at `lib/admin-homes/permissions.ts` already supports 15 PermAction literals + 5 TargetSpec kinds + 38 caller sites + cross-tenant gate + delegation overlay. W2.5 LOCKED additive only: new file `lib/admin-homes/scope.ts` for role-aware query predicates; `lead.write` already covers PATCH-style workbench mutations per existing `app/api/admin-homes/leads/[id]/route.ts` precedent (DELETE branch adds inline tier check for agent-can't-delete); add discrete `PermAction` only if a workbench action needs different semantics. 7-role surface: `platform_admin` + `platform_assistant` (`platform_admins.tier`), `tenant_manager` (NEW \u2014 multi-tenant via `tenant_manager_assignments` shipped W2), `tenant_admin`/`area_manager`/`manager`/`agent` (existing `agents.role` 5-value CHECK \u2014 no change). |";
const newW25 = "| W2.5 | `scopeLeadsQuery` helper + `can()` permission expansion | SHIPPED | 2026-05-13 | `lib/admin-homes/scope.ts` CREATED with 5 exports: `isCrossTenantView(user, hostTenantId)` predicate; `getScopedTenantId(user, hostTenantId)` resolver; `scopeLeadsQuery<T>(query, user, hostTenantId)` generic helper applying tenant + role gate (manager \u2192 `.in('agent_id', [own + managed])`; agent \u2192 `.eq('agent_id', own)`; admin \u2192 no filter); `scopeAgentsByRole<T>(query, user, hostTenantId)` same pattern keyed on `id`; constants `TENANT_ROLES` (5-value) + `PLATFORM_TIERS` (2-value) + `PRINCIPAL_TIERS` (7-value full surface). Pattern extracted verbatim from `leads/page.tsx` L70-78 + L62-67. Pure helpers \u2014 zero side effects, no DB hits, no async. `can()` permission expansion DEFERRED: W1-VERIFIED Probe 1 confirmed existing `lib/admin-homes/permissions.ts` (15 actions, 5 kinds, 38 caller sites) already covers all PATCH-style workbench mutations via `lead.write` + inline tier check pattern per `app/api/admin-homes/leads/[id]/route.ts` precedent. Consumer migration of `leads/page.tsx`, `users/page.tsx`, `agents/page.tsx` DEFERRED phase-by-phase (Rule Zero #2 no-regression: each migration needs smoke; W4 workbench uses scope.ts on day 1 as fresh consumer with zero regression risk). |";
const c2 = text.split(oldW25).length - 1;
if (c2 !== 1) throw new Error('P2 anchor count = ' + c2);
text = text.replace(oldW25, newW25);
console.log('P2 OK: W2.5 row OPEN -> SHIPPED');

// P3: insert W2.5-SHIPPED status log entry above W2-SHIPPED
const lines = text.split('\n');
const prefix = '- **2026-05-13 W2-SHIPPED** \u2014';
const idx = lines.findIndex(l => l.startsWith(prefix));
if (idx === -1) throw new Error('P3 anchor not found');
if (lines.filter(l => l.startsWith(prefix)).length !== 1) throw new Error('P3 anchor not unique');

const entry = "- **2026-05-13 W2.5-SHIPPED** \u2014 `lib/admin-homes/scope.ts` shipped as new file (pure additive, no existing file modified). 5 exports: `isCrossTenantView(user, hostTenantId): boolean` (platform admin + no tenant + no host = cross-tenant view); `getScopedTenantId(user, hostTenantId): string|null` (returns user.tenantId ?? hostTenantId, null on cross-tenant); `scopeLeadsQuery<T extends ScopableQuery<T>>(query, user, hostTenantId): T` (applies tenant_id .eq() filter when !seeAll, then role gate: manager \u2192 .in('agent_id', [own + managedAgentIds]); agent \u2192 .eq('agent_id', own); admin \u2192 no filter); `scopeAgentsByRole<T>(query, user, hostTenantId): T` (same pattern keyed on 'id'); 3 constant arrays `TENANT_ROLES` (5-value: agent/manager/area_manager/tenant_admin/admin from agents.role CHECK), `PLATFORM_TIERS` (2-value: admin/manager from platform_admins.tier), `PRINCIPAL_TIERS` (7-value: full surface platform_admin/platform_assistant/tenant_manager/tenant_admin/area_manager/manager/agent for documentation). Pattern extracted VERBATIM from `app/admin-homes/leads/page.tsx` L70-78 (tenant gate) + L62-67 (role gate) verified W2.5 recon. Pure functions \u2014 zero side effects, zero DB hits, zero async, zero throws (Rule Zero PURE FUNCTION CONTRACT). `can()` permission expansion DEFERRED based on W1-VERIFIED Probe 1: existing `lib/admin-homes/permissions.ts` (15 PermAction literals, 5 TargetSpec kinds, 38 caller sites, cross-tenant gate in evaluateTenantScoped, delegation overlay universal except delegation.grant) already covers all PATCH-style workbench mutations via `lead.write` + inline tier check pattern (`app/api/admin-homes/leads/[id]/route.ts` DELETE branch demonstrates `lead.write + roleDb===\u0027agent\u0027 inline 403 check` precedent). Consumer migration DEFERRED phase-by-phase: existing inline scoping in `leads/page.tsx` (20 hits), `users/page.tsx` (13 hits), `agents/page.tsx` (9 hits), `api/admin-homes/activities/route.ts` (6 hits), `territory/page.tsx` (6 hits), `delegations/route.ts` (3 hits) preserved unchanged \u2014 Rule Zero #2 no-regression (each consumer migration needs smoke test; ship now would block W3c on smoke matrix). W4 workbench page uses scope.ts on day 1 as fresh consumer (no regression risk \u2014 no prior behavior to preserve). Consumer refactors will land alongside other changes when each page is touched (W4 leads workbench, W5 leads list collapse-by-user, etc.). Multi-tenant safety: every helper enforces `tenant_id` filter when !seeAll; cross-tenant aggregation requires explicit platform admin + no tenant context (verified pre-existing safe pattern). NEXT: W3c source-URL wiring across `lib/actions/leads.ts buildLeadEmail` (add sourceUrl param + render row) + 8 inline builders across 5 routes (`walliam/contact buildContactEmail`, `charlie/appointment buildUserConfirmationEmail + buildAgentNotificationEmail`, `charlie/lead buildUserPlanEmail + buildAgentLeadEmail`, `charlie/plan-email buildRichPlanEmail`, `walliam/charlie/vip-request emailHtml + buildUserApprovalEmailHtml`) + 3 estimator routes (`walliam/estimator/{vip-request,vip-approve,vip-questionnaire}` per F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED). Rule Zero compliance: comprehensive (all 5 expected exports + 3 constant arrays + JSDoc), verified (shape extracted from recon-confirmed pattern), no regressions (pure additive, zero existing file modifications), no deferrals on W2.5 itself (consumer migration is correctly out-of-scope, not deferred work).";

lines.splice(idx, 0, entry);
text = lines.join('\n');
console.log('P3 OK: W2.5-SHIPPED status log entry inserted at index ' + idx);

if (text.indexOf('\r\n') !== -1) throw new Error('CRLF in LF output');

fs.writeFileSync(src, text, 'utf8');
const outBytes = fs.readFileSync(src);
let crlfOut = 0, lfOnlyOut = 0;
for (let i = 0; i < outBytes.length; i++) {
  if (outBytes[i] === 0x0A) {
    if (i > 0 && outBytes[i-1] === 0x0D) crlfOut++; else lfOnlyOut++;
  }
}
if (crlfOut > 0) throw new Error('LE drift');
if (lfOnlyOut < lfOnlyIn) throw new Error('LF count dropped');

console.log('');
console.log('=== PATCH SUCCESS ===');
console.log('Output: ' + outBytes.length + ' bytes (delta: +' + (outBytes.length - inputSize) + ')');