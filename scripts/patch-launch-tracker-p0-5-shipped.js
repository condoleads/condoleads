const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'
const HASH = '87b9b53'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')

if (original.includes('P0 execution: 5/5 closed') || original.includes('P0 TIER CLOSED')) {
  console.log('[SKIP] tracker already at P0 tier closed')
  process.exit(0)
}

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Status line — 4/5 -> 5/5 closed (P0 TIER CLOSED)',
    old: '**Status:** TRACKER COMPLETE; **P0 execution: 4/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705, P0-4 \u2705 2026-05-05)**.',
    new: '**Status:** TRACKER COMPLETE; **P0 TIER CLOSED \u2014 P0 execution: 5/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705, P0-4 \u2705, P0-5 \u2705 2026-05-05)**. Launch unblocked modulo external Paddle KYC.'
  },
  {
    name: 'Section 3 progress header — 4/5 -> 5/5',
    old: '**P0 progress: 4/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705, P0-4 \u2705 2026-05-05).**',
    new: '**P0 progress: 5/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705, P0-4 \u2705, P0-5 \u2705 2026-05-05). P0 TIER CLOSED.**'
  },
  {
    name: 'Next action — P0-5 in progress -> P0 tier closed',
    old: '**P0-5 in progress: W-ADMIN-AUTH-LOCKDOWN** \u2014 sweep 13 production routes onto `can()` + `role-transitions.ts`, off legacy `api-auth.ts`. Scope: `app/api/admin-homes/{activities, agents/[id]/*, agents/list, leads/[id], tenants/*, users/override}/route.ts`. After P0-5 ships, P0 tier is closed and launch milestone is unblocked (modulo external Paddle KYC).',
    new: '**P0 TIER CLOSED 2026-05-05.** All five P0 items (P0-1 through P0-5) shipped in a single working block. The only remaining launch blocker is external: Paddle KYC review (submitted; awaiting Sumsub/Paddle outcome). Once Paddle clears, payment processor onboarding completes and the platform is launch-ready.\n\n**Post-P0 backlog** (not blocking launch):\n- W-ROLES-DELEGATION R5 (delegation CRUD), R6 (workspace UI), R8 (full smoke matrix) \u2014 deferred per cohesion review.\n- W-HIERARCHY H3.9, H4 (backfill), H5 (smoke) \u2014 confirm closed or schedule.\n- 01leads.com go-to-market once payment processor live.\n- Scripts cleanup: `Remove-Item -Recurse -Force scripts` after final verification.'
  }
]

const sec1RowOld = 'Sister W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`.'
if (content.includes(sec1RowOld)) {
  replacements.push({
    name: 'Section 1 Roles & Delegation row \u2014 sister W-ADMIN-AUTH-LOCKDOWN closed',
    old: sec1RowOld,
    new: 'Sister W-ADMIN-AUTH-LOCKDOWN: \u2705 CLOSED via P0-5 (commit `' + HASH + '` 2026-05-05) \u2014 all 15 routes on `can()`; `api-auth.ts` deleted.'
  })
} else {
  console.log('  [info] Section 1 sister-tracker note not found at expected anchor; skipping that update')
}

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(' + occurrences + ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const p04EntryEnd = 'Sister R5 (CRUD) + R6 (UI) + R8 (full smoke matrix) remain in P1 backlog.'
if (!content.includes(p04EntryEnd)) {
  console.error('P0-4 entry anchor not found for inserting P0-5 entry')
  process.exit(1)
}
const p05Entry = '\n\n**P0-5. W-ADMIN-AUTH-LOCKDOWN \u2014 sweep 15 routes onto can()** \u2014 \u2705 **SHIPPED 2026-05-05** commit `' + HASH + '`\n- All 13 production routes that imported `lib/admin-homes/api-auth.ts` migrated to `resolveAdminHomesUser` + `can()` against `ActorPermissionContext`. Two partial-migration routes (`agents/tree-data`, `tenants/[id]/lifecycle`) folded in: inline role checks replaced with `can()` calls.\n- Permission mapping (legacy \u2192 can()): `requireAdminHomesUser` \u2192 null check; `requirePlatformAdmin` \u2192 `platform.read|write`; `requireTenantAccess` \u2192 `tenant.read|write`; `requireAgentAccess` \u2192 `agent.read|write|adminMutate`; `requireLeadAccess` \u2192 `lead.read|write`.\n- Policy clarifications applied: `users/override` (per-user credit overrides) is trust-based \u2014 any tenant-resident may grant/revoke; tenant hard cap is the safety net (no fitting can() action; uses `resolveAdminHomesUser` + cross-tenant guard). `agents/tree-data` uses `agent.read` (any tenant-resident per locked spec). `leads/[id]` DELETE preserves agent-role exclusion (legacy compliance: no agent destructive deletes). `tenants/[id]` PATCH (AI config / API keys / hard cap surface) and `tenants/[id]/lifecycle` map to `tenant.write` (Tenant Admin tier only).\n- Architecture: extracted `createServiceClient` to `lib/admin-homes/service-client.ts`. `agents/route.ts` updated to import from utility (kills duplication that existed pre-P0-5). Deleted `lib/admin-homes/api-auth.ts` (zero consumers).\n- Verification: TSC clean; project-wide grep for `@/lib/admin-homes/api-auth` returns 0; all 4 regression smoke suites pass (r3-3 42/42, r3-2-2 6/6, r4-2 25/25, smoke-recipients-helper 5/5).'

content = content.replace(p04EntryEnd, p04EntryEnd + p05Entry)
console.log('  Inserted P0-5 SHIPPED entry into Section 3')

const v10Marker = '**Status: 4/5 P0 closed.** Next: P0-5 (W-ADMIN-AUTH-LOCKDOWN \u2014 13 routes).'
if (!content.includes(v10Marker)) { console.error('v10 marker not found'); process.exit(1) }
const v11Line = '\n- **2026-05-05 v11** \u2014 **P0-5 SHIPPED. P0 TIER CLOSED.** Commit `' + HASH + '` pushed; TSC clean; all 4 regression smoke suites pass. Final scope: 15 routes (13 legacy api-auth + 2 partial migrations folded in per Rule Zero \u2014 Comprehensive). Architecture: `service-client.ts` utility extracted, `api-auth.ts` deleted (zero consumers), `agents/route.ts` updated to use utility. Policy work: `users/override` confirmed trust-based per Shah; `agents/tree-data` uses locked-spec `agent.read`; `leads/[id]` DELETE preserves agent-role exclusion (legacy compliance). 18 files changed: +395/-312 (net +83 lines, mostly from explicit fetch-then-can() pattern replacing implicit helper internals \u2014 architectural improvement). **All 5 P0 items (P0-1 .. P0-5) closed in a single working block 2026-05-05.** Launch unblocked modulo external Paddle KYC.'

content = content.replace(v10Marker, v10Marker + v11Line)
console.log('  Appended v11 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)