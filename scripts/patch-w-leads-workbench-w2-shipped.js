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
if (!isLfOnly) throw new Error('expected LF-only file');
console.log('LE: LF-only (lfOnly=' + lfOnlyIn + ')');
console.log('Input size: ' + inputSize + ' bytes');

const backupPath = src + '.backup_' + stamp;
fs.copyFileSync(src, backupPath);
console.log('BACKUP: ' + path.basename(backupPath));

let text = inputBytes.toString('utf8');

// Patch 1: header v3 -> v4
const oldHeader = "**Version:** v3 \u2014 OPEN 2026-05-13 \u2014 W1 deep recon CLOSED (10/10 sub-targets verified, all 4 prior PENDING items now disk-verified). Scope per v2: full 7-role hierarchy (platform_admin / platform_assistant / tenant_manager / tenant_admin / area_manager / manager / agent) + cumulative-view architecture (workbench anchored on user_id, leads list collapsed by user) + source_url propagation to email recipients + Home property Book a Visit CTA parity. Next: W2 schema migrations.";
const newHeader = "**Version:** v4 \u2014 OPEN 2026-05-13 \u2014 W2 schema migrations SHIPPED. leads.status CHECK +3 values (meeting_scheduled, won, archived); lead_admin_actions audit table created (tenant-scoped, mirrors lead_email_recipients_log); tenant_manager_assignments junction created (mirrors platform_manager_tenants); leads.source_url already present (143 NULL legacy rows left intact). W2.5 decision LOCKED: lead.write covers PATCH-style mutations per existing precedent. Next: W2.5 scope helper + permission expansion (additive only), then W3c source-URL wiring across 8 builders + 3 estimator routes.";
const c1 = text.split(oldHeader).length - 1;
if (c1 !== 1) throw new Error('Patch 1 anchor count = ' + c1);
text = text.replace(oldHeader, newHeader);
console.log('Patch 1 OK: header v3 -> v4');

// Patch 2: W2 row OPEN -> SHIPPED
const oldW2 = "| W2 | Schema migrations | OPEN | \u2014 | Status enum +3 values; `leads.source_url TEXT` + backfill; `lead_admin_actions` audit table; `tenant_manager_assignments` table; all multi-tenant safe with tenant_id NOT NULL |";
const newW2 = "| W2 | Schema migrations | SHIPPED | 2026-05-13 | `leads_status_check` CHECK +3 values (`meeting_scheduled`, `won`, `archived`) \u2014 atomic DROP+ADD; `lead_admin_actions` audit table created (12 cols + 2 indexes + 4 FKs, mirrors `lead_email_recipients_log`); `tenant_manager_assignments` junction created (7 cols + UNIQUE(user_id,tenant_id) + 2 partial indexes WHERE revoked_at IS NULL + 3 FKs, mirrors `platform_manager_tenants`); `leads.source_url` already exists (no column-add); 143 legacy NULL rows left intact (no fabrication backfill). Migrations on disk: `20260513_w2_a_lead_admin_actions.sql`, `20260513_w2_b_tenant_manager_assignments.sql`, `20260513_w2_c_leads_status_check.sql`. All idempotent. |";
const c2 = text.split(oldW2).length - 1;
if (c2 !== 1) throw new Error('Patch 2 anchor count = ' + c2);
text = text.replace(oldW2, newW2);
console.log('Patch 2 OK: W2 row OPEN -> SHIPPED');

// Patch 3: W2.5 row notes update
const oldW25 = "| W2.5 | `scopeLeadsQuery` helper + `can()` permission expansion | OPEN | \u2014 | New file `lib/admin-homes/scope.ts`; role-aware predicates; permission constants for 7 roles; existing routes refactored to use it |";
const newW25 = "| W2.5 | `scopeLeadsQuery` helper + `can()` permission expansion | OPEN | \u2014 | W1-VERIFIED Probe 1 confirms `can()` at `lib/admin-homes/permissions.ts` already supports 15 PermAction literals + 5 TargetSpec kinds + 38 caller sites + cross-tenant gate + delegation overlay. W2.5 LOCKED additive only: new file `lib/admin-homes/scope.ts` for role-aware query predicates; `lead.write` already covers PATCH-style workbench mutations per existing `app/api/admin-homes/leads/[id]/route.ts` precedent (DELETE branch adds inline tier check for agent-can't-delete); add discrete `PermAction` only if a workbench action needs different semantics. 7-role surface: `platform_admin` + `platform_assistant` (`platform_admins.tier`), `tenant_manager` (NEW \u2014 multi-tenant via `tenant_manager_assignments` shipped W2), `tenant_admin`/`area_manager`/`manager`/`agent` (existing `agents.role` 5-value CHECK \u2014 no change). |";
const c3 = text.split(oldW25).length - 1;
if (c3 !== 1) throw new Error('Patch 3 anchor count = ' + c3);
text = text.replace(oldW25, newW25);
console.log('Patch 3 OK: W2.5 row notes updated');

// Patch 4: insert W2-SHIPPED status log entry above W1-VERIFIED
const lines = text.split('\n');
const prefix = '- **2026-05-13 W1-VERIFIED** \u2014';
const idx = lines.findIndex(l => l.startsWith(prefix));
if (idx === -1) throw new Error('Patch 4 anchor not found');
if (lines.filter(l => l.startsWith(prefix)).length !== 1) throw new Error('Patch 4 anchor not unique');

const entry = "- **2026-05-13 W2-SHIPPED** \u2014 W2 schema migrations applied + verified in production. (A) `leads.status` CHECK constraint replaced atomically (DROP + ADD in single Supabase transaction); 5 existing values (`new`/`contacted`/`qualified`/`closed`/`lost`) + 3 NEW (`meeting_scheduled`/`won`/`archived`); current population 163 new + 1 closed unchanged. (B) `lead_admin_actions` audit table CREATED: 12 columns mirroring `lead_email_recipients_log` shape (`id` uuid PK gen_random_uuid; `tenant_id` uuid NOT NULL FK\u2192tenants CASCADE; `lead_id` uuid NOT NULL FK\u2192leads CASCADE; `actor_user_id` uuid NULL FK\u2192auth.users SET NULL; `actor_agent_id` uuid NULL FK\u2192agents SET NULL; `actor_role` text NOT NULL [snapshot at action time]; `action_type` text NOT NULL; `target_field` text NULL; `before_value` jsonb NULL; `after_value` jsonb NULL; `notes` text NULL; `created_at` timestamptz NOT NULL DEFAULT now()); 2 btree indexes (`idx_lead_admin_actions_tenant_lead` on (tenant_id, lead_id, created_at DESC); `idx_lead_admin_actions_actor` on (actor_user_id, created_at DESC)); 4 FK constraints all verified. (C) `tenant_manager_assignments` junction CREATED: 7 cols + PK (`id`; `user_id` uuid NOT NULL FK\u2192auth.users CASCADE; `tenant_id` uuid NOT NULL FK\u2192tenants CASCADE; `granted_by_user_id` uuid NULL FK\u2192auth.users SET NULL; `granted_at` timestamptz NOT NULL DEFAULT now(); `revoked_at` timestamptz NULL; `notes` text NULL); UNIQUE(user_id, tenant_id); 2 partial btree indexes WHERE revoked_at IS NULL for active-lookup hot path; mirrors `platform_manager_tenants`. (D) `leads.source_url` already exists (W1-VERIFIED Probe 3), 143 NULL legacy + 21 populated; default leave NULL (no fabrication backfill; W3c writes on new leads going forward). Migrations captured retroactively in 3 idempotent files in `supabase/migrations/`: `20260513_w2_a_lead_admin_actions.sql`, `20260513_w2_b_tenant_manager_assignments.sql`, `20260513_w2_c_leads_status_check.sql` \u2014 all use CREATE TABLE IF NOT EXISTS / DROP IF EXISTS + ADD; safe to re-run any environment. Multi-tenant safety verified: every new table has `tenant_id NOT NULL` with FK CASCADE; cross-tenant aggregation impossible by schema design. W2.5 decision LOCKED based on W1-VERIFIED Probe 1: `lead.write` already covers PATCH-style mutations (status enum change, quality change, assign) per existing `app/api/admin-homes/leads/[id]/route.ts` precedent (DELETE branch demonstrates `lead.write + inline tier check` pattern); W2.5 is additive only (new `scopeLeadsQuery` helper file + 7-role permission constants); no migration of 38 existing `can()` caller sites needed. NEXT: W2.5 ship (helper file + permission constants \u2014 single small commit), then W3c source-URL wiring across `lib/actions/leads.ts buildLeadEmail` + 8 inline builders + 3 estimator routes (`walliam/estimator/{vip-request,vip-approve,vip-questionnaire}` per F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED). Rule Zero compliance: comprehensive, verified, multi-tenant safe, no regressions (schema additions only), no deferrals.";

lines.splice(idx, 0, entry);
text = lines.join('\n');
console.log('Patch 4 OK: W2-SHIPPED status log entry inserted at index ' + idx);

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