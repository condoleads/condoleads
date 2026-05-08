// scripts/r-territory-t4a-3-smoke.ts
// T4a-3 smoke: 4 unit tests of computeApaDiff + 5 DB tests of audit churn behavior.
// Run: npx tsx scripts/r-territory-t4a-3-smoke.ts
// Production data is rolled back -- single transaction with savepoint isolation.

import { config } from 'dotenv'
import { Client } from 'pg'
import { computeApaDiff, ApaRow } from '../lib/admin-homes/apa-diff'

config({ path: '.env.local' })

const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!cs) { console.error('FAIL: DATABASE_URL/POSTGRES_URL not in .env.local'); process.exit(1) }

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AGENT_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'  // King Shah

interface TestResult { name: string; pass: boolean; detail: string }
const results: TestResult[] = []

function row(o: Partial<ApaRow>): ApaRow {
  return {
    agent_id: AGENT_ID,
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

function unitTests() {
  // T1: identical inputs -> 0 changes
  {
    const ex = [row({ id: '1', community_id: 'c1' })]
    const inc = [row({ community_id: 'c1' })]
    const d = computeApaDiff(ex, inc)
    results.push({
      name: 'T1: identical -> 0 changes',
      pass: d.toDelete.length === 0 && d.toInsert.length === 0 && d.toUpdate.length === 0 && d.unchanged === 1,
      detail: `del=${d.toDelete.length} ins=${d.toInsert.length} upd=${d.toUpdate.length} same=${d.unchanged}`,
    })
  }
  // T2: addition -> 1 insert
  {
    const ex: ApaRow[] = []
    const inc = [row({ community_id: 'c1' })]
    const d = computeApaDiff(ex, inc)
    results.push({
      name: 'T2: addition -> 1 insert',
      pass: d.toInsert.length === 1 && d.toDelete.length === 0,
      detail: `ins=${d.toInsert.length}`,
    })
  }
  // T3: removal -> 1 delete
  {
    const ex = [row({ id: '1', community_id: 'c1' })]
    const inc: ApaRow[] = []
    const d = computeApaDiff(ex, inc)
    results.push({
      name: 'T3: removal -> 1 delete',
      pass: d.toDelete.length === 1 && d.toInsert.length === 0,
      detail: `del=${d.toDelete.length}`,
    })
  }
  // T4: primary toggle -> 1 update + 1 primary claim
  {
    const ex = [row({ id: '1', community_id: 'c1', is_primary: false })]
    const inc = [row({ community_id: 'c1', is_primary: true })]
    const d = computeApaDiff(ex, inc)
    results.push({
      name: 'T4: primary off->on -> 1 update + 1 claim',
      pass: d.toUpdate.length === 1 && d.primaryClaims.length === 1 && d.toInsert.length === 0,
      detail: `upd=${d.toUpdate.length} claims=${d.primaryClaims.length}`,
    })
  }
}

async function dbTests() {
  const client = new Client({ connectionString: cs })
  await client.connect()
  await client.query('BEGIN')

  try {
    // Capture baseline existing rows for the agent
    const baselineRes = await client.query(
      `SELECT id, agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id,
              is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode
       FROM agent_property_access WHERE agent_id = $1 AND is_active = true`,
      [AGENT_ID]
    )
    const baseline: ApaRow[] = baselineRes.rows as ApaRow[]
    console.log(`Baseline: ${baseline.length} active rows for ${AGENT_ID}`)

    const auditCount = async (): Promise<number> => {
      const r = await client.query(`SELECT COUNT(*) FROM territory_assignment_changes WHERE agent_id = $1 AND tenant_id = $2`, [AGENT_ID, TENANT_ID])
      return parseInt(r.rows[0].count, 10)
    }

    const recentChangeTypes = async (n: number): Promise<string[]> => {
      const r = await client.query(`SELECT change_type FROM territory_assignment_changes WHERE agent_id=$1 AND tenant_id=$2 ORDER BY changed_at DESC LIMIT $3`, [AGENT_ID, TENANT_ID, n])
      return r.rows.map((x: any) => x.change_type as string)
    }

    const applyDiff = async (existing: ApaRow[], incoming: ApaRow[]) => {
      const diff = computeApaDiff(existing, incoming)
      // Auto-reassign for primary claims
      for (const claim of diff.primaryClaims) {
        let col: string | null = null, val: string | null = null
        if (claim.scope === 'area') { col = 'area_id'; val = claim.area_id }
        else if (claim.scope === 'municipality') { col = 'municipality_id'; val = claim.municipality_id }
        else if (claim.scope === 'community') { col = 'community_id'; val = claim.community_id }
        else if (claim.scope === 'neighbourhood') { col = 'neighbourhood_id'; val = claim.neighbourhood_id }
        if (col && val) {
          await client.query(
            `UPDATE agent_property_access SET is_primary = false
             WHERE scope = $1 AND ${col} = $2 AND is_active = true AND is_primary = true AND tenant_id = $3 AND agent_id != $4`,
            [claim.scope, val, claim.tenant_id, claim.agent_id]
          )
        }
      }
      if (diff.toDelete.length > 0) {
        const ids = diff.toDelete.map(r => r.id!).filter(Boolean)
        if (ids.length > 0) await client.query(`DELETE FROM agent_property_access WHERE id = ANY($1::uuid[])`, [ids])
      }
      for (const pair of diff.toUpdate) {
        const ex = pair.existing
        const inc = pair.incoming
        await client.query(
          `UPDATE agent_property_access SET is_primary=$2, condo_access=$3, homes_access=$4, buildings_access=$5, buildings_mode=$6 WHERE id = $1`,
          [ex.id, inc.is_primary, inc.condo_access, inc.homes_access, inc.buildings_access, inc.buildings_mode]
        )
      }
      for (const inc of diff.toInsert) {
        await client.query(
          `INSERT INTO agent_property_access (agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id, is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [inc.agent_id, inc.tenant_id, inc.scope, inc.area_id, inc.municipality_id, inc.community_id, inc.neighbourhood_id, inc.is_primary, inc.is_active, inc.condo_access, inc.homes_access, inc.buildings_access, inc.buildings_mode]
        )
      }
      return diff
    }

    // T5: identical save -> 0 audit rows
    await client.query('SAVEPOINT t5')
    {
      const a1 = await auditCount()
      const incoming = baseline.map(r => ({ ...r, id: undefined }))
      await applyDiff(baseline, incoming)
      const a2 = await auditCount()
      results.push({
        name: 'T5: identical save -> 0 audit rows',
        pass: (a2 - a1) === 0,
        detail: `audit delta = ${a2 - a1}`,
      })
    }
    await client.query('ROLLBACK TO SAVEPOINT t5')

    // T6: row added -> 1 assignment_granted
    await client.query('SAVEPOINT t6')
    {
      const a1 = await auditCount()
      const spareC = await client.query(
        `SELECT id FROM communities WHERE id NOT IN (SELECT community_id FROM agent_property_access WHERE agent_id = $1 AND community_id IS NOT NULL) LIMIT 1`,
        [AGENT_ID]
      )
      if (!spareC.rows[0]) throw new Error('No spare community for T6')
      const newCommId = spareC.rows[0].id
      const incoming = baseline.map(r => ({ ...r, id: undefined }))
      incoming.push(row({ community_id: newCommId, scope: 'community', is_primary: false }))
      await applyDiff(baseline, incoming)
      const a2 = await auditCount()
      const recent = await recentChangeTypes(a2 - a1)
      const granted = recent.filter(t => t === 'assignment_granted').length
      results.push({
        name: 'T6: row added -> 1 assignment_granted',
        pass: (a2 - a1) === 1 && granted === 1,
        detail: `audit delta = ${a2 - a1}, granted = ${granted}`,
      })
    }
    await client.query('ROLLBACK TO SAVEPOINT t6')

    // T7: row removed -> 1 assignment_revoked
    await client.query('SAVEPOINT t7')
    {
      const a1 = await auditCount()
      // Pick a non-primary row to remove (avoids reroll/distribute side effects)
      const target = baseline.find(r => !r.is_primary) || baseline[0]
      if (!target) throw new Error('No baseline row for T7')
      const incoming = baseline.filter(r => r.id !== target.id).map(r => ({ ...r, id: undefined }))
      await applyDiff(baseline, incoming)
      const a2 = await auditCount()
      const recent = await recentChangeTypes(a2 - a1)
      const revoked = recent.filter(t => t === 'assignment_revoked').length
      results.push({
        name: 'T7: row removed -> 1 assignment_revoked',
        pass: (a2 - a1) === 1 && revoked === 1,
        detail: `audit delta = ${a2 - a1}, revoked = ${revoked}`,
      })
    }
    await client.query('ROLLBACK TO SAVEPOINT t7')

    // T8: is_primary toggled off -> 1 primary_unset
    await client.query('SAVEPOINT t8')
    {
      const a1 = await auditCount()
      const target = baseline.find(r => r.is_primary && r.scope === 'community')
      if (target) {
        const incoming = baseline.map(r => {
          const base = { ...r, id: undefined }
          if (r.id === target.id) return { ...base, is_primary: false }
          return base
        })
        await applyDiff(baseline, incoming)
        const a2 = await auditCount()
        const recent = await recentChangeTypes(a2 - a1)
        const unset = recent.filter(t => t === 'primary_unset').length
        results.push({
          name: 'T8: is_primary off -> 1 primary_unset (no churn)',
          pass: (a2 - a1) === 1 && unset === 1,
          detail: `audit delta = ${a2 - a1}, primary_unset = ${unset}`,
        })
      } else {
        results.push({ name: 'T8: is_primary off', pass: false, detail: 'SKIP: no primary community row to toggle' })
      }
    }
    await client.query('ROLLBACK TO SAVEPOINT t8')

    // T9: condo_access flip -> 1 access_toggle_changed
    await client.query('SAVEPOINT t9')
    {
      const a1 = await auditCount()
      if (baseline.length > 0) {
        const target = baseline[0]
        const incoming = baseline.map(r => {
          const base = { ...r, id: undefined }
          if (r.id === target.id) return { ...base, condo_access: !target.condo_access }
          return base
        })
        await applyDiff(baseline, incoming)
        const a2 = await auditCount()
        const recent = await recentChangeTypes(a2 - a1)
        const toggled = recent.filter(t => t === 'access_toggle_changed').length
        results.push({
          name: 'T9: condo_access flip -> 1 access_toggle_changed (no churn)',
          pass: (a2 - a1) === 1 && toggled === 1,
          detail: `audit delta = ${a2 - a1}, access_toggle = ${toggled}`,
        })
      } else {
        results.push({ name: 'T9: access toggle', pass: false, detail: 'SKIP: no rows' })
      }
    }
    await client.query('ROLLBACK TO SAVEPOINT t9')
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
}

;(async () => {
  unitTests()
  await dbTests()

  console.log('\n=== Smoke results ===')
  let pass = 0, fail = 0
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL'
    console.log(`  ${tag}: ${r.name} -- ${r.detail}`)
    if (r.pass) pass++; else fail++
  }
  console.log(`Total: pass=${pass} fail=${fail} total=${results.length}`)
  console.log('(Production data ROLLED BACK -- no rows committed.)')
  if (fail > 0) process.exit(1)
})().catch(e => { console.error('SMOKE FAIL:', e); process.exit(1) })
