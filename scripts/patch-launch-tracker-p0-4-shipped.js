const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'
const COMMIT_HASH = '8a686c0'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

// --- Idempotency guard ---
const postPatchMarkers = [
  'P0 execution: 4/5 closed',
  'P0-5 in progress: W-ADMIN-AUTH-LOCKDOWN',
]
if (postPatchMarkers.some(m => original.includes(m))) {
  console.log('[SKIP] Tracker already at v10 — patch already applied. No changes.')
  process.exit(0)
}

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Section 1 Roles & Delegation row',
    old: '| Roles & Delegation (transitions, audit, can()) | \u2705 | \ud83d\udfe1 | \u2705 | \u274c | W-ROLES-DELEGATION R1\u2013R4 shipped. 5 RPCs + `can()` + `role-transitions.ts` live. 73 cells passing. **R5 (delegation CRUD), R6 (workspace UI), R7 (delegate BCC overlay), R8 (full smoke matrix) NOT shipped \u2014 scope-defined, deferred per cohesion review.** Sister W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`. |',
    new: '| Roles & Delegation (transitions, audit, can()) | \u2705 | \ud83d\udfe1 | \u2705 | \u274c | W-ROLES-DELEGATION R1\u2013R4 + **R7 shipped** (commit `' + COMMIT_HASH + '` 2026-05-05 \u2014 delegate BCC overlay live for layers 1\u20134; 5 smoke cases pass). 5 RPCs + `can()` + `role-transitions.ts` live. 73 cells + 5 R7 cases passing. **R5 (delegation CRUD), R6 (workspace UI), R8 (full smoke matrix) NOT shipped \u2014 scope-defined, deferred per cohesion review.** Sister W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`. |'
  },
  {
    name: 'Section 1 Leads & Email row — delegation overlay live',
    old: '**Delegation BCC overlay NOT live (depends on R7).**',
    new: '**Delegation BCC overlay LIVE** via R7 (commit `' + COMMIT_HASH + '` 2026-05-05 \u2014 layers 1\u20134; layers 5\u20136 platform_admins out of scope).'
  },
  {
    name: 'Section 2 Delegation -> Email BCC overlay entry',
    old: '- **Delegation \u2192 Email BCC overlay**: \u274c Helper does NOT yet read `agent_delegations`. R7 deferred. **Granting a delegation today does not cause the delegate to receive lead emails.**',
    new: '- **Delegation \u2192 Email BCC overlay**: \u2705 Helper reads `agent_delegations` and adds active delegates\u2019 `notification_email` to BCC at layers 1\u20134 (R7 shipped 2026-05-05 commit `' + COMMIT_HASH + '`; 5 smoke cases pass). Layers 5\u20136 (platform_admins) out of scope \u2014 would need parallel mechanism.'
  },
  {
    name: 'Section 3 P0-4 entry',
    old: '**P0-4. W-ROLES-DELEGATION R7 \u2014 delegate BCC overlay**\n- Symptom: delegate gets no email when delegator\'s lead fires.\n- Verify: grant delegation \u2192 POST a lead \u2192 delegate\'s email is in BCC array.\n- Source: `docs/W-ROLES-DELEGATION-TRACKER.md`',
    new: '**P0-4. W-ROLES-DELEGATION R7 \u2014 delegate BCC overlay** \u2014 \u2705 **SHIPPED 2026-05-05** commit `' + COMMIT_HASH + '`\n- Helper `lib/admin-homes/lead-email-recipients.ts` extended via 5 surgical patches: single batched query against `agent_delegations` (delegator_id IN principalIds, tenant_id, revoked_at IS NULL), in-memory map keyed by delegator, BCC entries added during assembly. Layers 1\u20134 only (5\u20136 are platform_admins, different table).\n- Smoke `scripts/smoke-recipients-helper.ts` rewritten: Case 4 (active delegation \u2192 delegate in BCC + resolved.tenant_admin_delegates) + Case 5 (revoked \u2192 delegate absent). Both PASS. Setup/teardown safe via try/finally.\n- Sister R5 (CRUD) + R6 (UI) + R8 (full smoke matrix) remain in P1 backlog.'
  },
  {
    name: 'Section 3 progress header',
    old: '**P0 progress: 3/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705 2026-05-05).**',
    new: '**P0 progress: 4/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705, P0-4 \u2705 2026-05-05).**'
  },
  {
    name: 'Section 4 W-ROLES-DELEGATION row',
    old: '| `docs/W-ROLES-DELEGATION-TRACKER.md` | R1\u2013R4 CLOSED 2026-05-04 | **R5 CRUD, R6 UI, R7 delegate BCC, R8 smoke matrix \u2014 DEFERRED per cohesion review** |',
    new: '| `docs/W-ROLES-DELEGATION-TRACKER.md` | R1\u2013R4 CLOSED 2026-05-04; **R7 SHIPPED via P0-4** 2026-05-05 commit `' + COMMIT_HASH + '` | **R5 CRUD, R6 UI, R8 smoke matrix \u2014 DEFERRED per cohesion review** (R7 upgraded to P0 and closed via P0-4) |'
  },
  {
    name: 'Status line',
    old: '**Status:** TRACKER COMPLETE; **P0 execution: 3/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705 2026-05-05)**.',
    new: '**Status:** TRACKER COMPLETE; **P0 execution: 4/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705, P0-4 \u2705 2026-05-05)**.'
  },
  {
    name: 'Next action',
    old: '**P0-4 in progress: W-ROLES-DELEGATION R7** \u2014 extend `lib/admin-homes/lead-email-recipients.ts` to query `agent_delegations` for each populated principal (layers 1\u20136) and add active delegates\u2019 `notification_email` to BCC. Update `scripts/smoke-recipients-helper.ts` to cover delegation cases. After P0-4, P0-5 (auth lockdown sweep) closes the P0 tier.',
    new: '**P0-5 in progress: W-ADMIN-AUTH-LOCKDOWN** \u2014 sweep 13 production routes onto `can()` + `role-transitions.ts`, off legacy `api-auth.ts`. Scope: `app/api/admin-homes/{activities, agents/[id]/*, agents/list, leads/[id], tenants/*, users/override}/route.ts`. After P0-5 ships, P0 tier is closed and launch milestone is unblocked (modulo external Paddle KYC).'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(occurrences:', occurrences, ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v9Marker = 'After R7, P0-5 (W-ADMIN-AUTH-LOCKDOWN \u2014 13 routes) finishes the P0 tier.'
const v10Line = '\n- **2026-05-05 v10** \u2014 **P0-4 SHIPPED.** Commit `' + COMMIT_HASH + '` pushed; TSC clean; 5 smoke cases all PASS (1: leaf no-delegations, 2: null agent, 3: tenant_admin as agent, 4: active delegation \u2192 delegate in BCC + resolved fields, 5: revoked delegation \u2192 delegate removed). Helper `lib/admin-homes/lead-email-recipients.ts` extended via 5 surgical patches. Smoke `scripts/smoke-recipients-helper.ts` rewritten with try/finally teardown. Layers 5\u20136 (platform_admins) explicitly out of R7 scope. **R7 was upgraded from P1 to P0 during cohesion review** \u2014 it was the only R5\u2013R8 item that was P0 because granting a delegation without BCC overlay creates a silent business-process failure (delegate never sees leads). **Note**: v10 first-attempt hit an apostrophe-class mismatch (curly \u2019 vs straight \') in P0-4 entry OLD anchor; fixed in 19.2-fixed; idempotency guard added so future reruns are safe no-ops. **Status: 4/5 P0 closed.** Next: P0-5 (W-ADMIN-AUTH-LOCKDOWN \u2014 13 routes).'

if (!content.includes(v9Marker)) { console.error('v9 marker not found'); process.exit(1) }
content = content.replace(v9Marker, v9Marker + v10Line)
console.log('  Appended v10 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)