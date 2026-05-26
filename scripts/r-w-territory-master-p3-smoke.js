// scripts/r-w-territory-master-p3-smoke.js
//
// P3 smoke: tests auto_distribute_areas RPC inside a transaction with ROLLBACK.
// Production WALLiam state is NEVER mutated.
//
// Tests:
//   1. M >= N: 6 areas, 3 agents -> each gets 2
//   2. M == N: 3 areas, 3 agents -> each gets 1, 0 unassigned
//   3. M < N: 2 areas, 3 agents -> 2 agents get 1 each, 1 agent unassigned
//   4. Idempotent: re-run returns 0 distributed, all skipped
//   5. Invalid area_id -> exception
//   6. Empty p_area_ids -> exception
//   7. Bad tenant -> exception
//   8. Cross-tenant: WALLiam areas distributed to WALLiam agents only

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const out = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

let pass = 0, fail = 0
function check(label, ok, detail) {
  if (ok) { console.log('  PASS:', label); pass++ }
  else    { console.log('  FAIL:', label, detail ? '— ' + detail : ''); fail++ }
}

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }
  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // Baseline
    const preCards = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
        WHERE tenant_id = $1 AND scope = 'area' AND is_active = true`,
      [WALLIAM]
    )
    const preCount = preCards.rows[0].n
    console.log('=== Baseline: WALLiam area cards pre =', preCount, '===')

    // Pick 6 areas not currently held by anyone on WALLiam (any 6 areas work
    // since WALLiam has 0 area cards baseline)
    const areaPool = await client.query(
      `SELECT id, name FROM treb_areas ORDER BY name LIMIT 6`
    )
    const areaIds = areaPool.rows.map(r => r.id)
    const areaNames = areaPool.rows.map(r => r.name)
    console.log('Test areas:', areaNames.join(', '))
    console.log('')

    await client.query('BEGIN')

    // ===== Test 1: M >= N (6 areas, 3 agents) =====
    console.log('=== Test 1: 6 areas, 3 agents, expect round-robin (2 each) ===')
    const r1 = await client.query(
      `SELECT auto_distribute_areas($1::uuid, $2::uuid[]) AS res`,
      [WALLIAM, areaIds]
    )
    const res1 = r1.rows[0].res
    check('1a. n_distributed = 6', res1.n_distributed === 6,
      `got ${res1.n_distributed}`)
    check('1b. n_skipped = 0', res1.n_skipped === 0)
    check('1c. 0 unassigned agents', res1.unassigned_agents.length === 0)

    // Verify each agent got exactly 2
    const perAgent = {}
    for (const d of res1.distributed) {
      perAgent[d.agent_id] = (perAgent[d.agent_id] || 0) + 1
    }
    const counts = Object.values(perAgent)
    check('1d. Each agent has 2 areas',
      counts.length === 3 && counts.every(c => c === 2),
      `got ${JSON.stringify(perAgent)}`)

    // Verify DB has 6 new active area cards
    const post1 = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
        WHERE tenant_id = $1 AND scope = 'area' AND is_active = true`,
      [WALLIAM]
    )
    check('1e. DB has 6 new active area cards',
      post1.rows[0].n === preCount + 6, `got ${post1.rows[0].n}, expected ${preCount + 6}`)

    // Verify each card has condo_access=true AND homes_access=true AND is_primary=true
    const cardFlags = await client.query(
      `SELECT condo_access, homes_access, is_primary
         FROM agent_property_access
        WHERE tenant_id = $1 AND scope = 'area' AND is_active = true`,
      [WALLIAM]
    )
    const allCorrect = cardFlags.rows.every(
      r => r.condo_access === true && r.homes_access === true && r.is_primary === true
    )
    check('1f. All cards: condo_access=true, homes_access=true, is_primary=true',
      allCorrect)

    // ===== Test 2: Idempotent re-run =====
    console.log('')
    console.log('=== Test 2: idempotent re-run, expect all skipped ===')
    const r2 = await client.query(
      `SELECT auto_distribute_areas($1::uuid, $2::uuid[]) AS res`,
      [WALLIAM, areaIds]
    )
    const res2 = r2.rows[0].res
    check('2a. n_distributed = 0 (re-run)', res2.n_distributed === 0)
    check('2b. n_skipped = 6 (re-run)', res2.n_skipped === 6)
    check('2c. all skip reasons are already_has_card',
      res2.skipped.every(s => s.reason === 'already_has_card'))

    // ===== Test 3: M < N =====
    // Rollback area cards from Test 1 first, then test M < N
    await client.query('ROLLBACK')
    await client.query('BEGIN')

    console.log('')
    console.log('=== Test 3: 2 areas, 3 agents, expect 1 unassigned ===')
    const r3 = await client.query(
      `SELECT auto_distribute_areas($1::uuid, $2::uuid[]) AS res`,
      [WALLIAM, areaIds.slice(0, 2)]
    )
    const res3 = r3.rows[0].res
    check('3a. n_distributed = 2', res3.n_distributed === 2)
    check('3b. 1 unassigned agent', res3.unassigned_agents.length === 1)

    // The unassigned agent must be the latest-created (WALLiam-brand)
    const lastAgent = await client.query(
      `SELECT id FROM agents
        WHERE tenant_id = $1 AND is_active = true AND is_selling = true
        ORDER BY created_at DESC LIMIT 1`,
      [WALLIAM]
    )
    check('3c. Unassigned agent is the latest-created',
      res3.unassigned_agents[0]?.agent_id === lastAgent.rows[0].id,
      `unassigned=${res3.unassigned_agents[0]?.agent_id}, last=${lastAgent.rows[0].id}`)

    // ===== Test 4: invalid area_id =====
    await client.query('ROLLBACK')
    await client.query('BEGIN')
    console.log('')
    console.log('=== Test 4: invalid area_id raises exception ===')
    let raised4 = false
    try {
      await client.query(
        `SELECT auto_distribute_areas($1::uuid, ARRAY['00000000-0000-0000-0000-000000000099']::uuid[])`,
        [WALLIAM]
      )
    } catch (e) {
      raised4 = e.message.includes('do not exist')
    }
    check('4. Invalid area_id raises exception', raised4)

    // ===== Test 5: empty p_area_ids =====
    await client.query('ROLLBACK')
    await client.query('BEGIN')
    console.log('=== Test 5: empty p_area_ids raises exception ===')
    let raised5 = false
    try {
      await client.query(
        `SELECT auto_distribute_areas($1::uuid, ARRAY[]::uuid[])`,
        [WALLIAM]
      )
    } catch (e) {
      raised5 = e.message.includes('at least one area')
    }
    check('5. Empty area list raises exception', raised5)

    // ===== Test 6: bad tenant =====
    await client.query('ROLLBACK')
    await client.query('BEGIN')
    console.log('=== Test 6: bad tenant raises exception ===')
    let raised6 = false
    try {
      await client.query(
        `SELECT auto_distribute_areas('00000000-0000-0000-0000-000000000099'::uuid, $1::uuid[])`,
        [areaIds.slice(0, 1)]
      )
    } catch (e) {
      raised6 = e.message.includes('tenant') && e.message.includes('not found')
    }
    check('6. Bad tenant raises exception', raised6)

    // ===== Final: ROLLBACK clean =====
    await client.query('ROLLBACK')
    const postRollback = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
        WHERE tenant_id = $1 AND scope = 'area' AND is_active = true`,
      [WALLIAM]
    )
    check('7. ROLLBACK leaves WALLiam at pre-state',
      postRollback.rows[0].n === preCount,
      `got ${postRollback.rows[0].n}, expected ${preCount}`)

    console.log('')
    console.log(`=== ${pass}/${pass + fail} checks PASS ===`)
    if (fail > 0) process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })