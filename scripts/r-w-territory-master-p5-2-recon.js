// scripts/r-w-territory-master-p5-2-recon.js
// W-TERRITORY-MASTER P5.2 recon. Read-only.
//
// Verifies:
//   1. agent_geo_buildings table shape (columns, constraints, indexes)
//   2. Existing triggers on agent_geo_buildings
//   3. Existing rows (real building cards, if any)
//   4. buildings table shape (column names, especially the "MLS"-equivalent or building name)
//   5. Building counts per geo (set UI expectations for tree rendering)
//   6. Existence of reresolve_building or similar per-building reroll helper
//   7. P2 resolver's building branch (lines that read agent_geo_buildings)
//   8. territory_assignment_changes CHECK constraint values (to know if we
//      need to add building_assigned / building_unassigned / building_reactivated)
//   9. Tenant-scoping shape on agent_geo_buildings (does it have tenant_id?)

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

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== 1. agent_geo_buildings columns ===')
    const r1 = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_geo_buildings'
      ORDER BY ordinal_position;
    `)
    console.table(r1.rows)

    console.log('')
    console.log('=== 2. agent_geo_buildings constraints ===')
    const r2 = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.agent_geo_buildings'::regclass
      ORDER BY conname;
    `)
    console.table(r2.rows.map(r => ({ name: r.conname, type: r.contype, def: r.def.slice(0, 100) })))

    console.log('')
    console.log('=== 3. agent_geo_buildings indexes ===')
    const r3 = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'agent_geo_buildings'
      ORDER BY indexname;
    `)
    for (const r of r3.rows) {
      console.log(`  ${r.indexname}`)
      console.log(`    ${r.indexdef}`)
    }

    console.log('')
    console.log('=== 4. Existing triggers on agent_geo_buildings ===')
    const r4 = await client.query(`
      SELECT tgname, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      WHERE t.tgrelid = 'public.agent_geo_buildings'::regclass
        AND NOT t.tgisinternal
      ORDER BY tgname;
    `)
    if (r4.rows.length === 0) {
      console.log('  No user-defined triggers.')
    } else {
      console.table(r4.rows.map(r => ({ tgname: r.tgname, def: r.def.slice(0, 100) })))
    }

    console.log('')
    console.log('=== 5. agent_geo_buildings rows (counts by tenant, sample) ===')
    const r5a = await client.query(`SELECT count(*)::int AS total FROM agent_geo_buildings;`)
    console.log('  Total rows:', r5a.rows[0].total)
    if (r5a.rows[0].total > 0) {
      const r5b = await client.query(`
        SELECT t.name AS tenant, count(*)::int AS rows
        FROM agent_geo_buildings agb
        JOIN agents a ON a.id = agb.agent_id
        JOIN tenants t ON t.id = a.tenant_id
        GROUP BY t.name
        ORDER BY 2 DESC;
      `)
      console.table(r5b.rows)
      const r5c = await client.query(`SELECT * FROM agent_geo_buildings LIMIT 3;`)
      console.log('  Sample rows:')
      console.log(JSON.stringify(r5c.rows, null, 2))
    }

    console.log('')
    console.log('=== 6. buildings table columns (for search / display) ===')
    const r6 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'buildings'
      ORDER BY ordinal_position;
    `)
    console.table(r6.rows)

    console.log('')
    console.log('=== 7. Building counts per geo (WALLiam scope, Toronto C01 example) ===')
    // Find Toronto C01 muni or community
    const r7a = await client.query(`
      SELECT id, name, kind FROM (
        SELECT id, name, 'municipality' AS kind FROM municipalities WHERE name ILIKE '%C01%'
        UNION ALL
        SELECT id, name, 'community' FROM communities WHERE name ILIKE '%C01%'
        UNION ALL
        SELECT id, name, 'area' FROM treb_areas WHERE name ILIKE '%C01%'
      ) s
      LIMIT 5;
    `)
    console.log('  C01-like geos found:')
    console.table(r7a.rows)

    // Total buildings in a few prominent areas/munis to set expectations
    const r7b = await client.query(`
      SELECT
        ta.name AS area,
        count(b.id)::int AS buildings
      FROM treb_areas ta
      LEFT JOIN municipalities m ON m.area_id = ta.id
      LEFT JOIN communities c ON c.municipality_id = m.id
      LEFT JOIN buildings b ON b.community_id = c.id
      WHERE ta.name IN ('Toronto', 'Mississauga', 'Whitby', 'Oakville')
      GROUP BY ta.name
      ORDER BY 2 DESC;
    `)
    console.log('  Building counts by area (sample tenants operate in TREB region):')
    console.table(r7b.rows)

    console.log('')
    console.log('=== 8. Does reresolve_building (or per-building reroll) exist? ===')
    const r8 = await client.query(`
      SELECT p.oid::regprocedure::text AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.proname ILIKE '%building%' OR p.proname ILIKE '%building_listings%')
      ORDER BY p.proname;
    `)
    console.table(r8.rows)

    console.log('')
    console.log('=== 9. resolve_agent_for_context P2 building branch (lines that reference agent_geo_buildings) ===')
    const r9 = await client.query(`
      SELECT pg_get_functiondef('public.resolve_agent_for_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) AS def;
    `)
    const lines = r9.rows[0].def.split('\n')
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes('agent_geo_buildings')) {
        console.log(`  line ${i + 1}: ${line.trim()}`)
      }
    })

    console.log('')
    console.log('=== 10. territory_assignment_changes CHECK current values ===')
    const r10 = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'territory_assignment_changes_change_type_check';
    `)
    console.log('  ' + r10.rows[0].def)

    console.log('')
    console.log('=== 11. mls_listings.building_id presence / coverage (resolver P2 input) ===')
    const r11 = await client.query(`
      SELECT
        count(*)::int AS total,
        count(building_id)::int AS with_building,
        count(building_id) FILTER (WHERE property_type = 'Residential Condo & Other')::int AS condos_with_bldg,
        count(*) FILTER (WHERE property_type = 'Residential Condo & Other')::int AS condos_total
      FROM mls_listings
      WHERE available_in_vow = true;
    `)
    console.table(r11.rows)

    console.log('')
    console.log('=== RECON COMPLETE ===')
  } catch (err) {
    console.error('RECON ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()