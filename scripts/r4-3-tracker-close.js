const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-ROLES-DELEGATION-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

const contentLF = original.replace(/\r\n/g, '\n')

const OLD_STATUS = '**Status:** R1 + R2 + R3 DONE (2026-05-04). R3 shipped permissions.ts with can() decision function (42-cell matrix smoke), GRANT migration on delegation tables, auth.ts extension populating ActorPermissionContext, and closed P0 auth hole on POST /api/admin-homes/agents (F11). R3.5 (delete api-auth.ts) spun out as W-ADMIN-AUTH-LOCKDOWN sister ticket: 13 production routes still call api-auth.ts and require per-route can() migration. R4 (transition state machine) is next action.'
const NEW_STATUS = '**Status:** R1 + R2 + R3 + R4 DONE (2026-05-04). R4 shipped 5 atomic Postgres RPCs (rpc_promote_agent / rpc_demote_agent / rpc_reassign_parent / rpc_grant_delegation / rpc_revoke_delegation), TypeScript wrapper at lib/admin-homes/role-transitions.ts, and RPC integration smoke at scripts/r4-2-smoke-rpcs.js (25/25 against real DB). Roles ticket is functionally complete. Sister ticket W-ADMIN-AUTH-LOCKDOWN (13 routes still on api-auth.ts) is open but does not block roadmap. Per Shah roadmap: territory \u2192 leads \u2192 dashboard UI \u2192 massive testing \u2192 production. Strategic gate: master launch tracker (W-LAUNCH-TRACKER.md) before territory begins.'

if (!contentLF.includes(OLD_STATUS)) {
  console.error('OLD_STATUS not found.')
  process.exit(1)
}

const OLD_NEXT_LF = [
  '## Next action',
  '',
  '**R4 \u2014 transition state machine.** New file lib/admin-homes/role-transitions.ts with functions promote(), demote(), reassignParent(), grantDelegation(), revokeDelegation(). Each:',
  '1. Calls can() (R3.1) for permission decision.',
  '2. Validates invariants (no orphan, no cycle, single-admin cardinality).',
  '3. Applies the change.',
  '4. Writes append-only audit row to agent_role_changes (R2.3).',
  '5. Returns result. All-or-nothing: failure at any step rolls back.',
  '',
  'Sister tickets opened by R3 close:',
  '',
  '- **W-ADMIN-AUTH-LOCKDOWN** (new, opens immediately) \u2014 migrate the 13 production routes still calling api-auth.ts onto can(). Each route gets surgical patch + per-route smoke. After all 13 ship, api-auth.ts deletion (the original R3.5) becomes safe. Scope: app/api/admin-homes/{activities,agents/[id]/*, agents/list, leads/[id], tenants/*, users/override}/route.ts.'
].join('\n')

const NEW_NEXT_LF = [
  '## Next action',
  '',
  '**Master launch tracker first.** Per session 2026-05-04 strategic pivot: produce docs/W-LAUNCH-TRACKER.md before any further feature ticket. Rationale: scattered backend pieces shipped without top-down cohesion check; no master view of how systems integrate; UI not yet seen end-to-end.',
  '',
  'Master tracker recon order (next session):',
  '1. Read W-HIERARCHY-TRACKER.md + this tracker (known good baselines)',
  '2. Recon leads + email flow (recipients helper, sendActivityEmail, every lead-creating route)',
  '3. Recon user management (user_profiles, chat_sessions, user_credit_overrides, user-tenant linkage)',
  '4. Recon credit system (lib/credits/*, smoke-w-credit-verify.js)',
  '5. Recon dashboard UI (every /admin-homes page + component)',
  '6. Recon territory tables (agent_property_access, agent_geo_buildings, tenant_property_access)',
  '7. Write W-LAUNCH-TRACKER.md with: systems status grid, integration matrix, launch blockers, active execution trackers',
  '',
  '**After master tracker exists**, decide next ticket based on what recon reveals. Likely candidates: territory backend, user-tenant assignment ticket, dashboard UI ticket, or wiring fixes between existing systems.',
  '',
  '### Open sister tickets (do not block roadmap)',
  '',
  '- **W-ADMIN-AUTH-LOCKDOWN** \u2014 migrate the 13 production routes still calling api-auth.ts onto can() + role-transitions.ts. After all 13 ship, lib/admin-homes/api-auth.ts deletion becomes safe. Scope: app/api/admin-homes/{activities, agents/[id]/*, agents/list, leads/[id], tenants/*, users/override}/route.ts. Independent of feature roadmap; can ship anytime.'
].join('\n')

if (!contentLF.includes(OLD_NEXT_LF)) {
  console.error('OLD_NEXT not found.')
  process.exit(1)
}

const APPEND_LF = [
  '',
  '---',
  '',
  '## R4 status log (2026-05-04)',
  '',
  '**R4.0 \u2014 atomic role transition RPCs.** Migration 20260504_r4_0_role_transition_rpcs.sql added 5 SECURITY DEFINER PL/pgSQL functions (rpc_promote_agent, rpc_demote_agent, rpc_reassign_parent, rpc_grant_delegation, rpc_revoke_delegation) plus 2 helpers (role_tier_rank, assert_same_tenant). Each RPC is a single Postgres transaction with structured RAISE EXCEPTION on invariant violations (INVARIANT_<NAME>: <details> prefix). Service-role-only EXECUTE grants. Verified via pg_proc query (7 functions in public schema).',
  '',
  '**R4.1 \u2014 TypeScript wrappers.** lib/admin-homes/role-transitions.ts: 5 exported async functions (promoteAgent, demoteAgent, reassignParent, grantDelegation, revokeDelegation). Each runs app-layer can() check first (R3.1) for fast 403 rejection, then invokes the RPC. INVARIANT_* prefixes parsed and mapped to 400 with structured reason. Locked design (Q1=A, Q2=A, Q3=A): platform actors must act via tenant override before invoking; promote/demote separate exported functions; RPC invariant errors return 400 verbatim. TSC clean.',
  '',
  '**R4.2 \u2014 RPC integration smoke.** scripts/r4-2-smoke-rpcs.js \u2014 fixture-driven test against real DB. Builds 2 sentinel tenants + 10 agents. Runs 25 cells across all 5 RPCs covering every documented success and rejection path. Wipes fixture in finally block. Result: 25/25 PASS.',
  '',
  '**R4.2.1 \u2014 cell 17 retired.** Initial cell 17 attempted CYCLE invariant via AM \u2192 A1 reassign. PARENT_TIER fired first because A1\'s tier is below AM\'s. Investigation: any reachable cycle case necessarily has the proposed parent at lower tier than target (cycle requires parent in target\'s subtree; subtrees are strictly lower-tier per spec). PARENT_TIER and CYCLE both correctly enforced; PARENT_TIER fires first as cheaper check. CYCLE remains in RPC as defense-in-depth against schema-corruption scenarios.',
  '',
  '### R4 commits on main',
  '',
  'Single batch commit covers:',
  '- supabase/migrations/20260504_r4_0_role_transition_rpcs.sql',
  '- lib/admin-homes/role-transitions.ts',
  '- scripts/r4-2-smoke-rpcs.js',
  '- docs/W-ROLES-DELEGATION-TRACKER.md (this update)',
  ''
].join('\n')

let updatedLF = contentLF
  .replace(OLD_STATUS, NEW_STATUS)
  .replace(OLD_NEXT_LF, NEW_NEXT_LF)
  + APPEND_LF

const updated = useCRLF ? updatedLF.replace(/\n/g, '\r\n') : updatedLF
fs.writeFileSync(path, updated, 'utf8')

console.log('Tracker patched.')
console.log('Original size:', original.length)
console.log('New size:', updated.length)
console.log('Delta:', updated.length - original.length)