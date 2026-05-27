// scripts/p5-2-recon-listing-shape.js
// W-TERRITORY-MASTER P5.2b recon
// Verify mls_listings.building_id exists, sample rows, and prove the
// reresolve_listing(NULL building_id) gap by calling resolve_agent_for_context
// twice: once with building_id, once without.
//
// Read-only. No writes. No transaction.

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

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== 1. mls_listings columns matching geo/building/agent patterns ===')
    const r1 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='mls_listings'
        AND (column_name ILIKE '%_id' OR column_name = 'assigned_agent_id' OR column_name = 'property_type')
      ORDER BY column_name;
    `)
    console.table(r1.rows)
    console.log('')

    const hasBuildingId = r1.rows.some(r => r.column_name === 'building_id')
    console.log('  building_id present on mls_listings:', hasBuildingId)
    console.log('')

    if (!hasBuildingId) {
      console.log('STOP: mls_listings has no building_id column. P5.2 cache model needs rework.')
      return
    }

    console.log('=== 2. Pick a real WALLiam building with listings ===')
    const r2 = await client.query(`
      SELECT m.building_id, COUNT(*) AS listing_count
      FROM mls_listings m
      WHERE m.building_id IS NOT NULL
      GROUP BY m.building_id
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 5;
    `)
    console.table(r2.rows)
    console.log('')

    if (r2.rows.length === 0) {
      console.log('STOP: no buildings with listings found in mls_listings.')
      return
    }

    const testBuildingId = r2.rows[0].building_id
    console.log('  Using test building_id:', testBuildingId)
    console.log('')

    console.log('=== 3. Sample 3 listings in that building ===')
    const r3 = await client.query(`
      SELECT id, listing_key, building_id, area_id, municipality_id, community_id,
             assigned_agent_id, property_type
      FROM mls_listings
      WHERE building_id = $1
      LIMIT 3;
    `, [testBuildingId])
    console.table(r3.rows)
    console.log('')

    if (r3.rows.length === 0) {
      console.log('STOP: building has no listings (data inconsistency).')
      return
    }

    const sample = r3.rows[0]

    console.log('=== 4. resolve_agent_for_context WITH p_building_id passed ===')
    const r4 = await client.query(`
      SELECT resolve_agent_for_context(
        $1::uuid,        -- p_listing_id
        $2::uuid,        -- p_building_id
        NULL::uuid,      -- p_neighbourhood_id
        $3::uuid,        -- p_community_id
        $4::uuid,        -- p_municipality_id
        $5::uuid,        -- p_area_id
        NULL::text,      -- p_property_type
        $6::uuid         -- p_tenant_id
      ) AS resolved;
    `, [sample.id, sample.building_id, sample.community_id, sample.municipality_id,
        sample.area_id, WALLIAM_TENANT_ID])
    console.log('  WITH building_id ->', r4.rows[0].resolved || 'NULL')
    console.log('')

    console.log('=== 5. resolve_agent_for_context WITHOUT p_building_id (current reresolve_listing behavior) ===')
    const r5 = await client.query(`
      SELECT resolve_agent_for_context(
        $1::uuid,        -- p_listing_id
        NULL::uuid,      -- p_building_id  <-- the bug
        NULL::uuid,      -- p_neighbourhood_id
        $2::uuid,        -- p_community_id
        $3::uuid,        -- p_municipality_id
        $4::uuid,        -- p_area_id
        NULL::text,      -- p_property_type
        $5::uuid         -- p_tenant_id
      ) AS resolved;
    `, [sample.id, sample.community_id, sample.municipality_id,
        sample.area_id, WALLIAM_TENANT_ID])
    console.log('  WITHOUT building_id ->', r5.rows[0].resolved || 'NULL')
    console.log('')

    console.log('=== 6. Probe reresolve_listing current body (the SELECT line) ===')
    const r6 = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_listing';
    `)
    if (r6.rows.length === 0) {
      console.log('  reresolve_listing NOT FOUND in public schema.')
    } else {
      const body = r6.rows[0].body
      console.log('  reresolve_listing body length:', body.length, 'chars')
      const selectMatch = body.match(/SELECT[\s\S]*?FROM mls_listings/i)
      if (selectMatch) {
        console.log('  SELECT-from-mls_listings fragment:')
        console.log('  ' + selectMatch[0].replace(/\n/g, '\n  '))
      }
      const buildingNullMatch = body.match(/NULL[^,)]*p_building_id/i)
      console.log('  Contains "NULL  -- p_building_id" pattern:', !!buildingNullMatch)
      if (buildingNullMatch) {
        console.log('  Matched fragment:', buildingNullMatch[0])
      }
    }
    console.log('')

    console.log('=== 7. Probe resolve_agent_for_context signature ===')
    const r7 = await client.query(`
      SELECT pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'resolve_agent_for_context';
    `)
    console.table(r7.rows)
    console.log('')

    console.log('=== 8. Confirm there is currently no active building card for the test building ===')
    const r8 = await client.query(`
      SELECT id, agent_id, is_active, created_at
      FROM agent_geo_buildings
      WHERE building_id = $1;
    `, [testBuildingId])
    console.table(r8.rows)
    console.log('')

    console.log('=== 9. Confirm a known WALLiam agent (from memory) exists and is selling ===')
    const r9 = await client.query(`
      SELECT id, first_name, last_name, is_selling, tenant_id
      FROM agents
      WHERE id IN (
        'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe',
        'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'
      );
    `)
    console.table(r9.rows)
    console.log('')

    console.log('=== RECON COMPLETE ===')
    console.log('')
    console.log('Compare sections 4 and 5:')
    console.log('  If 4 != 5, the bug is confirmed: reresolve_listing skips building tier.')
    console.log('  If 4 == 5 and both are NULL or geo-resolved, no building card exists yet -- expected.')
    console.log('  Section 6 should show the SELECT line missing building_id and the NULL p_building_id line.')
  } catch (err) {
    console.error('ERROR:', err.message)
    console.error(err.stack)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()