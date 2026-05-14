const fs = require('fs')
const path = require('path')

const TRACKER = 'docs/W-LEADS-WORKBENCH-TRACKER.md'
const filePath = path.join(process.cwd(), TRACKER)
const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

fs.copyFileSync(filePath, filePath + '.backup_' + ts)
console.log('  BACKUP ' + path.basename(filePath) + ' -> ' + path.basename(filePath) + '.backup_' + ts)

let txt = fs.readFileSync(filePath, 'utf8')

function exactReplace(text, oldStr, newStr, label) {
  const idx = text.indexOf(oldStr)
  if (idx === -1) throw new Error('anchor not found: ' + label)
  if (text.indexOf(oldStr, idx + oldStr.length) !== -1) throw new Error('anchor not unique: ' + label)
  return text.replace(oldStr, newStr)
}

// 1. Version v13 -> v14
const oldVersion = '**Version:** v13 \u2014 W4b SHIPPED \u2014 Plan tab renderer at email-template richness; normalizes both planType-nested and intent-flat plan_data shapes; family-of-plans selector when >1; anchor agent join extended for AgentCard fidelity'
const newVersion = '**Version:** v14 \u2014 W4c SHIPPED \u2014 Credits & Usage tab with UserCreditPanel extracted from Users page surface (3-pool model: chat / plans / estimator); 5-source server-side fetch keyed on anchorLead.user_id; empty state for anonymous leads'
txt = exactReplace(txt, oldVersion, newVersion, 'version line v13 -> v14')

// 2. W4c row OPEN -> SHIPPED
const oldW4c = '| W4c | Credits & Usage tab (extract UserCreditPanel) | OPEN | \u2014 | Reusable component from Users page surface |'
const newW4c = '| W4c | Credits & Usage tab (extract UserCreditPanel) | SHIPPED | 2026-05-14 | `components/admin-homes/lead-workbench/UserCreditPanel.tsx` new file (13231 bytes) -- 3-pool surface (chat/plans/estimator) lifted verbatim from `app/admin-homes/users/UsersClient.tsx`; `page.tsx` server-side 5-source fetch (user_profiles + chat_sessions most-recent + user_credit_overrides + tenants config + assigned agent display) keyed on anchorLead.user_id + tenant_id; LeadWorkbenchClient Credits tab branch with empty state when user_id IS NULL (42 of 164 leads = 26%); Users page intentionally untouched in W4c (Rule Zero #2 no-regression -- separate phase for Users page migration to consume the extracted component) |'
txt = exactReplace(txt, oldW4c, newW4c, 'W4c row')

// 3. Append status log entry
const entry =
  '\n- **2026-05-14 W4c-SHIPPED** \u2014 Credits & Usage tab shipped. ' +
  '`components/admin-homes/lead-workbench/UserCreditPanel.tsx` new file (13231 bytes, ~310 LOC). ' +
  '3-pool surface (chat / plans / estimator) extracted VERBATIM from `app/admin-homes/users/UsersClient.tsx`: `POOLS` const + `getTenantDefaults()` + `getResolvedLimits()` algorithm + grant modal with 3 inputs (AI Chat / AI Plans / Estimator) + POST/DELETE to existing `/api/admin-homes/users/override` endpoint + shared-plan-mode badge when `tenant.plan_mode === \'shared\'`. ' +
  '2 patches to existing files: ' +
  '(1) `app/admin-homes/leads/[id]/page.tsx` -- 5-source server-side fetch keyed on `anchorLead.user_id` + `anchorLead.tenant_id` using `Promise.all` parallel reads (user_profiles + chat_sessions most-recent + user_credit_overrides + tenants 17-col config + assigned agent display name; tenant_id-scoped on chat_sessions and user_credit_overrides for multi-tenant safety); userCredit prop + adminUser prop (agentId/role/isPlatformAdmin/tenantId from resolveAdminHomesUser) passed to LeadWorkbenchClient. ' +
  '(2) `app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx` 5 transforms -- import UserCreditPanel + UserCreditData type from new file; extend Props interface with `userCredit: UserCreditData | null` + `adminUser: AdminUserShape`; extend function destructure; extend tab ternary with `tab === \'credits\'` branch routing to new CreditsTab function; insert CreditsTab function with two-tier empty state (anchorLead.user_id IS NULL -> "No user account linked to this lead"; userCredit IS NULL -> "Credit data not available"). ' +
  '**Multi-tenant safety**: 5-source fetch uses `anchorLead.tenant_id` (trusted source from W4a cross-tenant gate) for all sibling queries; cross-tenant credit data access impossible by design. Override POST/DELETE go through existing endpoint that enforces its own cross-tenant gate. ' +
  '**Design decisions**: 3-pool surface mirrors Users page exactly per outcome #5 ("extracted from Users page surface"). Users page UI left UNCHANGED in W4c -- Rule Zero #2 no-regression; consumption migration is a separate phase. F-USERS-NO-SELLER-PLAN-INPUT (override API/DB support 4 limits but UI shows 3) remains OPEN and untouched -- not in W4c scope. ' +
  '**NEW finding F-W4C-USERCREDITPANEL-LOCATION**: component lives in `components/admin-homes/lead-workbench/` (same dir as PlanRenderer) for now; known move-candidate to `components/admin-homes/` (top-level shared) when Users page migrates to consume it -- both surfaces would benefit from a non-workbench-prefixed path. ' +
  '**NEW finding F-W4C-PLAN-MODE-NOT-VISUALIZED**: tenant.plan_mode (default `\'shared\'`) shown as small inline badge next to "Credit pools" heading; buyer/seller plan usage combined into one `plans` count (matches existing Users page semantics). When any tenant ships `plan_mode = \'independent\'`, future phase will split the pool display (2 plans cards instead of 1). Decision deferred until plan_mode actually has a non-shared value in production. ' +
  'TSC --noEmit exit 0. Local dev server running per Shah. ' +
  'NEXT: W4d Activity tab -- unified visitor + admin timeline cumulative across leadFamily (joins `user_activities` by contact_email + `lead_admin_actions` by lead_id across all leads in the family).\n'

if (!txt.endsWith('\n')) txt += '\n'
txt += entry

fs.writeFileSync(filePath, txt, 'utf8')
console.log('  WROTE  ' + TRACKER + ' (' + txt.length + ' bytes)')