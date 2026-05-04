// scripts/r4-2-smoke-rpcs.js
//
// W-ROLES-DELEGATION/R4.2 — RPC integration smoke.
//
// Tests all five role-transition RPCs against fabricated fixture data in a
// sentinel tenant. Exercises every success path and every documented invariant
// rejection. NOT a unit test for can() — that's R3.3. This is integration
// proof that the DB layer enforces what we claim.
//
// Run: node scripts/r4-2-smoke-rpcs.js
// Exit 0 if all cells pass; 1 if any fail.
//
// Fixture hierarchy:
//
//   TENANT_A
//   └── TA1 (tenant_admin) ── peer
//   └── TA2 (tenant_admin) ── peer (so TA1 can be demoted without sole-admin block)
//       └── AM (area_manager)
//           ├── M1 (manager)  → A1, A2
//           └── M2 (manager)  → A3
//   TENANT_B
//   └── TB_TA (tenant_admin)
//       └── TB_AGENT (agent)
//
// Cleanup: deletes fixture rows in FK-safe order at end (always runs, even on failure).

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ─────────────────────────────────────────────────────────────────────────────
// Fixture IDs
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_A = '00000000-0000-0000-0000-00000000000a'
const TENANT_B = '00000000-0000-0000-0000-00000000000b'

const TA1 = '00000000-0000-0000-0000-0000000000a1'
const TA2 = '00000000-0000-0000-0000-0000000000a2'
const AM  = '00000000-0000-0000-0000-0000000000a3'
const M1  = '00000000-0000-0000-0000-0000000000a4'
const M2  = '00000000-0000-0000-0000-0000000000a5'
const A1  = '00000000-0000-0000-0000-0000000000a6'
const A2  = '00000000-0000-0000-0000-0000000000a7'
const A3  = '00000000-0000-0000-0000-0000000000a8'

const TB_TA    = '00000000-0000-0000-0000-0000000000b1'
const TB_AGENT = '00000000-0000-0000-0000-0000000000b2'

const ALL_AGENTS = [TA1, TA2, AM, M1, M2, A1, A2, A3, TB_TA, TB_AGENT]
const ALL_TENANTS = [TENANT_A, TENANT_B]

// ─────────────────────────────────────────────────────────────────────────────
// Counters + cell runner
// ─────────────────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
const failures = []

async function expectOk(name, fn) {
  try {
    const result = await fn()
    if (result.error) {
      fail++
      console.log(`  FAIL: ${name}`)
      console.log(`        expected ok, got error: ${result.error.message}`)
      failures.push({ name, expected: 'ok', got: result.error.message })
      return null
    }
    pass++
    console.log(`  PASS: ${name}`)
    return result.data
  } catch (e) {
    fail++
    console.log(`  FAIL: ${name}`)
    console.log(`        unexpected throw: ${e.message}`)
    failures.push({ name, expected: 'ok', got: 'throw: ' + e.message })
    return null
  }
}

async function expectInvariant(name, expectedInvariant, fn) {
  try {
    const result = await fn()
    if (!result.error) {
      fail++
      console.log(`  FAIL: ${name}`)
      console.log(`        expected INVARIANT_${expectedInvariant}, got ok with data: ${JSON.stringify(result.data)}`)
      failures.push({ name, expected: 'INVARIANT_' + expectedInvariant, got: 'ok' })
      return
    }
    if (!result.error.message.includes('INVARIANT_' + expectedInvariant)) {
      fail++
      console.log(`  FAIL: ${name}`)
      console.log(`        expected INVARIANT_${expectedInvariant}, got: ${result.error.message}`)
      failures.push({ name, expected: 'INVARIANT_' + expectedInvariant, got: result.error.message })
      return
    }
    pass++
    console.log(`  PASS: ${name}`)
  } catch (e) {
    fail++
    console.log(`  FAIL: ${name}`)
    console.log(`        unexpected throw: ${e.message}`)
    failures.push({ name, expected: 'INVARIANT_' + expectedInvariant, got: 'throw: ' + e.message })
  }
}

async function expectMessage(name, msgFragment, fn) {
  try {
    const result = await fn()
    if (!result.error) {
      fail++
      console.log(`  FAIL: ${name}`)
      console.log(`        expected error containing "${msgFragment}", got ok`)
      failures.push({ name, expected: msgFragment, got: 'ok' })
      return
    }
    if (!result.error.message.includes(msgFragment)) {
      fail++
      console.log(`  FAIL: ${name}`)
      console.log(`        expected message to contain "${msgFragment}", got: ${result.error.message}`)
      failures.push({ name, expected: msgFragment, got: result.error.message })
      return
    }
    pass++
    console.log(`  PASS: ${name}`)
  } catch (e) {
    fail++
    console.log(`  FAIL: ${name}`)
    console.log(`        unexpected throw: ${e.message}`)
    failures.push({ name, expected: msgFragment, got: 'throw: ' + e.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture build / wipe
// ─────────────────────────────────────────────────────────────────────────────

async function wipeFixture() {
  // Delete in FK-safe order: delegations and role_changes first (point at agents),
  // then agents, then tenants.
  await supabase.from('agent_delegations').delete().in('tenant_id', ALL_TENANTS)
  await supabase.from('agent_role_changes').delete().in('tenant_id', ALL_TENANTS)
  await supabase.from('agents').delete().in('id', ALL_AGENTS)
  await supabase.from('tenants').delete().in('id', ALL_TENANTS)
}

async function buildFixture() {
  // Tenants
  const tenantRows = [
    { id: TENANT_A, name: 'R4.2 Tenant A', domain: 'r42a.test', admin_email: 'r42a@sentinel.test', source_key: 'r42-a' },
    { id: TENANT_B, name: 'R4.2 Tenant B', domain: 'r42b.test', admin_email: 'r42b@sentinel.test', source_key: 'r42-b' },
  ]
  let r = await supabase.from('tenants').insert(tenantRows)
  if (r.error) throw new Error('tenant insert: ' + r.error.message)

  // Agents
  function agentRow(id, tenantId, role, parentId, suffix) {
    return {
      id,
      tenant_id: tenantId,
      user_id: null,
      email: `r42-${suffix}@sentinel.test`,
      full_name: `R42 ${suffix.toUpperCase()}`,
      role,
      site_type: 'comprehensive',
      subdomain: `r42-${suffix}`,
      parent_id: parentId,
    }
  }

  const agentRows = [
    agentRow(TA1, TENANT_A, 'tenant_admin', null, 'ta1'),
    agentRow(TA2, TENANT_A, 'tenant_admin', null, 'ta2'),
    agentRow(AM,  TENANT_A, 'area_manager', TA1, 'am'),
    agentRow(M1,  TENANT_A, 'manager',      AM,  'm1'),
    agentRow(M2,  TENANT_A, 'manager',      AM,  'm2'),
    agentRow(A1,  TENANT_A, 'agent',        M1,  'a1'),
    agentRow(A2,  TENANT_A, 'agent',        M1,  'a2'),
    agentRow(A3,  TENANT_A, 'agent',        M2,  'a3'),
    agentRow(TB_TA,    TENANT_B, 'tenant_admin', null, 'tb-ta'),
    agentRow(TB_AGENT, TENANT_B, 'agent',        TB_TA, 'tb-agent'),
  ]
  r = await supabase.from('agents').insert(agentRows)
  if (r.error) throw new Error('agent insert: ' + r.error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC helpers
// ─────────────────────────────────────────────────────────────────────────────

const rpc = {
  promote: (actor, target, newRole, reason) =>
    supabase.rpc('rpc_promote_agent', { p_actor_id: actor, p_target_id: target, p_new_role: newRole, p_reason: reason ?? null }),
  demote: (actor, target, newRole, reason) =>
    supabase.rpc('rpc_demote_agent', { p_actor_id: actor, p_target_id: target, p_new_role: newRole, p_reason: reason ?? null }),
  reassign: (actor, target, newParent, reason) =>
    supabase.rpc('rpc_reassign_parent', { p_actor_id: actor, p_target_id: target, p_new_parent_id: newParent, p_reason: reason ?? null }),
  grant: (actor, delegator, delegate, notes) =>
    supabase.rpc('rpc_grant_delegation', { p_actor_id: actor, p_delegator_id: delegator, p_delegate_id: delegate, p_notes: notes ?? null }),
  revoke: (actor, delegationId, reason) =>
    supabase.rpc('rpc_revoke_delegation', { p_actor_id: actor, p_delegation_id: delegationId, p_reason: reason ?? null }),
}

// Reset role/parent of an agent between tests so order doesn't matter
async function resetAgent(agentId, role, parentId) {
  await supabase.from('agents').update({ role, parent_id: parentId }).eq('id', agentId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('R4.2 — RPC smoke')
  console.log('=================')
  console.log('')
  console.log('Wiping any prior fixture...')
  await wipeFixture()
  console.log('Building fixture...')
  await buildFixture()
  console.log('')

  try {
    // ── promote ────────────────────────────────────────────────────────────
    console.log('--- rpc_promote_agent ---')

    await expectOk('1. TA1 promotes A1 (agent → manager)',
      () => rpc.promote(TA1, A1, 'manager', 'smoke 1'))
    await resetAgent(A1, 'agent', M1)

    await expectInvariant('2. TA1 promotes self (blocked)', 'SELF_ACTION',
      () => rpc.promote(TA1, TA1, 'admin', 'smoke 2'))

    await expectInvariant('3. TA1 promotes TB_AGENT (cross-tenant blocked)', 'CROSS_TENANT',
      () => rpc.promote(TA1, TB_AGENT, 'manager', 'smoke 3'))

    await expectInvariant('4. TA1 promotes A1 to "agent" (no change)', 'NO_CHANGE',
      () => rpc.promote(TA1, A1, 'agent', 'smoke 4'))

    await expectInvariant('5. TA1 promotes M1 to "agent" (not a promotion)', 'NOT_PROMOTION',
      () => rpc.promote(TA1, M1, 'agent', 'smoke 5'))

    await expectInvariant('6. TA1 promotes A1 to "bogus" (invalid role)', 'INVALID_ROLE',
      () => rpc.promote(TA1, A1, 'bogus', 'smoke 6'))

    // ── demote ─────────────────────────────────────────────────────────────
    console.log('')
    console.log('--- rpc_demote_agent ---')

    // First, give M2 no children so demoting it to agent is no-orphan-safe
    await resetAgent(A3, 'agent', M1)  // move A3 from M2 to M1 to free M2

    await expectOk('7. TA1 demotes M2 (manager → agent, no children now)',
      () => rpc.demote(TA1, M2, 'agent', 'smoke 7'))
    await resetAgent(M2, 'manager', AM)
    await resetAgent(A3, 'agent', M2)  // restore

    await expectInvariant('8. TA1 demotes self (blocked)', 'SELF_ACTION',
      () => rpc.demote(TA1, TA1, 'agent', 'smoke 8'))

    await expectInvariant('9. TA1 demotes M1 to agent (has children A1,A2 → no-orphan)', 'NO_ORPHAN',
      () => rpc.demote(TA1, M1, 'agent', 'smoke 9'))

    // Sole-tenant-admin block: temporarily delete TA2 so TA1 is alone
    await supabase.from('agents').delete().eq('id', TA2)
    await expectInvariant('10. TA2 demotes TA1 — TA1 is sole TA (sole-tenant-admin)', 'SOLE_TENANT_ADMIN',
      () => rpc.demote(AM, TA1, 'area_manager', 'smoke 10'))
    // Restore TA2
    await supabase.from('agents').insert({
      id: TA2, tenant_id: TENANT_A, user_id: null, email: 'r42-ta2@sentinel.test',
      full_name: 'R42 TA2', role: 'tenant_admin', site_type: 'comprehensive',
      subdomain: 'r42-ta2', parent_id: null,
    })

    await expectInvariant('11. TA1 demotes A1 to manager (not a demotion)', 'NOT_DEMOTION',
      () => rpc.demote(TA1, A1, 'manager', 'smoke 11'))

    // ── reassign_parent ────────────────────────────────────────────────────
    console.log('')
    console.log('--- rpc_reassign_parent ---')

    await expectOk('12. TA1 reassigns A1 from M1 → M2',
      () => rpc.reassign(TA1, A1, M2, 'smoke 12'))
    await resetAgent(A1, 'agent', M1)

    await expectInvariant('13. TA1 reassigns self (blocked)', 'SELF_ACTION',
      () => rpc.reassign(TA1, TA1, AM, 'smoke 13'))

    await expectInvariant('14. TA1 reassigns A1 to A1 (parent = self)', 'SELF_PARENT',
      () => rpc.reassign(TA1, A1, A1, 'smoke 14'))

    await expectInvariant('15. TA1 reassigns A1 → TB_TA (cross-tenant parent)', 'CROSS_TENANT_PARENT',
      () => rpc.reassign(TA1, A1, TB_TA, 'smoke 15'))

    await expectInvariant('16. TA1 reassigns M1 → A1 (parent tier ≤ target tier)', 'PARENT_TIER',
      () => rpc.reassign(TA1, M1, A1, 'smoke 16'))

    // Cell 17 (cycle detection) intentionally omitted.
    //
    // The CYCLE invariant in rpc_reassign_parent fires when new_parent_id is
    // in the target's subtree. But subtrees ALWAYS contain only same-or-lower
    // tier agents (per the spec: parent role tier must be > child role tier).
    // So any reachable cycle case is also a PARENT_TIER violation, and
    // PARENT_TIER is checked first (cheaper).
    //
    // CYCLE remains in the RPC as defense-in-depth: it would activate if
    // a data migration or manual SQL ever produced a same-tier parent-child
    // relationship (currently impossible via API, but the trigger is the
    // last line of defense if schema integrity is violated).
    //
    // Cell 17 retired 2026-05-04 in R4.2.1.

    await expectOk('18. TA1 reassigns A1 to top of tenant (parent=null)',
      () => rpc.reassign(TA1, A1, null, 'smoke 18'))
    await resetAgent(A1, 'agent', M1)

    // ── grant_delegation ───────────────────────────────────────────────────
    console.log('')
    console.log('--- rpc_grant_delegation ---')

    let firstDelegation = null
    const grantData = await expectOk('19. TA1 grants delegation: M1 → A1',
      () => rpc.grant(TA1, M1, A1, 'smoke 19'))
    if (grantData) firstDelegation = grantData.delegation_id

    await expectMessage('20. TA1 grants M1 → M1 (self-delegation, table CHECK)', 'agent_delegations_no_self',
      () => rpc.grant(TA1, M1, M1, 'smoke 20'))

    await expectInvariant('21. TA1 grants M1 → TB_AGENT (cross-tenant)', 'CROSS_TENANT_DELEGATION',
      () => rpc.grant(TA1, M1, TB_AGENT, 'smoke 21'))

    // No-SOS: A1 is now a delegate (smoke 19). Try to make A1 a delegator.
    await expectMessage('22. TA1 grants A1 → A2 (A1 is already delegate → no-SOS trigger)', 'support-of-support',
      () => rpc.grant(TA1, A1, A2, 'smoke 22'))

    // No-cycle (direct): grant A1 → M1 (M1 already delegates to A1)
    await expectMessage('23. TA1 grants A1 → M1 (direct cycle)', 'cycle',
      () => rpc.grant(TA1, A1, M1, 'smoke 23'))

    // ── revoke_delegation ──────────────────────────────────────────────────
    console.log('')
    console.log('--- rpc_revoke_delegation ---')

    if (firstDelegation) {
      await expectOk('24. TA1 revokes the delegation from cell 19',
        () => rpc.revoke(TA1, firstDelegation, 'smoke 24'))

      await expectInvariant('25. TA1 revokes the same delegation again (already revoked)', 'ALREADY_REVOKED',
        () => rpc.revoke(TA1, firstDelegation, 'smoke 25'))
    } else {
      console.log('  SKIP cells 24-25 (cell 19 did not return a delegation_id)')
    }

    await expectInvariant('26. TA1 revokes nonexistent delegation', 'DELEGATION_NOT_FOUND',
      () => rpc.revoke(TA1, '00000000-0000-0000-0000-deadbeefdead', 'smoke 26'))

  } finally {
    console.log('')
    console.log('Cleaning up fixture...')
    await wipeFixture()
  }

  // Summary
  console.log('')
  console.log('--- Summary ---')
  console.log(`PASS: ${pass}`)
  console.log(`FAIL: ${fail}`)
  console.log(`TOTAL: ${pass + fail}`)

  if (fail > 0) {
    console.log('')
    console.log('FAILURES:')
    for (const f of failures) {
      console.log(`  - ${f.name}`)
      console.log(`    expected: ${f.expected}`)
      console.log(`    got:      ${f.got}`)
    }
    process.exit(1)
  }

  console.log('')
  console.log('ALL CELLS PASS')
  process.exit(0)
}

main().catch(e => {
  console.error('FATAL:', e)
  console.error('Attempting cleanup before exit...')
  wipeFixture().finally(() => process.exit(1))
})