// scripts/inchat-taxmatch-order-verify.ts
//
// W-CHARLIE-INCHAT-TAXMATCH-ORDER FIX-VERIFY — RENDER-GATE + ORDER.
//
// The prior W-CHARLIE-INCHAT-TAXMATCH-HYDRATE verify proved the
// Tax-Matched NODE renders on the failing path. THIS round proves
// DOM ORDER + single-invocation under mutual exclusion:
//
//   1. SINGLE INVOCATION (comparables-present): exactly ONE
//      "Tax-Matched" header in markup; the branch fires, the hoist
//      is gated off.
//   2. ORDER (comparables-present): the Tax-Matched header sits
//      AFTER the Comparable Sold header AND BEFORE the plan/scheduler
//      /disclaimer content.
//   3. SINGLE INVOCATION (no-comparables / failing-hydration path):
//      exactly ONE "Tax-Matched" header in markup; the branch is
//      never entered (no comparables block), the hoist fires.
//   4. MUTUAL EXCLUSION: across every test render, the count of
//      `<BuyerTaxMatchInChat` invocation REACHES is exactly ONE per
//      render — we never produce two Tax-Matched headers.
//   5. SOURCE-LEVEL: assert the gate `!(blocks||[]).some(b => b.type
//      === 'comparables')` is present on the top-level hoist, and
//      the branch-internal invocation is present in the comparables-
//      branch return.
//   6. BYTE-IDENTITY: only ResultsPanel.tsx changed in this commit.
//      Email + lead + seller + other paths all byte-identical.
//
// Render method: react-dom/server.renderToStaticMarkup on the REAL
// default-exported ResultsPanel component (NOT just BuyerTaxMatchInChat
// in isolation). This is the smallest "real wrapper" that exercises
// blocks.map() + hoist together — required to assert ORDER, not just
// presence.

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const RENDER_DIR = path.join(OUT_DIR, 'inchat-taxmatch-order-render')
const REPORT = path.join(OUT_DIR, 'inchat-taxmatch-order-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(RENDER_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m: string) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr  = () => log('─'.repeat(76))

let pass = 0, fail = 0
function expect(label: string, cond: boolean, evidence?: string) {
  if (!cond) fail++; else pass++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

;(async () => {
  log('W-CHARLIE-INCHAT-TAXMATCH-ORDER FIX-VERIFY — ' + new Date().toISOString())
  log('Render method: react-dom/server.renderToStaticMarkup on the REAL default-')
  log('exported ResultsPanel. Exercises blocks.map() + hoist together so DOM')
  log('ORDER can be asserted via string-index positions of the section headers.')
  hr()

  const { renderToStaticMarkup } = await import('react-dom/server')
  const { jsx } = await import('react/jsx-runtime')
  const RP = await import('../app/charlie/components/ResultsPanel')
  const ResultsPanel = (RP as any).default

  expect('0.0: ResultsPanel exported as default',
    typeof ResultsPanel === 'function',
    `typeof default = ${typeof ResultsPanel}`)

  // Real-shape buyerTaxMatch with 6 samples + trreb-image URLs.
  const realBtm: any = {
    isEmpty: false,
    reason: null,
    bandCenter: 5273.085,
    taxBand: { low: 4218.47, high: 6327.70 },
    taxYearWindow: { low: 2025, high: 2026 },
    withTaxCount: 9, totalCount: 10,
    samples: [
      { listingKey: 'E13158732', address: '88 Sample St, Whitby, ON', price: 875000, closeDate: '2026-04-12', bedrooms: 4, bathrooms: 3, propertySubtype: 'Detached', unitNumber: null, tax: 5240, daysOnMarket: 18, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/3D46UKfVOi1NFcCLAATs1lOtqx_OP4bUZMMIuMm1j20/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13169330', address: '12 Sample Ave, Whitby, ON', price: 825000, closeDate: '2026-03-28', bedrooms: 3, bathrooms: 3, propertySubtype: 'Detached', unitNumber: null, tax: 5102, daysOnMarket: 22, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/RpewApePBC2XH65c-Dd7bhVYLgCSV7psdlvkXSwl7kA/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13194904', address: '47 Sample Rd, Whitby, ON', price: 798000, closeDate: '2026-03-14', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4985, daysOnMarket: 14, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/nr7tJwSu5iQZglRzOf-_nlX1d0QZ1-2imxHWyA8lW_8/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13182312', address: '21 Sample Ln, Whitby, ON', price: 765000, closeDate: '2026-02-22', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4730, daysOnMarket: 31, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/NRIWQL-h2fVNrg8NRIOV2xvF48LfhtkeqkjXzJJYaiw/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13156072', address: '99 Sample Cr, Whitby, ON', price: 712000, closeDate: '2026-02-09', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4560, daysOnMarket: 25, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/HsjTXUGLk5DPNkY8Qg1ofMGYzSVlpn5SwHUDUiV_W08/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13168976', address: '5 Sample Pl, Whitby, ON', price: 689500, closeDate: '2026-01-30', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4480, daysOnMarket: 19, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/Scw-IliNUtZ49GsWwwpVCp-7bmhFVff0oIHRMRp_cmM/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
    ],
  }

  const realComparables = [
    { listingKey: 'C001', listing_key: 'C001', unparsed_address: '500 Comp Dr, Whitby, ON', closePrice: 850000, close_price: 850000, closeDate: '2026-03-01', close_date: '2026-03-01', bedrooms: 4, bathrooms: 3, propertySubtype: 'Detached', mediaUrl: 'https://trreb-image.ampre.ca/comp1/x.jpg' },
    { listingKey: 'C002', listing_key: 'C002', unparsed_address: '510 Comp Dr, Whitby, ON', closePrice: 820000, close_price: 820000, closeDate: '2026-02-15', close_date: '2026-02-15', bedrooms: 4, bathrooms: 3, propertySubtype: 'Detached', mediaUrl: 'https://trreb-image.ampre.ca/comp2/x.jpg' },
  ]

  const realForSale = [
    { id: 'a1', listing_key: 'F001', unparsed_address: '100 Active St, Whitby, ON', list_price: 800000, bedrooms_total: 3, bathrooms_total_integer: 2, property_type: 'Residential Freehold', property_subtype: 'Detached', _slug: '/100-active-st-whitby-f001', media: [{ media_url: 'https://trreb-image.ampre.ca/fsale1/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
  ]

  const realAnalytics = { sale_to_list_ratio: 96.79, closed_avg_dom_90: 20, active_count: 250, closed_sale_count_90: 137, absorption_rate_pct: 36, track: 'homes', avg_concession_pct: 3.21 }
  const realGeoContext = { geoType: 'municipality', geoId: '70103aef-1b32-4939-9ff8-264e859a5587', geoName: 'Whitby' }
  const realPlan = { type: 'buyer', planReady: true, geoName: 'Whitby', budgetMax: 900000, budgetMin: 600000, propertyType: 'homes', bedrooms: 3, timeline: 'flexible' }

  function makeProps(opts: { withComparables: boolean; withPlan: boolean }): any {
    const blocks: any[] = []
    blocks.push({ type: 'analytics', data: { ...realAnalytics, geoType: 'municipality', geoId: realGeoContext.geoId, track: 'homes' }, geoName: 'Whitby' })
    blocks.push({ type: 'listings', label: 'Matched Listings', listings: realForSale })
    if (opts.withComparables) {
      blocks.push({ type: 'comparables', listings: realComparables, intent: '' })
    }
    if (opts.withPlan) {
      blocks.push({ type: 'plan', data: realPlan, analyticsSnapshot: realAnalytics, listingsSnapshot: realForSale, geoContext: realGeoContext })
    }
    return {
      analytics: [{ ...realAnalytics, geoType: 'municipality', geoId: realGeoContext.geoId, track: 'homes' }],
      listingGroups: [{ label: 'Matched Listings', listings: realForSale }],
      comparables: opts.withComparables ? realComparables : [],
      geoContext: realGeoContext,
      plan: opts.withPlan ? realPlan : null,
      agent: null,
      onSendPlan: () => {},
      leadCaptured: false,
      sellerEstimate: null,
      communityBuildings: { affordable: [], premium: [] },
      sessionId: 'verify-session',
      userId: 'verify-user',
      onLeadCaptured: () => {},
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 1,
      searchedBuildings: [],
      rankings: [],
      priceTrends: [],
      seasonalData: null,
      blocks,
      backfilledTaxMatch: realBtm,
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // SECTION 1 — Comparables-present session: branch fires, hoist skips
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 1 — Comparables-present buyer session (branch fires)')
  const markupWithComparables = renderToStaticMarkup(
    jsx(ResultsPanel, makeProps({ withComparables: true, withPlan: true }))
  )
  fs.writeFileSync(path.join(RENDER_DIR, 'with-comparables.html'), markupWithComparables)
  log(`     markup length: ${markupWithComparables.length} bytes`)

  // Count "Tax-Matched" headers (the SectionHeader title text).
  const tmHits = (markupWithComparables.match(/Tax-Matched/g) || []).length
  expect('1.1: exactly ONE "Tax-Matched" header in markup (single invocation)',
    tmHits === 1, `count=${tmHits}`)

  // Find position of section markers
  const idxComparableSold = markupWithComparables.indexOf('Comparable Sold')
  const idxTaxMatched = markupWithComparables.indexOf('Tax-Matched')
  const idxAIDisclaimer = markupWithComparables.indexOf('AI Disclaimer')
  log(`     index "Comparable Sold": ${idxComparableSold}`)
  log(`     index "Tax-Matched":     ${idxTaxMatched}`)
  log(`     index "AI Disclaimer":   ${idxAIDisclaimer}`)

  expect('1.2: "Comparable Sold" header present in markup',
    idxComparableSold > 0, `idx=${idxComparableSold}`)
  expect('1.3: "Tax-Matched" header present in markup',
    idxTaxMatched > 0, `idx=${idxTaxMatched}`)
  expect('1.4: "Tax-Matched" appears AFTER "Comparable Sold"',
    idxTaxMatched > idxComparableSold,
    `${idxTaxMatched} > ${idxComparableSold}`)
  expect('1.5: "Tax-Matched" appears BEFORE "AI Disclaimer" (plan block content)',
    idxAIDisclaimer > 0 && idxTaxMatched < idxAIDisclaimer,
    `Tax-Matched=${idxTaxMatched} < AI Disclaimer=${idxAIDisclaimer}`)

  // Confirm tax-match tiles rendered with photos
  const trrebHits = (markupWithComparables.match(/trreb-image\.ampre\.ca/g) || []).length
  log(`     trreb-image URL hits: ${trrebHits} (For Sale + Comp Sold + Tax-Matched all carry photos)`)
  // Each Tax-Matched tile has its own <img>; check 6 hits attributable to tax-match's sample set
  // (sample URLs are distinct from the For Sale + comp URLs).
  const tmSampleHashes = ['3D46UK', 'RpewAp', 'nr7tJw', 'NRIWQL', 'HsjTXU', 'Scw-Il']
  const tmSampleHits = tmSampleHashes.filter(h => markupWithComparables.includes(h)).length
  expect('1.6: all 6 Tax-Matched sample URLs in markup (tiles with photos)',
    tmSampleHits === 6, `sample-URL hits: ${tmSampleHits}/6`)

  // Comparable Sold check
  expect('1.7: Comparable Sold "2 found" count present',
    /Comparable Sold[^<]*2 found/.test(markupWithComparables),
    'comparable count rendered')
  hr()

  // ───────────────────────────────────────────────────────────────────
  // SECTION 2 — No-comparables session: hoist fires (failing-path)
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 2 — No-comparables session (failing-path / hydration; hoist fires)')
  const markupNoComparables = renderToStaticMarkup(
    jsx(ResultsPanel, makeProps({ withComparables: false, withPlan: true }))
  )
  fs.writeFileSync(path.join(RENDER_DIR, 'no-comparables.html'), markupNoComparables)
  log(`     markup length: ${markupNoComparables.length} bytes`)

  const tmHitsNoComp = (markupNoComparables.match(/Tax-Matched/g) || []).length
  expect('2.1: exactly ONE "Tax-Matched" header in markup (hoist fires)',
    tmHitsNoComp === 1, `count=${tmHitsNoComp}`)

  // No Comparable Sold header
  expect('2.2: NO "Comparable Sold" header (no comparables block)',
    markupNoComparables.indexOf('Comparable Sold') === -1)

  // Photos still flow through
  const tmSampleHitsNoComp = tmSampleHashes.filter(h => markupNoComparables.includes(h)).length
  expect('2.3: all 6 Tax-Matched sample URLs present (mount-null fix intact)',
    tmSampleHitsNoComp === 6, `sample-URL hits: ${tmSampleHitsNoComp}/6`)

  // Order in no-comp scenario: Tax-Matched still BEFORE AI Disclaimer (plan block AFTER hoist? Actually
  // plan block is IN-MAP so plan renders BEFORE hoist. So Tax-Matched comes AFTER plan in this case.)
  const idxTaxMatchedNoComp = markupNoComparables.indexOf('Tax-Matched')
  const idxAIDisclaimerNoComp = markupNoComparables.indexOf('AI Disclaimer')
  log(`     index "Tax-Matched":   ${idxTaxMatchedNoComp}`)
  log(`     index "AI Disclaimer": ${idxAIDisclaimerNoComp}`)
  // In the no-comparables path the hoist fires AFTER blocks.map(), so Tax-Matched
  // is AFTER the plan-block content (disclaimer). That's the same as pre-this-commit
  // behavior for failing-path sessions; the hoist's position didn't change.
  log('     (in no-comp path, hoist position is unchanged — tax-match still appears after plan/disclaimer; this is the pre-existing position and the operator was not complaining about THIS scenario, only the comparables-present scenario)')
  hr()

  // ───────────────────────────────────────────────────────────────────
  // SECTION 3 — Mutual exclusion across both renders
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 3 — Mutual exclusion (never two Tax-Matched headers)')
  expect('3.1: comparables-present render has 1 Tax-Matched (branch only)',
    tmHits === 1)
  expect('3.2: no-comparables render has 1 Tax-Matched (hoist only)',
    tmHitsNoComp === 1)
  expect('3.3: never zero, never two (mutual exclusion holds)',
    tmHits === 1 && tmHitsNoComp === 1,
    `with-comp=${tmHits}, no-comp=${tmHitsNoComp}`)
  hr()

  // ───────────────────────────────────────────────────────────────────
  // SECTION 4 — Source-level: gate + branch invocation present
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 4 — SOURCE-LEVEL: gate + branch invocation present')
  const rpTxt = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/components/ResultsPanel.tsx'), 'utf8')
  expect('4.1: top-level hoist gated with !(blocks||[]).some(b => b.type === "comparables")',
    /\{!\(blocks \|\| \[\]\)\.some\(\(b:[^)]*\) => b\.type === 'comparables'\) && \(\(\) =>/.test(rpTxt))
  // Confirm branch-internal invocation exists by counting <BuyerTaxMatchInChat occurrences:
  // we should have EXACTLY 2 (one in branch, one in gated hoist).
  const invocationCount = (rpTxt.match(/<BuyerTaxMatchInChat\s/g) || []).length
  expect('4.2: exactly 2 <BuyerTaxMatchInChat invocation sites in source',
    invocationCount === 2, `invocation count: ${invocationCount}`)
  // And the comparables-branch invocation passes the same props the hoist does
  expect('4.3: both invocations pass `initialBtm={backfilledTaxMatch ?? null}`',
    (rpTxt.match(/initialBtm=\{backfilledTaxMatch \?\? null\}/g) || []).length === 2,
    'identical props at both sites')
  // Order marker present
  expect('4.4: W-CHARLIE-INCHAT-TAXMATCH-ORDER markers present in both sites',
    (rpTxt.match(/W-CHARLIE-INCHAT-TAXMATCH-ORDER/g) || []).length >= 2)
  hr()

  // ───────────────────────────────────────────────────────────────────
  // SECTION 5 — Byte-identity (only ResultsPanel.tsx changed)
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 5 — Byte-identity (ONE file changed)')
  function diffEmpty(p: string): boolean {
    try { return execSync(`git diff HEAD -- "${p}"`, { encoding: 'utf8' }).trim() === '' }
    catch { return false }
  }
  expect('5.1: lib/email/charlie-plan-email-html.ts unchanged', diffEmpty('lib/email/charlie-plan-email-html.ts'))
  expect('5.2: components/admin-homes/lead-workbench/PlanRenderer.tsx unchanged',
    diffEmpty('components/admin-homes/lead-workbench/PlanRenderer.tsx'))
  expect('5.3: lib/charlie/buyer-tax-match.ts unchanged', diffEmpty('lib/charlie/buyer-tax-match.ts'))
  expect('5.4: lib/estimator/tax-band-sold-query.ts unchanged', diffEmpty('lib/estimator/tax-band-sold-query.ts'))
  expect('5.5: lib/estimator/home-comparable-matcher-sales.ts unchanged',
    diffEmpty('lib/estimator/home-comparable-matcher-sales.ts'))
  expect('5.6: lib/estimator/condo-comparable-matcher-sales.ts unchanged',
    diffEmpty('lib/estimator/condo-comparable-matcher-sales.ts'))
  expect('5.7: app/api/charlie/plan-email/route.ts unchanged',
    diffEmpty('app/api/charlie/plan-email/route.ts'))
  expect('5.8: app/api/charlie/buyer-tax-match/route.ts unchanged',
    diffEmpty('app/api/charlie/buyer-tax-match/route.ts'))
  expect('5.9: app/charlie/hooks/useCharlie.ts unchanged (hydration kept verbatim)',
    diffEmpty('app/charlie/hooks/useCharlie.ts'))
  expect('5.10: app/charlie/components/CharlieOverlay.tsx unchanged (prop-drill kept verbatim)',
    diffEmpty('app/charlie/components/CharlieOverlay.tsx'))
  hr()

  // ───────────────────────────────────────────────────────────────────
  // SECTION 6 — Edit-set identity (exactly 1 declared target)
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 6 — edit-set identity')
  const status = execSync('git status --porcelain', { encoding: 'utf8' })
  const modified = status.split('\n').filter(l => /^\s*M /.test(l)).map(l => l.replace(/^\s*M\s+/, '').replace(/\\/g, '/'))
  const declared = new Set(['app/charlie/components/ResultsPanel.tsx'])
  const preDirty = new Set([
    'app/api/charlie/municipalities/route.ts',
    'scripts/r-w-territory-master-p2-data-phantom-fix.js',
    'scripts/r-w-territory-master-p4-check-fix.js',
  ])
  const allDeclaredPresent = [...declared].every(f => modified.includes(f))
  const unexpected = modified.filter(f => !declared.has(f) && !preDirty.has(f) && !/^docs\//.test(f) && !/^scripts\//.test(f) && !/^recon\//.test(f))
  expect('6.1: ResultsPanel.tsx in M list', allDeclaredPresent, `M: ${modified.join(', ')}`)
  expect('6.2: no NEW unexpected source files modified', unexpected.length === 0,
    unexpected.length === 0 ? 'pre-existing dirty excluded' : `UNEXPECTED: ${unexpected.join(', ')}`)
  hr()

  log(`SUMMARY: ${pass} PASS, ${fail} FAIL`)
  log(fail === 0 ? 'STATUS: ORDER + single-invocation verified.' : 'STATUS: FAIL — investigate before proceeding.')
  log('NOTE: live-DOM final order = operator eyeball on walliam.ca post-deploy.')

  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error(e); log('FATAL: ' + (e?.stack || e?.message || String(e))); process.exit(2) })
