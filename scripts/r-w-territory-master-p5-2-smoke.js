// scripts/r-w-territory-master-p5-2-smoke.js
// W-TERRITORY-MASTER P5.2 smoke: end-to-end validation of building card lifecycle.
//
// Single transaction with ROLLBACK at the end. Production state untouched.

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found')
    process.exit(1)
  }
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadDotEnvLocal()
const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

const checks = []
function rec(name, pass, detail) {
  checks.push({ name, pass, detail: detail || '' })
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? '  -- ' + String(detail).slice(0, 200) : ''}`)
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()

  let txStarted = false

  try {
    console.log('=== STEP 0: discover real IDs ===')
    const tenantRow = (await client.query(`SELECT id FROM tenants WHERE domain = 'walliam.ca' LIMIT 1;`)).rows[0]
    if (!tenantRow) throw new Error('WALLiam tenant not found')
    const tenantId = tenantRow.id
    console.log('  WALLiam tenant:', tenantId)

    const agentRows = (await client.query(`
      SELECT id, full_name FROM agents
      WHERE tenant_id = $1 AND is_active = true AND is_selling = true
      ORDER BY created_at LIMIT 3;
    `, [tenantId])).rows
    if (agentRows.length < 2) throw new Error(`Need >=2 selling agents, found ${agentRows.length}`)
    const agentA = agentRows[0]
    const agentB = agentRows[1]
    console.log('  Agent A:', agentA.full_name, agentA.id)
    console.log('  Agent B:', agentB.full_name, agentB.id)

    // Find a building that does NOT have an active card (so we can pin it cleanly).
    const buildingRow = (await client.query(`
      SELECT b.id, b.canonical_address, b.community_id
      FROM buildings b
      WHERE NOT EXISTS (
        SELECT 1 FROM agent_geo_buildings agb
        WHERE agb.building_id = b.id AND agb.is_active = true
      )
      LIMIT 1;
    `)).rows[0]
    if (!buildingRow) throw new Error('No unassigned building found')
    const buildingId = buildingRow.id
    console.log('  Test building:', buildingRow.canonical_address, buildingId)

    // Count listings in this building (for reroll verification).
    const listingsInBuilding = (await client.query(`
      SELECT count(*)::int AS n FROM mls_listings WHERE building_id = $1;
    `, [buildingId])).rows[0].n
    console.log('  Listings in building:', listingsInBuilding)

    console.log('')
    console.log('=== BEGIN smoke transaction (will ROLLBACK at end) ===')
    await client.query('BEGIN')
    txStarted = true

    // --------------------------------------------------------------------------
    // Schema checks
    // --------------------------------------------------------------------------
    const cols = (await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='agent_geo_buildings'
      ORDER BY column_name;
    `)).rows.map(r => r.column_name)
    const expected = ['is_active', 'deactivated_at', 'deactivated_by', 'assigned_reason']
    rec('1. agb has all lifecycle columns',
      expected.every(c => cols.includes(c)),
      `present: ${expected.filter(c => cols.includes(c)).join(',')}`)

    const oldUnique = (await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'agent_geo_buildings_building_id_key';
    `)).rows
    rec('2. Old building_id unique constraint dropped',
      oldUnique.length === 0, `count=${oldUnique.length}`)

    const partialIdx = (await client.query(`
      SELECT indexdef FROM pg_indexes
      WHERE indexname = 'uq_agb_building_active' AND schemaname = 'public';
    `)).rows
    rec('3. uq_agb_building_active partial unique exists',
      partialIdx.length === 1 && partialIdx[0].indexdef.includes('WHERE') && partialIdx[0].indexdef.includes('is_active'))

    const checkDef = (await client.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'territory_assignment_changes_change_type_check';
    `)).rows[0]?.def || ''
    rec('4. tac CHECK has all 3 building change_types',
      ['building_assigned', 'building_unassigned', 'building_reactivated']
        .every(t => checkDef.includes(`'${t}'`)))

    rec('5. reresolve_building function exists',
      (await client.query(`
        SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='reresolve_building') AS e;
      `)).rows[0].e === true)

    // --------------------------------------------------------------------------
    // INSERT pin -> audit + reroll
    // --------------------------------------------------------------------------
    const ins1 = (await client.query(`
      INSERT INTO agent_geo_buildings(agent_id, building_id, assigned_by, assigned_reason)
      VALUES ($1, $2, $3, 'P5.2 smoke')
      RETURNING id, is_active;
    `, [agentA.id, buildingId, agentA.id])).rows[0]
    rec('6a. Building card INSERT succeeded, is_active=true',
      ins1.is_active === true, `card_id=${ins1.id}`)

    const audit1 = (await client.query(`
      SELECT id FROM territory_assignment_changes
      WHERE scope='building' AND scope_id=$1 AND change_type='building_assigned'
      ORDER BY changed_at DESC LIMIT 1;
    `, [buildingId])).rows
    rec("6b. 'building_assigned' audit row written", audit1.length === 1)

    // Reroll affected listings — each listing in the building should now resolve to agentA.
    // We just check one sample listing if any exist.
    if (listingsInBuilding > 0) {
      const sampleListing = (await client.query(`
        SELECT id, assigned_agent_id FROM mls_listings WHERE building_id = $1 LIMIT 1;
      `, [buildingId])).rows[0]
      rec('7. Sample listing in building has assigned_agent_id = agentA',
        sampleListing.assigned_agent_id === agentA.id,
        `expected=${agentA.id.slice(0,8)} got=${sampleListing.assigned_agent_id?.slice(0,8) || 'NULL'}`)
    } else {
      rec('7. (skipped) No listings in this building to verify cache', true, 'no listings')
    }

    // --------------------------------------------------------------------------
    // Duplicate active card rejected
    // --------------------------------------------------------------------------
    let dupCode = null
    try {
      await client.query('SAVEPOINT s_dup')
      await client.query(`
        INSERT INTO agent_geo_buildings(agent_id, building_id, assigned_by)
        VALUES ($1, $2, $3);
      `, [agentB.id, buildingId, agentB.id])
      await client.query('RELEASE SAVEPOINT s_dup')
    } catch (e) {
      dupCode = e.code
      await client.query('ROLLBACK TO SAVEPOINT s_dup')
      await client.query('RELEASE SAVEPOINT s_dup')
    }
    rec('8. Duplicate active card rejected with 23505',
      dupCode === '23505', `code=${dupCode}`)

    // --------------------------------------------------------------------------
    // Deactivate -> 'building_unassigned' audit
    // --------------------------------------------------------------------------
    await client.query(`
      UPDATE agent_geo_buildings
      SET is_active = false, deactivated_at = now(), deactivated_by = $1
      WHERE id = $2;
    `, [agentA.id, ins1.id])

    const audit2 = (await client.query(`
      SELECT id FROM territory_assignment_changes
      WHERE scope='building' AND scope_id=$1 AND change_type='building_unassigned'
      ORDER BY changed_at DESC LIMIT 1;
    `, [buildingId])).rows
    rec("9. 'building_unassigned' audit row written on soft-delete",
      audit2.length === 1)

    // --------------------------------------------------------------------------
    // New card now allowed (first is inactive)
    // --------------------------------------------------------------------------
    const ins2 = (await client.query(`
      INSERT INTO agent_geo_buildings(agent_id, building_id, assigned_by, assigned_reason)
      VALUES ($1, $2, $3, 'P5.2 smoke 2')
      RETURNING id;
    `, [agentB.id, buildingId, agentB.id])).rows[0]
    rec('10. New card INSERT succeeds after first deactivated',
      !!ins2.id)

    // --------------------------------------------------------------------------
    // Reactivation race: reactivating first while second is active is rejected
    // --------------------------------------------------------------------------
    let reactCode = null
    try {
      await client.query('SAVEPOINT s_react')
      await client.query(`
        UPDATE agent_geo_buildings
        SET is_active = true, deactivated_at = NULL, deactivated_by = NULL
        WHERE id = $1;
      `, [ins1.id])
      await client.query('RELEASE SAVEPOINT s_react')
    } catch (e) {
      reactCode = e.code
      await client.query('ROLLBACK TO SAVEPOINT s_react')
      await client.query('RELEASE SAVEPOINT s_react')
    }
    rec('11. Reactivating soft-deleted card while another active card exists rejected',
      reactCode === '23505', `code=${reactCode}`)

    // --------------------------------------------------------------------------
    // Soft-delete second, reactivate first -> 'building_reactivated' audit
    // --------------------------------------------------------------------------
    await client.query(`
      UPDATE agent_geo_buildings
      SET is_active = false, deactivated_at = now(), deactivated_by = $1
      WHERE id = $2;
    `, [agentB.id, ins2.id])

    await client.query(`
      UPDATE agent_geo_buildings
      SET is_active = true, deactivated_at = NULL, deactivated_by = NULL
      WHERE id = $1;
    `, [ins1.id])

    const audit3 = (await client.query(`
      SELECT id FROM territory_assignment_changes
      WHERE scope='building' AND scope_id=$1 AND change_type='building_reactivated'
      ORDER BY changed_at DESC LIMIT 1;
    `, [buildingId])).rows
    rec("12. 'building_reactivated' audit written",
      audit3.length === 1)

    // --------------------------------------------------------------------------
    // Resolver: with all building cards inactive, resolver returns NOT-this-building's-cached-agent
    // --------------------------------------------------------------------------
    await client.query(`
      UPDATE agent_geo_buildings
      SET is_active = false, deactivated_at = now(), deactivated_by = $1
      WHERE building_id = $2 AND is_active = true;
    `, [agentA.id, buildingId])

    const resolverResult = (await client.query(`
      SELECT resolve_agent_for_context(
        NULL::uuid, $1::uuid, NULL, NULL, NULL, NULL, NULL, $2::uuid
      ) AS agent_id;
    `, [buildingId, tenantId])).rows[0]
    rec('13. After all building cards inactive, resolver does NOT return either deactivated agent',
      resolverResult.agent_id !== agentA.id && resolverResult.agent_id !== agentB.id,
      `returned=${resolverResult.agent_id?.slice(0,8) || 'NULL'}`)

    // --------------------------------------------------------------------------
    // Cross-tenant trigger safety
    // --------------------------------------------------------------------------
    const lastAudit = (await client.query(`
      SELECT tenant_id FROM territory_assignment_changes
      WHERE scope='building' AND scope_id=$1
      ORDER BY changed_at DESC LIMIT 1;
    `, [buildingId])).rows[0]
    rec('14. Audit tenant_id derived from agent (matches WALLiam)',
      lastAudit.tenant_id === tenantId)

    // --------------------------------------------------------------------------
    // All three building change_types present
    // --------------------------------------------------------------------------
    const seenTypes = (await client.query(`
      SELECT DISTINCT change_type FROM territory_assignment_changes
      WHERE scope='building' AND scope_id=$1;
    `, [buildingId])).rows.map(r => r.change_type)
    rec('15. All three building change_types present in audit log',
      ['building_assigned', 'building_unassigned', 'building_reactivated']
        .every(t => seenTypes.includes(t)),
      `types=${seenTypes.join(',')}`)

    // --------------------------------------------------------------------------
    // Pre-existing 9 cards preserved (untouched by smoke)
    // --------------------------------------------------------------------------
    const oldCardsActive = (await client.query(`
      SELECT count(*)::int AS n FROM agent_geo_buildings
      WHERE building_id <> $1 AND is_active = true;
    `, [buildingId])).rows[0].n
    rec('16. Pre-existing cards (other buildings) untouched, still active',
      oldCardsActive === 9,
      `expected=9 got=${oldCardsActive}`)

    // --------------------------------------------------------------------------
    // ROLLBACK
    // --------------------------------------------------------------------------
    console.log('')
    console.log('=== ROLLBACK smoke transaction ===')
    await client.query('ROLLBACK')
    txStarted = false
    console.log('ROLLBACK complete. Production state unchanged.')

    console.log('')
    const passed = checks.filter(c => c.pass).length
    const failed = checks.filter(c => !c.pass).length
    console.log(`=== SUMMARY: ${passed}/${checks.length} PASS, ${failed} FAIL ===`)
    if (failed > 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error('SMOKE ERROR:', err.message)
    if (txStarted) {
      try { await client.query('ROLLBACK') } catch (_e) {}
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()