// scripts/r-territory-t4c-1-smoke.ts
//
// T4c-1 Phase B smoke -- 6 tests covering what's NEW in the bulk-assign route.
//
// Run: npx tsx scripts/r-territory-t4c-1-smoke.ts
// Production data is rolled back -- single outer transaction with SAVEPOINT isolation per test.
// Pattern mirrors scripts/r-territory-t4a-3-smoke.ts (which ran 9/9 PASS).
//
// Coverage in this smoke:
//   T1 (unit) -- computeApaDiff no-op (identical baseline -> incoming) -> 0/0/0/N
//   T2 (unit) -- cross-agent primary conflict guard, positive  -> 1 conflict
//   T3 (unit) -- cross-agent primary conflict guard, negative  -> 0 conflicts
//   T4 (DB)   -- bulk no-op end-to-end                          -> 0 audit rows
//   T5 (DB)   -- mid-transaction INSERT + ROLLBACK              -> pre-state restored (SHA256 match)
//   T6 (DB)   -- multi-agent diff applied independently         -> 1 audit per agent
//
// Coverage NOT in this smoke (deferred to HTTP integration):
//   - can() perm-rejection paths (FORBIDDEN_CROSS_TENANT / FORBIDDEN_SCOPE / no-manage).
//     The can() lib was unit-tested in W-ROLES-DELEGATION R1-R7; the route's perm gate
//     is a thin wrapper that builds an AgentTarget context and calls can() for each
//     target before BEGIN. End-to-end perm rejection requires a running Next.js server
//     + auth fixture, which is outside a savepoint-isolated DB smoke. Tracked as a
//     known coverage gap; can be added as scripts/r-territory-t4c-1-http-smoke.ts in
//     a follow-up if comprehensive HTTP coverage is desired before T4c-2 ships.

import { config } from 'dotenv'
import { Client } from 'pg'
import { computeApaDiff, ApaRow } from '../lib/admin-homes/apa-diff'
import { createHash } from 'crypto'

config({ path: '.env.local' })

const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!cs) {
  console.error('FAIL: DATABASE_URL/POSTGRES_URL not in .env.local')
  process.exit(1)
}

// Test fixtures (verified UUIDs, single tenant -- multi-tenant boundary
// is enforced by tenant_id filters in every query; multi-tenant cross-leak
// rejection is exercised by can() at the route level, not by this smoke).
const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AGENT_A = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'  // King Shah
const AGENT_B = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'  // Neo Smith

interface TestResult { name: string; pass: boolean; detail: string }
const results: TestResult[] = []

function row(o: Partial<ApaRow>): ApaRow {
  return {
    agent_id: AGENT_A,
    tenant_id: TENANT_ID,
    scope: 'community',
    area_id: null,
    municipality_id: null,
    community_id: null,
    neighbourhood_id: null,
    is_primary: false,
    is_active: true,
    condo_access: true,
    homes_access: true,
    buildings_access: true,
    buildings_mode: 'all',
    ...o,
  }
}

// Pure replica of the route's Phase 2 conflict-detection logic
// (app/api/admin-homes/territory/bulk-assign/route.ts lines ~110-145).
// No DB. Returns conflicts in the same shape the route returns to the client.
function detectCrossAgentPrimaryConflicts(
  assignments: Record<string, ApaRow[]>
): { key: string; agents: string[] }[] {
  const primaryClaimsByKey = new Map<string, string[]>()
  for (const agentId of Object.keys(assignments)) {
    for (const r of assignments[agentId]) {
      if (!r.is_primary) continue
      let scopeVal: string | null = null
      if (r.scope === 'area') scopeVal = r.area_id
      else if (r.scope === 'municipality') scopeVal = r.municipality_id
      else if (r.scope === 'community') scopeVal = r.community_id
      else if (r.scope === 'neighbourhood') scopeVal = r.neighbourhood_id
      if (!scopeVal) continue
      const key = r.scope + '|' + scopeVal
      const lst = primaryClaimsByKey.get(key) || []
      if (!lst.includes(agentId)) lst.push(agentId)
      primaryClaimsByKey.set(key, lst)
    }
  }
  const conflicts: { key: string; agents: string[] }[] = []
  for (const e of primaryClaimsByKey) {
    if (e[1].length > 1) conflicts.push({ key: e[0], agents: e[1] })
  }
  return conflicts
}

// =============================================================================
// Unit tests
// =============================================================================

function unitTests() {
  // T1: computeApaDiff no-op
  {
    const ex = [row({ id: '1', community_id: 'c1' })]
    const inc = [row({ community_id: 'c1' })]
    const d = computeApaDiff(ex, inc)
    results.push({
      name: 'T1 (unit): computeApaDiff no-op -> 0/0/0/1',
      pass: d.toDelete.length === 0 && d.toInsert.length === 0 && d.toUpdate.length === 0 && d.unchanged === 1 && d.primaryClaims.length === 0,
      detail: `del=${d.toDelete.length} ins=${d.toInsert.length} upd=${d.toUpdate.length} same=${d.unchanged} claims=${d.primaryClaims.length}`,
    })
  }

  // T2: cross-agent primary conflict (positive case)
  {
    const assignments: Record<string, ApaRow[]> = {
      [AGENT_A]: [row({ agent_id: AGENT_A, community_id: 'c1', is_primary: true })],
      [AGENT_B]: [row({ agent_id: AGENT_B, community_id: 'c1', is_primary: true })],
    }
    const conflicts = detectCrossAgentPrimaryConflicts(assignments)
    const ok = conflicts.length === 1 &&
               conflicts[0].agents.length === 2 &&
               conflicts[0].agents.includes(AGENT_A) &&
               conflicts[0].agents.includes(AGENT_B) &&
               conflicts[0].key === 'community|c1'
    results.push({
      name: 'T2 (unit): 2 agents claim primary on same (scope, scope_id) -> 1 conflict',
      pass: ok,
      detail: `conflicts=${conflicts.length} key=${conflicts[0]?.key} agents=[${conflicts[0]?.agents?.join(',') ?? ''}]`,
    })
  }

  // T3: cross-agent primary conflict (negative case -- only one agent is_primary=true)
  {
    const assignments: Record<string, ApaRow[]> = {
      [AGENT_A]: [row({ agent_id: AGENT_A, community_id: 'c1', is_primary: true })],
      [AGENT_B]: [row({ agent_id: AGENT_B, community_id: 'c1', is_primary: false })],
    }
    const conflicts = detectCrossAgentPrimaryConflicts(assignments)
    results.push({
      name: 'T3 (unit): only 1 agent primary on shared key -> 0 conflicts',
      pass: conflicts.length === 0,
      detail: `conflicts=${conflicts.length}`,
    })
  }
}

// =============================================================================
// DB tests
// =============================================================================

async function dbTests() {
  const client = new Client({ connectionString: cs })
  await client.connect()
  await client.query('BEGIN')

  try {
    // applyDiff mirrors the route's Phase 4 apply logic (route.ts ~165-220).
    // Runs against the current outer transaction; isolation is per-test via SAVEPOINT.
    const applyDiff = async (existing: ApaRow[], incoming: ApaRow[]) => {
      const diff = computeApaDiff(existing, incoming)

      // Auto-reassign for primary claims (single-agent path -- cross-agent dedup
      // already exercised at the unit level in T2/T3 and would be a no-op here).
      for (const claim of diff.primaryClaims) {
        let col: string | null = null
        let val: string | null = null
        if (claim.scope === 'area') { col = 'area_id'; val = claim.area_id }
        else if (claim.scope === 'municipality') { col = 'municipality_id'; val = claim.municipality_id }
        else if (claim.scope === 'community') { col = 'community_id'; val = claim.community_id }
        else if (claim.scope === 'neighbourhood') { col = 'neighbourhood_id'; val = claim.neighbourhood_id }
        if (col && val) {
          await client.query(
            `UPDATE agent_property_access SET is_primary = false
             WHERE scope = $1 AND ${col} = $2 AND is_active = true AND is_primary = true
             AND tenant_id = $3 AND agent_id != $4`,
            [claim.scope, val, claim.tenant_id, claim.agent_id]
          )
        }
      }

      if (diff.toDelete.length > 0) {
        const ids = diff.toDelete.map(r => r.id!).filter(Boolean)
        if (ids.length > 0) {
          await client.query(`DELETE FROM agent_property_access WHERE id = ANY($1::uuid[])`, [ids])
        }
      }

      for (const pair of diff.toUpdate) {
        await client.query(
          `UPDATE agent_property_access
           SET is_primary=$2, condo_access=$3, homes_access=$4, buildings_access=$5, buildings_mode=$6
           WHERE id = $1`,
          [pair.existing.id, pair.incoming.is_primary, pair.incoming.condo_access,
           pair.incoming.homes_access, pair.incoming.buildings_access, pair.incoming.buildings_mode]
        )
      }

      for (const inc of diff.toInsert) {
        await client.query(
          `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id,
            is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [inc.agent_id, inc.tenant_id, inc.scope, inc.area_id, inc.municipality_id, inc.community_id, inc.neighbourhood_id,
           inc.is_primary, inc.is_active, inc.condo_access, inc.homes_access, inc.buildings_access, inc.buildings_mode]
        )
      }

      return diff
    }

    const apaStateForAgent = async (agentId: string): Promise<ApaRow[]> => {
      const r = await client.query<ApaRow>(
        `SELECT id, agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id,
                is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode
         FROM agent_property_access
         WHERE agent_id = $1 AND tenant_id = $2 AND is_active = true
         ORDER BY id`,
        [agentId, TENANT_ID]
      )
      return r.rows as ApaRow[]
    }

    const auditCountForAgent = async (agentId: string): Promise<number> => {
      const r = await client.query(
        `SELECT COUNT(*) FROM territory_assignment_changes
         WHERE agent_id = $1 AND tenant_id = $2`,
        [agentId, TENANT_ID]
      )
      return parseInt(r.rows[0].count, 10)
    }

    const stateHash = (rows: ApaRow[]): string => {
      const norm = rows.map(r => ({
        id: r.id, agent_id: r.agent_id, tenant_id: r.tenant_id, scope: r.scope,
        area_id: r.area_id, municipality_id: r.municipality_id, community_id: r.community_id, neighbourhood_id: r.neighbourhood_id,
        is_primary: r.is_primary, is_active: r.is_active,
        condo_access: r.condo_access, homes_access: r.homes_access,
        buildings_access: r.buildings_access, buildings_mode: r.buildings_mode,
      }))
      return createHash('sha256').update(JSON.stringify(norm)).digest('hex')
    }

    // ------------------------------------------------------------------------
    // T4: bulk no-op end-to-end -> 0 audit rows
    // ------------------------------------------------------------------------
    await client.query('SAVEPOINT t4')
    {
      const baseline = await apaStateForAgent(AGENT_A)
      console.log(`T4 baseline: ${baseline.length} active APA rows for AGENT_A`)
      const a1 = await auditCountForAgent(AGENT_A)
      const incoming = baseline.map(r => ({ ...r, id: undefined }))
      await applyDiff(baseline, incoming)
      const a2 = await auditCountForAgent(AGENT_A)
      results.push({
        name: 'T4 (DB): bulk no-op (identical baseline -> incoming) -> 0 audit rows',
        pass: (a2 - a1) === 0,
        detail: `audit delta=${a2 - a1} (baseline=${baseline.length} rows)`,
      })
    }
    await client.query('ROLLBACK TO SAVEPOINT t4')

    // ------------------------------------------------------------------------
    // T5: mid-transaction INSERT + ROLLBACK -> pre-state restored
    // ------------------------------------------------------------------------
    await client.query('SAVEPOINT t5')
    {
      const pre = await apaStateForAgent(AGENT_A)
      const hashPre = stateHash(pre)

      // Inner savepoint mimics the route's `await client.query('BEGIN')`.
      // The route's catch block does `client.query('ROLLBACK')`; here we do
      // ROLLBACK TO SAVEPOINT to get the same atomicity semantics nested.
      await client.query('SAVEPOINT t5_inner')
      let threw = false
      let hashMid = ''
      try {
        // Probe: find a community AGENT_A doesn't currently hold
        const spareRes = await client.query(
          `SELECT id FROM communities
           WHERE id NOT IN (
             SELECT community_id FROM agent_property_access
             WHERE agent_id = $1 AND community_id IS NOT NULL AND is_active = true
           )
           LIMIT 1`,
          [AGENT_A]
        )
        if (!spareRes.rows[0]) throw new Error('T5 setup: no spare community for AGENT_A')

        // INSERT a probe row directly (bypasses computeApaDiff -- we want a raw
        // mid-transaction write to verify ROLLBACK undoes it).
        await client.query(
          `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, community_id, is_primary, is_active,
            condo_access, homes_access, buildings_access, buildings_mode)
           VALUES ($1, $2, 'community', $3, false, true, true, true, true, 'all')`,
          [AGENT_A, TENANT_ID, spareRes.rows[0].id]
        )

        const mid = await apaStateForAgent(AGENT_A)
        hashMid = stateHash(mid)
        if (hashMid === hashPre) throw new Error('T5 setup error: INSERT did not change state')

        // Simulate failure mid-transaction (this is the throw the route's
        // catch block would respond to with ROLLBACK)
        throw new Error('Simulated mid-transaction failure -- expected for ROLLBACK test')
      } catch (e) {
        threw = true
        await client.query('ROLLBACK TO SAVEPOINT t5_inner')
      }

      const post = await apaStateForAgent(AGENT_A)
      const hashPost = stateHash(post)

      const ok = threw && hashMid !== '' && hashMid !== hashPre && hashPre === hashPost
      results.push({
        name: 'T5 (DB): mid-tx INSERT + ROLLBACK -> pre-state restored (SHA256 match)',
        pass: ok,
        detail: `threw=${threw} preHash=${hashPre.slice(0, 12)} midHash=${hashMid.slice(0, 12)} postHash=${hashPost.slice(0, 12)} preEqPost=${hashPre === hashPost}`,
      })
    }
    await client.query('ROLLBACK TO SAVEPOINT t5')

    // ------------------------------------------------------------------------
    // T6: multi-agent diff applied independently -> 1 audit per agent
    // ------------------------------------------------------------------------
    await client.query('SAVEPOINT t6')
    {
      const baseA = await apaStateForAgent(AGENT_A)
      const baseB = await apaStateForAgent(AGENT_B)
      const aA1 = await auditCountForAgent(AGENT_A)
      const aB1 = await auditCountForAgent(AGENT_B)
      console.log(`T6 baselines: A=${baseA.length} rows, B=${baseB.length} rows`)

      // Find 2 communities neither agent currently holds (active rows only)
      const spareRes = await client.query(
        `SELECT id FROM communities
         WHERE id NOT IN (
           SELECT community_id FROM agent_property_access
           WHERE agent_id = ANY($1::uuid[]) AND community_id IS NOT NULL AND is_active = true
         )
         LIMIT 2`,
        [[AGENT_A, AGENT_B]]
      )
      if (spareRes.rows.length < 2) throw new Error('T6: need 2 spare communities (have ' + spareRes.rows.length + ')')
      const cA = spareRes.rows[0].id
      const cB = spareRes.rows[1].id

      const incA = baseA.map(r => ({ ...r, id: undefined }))
      incA.push(row({ agent_id: AGENT_A, community_id: cA, scope: 'community', is_primary: false }))
      const incB = baseB.map(r => ({ ...r, id: undefined }))
      incB.push(row({ agent_id: AGENT_B, community_id: cB, scope: 'community', is_primary: false }))

      // Both diffs in the single outer transaction (same as route's Phase 4)
      await applyDiff(baseA, incA)
      await applyDiff(baseB, incB)

      const aA2 = await auditCountForAgent(AGENT_A)
      const aB2 = await auditCountForAgent(AGENT_B)

      const ok = (aA2 - aA1) === 1 && (aB2 - aB1) === 1
      results.push({
        name: 'T6 (DB): multi-agent diff -- each agent gets exactly 1 grant audit',
        pass: ok,
        detail: `A delta=${aA2 - aA1}, B delta=${aB2 - aB1}`,
      })
    }
    await client.query('ROLLBACK TO SAVEPOINT t6')
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
}

// =============================================================================
// Runner
// =============================================================================

;(async () => {
  unitTests()
  await dbTests()

  console.log('\n=== T4c-1 Phase B smoke results ===')
  let pass = 0
  let fail = 0
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL'
    console.log(`  ${tag}: ${r.name}`)
    console.log(`        ${r.detail}`)
    if (r.pass) pass++; else fail++
  }
  console.log(`\nTotal: pass=${pass} fail=${fail} total=${results.length}`)
  console.log('(Production data ROLLED BACK -- no rows committed.)')

  if (fail > 0) process.exit(1)
})().catch(e => {
  console.error('\nSMOKE FAIL (unhandled):', e)
  process.exit(1)
})