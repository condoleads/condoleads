#!/usr/bin/env node
// W-TERRITORY-SMOKE UNIT 34 — territory regression gate.
// Locks the fixes from UNIT 33 (audit) + UNIT 34 (fix) so they can't regress.
// Run from project root: node scripts/test-territory-regression.js
// Exit 0 = all pass; nonzero = regression detected.
//
// Asserts:
//   A. Buildings rollup at area + muni returns non-zero for known geos
//      (Toronto > 0, Durham > 0). DB-level — fails if FK chain breaks.
//   B. The geo-rollup endpoint source still applies the chain rollup at
//      muni + area levels (locks FIX 1 against future hardcode-to-0).
//   C. Resolver cascade: resolve_agent_for_context exists with correct
//      signature; P-HOUSE branch returns the tenant's default_agent_id
//      for an unmatched scope (Aily -> Ovais, WALLiam -> King Shah).
//   D. The 4 lead-create routes all apply is_active + is_selling
//      filter on the mls_listings cache lookup (locks C2 fix).
//   E. pick_routing_agent_for_type body contains ORDER BY (locks the
//      UNIT 34 Fix 2 STEP 3 once applied; before then the assertion
//      reports "PENDING gate" but does not fail — switch to fail mode
//      after the DDL ships).

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') }) } catch {}

const AILY = 'e2619717-6401-4159-8d4c-d5f87651c8d6'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const OVAIS = '319ad339-f031-43af-b036-be06bd5221b3'
const KING_SHAH = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'

let passes = 0, failures = 0
function ok(cond, msg) {
  if (cond) { console.log('  PASS  ' + msg); passes++ }
  else      { console.error('  FAIL  ' + msg); failures++ }
}
function pending(msg) { console.log('  PEND  ' + msg + '  (gate not yet shipped)') }

const REPO = path.join(__dirname, '..')

async function main() {
  // ─── A. Building rollup at area + muni: non-zero for known geos ───────
  console.log('\n=== A. Building rollup at area + municipality ===')
  const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL
  if (!conn) {
    console.log('  SKIP  no DATABASE_URL — running source-only checks')
  } else {
    const c = new Client({ connectionString: conn })
    await c.connect()
    try {
      const { rows: areaTor } = await c.query(`
        SELECT (SELECT COUNT(*)::int FROM buildings b
                  JOIN communities c ON c.id=b.community_id
                  JOIN municipalities m ON m.id=c.municipality_id
                 WHERE m.area_id = ta.id) AS n
          FROM treb_areas ta WHERE ta.name='Toronto'`)
      ok(areaTor[0] && areaTor[0].n > 1000, 'Toronto area-rollup building_count > 1000 (got ' + (areaTor[0] && areaTor[0].n) + ')')

      const { rows: areaDur } = await c.query(`
        SELECT (SELECT COUNT(*)::int FROM buildings b
                  JOIN communities c ON c.id=b.community_id
                  JOIN municipalities m ON m.id=c.municipality_id
                 WHERE m.area_id = ta.id) AS n
          FROM treb_areas ta WHERE ta.name='Durham'`)
      ok(areaDur[0] && areaDur[0].n > 100, 'Durham area-rollup building_count > 100 (got ' + (areaDur[0] && areaDur[0].n) + ')')

      const { rows: muniTorC01 } = await c.query(`
        SELECT (SELECT COUNT(*)::int FROM buildings b
                  JOIN communities c ON c.id=b.community_id
                 WHERE c.municipality_id = m.id) AS n
          FROM municipalities m WHERE m.name='Toronto C01'`)
      ok(muniTorC01[0] && muniTorC01[0].n > 100, 'Toronto C01 muni-rollup building_count > 100 (got ' + (muniTorC01[0] && muniTorC01[0].n) + ')')

      // ─── E. pick_routing_agent_for_type tie-break ORDER BY (lock UNIT 34 Fix 2 STEP 3) ───
      console.log('\n=== E. pick_routing_agent_for_type ORDER BY (C1 fix lock) ===')
      const { rows: fn } = await c.query(
        "SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='pick_routing_agent_for_type' AND pronamespace='public'::regnamespace"
      )
      if (!fn.length) { ok(false, 'pick_routing_agent_for_type function exists') }
      else {
        const hasOrderBy = /ORDER\s+BY/i.test(fn[0].def)
        if (hasOrderBy) {
          ok(true, 'pick_routing_agent_for_type body contains ORDER BY (deterministic tie-break locked)')
        } else {
          pending('pick_routing_agent_for_type body does NOT contain ORDER BY — Fix 2 STEP 3 DDL pending operator gate')
        }
      }

      // ─── C. resolve_agent_for_context P-HOUSE fallback ───────────────
      console.log('\n=== C. resolver P-HOUSE fallback (Aily / WALLiam) ===')
      const { rows: ailyR } = await c.query(
        "SELECT resolve_agent_for_context(NULL, NULL, NULL, NULL, NULL, NULL, NULL, $1::uuid) AS agent_id",
        [AILY]
      )
      ok(ailyR[0].agent_id === OVAIS, 'resolver(Aily, unmatched) -> Ovais (P-HOUSE fallback live)')
      const { rows: walR } = await c.query(
        "SELECT resolve_agent_for_context(NULL, NULL, NULL, NULL, NULL, NULL, NULL, $1::uuid) AS agent_id",
        [WALLIAM]
      )
      ok(walR[0].agent_id === KING_SHAH, 'resolver(WALLiam, unmatched) -> King Shah (P-HOUSE fallback live)')
    } finally {
      await c.end()
    }
  }

  // ─── B. geo-rollup endpoint locks FIX 1 (source-level) ────────────────
  console.log('\n=== B. geo-rollup source contains buildings rollup at muni + area ===')
  const geoRollupSrc = fs.readFileSync(
    path.join(REPO, 'app', 'api', 'admin-homes', 'territory', 'geo-rollup', 'route.ts'),
    'utf8'
  )
  ok(/level === 'municipality'[\s\S]{0,300}buildingCountExpr[\s\S]{0,300}buildings[\s\S]{0,300}communities/.test(geoRollupSrc),
     'geo-rollup buildingCountExpr at municipality level joins buildings -> communities')
  ok(/level === 'area'[\s\S]{0,400}buildingCountExpr[\s\S]{0,400}buildings[\s\S]{0,400}communities[\s\S]{0,400}municipalities/.test(geoRollupSrc),
     'geo-rollup buildingCountExpr at area level joins buildings -> communities -> municipalities')

  // ─── D. 4 lead-create routes apply is_active + is_selling re-check ─────
  console.log('\n=== D. 4 lead-create routes lock C2 (cache is_active+is_selling re-check) ===')
  const ROUTES = [
    'app/api/charlie/lead/route.ts',
    'app/api/walliam/contact/route.ts',
    'app/api/charlie/appointment/route.ts',
    'lib/actions/leads.ts',
  ]
  for (const rel of ROUTES) {
    const src = fs.readFileSync(path.join(REPO, rel), 'utf8')
    const hasMlsCache = /from\('mls_listings'\)[\s\S]{0,200}assigned_agent_id/.test(src)
    const hasActiveCheck = /agents\.is_active['"][\s\S]{0,100}true/.test(src) || /\.eq\('agents\.is_active', true\)/.test(src)
    const hasSellingCheck = /agents\.is_selling['"][\s\S]{0,100}true/.test(src) || /\.eq\('agents\.is_selling', true\)/.test(src)
    if (hasMlsCache) {
      ok(hasActiveCheck, rel + ' filters agents.is_active=true on cache lookup')
      ok(hasSellingCheck, rel + ' filters agents.is_selling=true on cache lookup')
    } else {
      ok(true, rel + ' does not read mls_listings cache (no C2 surface)')
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log('  PASS: ' + passes + '   FAIL: ' + failures)
  if (failures > 0) process.exit(1)
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
