// scripts/smoke-seller-estimate-view.js
//
// W-CHARLIE-CONVERGENCE CV-0 (2026-06-14) — fixture-driven smoke for the
// canonical helpers (lib/charlie/seller-estimate-view.ts +
// lib/charlie/tier-chip.ts). Invokes them through the test-only probe
// endpoint at /api/charlie/test-seller-estimate-view-probe so the SHIPPED
// TypeScript runs unmodified.
//
// Pipeline:
//   1. SAVEPOINT-isolated pg read of lead 63b48f13 plan_data (source-of-
//      truth for assertions).
//   2. POST { op: 'view', leadId } → probe loads lead, runs
//      buildSellerEstimateView, returns the view. Smoke asserts every
//      canonical section against the live source values.
//   3. POST { op: 'tierChip', sourceTier, anchorTier, path } truth table.
//   4. POST { op: 'view', planData: buyer-shaped } → returns null cleanly
//      (no throw).
//
// Requires npm run dev on http://localhost:3000 (or 3001 fallback). No
// mutation. No emails. No commits.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const LEAD_FIXTURE_ID = '63b48f13-8a03-46be-b4ce-91007da0794a'
const REPORT_PATH = path.resolve(__dirname, '..', 'scripts-output', 'smoke-seller-estimate-view.txt')

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}

async function detectDev() {
  for (const b of [process.env.DEV_BASE_URL, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean)) {
    try {
      const r = await fetch(b, { method: 'HEAD' })
      if (r.status < 500) return b
    } catch {}
  }
  return null
}

async function probe(base, body) {
  const res = await fetch(`${base}/api/charlie/test-seller-estimate-view-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!j.ok) throw new Error('probe error: ' + (j.error || res.statusText))
  return j
}

const out = []
function log(s) { out.push(s); console.log(s) }
const checks = []
function check(name, ok, detail) { checks.push([name, !!ok, detail || '']); log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : '')) }

async function main() {
  log('================================================================')
  log('W-CHARLIE-CONVERGENCE CV-0 — SMOKE (canonical helper, real fixture)')
  log('================================================================')

  // ── Source: SAVEPOINT pg read ──
  const c = new Client(dbCfg())
  await c.connect()
  let source
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')
    const r = await c.query(`SELECT plan_data FROM leads WHERE id = $1`, [LEAD_FIXTURE_ID])
    if (!r.rows[0]) throw new Error('lead 63b48f13... not found')
    source = r.rows[0].plan_data
    await c.query('ROLLBACK')
  } finally {
    await c.end()
  }

  const base = await detectDev()
  if (!base) {
    log('')
    log('ERROR: no dev server reachable on :3000 or :3001. Run `npm run dev` and re-run.')
    process.exit(2)
  }
  log(`dev server: ${base}`)
  log(`fixture lead: ${LEAD_FIXTURE_ID}`)
  log('')

  // ── op:view against fixture ──
  const viewRes = await probe(base, { op: 'view', leadId: LEAD_FIXTURE_ID })
  const view = viewRes.view
  log('view top-level keys: ' + (view ? Object.keys(view).join(', ') : '(null)'))
  log('view.present: ' + JSON.stringify(view?.present))
  log('')

  // ── Identity ──
  check('view non-null', !!view)
  check('view.path === "home" (fixture is a home seller)', view?.path === 'home', `actual=${JSON.stringify(view?.path)}`)
  check('view.intent === "sale"', view?.intent === 'sale', `actual=${JSON.stringify(view?.intent)}`)
  check('view.subjectAddress === "606 Aspen rd, Pickering"', view?.subjectAddress === '606 Aspen rd, Pickering', `actual=${JSON.stringify(view?.subjectAddress)}`)
  check('view.buildingName === null (home, no building)', view?.buildingName === null, `actual=${JSON.stringify(view?.buildingName)}`)
  check('view.geoLevel === null', view?.geoLevel === null, `actual=${JSON.stringify(view?.geoLevel)}`)
  check('view.geoName === "Pickering"', view?.geoName === 'Pickering')

  // ── present flags vs reality ──
  const p = view?.present || {}
  const exp = {
    priceCard: true,
    tierRail: true,
    comparables: true,
    taxMatch: true,
    competing: true,
    marketIntel: true,
    priceByHomeType: true,
    offerIntel: true,
    bestTime: true,
    planCardGrid: true,
    planSummary: true,
    pricingRisk: true,
  }
  for (const k of Object.keys(exp)) {
    check(`present.${k} === ${exp[k]}`, p[k] === exp[k], `actual=${p[k]}`)
  }

  // ── priceCard ──
  check('priceCard.estimatedPrice === 1012635', view?.priceCard?.estimatedPrice === 1012635, `actual=${view?.priceCard?.estimatedPrice}`)
  check('priceCard.priceRange.low === 931624 && high === 1093646', view?.priceCard?.priceRange?.low === 931624 && view?.priceCard?.priceRange?.high === 1093646)
  check('priceCard.confidence === "Medium"', view?.priceCard?.confidence === 'Medium')
  check('priceCard.matchTier === "RANGE-ADJ"', view?.priceCard?.matchTier === 'RANGE-ADJ')
  // NOTE: estimate.marketSpeed.avgDaysOnMarket is the matcher's avg DOM
  // across THIS subject's comparables (17 for 63b48f13), NOT the geo-wide
  // analytics.closed_avg_dom_90 (25). They live on different fields and
  // mean different things. Anchor on a positive integer rather than a
  // specific value so the assertion doesn't drift if the matcher rolls
  // newer comps in.
  check('priceCard.marketSpeed.avgDaysOnMarket is a positive integer (matcher-derived comp avg DOM)',
    Number.isInteger(view?.priceCard?.marketSpeed?.avgDaysOnMarket) && view.priceCard.marketSpeed.avgDaysOnMarket > 0,
    `actual=${view?.priceCard?.marketSpeed?.avgDaysOnMarket}`)
  check('priceCard.currentMarketPrice === 1032000', view?.priceCard?.currentMarketPrice === 1032000)

  // ── tierRail ──
  check('tierRail.bestGeoTier === "gold" (the anchor)', view?.tierRail?.bestGeoTier === 'gold')
  check('tierRail.slots.platinum === null', view?.tierRail?.slots?.platinum === null)
  check('tierRail.slots.bronze === null', view?.tierRail?.slots?.bronze === null)
  check('tierRail.slots.gold.count === 5 && median === 1127000', view?.tierRail?.slots?.gold?.count === 5 && view?.tierRail?.slots?.gold?.median === 1127000)
  check('tierRail.slots.silver.count === 32 && median === 1118500', view?.tierRail?.slots?.silver?.count === 32 && view?.tierRail?.slots?.silver?.median === 1118500)

  // ── comparables (geo, normalized) ──
  check('comparables.length === 5', view?.comparables?.length === 5, `actual=${view?.comparables?.length}`)
  if (Array.isArray(view?.comparables) && view.comparables.length === 5) {
    for (let i = 0; i < 5; i++) {
      const row = view.comparables[i]
      const src = source.sellerEstimate.comparables[i]
      check(`comparables[${i}].priceKind === "close"`, row.priceKind === 'close')
      check(`comparables[${i}].sourceTier === null (geo cascade, undefined in source)`, row.sourceTier === null, `actual=${JSON.stringify(row.sourceTier)}`)
      check(`comparables[${i}].listingKey matches source (${src.listingKey})`, row.listingKey === src.listingKey)
      check(`comparables[${i}].mediaUrl matches source`, row.mediaUrl === src.mediaUrl)
      check(`comparables[${i}].address matches unparsedAddress`, row.address === src.unparsedAddress)
      check(`comparables[${i}].beds === src.bedrooms`, row.beds === src.bedrooms)
      check(`comparables[${i}].baths === src.bathrooms`, row.baths === src.bathrooms)
      check(`comparables[${i}].dom === src.daysOnMarket`, row.dom === src.daysOnMarket)
      // sold tile prefers adjustedPrice, else closePrice
      const expectedPrice = src.adjustedPrice ?? src.closePrice
      check(`comparables[${i}].price === adjustedPrice ?? closePrice (=${expectedPrice})`, row.price === expectedPrice, `row=${row.price}, expected=${expectedPrice}`)
      check(`comparables[${i}].sqft === src.livingAreaRange ("${src.livingAreaRange}")`, row.sqft === src.livingAreaRange)
    }
  }

  // ── taxMatch ──
  check('taxMatch.count === 12', view?.taxMatch?.count === 12, `actual=${view?.taxMatch?.count}`)
  check('taxMatch.bestGeoTier === "silver"', view?.taxMatch?.bestGeoTier === 'silver')
  check('taxMatch.comparables.length === 10', view?.taxMatch?.comparables?.length === 10)
  check('taxMatch.estimatedPrice === 848754', view?.taxMatch?.estimatedPrice === 848754)
  if (Array.isArray(view?.taxMatch?.comparables) && view.taxMatch.comparables.length === 10) {
    const allSilver = view.taxMatch.comparables.every(c => c.sourceTier === 'silver')
    check('every tax comp row carries sourceTier="silver"', allSilver, `silver count=${view.taxMatch.comparables.filter(c => c.sourceTier === 'silver').length}/10`)
    const allClose = view.taxMatch.comparables.every(c => c.priceKind === 'close')
    check('every tax comp row priceKind === "close"', allClose)
  }

  // ── competingListings (snake_case → canonical) ──
  check('competingListings.length === 2', view?.competingListings?.length === 2)
  if (Array.isArray(view?.competingListings) && view.competingListings.length === 2) {
    const c0 = view.competingListings[0]
    const s0 = source.sellerEstimate.competingListings[0]
    check('competingListings[0].priceKind === "list"', c0.priceKind === 'list')
    check('competingListings[0].price === src.list_price (=1199900)', c0.price === 1199900)
    check('competingListings[0].address === src.unparsed_address', c0.address === s0.unparsed_address)
    check('competingListings[0].beds === src.bedrooms_total (=3)', c0.beds === 3)
    check('competingListings[0].baths === src.bathrooms_total_integer (=3)', c0.baths === 3)
    check('competingListings[0].listingKey === src.listing_key', c0.listingKey === s0.listing_key)
    check('competingListings[0].id === src.id', c0.id === s0.id)
    check('competingListings[0].sourceTier === null', c0.sourceTier === null)
  }

  // ── analytics-derived sections (Market Intel / Price by Home Type / Offer Intel / Best Time) ──
  check('marketIntel.geoName === "Pickering"', view?.marketIntel?.geoName === 'Pickering')
  check('marketIntel.closedAvgDom90 === 25', view?.marketIntel?.closedAvgDom90 === 25)
  check('marketIntel.saleToListRatio === 100.72', view?.marketIntel?.saleToListRatio === 100.72)
  check('marketIntel.activeCount === 423', view?.marketIntel?.activeCount === 423)
  check('marketIntel.absorptionRatePct === 18.68', view?.marketIntel?.absorptionRatePct === 18.68)
  check('marketIntel.monthsOfInventory === 5.35', view?.marketIntel?.monthsOfInventory === 5.35)
  check('marketIntel.medianPsf === null (source is null)', view?.marketIntel?.medianPsf === null)

  check('priceByHomeType.length === 5 (Detached / Semi-Detached / Att-Row / Link / Duplex)', view?.priceByHomeType?.length === 5, `actual=${view?.priceByHomeType?.length}`)
  if (Array.isArray(view?.priceByHomeType)) {
    const detachedRow = view.priceByHomeType.find(r => r.subtype === 'Detached')
    check('priceByHomeType has a "Detached" row', !!detachedRow)
    if (detachedRow) {
      const srcDetached = source.analytics.subtype_breakdown['Detached']
      check('Detached row count matches source', detachedRow.count === srcDetached.count)
      check('Detached row medianPrice matches source', detachedRow.medianPrice === srcDetached.median_price)
      check('Detached row saleToList matches source', detachedRow.saleToList === srcDetached.sale_to_list)
    }
  }

  check('offerIntel.offerAt === 100.72', view?.offerIntel?.offerAt === 100.72)
  check('offerIntel.avgConcession === 3.57', view?.offerIntel?.avgConcession === 3.57)
  check('offerIntel.decideIn === 25', view?.offerIntel?.decideIn === 25)

  check('bestTime.currentMonth === 6', view?.bestTime?.currentMonth === 6)
  check('bestTime.currentMonthRank === 3', view?.bestTime?.currentMonthRank === 3)
  check('bestTime.bestMonths is non-empty array', Array.isArray(view?.bestTime?.bestMonths) && view.bestTime.bestMonths.length > 0)

  // ── plan card / summary ──
  check('planCardGrid.goal === "Top dollar"', view?.planCardGrid?.goal === 'Top dollar')
  check('planCardGrid.timeline === "3-6 months"', view?.planCardGrid?.timeline === '3-6 months')
  check('planCardGrid.propertyType === "Detached"', view?.planCardGrid?.propertyType === 'Detached')
  check('planCardGrid.bedrooms === 3', view?.planCardGrid?.bedrooms === 3)
  check('planCardGrid.budgetMax === null (seller)', view?.planCardGrid?.budgetMax === null)
  check('planSummary starts with "Pickering is currently a Buyer\'s Market"',
    typeof view?.planSummary === 'string' && view.planSummary.startsWith("Pickering is currently a Buyer's Market"))

  // ── pricingRisk ──
  check('pricingRisk.saleToListRatio === 100.72', view?.pricingRisk?.saleToListRatio === 100.72)
  check('pricingRisk.closedAvgDom90 === 25', view?.pricingRisk?.closedAvgDom90 === 25)
  check('pricingRisk.estimatedPrice === 1012635', view?.pricingRisk?.estimatedPrice === 1012635)
  check('pricingRisk.avgConcessionPct === 3.57', view?.pricingRisk?.avgConcessionPct === 3.57)

  // ── No NaN / undefined / fabricated values in the entire view ──
  const viewStr = JSON.stringify(view)
  check('view has zero "NaN" tokens', !/\bNaN\b/.test(viewStr))
  check('view has zero "undefined" tokens', !/\bundefined\b/.test(viewStr))
  // null is acceptable (canonical), but no fabricated placeholders like "N/A" or "—"
  check('view has zero "N/A" placeholder strings', !/"N\/A"/.test(viewStr))
  check('view has zero em-dash placeholder strings', !/"—"/.test(viewStr))

  log('')
  log('── tierChipFor truth table ──')

  // ── tierChipFor truth table (op:tierChip) ──
  const t1 = await probe(base, { op: 'tierChip', sourceTier: 'silver', anchorTier: 'gold', path: 'home' })
  check('tierChipFor("silver", "gold", "home") → silver (per-tile wins) + sub="Municipality"',
    t1?.result?.tier === 'silver' && t1?.result?.color === '#64748b' && t1?.result?.sub === 'Municipality',
    JSON.stringify(t1?.result))
  const t2 = await probe(base, { op: 'tierChip', sourceTier: null, anchorTier: 'gold', path: 'home' })
  check('tierChipFor(null, "gold", "home") → gold (anchor fallback) + sub="Community"',
    t2?.result?.tier === 'gold' && t2?.result?.color === '#f59e0b' && t2?.result?.sub === 'Community',
    JSON.stringify(t2?.result))
  const t3 = await probe(base, { op: 'tierChip', sourceTier: null, anchorTier: null, path: 'home' })
  check('tierChipFor(null, null, "home") → null (no chip)', t3?.result === null)
  const t4 = await probe(base, { op: 'tierChip', sourceTier: 'platinum', anchorTier: null, path: 'condo' })
  check('tierChipFor("platinum", null, "condo") → platinum + sub="Same Building"',
    t4?.result?.tier === 'platinum' && t4?.result?.color === '#10b981' && t4?.result?.sub === 'Same Building')
  const t5 = await probe(base, { op: 'tierChip', sourceTier: 'bronze', anchorTier: null, path: 'home' })
  check('tierChipFor("bronze", null, "home") → bronze + sub="Area"',
    t5?.result?.tier === 'bronze' && t5?.result?.color === '#c2410c' && t5?.result?.sub === 'Area')
  const t6 = await probe(base, { op: 'tierChip', sourceTier: 'none', anchorTier: 'gold', path: 'home' })
  check('tierChipFor("none", "gold", "home") → gold (anchor — "none" is not valid)', t6?.result?.tier === 'gold')
  const t7 = await probe(base, { op: 'tierChip', sourceTier: 'gibberish', anchorTier: 'silver', path: 'home' })
  check('tierChipFor("gibberish", "silver", "home") → silver (anchor fallback ignores unknown tier)', t7?.result?.tier === 'silver')

  // TIER_META values match the cited surfaces (ComparableCard.tsx:54-58)
  const tm = await probe(base, { op: 'tierMeta' })
  check('TIER_META.platinum.color === "#10b981"', tm?.TIER_META?.platinum?.color === '#10b981')
  check('TIER_META.gold.color     === "#f59e0b"', tm?.TIER_META?.gold?.color === '#f59e0b')
  check('TIER_META.silver.color   === "#64748b"', tm?.TIER_META?.silver?.color === '#64748b')
  check('TIER_META.bronze.color   === "#c2410c"', tm?.TIER_META?.bronze?.color === '#c2410c')
  check('TIER_META.platinum.marker === "◆"', tm?.TIER_META?.platinum?.marker === '◆')
  check('TIER_META.gold.marker === "●"', tm?.TIER_META?.gold?.marker === '●')

  // ── buildSellerEstimateView returns null for buyer-shaped plan_data ──
  log('')
  log('── buildSellerEstimateView gate cases ──')
  const buyerCase = await probe(base, { op: 'view', planData: { planType: 'buyer', plan: { goal: 'Investment' }, sellerEstimate: null } })
  check('buyer plan (planType=buyer, sellerEstimate=null) → view is null (clean gate, no throw)', buyerCase?.view === null)
  const emptyCase = await probe(base, { op: 'view', planData: { planType: 'seller', plan: { goal: 'x' } /* no sellerEstimate */ } })
  check('seller plan with no sellerEstimate → view is null (gate enforced)', emptyCase?.view === null)
  const nullCase = await probe(base, { op: 'view', planData: null })
  check('planData=null → view is null', nullCase?.view === null)

  // ── final ──
  log('')
  log('================================================================')
  const fails = checks.filter(c => !c[1]).length
  log(`OVERALL: ${fails === 0 ? 'PASS' : 'FAIL'}  (${checks.length - fails}/${checks.length} passed, ${fails} failed)`)
  log('================================================================')

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, out.join('\n') + '\n')
  console.log('\nreport written: ' + REPORT_PATH)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('FATAL', e)
  out.push('FATAL ' + (e?.message || String(e)))
  try { fs.writeFileSync(REPORT_PATH, out.join('\n') + '\n') } catch {}
  process.exit(2)
})
