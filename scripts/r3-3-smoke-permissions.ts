// scripts/r3-3-smoke-permissions.ts
//
// W-ROLES-DELEGATION/R3.3 — comprehensive permission matrix smoke.
//
// Pure in-memory test of can() against fabricated ActorPermissionContext +
// TargetSpec values. No DB. R3.2.2 already proved the DB integration in
// auth.ts works against production data; this proves the decision function
// itself implements the locked spec correctly across every meaningful cell.
//
// Run: npx tsx scripts/r3-3-smoke-permissions.ts
// Exit 0 if all cells pass; 1 if any fail.

import {
  can,
  type ActorPermissionContext,
  type CanResult,
  type DbRole,
  type PermAction,
  type TargetSpec,
} from '../lib/admin-homes/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// Fixture IDs (in-memory only, never written to DB)
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_A = '00000000-0000-0000-0000-00000000000a'
const TENANT_B = '00000000-0000-0000-0000-00000000000b'

const TA  = '00000000-0000-0000-0000-0000000000a1' // tenant_admin (TENANT_A)
const AM  = '00000000-0000-0000-0000-0000000000a2' // area_manager
const M1  = '00000000-0000-0000-0000-0000000000a3' // manager (under AM)
const M2  = '00000000-0000-0000-0000-0000000000a4' // manager (under AM)
const M3  = '00000000-0000-0000-0000-0000000000a5' // manager (under TA — bypasses AM)
const A1  = '00000000-0000-0000-0000-0000000000a6' // agent (under M1)
const A2  = '00000000-0000-0000-0000-0000000000a7' // agent (under M1)
const A3  = '00000000-0000-0000-0000-0000000000a8' // agent (under M2)
const A4  = '00000000-0000-0000-0000-0000000000a9' // agent (under M3)

const TA2 = '00000000-0000-0000-0000-0000000000b1' // tenant_admin (TENANT_B)
const B_AGENT = '00000000-0000-0000-0000-0000000000b2' // agent (TENANT_B)

const LEAD_OF_A1 = '00000000-0000-0000-0000-0000000000c1'
const LEAD_OF_A2 = '00000000-0000-0000-0000-0000000000c2'
const LEAD_OF_A3 = '00000000-0000-0000-0000-0000000000c3'
const LEAD_OF_A4 = '00000000-0000-0000-0000-0000000000c4'

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy:
//
//   TENANT_A
//   └── TA (tenant_admin)
//       ├── AM (area_manager)
//       │   ├── M1 (manager)        → A1, A2
//       │   └── M2 (manager)        → A3
//       └── M3 (manager)            → A4         (NOT under AM)
//
//   TENANT_B
//   └── TA2 (tenant_admin)
//       └── B_AGENT (agent)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Context builders
// ─────────────────────────────────────────────────────────────────────────────

function ctx(opts: Partial<ActorPermissionContext> & { agentId: string | null }): ActorPermissionContext {
  return {
    agentId: opts.agentId,
    tenantId: opts.tenantId ?? null,
    roleDb: opts.roleDb ?? null,
    platformTier: opts.platformTier ?? null,
    managedAgentIds: opts.managedAgentIds ?? [],
    activeDelegators: opts.activeDelegators ?? [],
  }
}

const ctxTA  = ctx({ agentId: TA,  tenantId: TENANT_A, roleDb: 'tenant_admin', managedAgentIds: [] })
const ctxAM  = ctx({ agentId: AM,  tenantId: TENANT_A, roleDb: 'area_manager', managedAgentIds: [M1, M2, A1, A2, A3] })
const ctxM1  = ctx({ agentId: M1,  tenantId: TENANT_A, roleDb: 'manager', managedAgentIds: [A1, A2] })
const ctxM3  = ctx({ agentId: M3,  tenantId: TENANT_A, roleDb: 'manager', managedAgentIds: [A4] })
const ctxA1  = ctx({ agentId: A1,  tenantId: TENANT_A, roleDb: 'agent' })
const ctxA2  = ctx({ agentId: A2,  tenantId: TENANT_A, roleDb: 'agent' })
const ctxTA2 = ctx({ agentId: TA2, tenantId: TENANT_B, roleDb: 'tenant_admin' })

const ctxAdminPlat = ctx({ agentId: null, tenantId: null, roleDb: null, platformTier: 'admin' })
const ctxMgrPlat   = ctx({ agentId: null, tenantId: null, roleDb: null, platformTier: 'manager' })

// A1 acting as M1's delegate — for overlay tests.
const ctxA1AsM1Delegate: ActorPermissionContext = {
  ...ctxA1,
  activeDelegators: [
    { delegatorId: M1, delegatorRoleDb: 'manager', delegatorTenantId: TENANT_A, delegatorManagedAgentIds: [A1, A2] },
  ],
}

// AM acting as TA's delegate — for self-protection-vs-delegation test.
const ctxAMAsTADelegate: ActorPermissionContext = {
  ...ctxAM,
  activeDelegators: [
    { delegatorId: TA, delegatorRoleDb: 'tenant_admin', delegatorTenantId: TENANT_A, delegatorManagedAgentIds: [] },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Target builders
// ─────────────────────────────────────────────────────────────────────────────

function tgtAgent(agentId: string, tenantId: string, parentId: string | null, roleDb: DbRole): TargetSpec {
  return { kind: 'agent', agentId, tenantId, parentId, roleDb }
}
function tgtLead(leadId: string, tenantId: string, agentId: string | null): TargetSpec {
  return { kind: 'lead', leadId, tenantId, agentId }
}
function tgtTenant(tenantId: string): TargetSpec {
  return { kind: 'tenant', tenantId }
}
function tgtDelegation(delegatorId: string, delegateId: string, tenantId: string): TargetSpec {
  return { kind: 'delegation', delegatorId, delegateId, tenantId }
}
function tgtPlatform(): TargetSpec {
  return { kind: 'platform' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell type + runner
// ─────────────────────────────────────────────────────────────────────────────

interface ExpectOk { ok: true }
interface ExpectDeny { ok: false; status?: 401 | 403; reasonContains?: string }
type Expect = ExpectOk | ExpectDeny

interface Cell {
  name: string
  actor: ActorPermissionContext
  action: PermAction
  target: TargetSpec
  expect: Expect
}

function cell(name: string, actor: ActorPermissionContext, action: PermAction, target: TargetSpec, expect: Expect): Cell {
  return { name, actor, action, target, expect }
}

function evaluateCell(c: Cell): { pass: boolean; got: CanResult; reason?: string } {
  const got = can(c.actor, c.action, c.target)
  if (c.expect.ok) {
    return got.ok ? { pass: true, got } : { pass: false, got, reason: 'expected ok, got deny' }
  }
  if (got.ok) return { pass: false, got, reason: 'expected deny, got ok' }
  if (c.expect.status !== undefined && got.status !== c.expect.status) {
    return { pass: false, got, reason: `expected status ${c.expect.status}, got ${got.status}` }
  }
  if (c.expect.reasonContains !== undefined && !got.reason.includes(c.expect.reasonContains)) {
    return { pass: false, got, reason: `expected reason to contain "${c.expect.reasonContains}", got "${got.reason}"` }
  }
  return { pass: true, got }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cells (42 total)
// ─────────────────────────────────────────────────────────────────────────────

const cells: Cell[] = [
  // ── Self-protection (3) ─────────────────────────────────────────────────────
  cell('1.  TA promote self → blocked',                ctxTA, 'agent.promote',         tgtAgent(TA, TENANT_A, null, 'tenant_admin'),     { ok: false, reasonContains: 'self' }),
  cell('2.  M1 demote self → blocked',                 ctxM1, 'agent.demote',          tgtAgent(M1, TENANT_A, AM,   'manager'),          { ok: false, reasonContains: 'self' }),
  cell('3.  A1 reassignParent self → blocked',         ctxA1, 'agent.reassignParent',  tgtAgent(A1, TENANT_A, M1,   'agent'),            { ok: false, reasonContains: 'self' }),

  // ── Cross-tenant (3) ───────────────────────────────────────────────────────
  cell('4.  TA write agent in B → cross-tenant block', ctxTA, 'agent.write',           tgtAgent(B_AGENT, TENANT_B, TA2, 'agent'),        { ok: false, reasonContains: 'cross-tenant' }),
  cell('5.  TA read agent in B → cross-tenant block',  ctxTA, 'agent.read',            tgtAgent(B_AGENT, TENANT_B, TA2, 'agent'),        { ok: false, reasonContains: 'cross-tenant' }),
  cell('6.  Admin Platform writes B agent → ok',       ctxAdminPlat, 'agent.write',    tgtAgent(B_AGENT, TENANT_B, TA2, 'agent'),        { ok: true }),

  // ── Agent tier (4) ─────────────────────────────────────────────────────────
  cell('7.  A1 read A2 → ok (any reads in tenant)',    ctxA1, 'agent.read',            tgtAgent(A2, TENANT_A, M1, 'agent'),              { ok: true }),
  cell('8.  A1 write A2 → role blocked',               ctxA1, 'agent.write',           tgtAgent(A2, TENANT_A, M1, 'agent'),              { ok: false, reasonContains: 'role' }),
  cell('9.  A1 read own lead → ok',                    ctxA1, 'lead.read',             tgtLead(LEAD_OF_A1, TENANT_A, A1),                { ok: true }),
  cell('10. A1 read A2 lead → not your lead',          ctxA1, 'lead.read',             tgtLead(LEAD_OF_A2, TENANT_A, A2),                { ok: false, reasonContains: 'not your lead' }),

  // ── Manager scope (5) ──────────────────────────────────────────────────────
  cell('11. M1 write A1 (direct child) → ok',          ctxM1, 'agent.write',           tgtAgent(A1, TENANT_A, M1, 'agent'),              { ok: true }),
  cell('12. M1 write A3 (other team) → out of scope',  ctxM1, 'agent.write',           tgtAgent(A3, TENANT_A, M2, 'agent'),              { ok: false, reasonContains: 'scope' }),
  cell('13. M1 write M3 → out of scope',               ctxM1, 'agent.write',           tgtAgent(M3, TENANT_A, TA, 'manager'),            { ok: false, reasonContains: 'scope' }),
  cell('14. M1 read A1 lead → ok',                     ctxM1, 'lead.read',             tgtLead(LEAD_OF_A1, TENANT_A, A1),                { ok: true }),
  cell('15. M1 read A3 lead → out of scope',           ctxM1, 'lead.read',             tgtLead(LEAD_OF_A3, TENANT_A, A3),                { ok: false, reasonContains: 'scope' }),

  // ── Area manager subtree (4) ───────────────────────────────────────────────
  cell('16. AM write M1 (direct child) → ok',          ctxAM, 'agent.write',           tgtAgent(M1, TENANT_A, AM, 'manager'),            { ok: true }),
  cell('17. AM write A1 (grandchild) → ok',            ctxAM, 'agent.write',           tgtAgent(A1, TENANT_A, M1, 'agent'),              { ok: true }),
  cell('18. AM write A4 (under M3, not subtree) → blocked',
                                                       ctxAM, 'agent.write',           tgtAgent(A4, TENANT_A, M3, 'agent'),              { ok: false, reasonContains: 'scope' }),
  cell('19. AM write M3 (sibling, not subtree) → blocked',
                                                       ctxAM, 'agent.write',           tgtAgent(M3, TENANT_A, TA, 'manager'),            { ok: false, reasonContains: 'scope' }),

  // ── Tenant admin (4) ───────────────────────────────────────────────────────
  cell('20. TA write any agent in tenant → ok',        ctxTA, 'agent.write',           tgtAgent(A4, TENANT_A, M3, 'agent'),              { ok: true }),
  cell('21. TA promote M1 → ok',                       ctxTA, 'agent.promote',         tgtAgent(M1, TENANT_A, AM, 'manager'),            { ok: true }),
  cell('22. TA promote AM (area_manager target) → ok', ctxTA, 'agent.promote',         tgtAgent(AM, TENANT_A, TA, 'area_manager'),       { ok: true }),
  cell('23. TA promote TA2 (tenant_admin target) → role blocked',
                                                       ctxTA, 'agent.promote',         tgtAgent(TA2, TENANT_A, null, 'tenant_admin'),    { ok: false, reasonContains: 'role' }),

  // ── Manager Platform (5 — including R3.1 fix regression) ───────────────────
  cell('24. MGR_PLAT writes A in TENANT_A → ok',       ctxMgrPlat, 'agent.write',      tgtAgent(A1, TENANT_A, M1, 'agent'),              { ok: true }),
  cell('25. MGR_PLAT writes B agent (cross-tenant) → ok',
                                                       ctxMgrPlat, 'agent.write',      tgtAgent(B_AGENT, TENANT_B, TA2, 'agent'),        { ok: true }),
  cell('26. MGR_PLAT promotes TA (R3.1 fix regression test) → ok',
                                                       ctxMgrPlat, 'agent.promote',    tgtAgent(TA, TENANT_A, null, 'tenant_admin'),     { ok: true }),
  cell('27. MGR_PLAT platform.write → blocked',        ctxMgrPlat, 'platform.write',   tgtPlatform(),                                    { ok: false, reasonContains: 'platform' }),
  cell('28. MGR_PLAT platform.read → ok',              ctxMgrPlat, 'platform.read',    tgtPlatform(),                                    { ok: true }),

  // ── Admin Platform (3) ─────────────────────────────────────────────────────
  cell('29. ADMIN_PLAT promote anyone → ok',           ctxAdminPlat, 'agent.promote',  tgtAgent(TA, TENANT_A, null, 'tenant_admin'),     { ok: true }),
  cell('30. ADMIN_PLAT platform.write → ok',           ctxAdminPlat, 'platform.write', tgtPlatform(),                                    { ok: true }),
  cell('31. ADMIN_PLAT delegation.grant any → ok',     ctxAdminPlat, 'delegation.grant', tgtDelegation(M1, A2, TENANT_A),                { ok: true }),

  // ── Delegation grant (3) ───────────────────────────────────────────────────
  cell('32. M1 grants delegation of own authority → ok',
                                                       ctxM1, 'delegation.grant',      tgtDelegation(M1, A2, TENANT_A),                  { ok: true }),
  cell('33. M1 grants delegation of TA authority → blocked',
                                                       ctxM1, 'delegation.grant',      tgtDelegation(TA, A2, TENANT_A),                  { ok: false, reasonContains: 'scope' }),
  cell('34. A1 grants delegation of own authority → ok (every tier may delegate)',
                                                       ctxA1, 'delegation.grant',      tgtDelegation(A1, A2, TENANT_A),                  { ok: true }),

  // ── Delegation revoke (2) ──────────────────────────────────────────────────
  cell('35. TA revokes M1’s delegation → ok',          ctxTA, 'delegation.revoke',     tgtDelegation(M1, A1, TENANT_A),                  { ok: true }),
  cell('36. A1 revokes M1’s delegation → blocked',     ctxA1, 'delegation.revoke',     tgtDelegation(M1, A2, TENANT_A),                  { ok: false, reasonContains: 'scope' }),

  // ── Delegation overlay (5) ─────────────────────────────────────────────────
  cell('37. A1-as-M1-delegate reads A1 lead via own → ok',
                                                       ctxA1AsM1Delegate, 'lead.read', tgtLead(LEAD_OF_A1, TENANT_A, A1),                { ok: true }),
  cell('38. A1-as-M1-delegate reads A2 lead via overlay → ok',
                                                       ctxA1AsM1Delegate, 'lead.read', tgtLead(LEAD_OF_A2, TENANT_A, A2),                { ok: true }),
  cell('39. A1-as-M1-delegate reads A4 lead → out of scope (M3 subtree)',
                                                       ctxA1AsM1Delegate, 'lead.read', tgtLead(LEAD_OF_A4, TENANT_A, A4),                { ok: false, reasonContains: 'scope' }),
  cell('40. A1-as-M1-delegate grants delegation of own → ok (no SOS for own)',
                                                       ctxA1AsM1Delegate, 'delegation.grant', tgtDelegation(A1, A2, TENANT_A),           { ok: true }),
  cell('41. A1-as-M1-delegate grants delegation of M1 → SOS blocked',
                                                       ctxA1AsM1Delegate, 'delegation.grant', tgtDelegation(M1, A2, TENANT_A),           { ok: false, reasonContains: 'scope' }),

  // ── Self-protection vs delegation (1) ──────────────────────────────────────
  cell('42. AM-as-TA-delegate demotes AM (self) → self-protection wins over delegation',
                                                       ctxAMAsTADelegate, 'agent.demote', tgtAgent(AM, TENANT_A, TA, 'area_manager'),    { ok: false, reasonContains: 'self' }),
]

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

console.log('R3.3 — comprehensive permission matrix smoke')
console.log('============================================')
console.log(`Cells: ${cells.length}`)
console.log('')

let pass = 0
let fail = 0
const failures: { cell: Cell; reason: string; got: CanResult }[] = []

for (const c of cells) {
  const r = evaluateCell(c)
  if (r.pass) {
    pass++
    console.log(`  PASS: ${c.name}`)
  } else {
    fail++
    console.log(`  FAIL: ${c.name}`)
    console.log(`        ${r.reason}`)
    console.log(`        got: ${JSON.stringify(r.got)}`)
    failures.push({ cell: c, reason: r.reason ?? '', got: r.got })
  }
}

console.log('')
console.log('--- Summary ---')
console.log(`PASS: ${pass}`)
console.log(`FAIL: ${fail}`)
console.log(`TOTAL: ${cells.length}`)

if (fail > 0) {
  console.log('')
  console.log('FAILURES:')
  for (const f of failures) {
    console.log(`  - ${f.cell.name}`)
    console.log(`    expect: ${JSON.stringify(f.cell.expect)}`)
    console.log(`    got:    ${JSON.stringify(f.got)}`)
  }
  process.exit(1)
}

console.log('')
console.log('ALL CELLS PASS')
process.exit(0)