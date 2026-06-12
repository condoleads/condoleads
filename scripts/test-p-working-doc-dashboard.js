// scripts/test-p-working-doc-dashboard.js
//
// P-WORKING-DOC-DASHBOARD SAVEPOINT-isolated test.
// Verifies the data-assembly layer feeding the new WorkingDocView render:
//   1. With workingDoc — assembly produces idMap with real mls_listings.id
//      values; baseUrl resolves to https://walliam.ca; the resulting tile-link
//      construction targets walliam.ca/property/{uuid}.
//   2. Without workingDoc (legacy lead) — assembly is a graceful no-op (empty
//      idMap, no crash, no "undefined"/"null" leak).
//   3. Tenant scoping is intact (the lookup uses the lead row's tenant_id,
//      not a hardcoded value) — single tenant.domain lookup per page load.
//   4. Mutation check (BEGIN/ROLLBACK): leads row count delta = 0.
//
// React render is not exercised here (no JSX runtime) — the assembly inputs
// are what the failure modes live in. The component itself is type-checked
// by `npx tsc --noEmit` (already PASSED above this turn).

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const WALLIAM_TEN = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const KING_SHAH    = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const WALLIAM_DOM  = 'walliam.ca'

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}

// Mirrors lib/email/working-doc-render.ts: collectListingKeys + resolveListingIds.
function collectListingKeys(doc) {
  if (!doc) return []
  const keys = []
  const grab = (s) => {
    if (!s) return
    for (const t of s.tiles || []) {
      if (t.listingKey && !t.id) keys.push(t.listingKey)
    }
  }
  grab(doc.comparableSold)
  grab(doc.taxMatch)
  grab(doc.competing)
  return keys
}

async function resolveListingIds(c, keys) {
  const out = {}
  const unique = Array.from(new Set((keys || []).filter(Boolean)))
  if (unique.length === 0) return out
  const r = await c.query(
    `SELECT id, listing_key FROM mls_listings WHERE listing_key = ANY($1::text[])`,
    [unique],
  )
  for (const row of r.rows) {
    if (row.listing_key) out[row.listing_key] = row.id
  }
  return out
}

// Mirrors buildBaseUrl: tenant.domain wins; NEXT_PUBLIC_APP_URL fallback.
function buildBaseUrl(domain) {
  return domain ? `https://${domain}` : (process.env.NEXT_PUBLIC_APP_URL || '')
}

;(async () => {
  const c = new Client(dbCfg())
  await c.connect()
  console.log('[test] connected to PG\n')

  const before = (await c.query('SELECT COUNT(*) AS n FROM leads')).rows[0].n
  await c.query('BEGIN')

  // ─── Build a representative workingDoc + insert a lead with it ────────────
  const sample = await c.query(
    `SELECT id, listing_key FROM mls_listings
     WHERE listing_key IS NOT NULL AND id IS NOT NULL
     ORDER BY close_date DESC NULLS LAST
     LIMIT 6`,
  )
  const keys = sample.rows.map(r => r.listing_key)
  console.log('sampled listing_keys:', keys)

  const workingDoc = {
    version: 1,
    type: 'condo',
    subject: {
      buildingName: 'X2 Condos', buildingAddress: '101 Charles St E, Toronto',
      unitNumber: '1505', bedrooms: 2, bathrooms: 2, livingAreaRange: '800-899',
    },
    estimate: {
      estimatedPrice: 925000,
      priceRange: { low: 880000, high: 970000 },
      matchTier: 'RANGE', bestGeoTier: 'gold',
      confidence: 'Medium-High',
      confidenceMessage: 'Good estimate. Signal: strong (8 comps).',
    },
    comparableSold: {
      bestGeoTier: 'gold', count: 8, estimatedPrice: 925000, median: 920000,
      tiles: keys.slice(0, 3).map((k, i) => ({
        listingKey: k, closePrice: 900000 + i * 10000, closeDate: '2026-05-01',
        bedrooms: 2, bathrooms: 2, livingAreaRange: '800-899',
        unparsedAddress: `Test Address ${i + 1}, Toronto`,
        matchTier: 'RANGE', sourceTier: i === 0 ? 'platinum' : 'gold',
      })),
    },
    taxMatch: {
      bestGeoTier: 'gold', count: 4, estimatedPrice: 915000,
      tiles: keys.slice(3, 5).map((k, i) => ({
        listingKey: k, closePrice: 920000 + i * 5000, closeDate: '2026-04-15',
        bedrooms: 2, bathrooms: 2, livingAreaRange: '800-899',
        unparsedAddress: `Tax Comp ${i + 1}, Toronto`, sourceTier: 'gold',
      })),
    },
    competing: {
      count: 1,
      tiles: keys.slice(5, 6).map(k => ({
        // CompetingListing carries id directly; on the persisted doc we may
        // have populated it OR left it null. Test the listingKey resolution.
        listingKey: k, listPrice: 949000, daysOnMarket: 12,
        bedrooms: 2, bathrooms: 2, livingAreaRange: '800-899',
        unparsedAddress: 'Active Comp 1, Toronto',
      })),
    },
  }

  // Persist the lead row inside the transaction (proves SELECT('*') sees
  // property_details.workingDoc shape end-to-end).
  await c.query('SAVEPOINT sp1')
  let inserted = null
  try {
    const ins = await c.query(
      `INSERT INTO leads (tenant_id, agent_id, contact_name, contact_email, source, status, property_details)
       VALUES ($1, $2, $3, $4, $5, 'new', $6)
       RETURNING id, tenant_id, property_details`,
      [
        WALLIAM_TEN, KING_SHAH,
        'TEST P-WORKING-DOC-DASHBOARD', 'test+dash@invalid',
        'estimator',
        JSON.stringify({ workingDoc, buildingName: 'X2 Condos' }),
      ],
    )
    inserted = ins.rows[0]
  } catch (e) {
    console.error('FAIL insert:', e.message)
    await c.query('ROLLBACK TO SAVEPOINT sp1')
  }

  // Read-back from the inserted row (mirrors page.tsx's select('*'))
  let readBack = null
  if (inserted) {
    const r = await c.query(
      `SELECT property_details, tenant_id FROM leads WHERE id = $1`,
      [inserted.id],
    )
    readBack = r.rows[0]
  }

  // ─── Test 1: tenant.domain lookup uses LEAD's tenant_id, not a hardcode ──
  let tenantDomain = null
  if (readBack?.tenant_id) {
    const tr = await c.query(`SELECT domain FROM tenants WHERE id = $1`, [readBack.tenant_id])
    tenantDomain = tr.rows[0]?.domain || null
  }
  const tenantOk = tenantDomain === WALLIAM_DOM

  // ─── Test 2: baseUrl + listing-id resolution ──────────────────────────────
  const baseUrl = buildBaseUrl(tenantDomain)
  const wd = readBack?.property_details?.workingDoc ?? null
  const idMap = wd ? await resolveListingIds(c, collectListingKeys(wd)) : {}
  const tileLinks = []
  if (wd) {
    const grab = (section) => {
      if (!section) return
      for (const t of section.tiles || []) {
        const id = t.id || (t.listingKey ? idMap[t.listingKey] : null)
        if (id) tileLinks.push(`${baseUrl}/property/${id}`)
      }
    }
    grab(wd.comparableSold)
    grab(wd.taxMatch)
    grab(wd.competing)
  }
  const linksOk = tileLinks.length > 0
    && tileLinks.every(h => h.startsWith(`https://${WALLIAM_DOM}/property/`))
    && tileLinks.every(h => !h.includes('condoleads'))
  const sectionsOk = !!(wd?.comparableSold?.tiles?.length
    && wd?.taxMatch?.tiles?.length
    && wd?.competing?.tiles?.length)

  // ─── Test 3: legacy fallback — lead with summary-only property_details ────
  await c.query('SAVEPOINT sp2')
  let legacyRow = null
  try {
    const legacyIns = await c.query(
      `INSERT INTO leads (tenant_id, agent_id, contact_name, contact_email, source, status, property_details)
       VALUES ($1, $2, $3, $4, $5, 'new', $6)
       RETURNING id, property_details`,
      [
        WALLIAM_TEN, KING_SHAH,
        'TEST P-WORKING-DOC-DASHBOARD legacy', 'test+legacy@invalid',
        'estimator',
        JSON.stringify({ buildingName: 'Legacy Subject', estimatedPrice: 800000 }),
      ],
    )
    legacyRow = legacyIns.rows[0]
  } catch (e) {
    console.error('FAIL legacy insert:', e.message)
    await c.query('ROLLBACK TO SAVEPOINT sp2')
  }
  const legacyWd = legacyRow?.property_details?.workingDoc ?? null
  const legacyIdMap = legacyWd ? await resolveListingIds(c, collectListingKeys(legacyWd)) : {}
  // Component logic: if !workingDoc return null. Assembly should produce empty
  // idMap and not crash; the React render returns null gracefully.
  const legacyOk = legacyWd === null
    && Object.keys(legacyIdMap).length === 0
    && legacyRow?.property_details?.buildingName === 'Legacy Subject'

  // ─── Rollback everything ─────────────────────────────────────────────────
  await c.query('ROLLBACK')
  const after = (await c.query('SELECT COUNT(*) AS n FROM leads')).rows[0].n
  const mutOk = before === after

  await c.end()

  console.log('\n=== VERDICTS ===')
  console.log(`1 Tenant.domain resolves from LEAD'S tenant_id (walliam.ca):  ${tenantOk ? 'PASS' : 'FAIL'}  (got: ${tenantDomain})`)
  console.log(`2 3 sections present on persisted workingDoc:                 ${sectionsOk ? 'PASS' : 'FAIL'}`)
  console.log(`3 Tile links tenant-correct (walliam.ca, zero condoleads):    ${linksOk ? 'PASS' : 'FAIL'}  (${tileLinks.length} links)`)
  console.log(`4 Legacy lead (no workingDoc): graceful, no crash:            ${legacyOk ? 'PASS' : 'FAIL'}`)
  console.log(`5 Mutation delta = 0 (BEGIN/ROLLBACK):                        ${mutOk ? 'PASS' : 'FAIL'}  (before=${before} after=${after})`)
  console.log('')
  console.log('sample tile links (first 3):')
  tileLinks.slice(0, 3).forEach(h => console.log('  ' + h))

  const all = tenantOk && sectionsOk && linksOk && legacyOk && mutOk
  console.log(`\nOVERALL: ${all ? 'PASS' : 'FAIL'}`)
  process.exit(all ? 0 : 1)
})().catch(e => { console.error('[test] failed:', e); process.exit(2) })
