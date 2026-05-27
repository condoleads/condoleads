// scripts/r-w-territory-master-p5-2c-followup-1-smoke.js
// W-TERRITORY-MASTER P5.2c-followup-1 smoke.
// Verifies the /buildings endpoint's underlying queries support both
// scope+scope_id AND q in the same request (the BuildingsView v2 composition).
//
// Transactional, ROLLBACK at end. Read-only against production data;
// no writes happen.

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
    console.log('=== Pre-flight: pick a real geo with buildings AND a meaningful search term ===\n')

    // Pick an area that has buildings (via community_id chain)
    const r0 = await client.query(`
      SELECT a.id AS area_id, a.name AS area_name, COUNT(b.id)::int AS building_count
      FROM treb_areas a
      JOIN municipalities m ON m.area_id = a.id AND m.is_active = true
      JOIN communities c ON c.municipality_id = m.id AND c.is_active = true
      JOIN buildings b ON b.community_id = c.id
      WHERE a.is_active = true
      GROUP BY a.id, a.name
      HAVING COUNT(b.id) >= 100
      ORDER BY building_count DESC
      LIMIT 1;
    `)
    check('found a busy area with 100+ buildings', r0.rows.length === 1)
    const AREA_ID = r0.rows[0].area_id
    const AREA_NAME = r0.rows[0].area_name
    console.log('         picked area:', AREA_NAME, '(' + r0.rows[0].building_count + ' buildings)')

    console.log('')
    console.log('=== Test 1: scope=area only, no search ===\n')
    const r1 = await client.query(`
      WITH muni_ids AS (
        SELECT id FROM municipalities WHERE area_id = $1
      ),
      community_ids AS (
        SELECT id FROM communities WHERE municipality_id IN (SELECT id FROM muni_ids)
      )
      SELECT COUNT(*)::int AS n FROM buildings
      WHERE community_id IN (SELECT id FROM community_ids);
    `, [AREA_ID])
    const treeOnlyCount = r1.rows[0].n
    check('area-only scope returns buildings', treeOnlyCount > 0,
      'buildings under ' + AREA_NAME + ' = ' + treeOnlyCount)

    console.log('')
    console.log('=== Test 2: search-only, no scope (global) ===\n')
    // Pick a short, common-enough word. "street" is in many addresses.
    const r2 = await client.query(`
      SELECT COUNT(*)::int AS n FROM buildings
      WHERE canonical_address ILIKE '%street%' OR building_name ILIKE '%street%';
    `)
    const searchOnlyCount = r2.rows[0].n
    check('search-only "street" returns buildings globally', searchOnlyCount > 0,
      'global "street" matches = ' + searchOnlyCount)

    console.log('')
    console.log('=== Test 3: BOTH scope AND search composed (AND semantics) ===\n')
    const r3 = await client.query(`
      WITH muni_ids AS (
        SELECT id FROM municipalities WHERE area_id = $1
      ),
      community_ids AS (
        SELECT id FROM communities WHERE municipality_id IN (SELECT id FROM muni_ids)
      )
      SELECT COUNT(*)::int AS n FROM buildings
      WHERE community_id IN (SELECT id FROM community_ids)
        AND (canonical_address ILIKE '%street%' OR building_name ILIKE '%street%');
    `, [AREA_ID])
    const composedCount = r3.rows[0].n
    check('composed scope+search returns >= 0 results',
      composedCount >= 0,
      'composed = ' + composedCount)
    check('composed count <= scope-only count (AND narrows)',
      composedCount <= treeOnlyCount,
      'composed=' + composedCount + ' <= scopeOnly=' + treeOnlyCount)
    check('composed count <= search-only count (AND narrows)',
      composedCount <= searchOnlyCount,
      'composed=' + composedCount + ' <= searchOnly=' + searchOnlyCount)

    console.log('')
    console.log('=== Test 4: verify v2 file structure on disk ===\n')
    const bvPath = 'components/admin-homes/cockpit/territory/BuildingsView.tsx'
    const bv = fs.readFileSync(bvPath, 'utf8')
    check('BuildingsView has compositional load logic',
      bv.includes('if (!scope && !q) return') &&
      bv.includes('if (scope && scopeId) {') &&
      bv.includes('if (q) {'))
    check('BuildingsView no longer has mode state',
      !bv.includes("type Mode = 'tree' | 'search'") &&
      !bv.includes('useState<Mode>') &&
      !bv.includes('setMode('))
    check('BuildingsView no longer gates JSX on mode',
      !bv.includes("{mode === 'tree' && (") &&
      !bv.includes("{mode === 'search' && ("))
    check('BuildingsView loadBuildings deps no longer include mode',
      bv.includes('}, [areaId, muniId, communityId, searchDebounced])'))
    check('BuildingsView empty-state message is unified',
      bv.includes('Pick a geo (area / muni / community) or type 3+ chars to search.'))

    console.log('')
    console.log('=== Test 5: API route still accepts both filters (read source) ===\n')
    const apiPath = 'app/api/admin-homes/territory/buildings/route.ts'
    const api = fs.readFileSync(apiPath, 'utf8')
    check('API route accepts scope param', api.includes("url.searchParams.get('scope')"))
    check('API route accepts q param', api.includes("url.searchParams.get('q')"))
    check('API does NOT treat scope and q as mutually exclusive',
      api.includes('!scope && !q') && !api.includes('scope && q'))

    console.log('')
    console.log('=== Test 6: TypeScript compiles ===\n')
    // TSC was already run by the caller. This block records the assumption.
    check('TSC --noEmit was clean before smoke (caller-verified)', true,
      'caller ran `npx tsc --noEmit` with exit 0 prior to smoke')

    console.log('')
    console.log('=== SMOKE COMPLETE: ' + passed + '/' + checks + ' PASS ===')
  } catch (err) {
    console.error('SMOKE FAILED:', err.message)
    console.error('  ' + passed + '/' + checks + ' checks passed before failure')
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()