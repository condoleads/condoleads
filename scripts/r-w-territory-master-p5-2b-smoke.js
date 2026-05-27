// scripts/r-w-territory-master-p5-2b-smoke.js
// W-TERRITORY-MASTER P5.2b smoke.
// Runs AFTER deploy. Single transaction with ROLLBACK at end -- no production
// data is modified.
//
// Verified inputs (all read from session-verified sources):
//   - WALLiam tenant_id: b16e1039-38ed-43d7-bbc5-dd02bb651bc9 (userMemories + agents row)
//   - King Shah agent_id: fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe (probe-agents-columns.js)
//   - Test building_id: 3a188ae4-2b0f-481a-a0e0-f18d1315ba2b (recon section 2)
//
// Column names verified via probe-agents-columns.js:
//   - agents has full_name (not first_name/last_name)

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
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
if (!conn) {
  console.error('FATAL: SUPABASE_DB_URL or DATABASE_URL not set in .env.local')
  process.exit(1)
}

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AGENT_KING = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const BUILDING_ID = '3a188ae4-2b0f-481a-a0e0-f18d1315ba2b'

let checks = 0
let passed = 0

function check(name, ok, detail) {
  checks++
  if (ok) {
    passed++
    console.log('  PASS [' + checks + ']: ' + name)
    if (detail) console.log('         ' + detail)
  } else {
    console.log('  FAIL [' + checks + ']: ' + name)
    if (detail) console.log('         ' + detail)
    throw new Error('Smoke check failed: ' + name)
  }
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== Pre-flight: confirm verified inputs exist in DB ===')
    const r0a = await client.query(
      `SELECT id, full_name, is_selling, is_active, tenant_id
       FROM agents WHERE id = $1;`, [AGENT_KING])
    check('agent King Shah exists', r0a.rows.length === 1)
    check('agent is_selling', r0a.rows[0].is_selling === true)
    check('agent is_active', r0a.rows[0].is_active === true)
    check('agent tenant matches WALLiam', r0a.rows[0].tenant_id === TENANT_ID)

    const r0b = await client.query(`SELECT COUNT(*)::int AS n FROM mls_listings WHERE building_id = $1;`, [BUILDING_ID])
    check('test building has listings', r0b.rows[0].n > 0,
          'count=' + r0b.rows[0].n)

    const rSig = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_listing';
    `)
    check('reresolve_listing has new SELECT (with building_id)',
      rSig.rows[0].body.indexOf('SELECT area_id, municipality_id, community_id, building_id, assigned_agent_id') !== -1)
    check('reresolve_listing passes v_listing.building_id',
      rSig.rows[0].body.indexOf('v_listing.building_id') !== -1)
    console.log('')

    console.log('=== Begin smoke transaction (ROLLBACK at end) ===')
    await client.query('BEGIN')

    const preSnap = await client.query(
      `SELECT COUNT(*)::int AS n FROM mls_listings WHERE building_id = $1 AND assigned_agent_id = $2;`,
      [BUILDING_ID, AGENT_KING])
    console.log('  pre-snapshot: listings in building already assigned to King:', preSnap.rows[0].n)

    const preCard = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_geo_buildings WHERE building_id = $1 AND is_active = true;`,
      [BUILDING_ID])
    check('no pre-existing active building card on test building', preCard.rows[0].n === 0,
          'active_cards=' + preCard.rows[0].n)

    console.log('')
    console.log('=== Test 1: assign building card, verify cache reroll propagates ===')
    const ins1 = await client.query(
      `INSERT INTO agent_geo_buildings (agent_id, building_id, assigned_by, is_active, assigned_reason)
       VALUES ($1, $2, $1, true, 'P5.2b smoke')
       RETURNING id;`,
      [AGENT_KING, BUILDING_ID])
    const cardId = ins1.rows[0].id
    console.log('  inserted card id:', cardId)

    const postAssign = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE assigned_agent_id = $2)::int AS routed_to_king,
         COUNT(*)::int AS total
       FROM mls_listings WHERE building_id = $1;`,
      [BUILDING_ID, AGENT_KING])
    check('all listings in building now routed to King Shah',
      postAssign.rows[0].routed_to_king === postAssign.rows[0].total,
      'routed=' + postAssign.rows[0].routed_to_king + ' / total=' + postAssign.rows[0].total)

    const audit1 = await client.query(
      `SELECT change_type FROM territory_assignment_changes
       WHERE scope = 'building' AND scope_id = $1 AND tenant_id = $2
       ORDER BY changed_at DESC LIMIT 1;`,
      [BUILDING_ID, TENANT_ID])
    check('audit row written for building card insert',
      audit1.rows.length === 1 && audit1.rows[0].change_type === 'building_assigned',
      audit1.rows.length ? 'change_type=' + audit1.rows[0].change_type : 'no audit row')

    console.log('')
    console.log('=== Test 2: soft-delete building card, verify cache routes back ===')
    await client.query(
      `UPDATE agent_geo_buildings SET is_active = false, deactivated_at = now(), deactivated_by = $2
       WHERE id = $1;`, [cardId, AGENT_KING])

    const postDeact = await client.query(
      `SELECT COUNT(*) FILTER (WHERE assigned_agent_id = $2)::int AS still_king,
              COUNT(*)::int AS total
       FROM mls_listings WHERE building_id = $1;`,
      [BUILDING_ID, AGENT_KING])
    check('after soft-delete, listings no longer routed to King via this building card',
      postDeact.rows[0].still_king === preSnap.rows[0].n,
      'still_king=' + postDeact.rows[0].still_king + ', pre_snapshot=' + preSnap.rows[0].n)

    console.log('')
    console.log('=== Test 3: pin regression -- pin a listing, verify P1 still beats P2 ===')
    await client.query(
      `UPDATE agent_geo_buildings SET is_active = true, deactivated_at = NULL, deactivated_by = NULL
       WHERE id = $1;`, [cardId])

    const otherAgent = await client.query(
      `SELECT id FROM agents
       WHERE tenant_id = $1 AND is_active = true AND is_selling = true AND id <> $2
       LIMIT 1;`, [TENANT_ID, AGENT_KING])

    if (otherAgent.rows.length > 0) {
      const pinAgent = otherAgent.rows[0].id
      const sampleListing = await client.query(
        `SELECT id FROM mls_listings WHERE building_id = $1 LIMIT 1;`, [BUILDING_ID])
      const listingId = sampleListing.rows[0].id
      await client.query(
        `INSERT INTO agent_listing_assignments (agent_id, listing_id, assigned_by, is_active, pin_reason)
         VALUES ($1, $2, $1, true, 'P5.2b smoke regression');`,
        [pinAgent, listingId])

      const pinCheck = await client.query(
        `SELECT assigned_agent_id FROM mls_listings WHERE id = $1;`, [listingId])
      check('pin beats building card (P1 > P2)',
        pinCheck.rows[0].assigned_agent_id === pinAgent,
        'expected=' + pinAgent + ', got=' + pinCheck.rows[0].assigned_agent_id)
    } else {
      console.log('  SKIP: no second selling agent in WALLiam -- pin regression test not run')
    }

    console.log('')
    console.log('=== Test 4: geo-only listing regression -- listing with no building_id still works ===')
    const noBuildingListing = await client.query(
      `SELECT id, area_id, municipality_id, community_id, assigned_agent_id
       FROM mls_listings
       WHERE building_id IS NULL
         AND area_id IS NOT NULL
       LIMIT 1;`)
    if (noBuildingListing.rows.length > 0) {
      const lid = noBuildingListing.rows[0].id
      const before = noBuildingListing.rows[0].assigned_agent_id
      const resolved = await client.query(
        `SELECT reresolve_listing($1::uuid, $2::uuid) AS resolved;`, [lid, TENANT_ID])
      const resolved2 = await client.query(
        `SELECT reresolve_listing($1::uuid, $2::uuid) AS resolved;`, [lid, TENANT_ID])
      check('reresolve_listing on building_id-IS-NULL listing does not error',
        true, 'resolved=' + resolved.rows[0].resolved + ', before=' + before)
      check('reresolve_listing is deterministic on same input',
        resolved.rows[0].resolved === resolved2.rows[0].resolved)
    } else {
      console.log('  SKIP: no listing found with NULL building_id and non-NULL area_id')
    }

    console.log('')
    console.log('=== ROLLBACK ===')
    await client.query('ROLLBACK')
    console.log('  transaction rolled back -- no production data modified')

    const finalCard = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_geo_buildings WHERE building_id = $1 AND is_active = true;`,
      [BUILDING_ID])
    check('rollback restored pre-state (no active card on test building)', finalCard.rows[0].n === 0,
          'active_cards_after_rollback=' + finalCard.rows[0].n)

    console.log('')
    console.log('=== SMOKE COMPLETE: ' + passed + '/' + checks + ' PASS ===')
  } catch (err) {
    console.error('SMOKE FAILED:', err.message)
    try {
      await client.query('ROLLBACK')
      console.error('  ROLLBACK executed')
    } catch (e) {
      // ignore
    }
    console.error('  ' + passed + '/' + checks + ' checks passed before failure')
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()