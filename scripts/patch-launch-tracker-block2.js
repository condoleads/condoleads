const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'User Management row',
    old: '| User Management (profiles, sessions, tenant link) | _RECON PENDING_ | | | | Block 2 |',
    new: '| User Management (profiles, sessions, tenant link) | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | \ud83d\udfe1 | `user_profiles` (96 rows, **no `tenant_id`** \u2014 by design, cross-tenant users). `chat_sessions` (2096 rows; 48 with NULL `tenant_id`; 2003 anonymous). `user_credit_overrides` (11 rows, `tenant_id NOT NULL` \u2705). `tenant_users` table exists but **no `lib/` or `app/` code refs** \u2014 orphan or RLS-only, needs sweep. Auth helper: `lib/admin-homes/auth.ts` (R3.2.1, 11175B). |'
  },
  {
    name: 'Multi-tenant isolation row',
    old: '| Multi-tenant isolation (tenant_id propagation) | _RECON PENDING_ | | | | Block 2 |',
    new: '| Multi-tenant isolation (tenant_id propagation) | \u2705 | \ud83d\udfe1 | \ud83d\udfe1 | \u2014 | `tenant_id` columns present on `agents`, `leads`, `user_credit_overrides`, `chat_sessions`, `vip_requests`. **Strong enforcement:** `leads.tenant_id NOT NULL`, `user_credit_overrides.tenant_id NOT NULL`, `agents.tenant_id` (FK). **Soft enforcement:** `chat_sessions.tenant_id` nullable; 48 prod rows have NULL. **By design:** `user_profiles` has no `tenant_id` column \u2014 cross-tenant user model. W-TENANT-AUTH Phase 4b smoke matrix 8/8 per W-CREDIT-VERIFY tracker. |'
  },
  {
    name: 'Status line',
    old: '**Status:** RECON IN PROGRESS \u2014 1/5 blocks complete',
    new: '**Status:** RECON IN PROGRESS \u2014 2/5 blocks complete'
  },
  {
    name: 'Next action',
    old: '**Block 2 recon** \u2014 User management (profiles, sessions, tenant linkage). Verification commands in chat.',
    new: '**Block 3 recon** \u2014 Credit system + Auth & Sessions (lib/credits, CreditSessionContext, atomic RPC, chat_messages_v2 logging, `tenant_users` orphan sweep). Verification commands in chat.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v1Marker = '- **2026-05-05 v1** \u2014 Block 1 (Leads + Email) recon complete. Hierarchy, Roles & Delegation, Leads & Email rows populated. Findings: helper + walker uniformity confirmed across 7 lead routes; R5\u2013R8 of W-ROLES-DELEGATION NOT shipped (deferred); 6 F55-class admin literals remain in System 1 + platform routes (out of scope); `leads` table currently empty.'
const v2Line = '\n- **2026-05-05 v2** \u2014 Block 2 (User mgmt + Multi-tenant) recon complete. 4 user-related tables verified. **Two issues surfaced for Section 3 (launch blockers):** (a) 48 `chat_sessions` rows with NULL `tenant_id`; (b) 2003/2096 sessions are anonymous (pre-W-RECOVERY historical \u2014 needs post-Apr-28 confirmation). One open question: `tenant_users` table exists but unreferenced in code \u2014 Block 3 sweep.'

if (!content.includes(v1Marker)) { console.error('v1 marker not found'); process.exit(1) }
content = content.replace(v1Marker, v1Marker + v2Line)
console.log('  Appended v2 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)