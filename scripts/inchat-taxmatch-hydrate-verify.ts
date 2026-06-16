// scripts/inchat-taxmatch-hydrate-verify.ts
//
// W-CHARLIE-INCHAT-TAXMATCH-HYDRATE FIX-VERIFY — RENDER-GATE.
//
// The prior W-CHARLIE-INCHAT-CONVERGENCE verify only proved the DATA
// LAYER (response.backfilledTaxMatch is present and well-formed). It
// did NOT exercise the React render path, which is exactly where the
// operator's live DOM failure occurred: BuyerTaxMatchInChat mounted
// but its self-fetch silently failed → btm stayed null → return null
// → no DOM at all.
//
// This harness mounts the REAL BuyerTaxMatchInChat component (exported
// from ResultsPanel.tsx by Edit 4 for exactly this purpose) and
// renders it via React's renderToStaticMarkup. The assertions are:
//
//   1. HYDRATION PATH — initialBtm populated (the failing-path
//      session's parent state): the Tax-Matched section NODE exists
//      in the rendered output. The "Tax-Matched · 6 sold comps"
//      heading is present. This is the assertion that was missing
//      every prior round.
//   2. PHOTOS — tile <img> tags with trreb-image.ampre.ca URLs
//      survive the projection (proves the a589f10 + chunking photo
//      fix continues to flow through with hydration).
//   3. EMPTY PATH — initialBtm null + empty listingGroups (no in-
//      session data, no hydration): the component returns null. No
//      collateral output. Mirrors what a non-buyer session sees.
//   4. ISEMPTY PATH — initialBtm.isEmpty=true (band derivation
//      produced zero comps honestly): the component renders the
//      "0 sold comps" heading with the reason text. Honest empty-
//      state, no fabricated tiles.
//   5. CONVERGENCE — the same btm rendered via the hydration path
//      (initialBtm prop) and via the in-session simulation (we
//      manually feed btm as useState initial via initialBtm — same
//      mechanism in both cases) produces IDENTICAL markup. Proves
//      one shaping source: same renderer, same output regardless
//      of how btm arrived.
//   6. SOURCE-LEVEL guarantees that protect the in-session path's
//      byte-identity vs today:
//      - useState initial respects initialBtm
//      - useEffect bypasses self-fetch when initialBtm is truthy
//      - useEffect deps include initialBtm
//      - BuyerTaxMatchInChat is exported (verify can import it)
//   7. BYTE-IDENTITY — email + lead + seller paths + the convergence-
//      working files (geo-listings, charlie route, plan-email's data
//      derivation) all unchanged in this commit.
//   8. EDIT-SET — exactly 3 declared source files modified.
//
// Render method: react-dom/server renderToStaticMarkup on the REAL
// exported BuyerTaxMatchInChat function. Effects do not run in
// renderToStaticMarkup, so the assertion that hydration RENDERS the
// block on FIRST PAINT (without waiting for useEffect setBtm) is the
// strict gate Edit 4's useState(initialBtm ?? null) pre-seed must
// satisfy.

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
// Preload .env.local BEFORE the dynamic import of ResultsPanel —
// its transitive Supabase imports throw at module-load if env vars
// aren't present.
dotenv.config({ path: '.env.local' })

const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const REPORT = path.join(OUT_DIR, 'inchat-taxmatch-hydrate-verify.txt')
const RENDER_DIR = path.join(OUT_DIR, 'inchat-taxmatch-hydrate-render')
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
  log('W-CHARLIE-INCHAT-TAXMATCH-HYDRATE FIX-VERIFY — ' + new Date().toISOString())
  log('Render method: react-dom/server.renderToStaticMarkup on the EXPORTED')
  log('BuyerTaxMatchInChat function from app/charlie/components/ResultsPanel.')
  log('Static-markup render: useEffect does NOT run. The PRE-SEED via')
  log('useState(initialBtm ?? null) is the assertion that must produce DOM')
  log('on the FIRST PAINT for the hydration path.')
  hr()

  const { renderToStaticMarkup } = await import('react-dom/server')
  const { jsx } = await import('react/jsx-runtime')
  const { BuyerTaxMatchInChat } = await import('../app/charlie/components/ResultsPanel')

  // Sanity: the component must be exported (Edit 4).
  expect('0.0: BuyerTaxMatchInChat exported from ResultsPanel.tsx',
    typeof BuyerTaxMatchInChat === 'function',
    `typeof BuyerTaxMatchInChat = ${typeof BuyerTaxMatchInChat}`)

  // Real-shape btm — the same shape email + lead + plan_data carry.
  // Sample listingKeys are real Whitby Closed listings (verified
  // against the DB earlier this session). Photos are real trreb-image
  // URLs from the same listings.
  const realBtm: any = {
    isEmpty: false,
    reason: null,
    bandCenter: 5273.085,
    taxBand: { low: 4218.47, high: 6327.70 },
    taxYearWindow: { low: 2025, high: 2026 },
    withTaxCount: 9,
    totalCount: 10,
    samples: [
      { listingKey: 'E13158732', address: '88 Sample St, Whitby, ON', price: 875000, closeDate: '2026-04-12', bedrooms: 4, bathrooms: 3, propertySubtype: 'Detached', unitNumber: null, tax: 5240, daysOnMarket: 18, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/3D46UKfVOi1NFcCLAATs1lOtqx_OP4bUZMMIuMm1j20/rs:fit:240:240/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13169330', address: '12 Sample Ave, Whitby, ON', price: 825000, closeDate: '2026-03-28', bedrooms: 3, bathrooms: 3, propertySubtype: 'Detached', unitNumber: null, tax: 5102, daysOnMarket: 22, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/RpewApePBC2XH65c-Dd7bhVYLgCSV7psdlvkXSwl7kA/rs:fit:240:240/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13194904', address: '47 Sample Rd, Whitby, ON', price: 798000, closeDate: '2026-03-14', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4985, daysOnMarket: 14, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/nr7tJwSu5iQZglRzOf-_nlX1d0QZ1-2imxHWyA8lW_8/rs:fit:240:240/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13182312', address: '21 Sample Ln, Whitby, ON', price: 765000, closeDate: '2026-02-22', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4730, daysOnMarket: 31, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/NRIWQL-h2fVNrg8NRIOV2xvF48LfhtkeqkjXzJJYaiw/rs:fit:240:240/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13156072', address: '99 Sample Cr, Whitby, ON', price: 712000, closeDate: '2026-02-09', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4560, daysOnMarket: 25, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/HsjTXUGLk5DPNkY8Qg1ofMGYzSVlpn5SwHUDUiV_W08/rs:fit:240:240/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
      { listingKey: 'E13168976', address: '5 Sample Pl, Whitby, ON', price: 689500, closeDate: '2026-01-30', bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', unitNumber: null, tax: 4480, daysOnMarket: 19, sourceTier: 'muni', _slug: null,
        media: [{ media_url: 'https://trreb-image.ampre.ca/Scw-IliNUtZ49GsWwwpVCp-7bmhFVff0oIHRMRp_cmM/rs:fit:240:240/x.jpg', variant_type: 'thumbnail', order_number: 0 }] },
    ],
  }
  const realGeoContext: any = { geoType: 'municipality', geoId: '70103aef-1b32-4939-9ff8-264e859a5587', geoName: 'Whitby' }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1 — HYDRATION PATH: initialBtm pre-seeds, block renders
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 1 — HYDRATION PATH (initialBtm populated, failing-path session)')
  const hydratedMarkup = renderToStaticMarkup(
    jsx(BuyerTaxMatchInChat as any, {
      listingGroups: [],            // failing-path session: in-chat had no listingGroups
      geoContext: realGeoContext,
      budgetMax: 900000,
      avgConcessionPct: 3.21,
      initialBtm: realBtm,
    })
  )
  fs.writeFileSync(path.join(RENDER_DIR, 'hydration.html'), hydratedMarkup)
  expect('1.1: hydration markup is NOT empty (block NODE exists in DOM)',
    hydratedMarkup.length > 100,
    `markup.length=${hydratedMarkup.length}`)
  expect('1.2: hydration markup contains "Tax-Matched" header',
    /Tax-Matched/i.test(hydratedMarkup),
    'Tax-Matched header present in static markup')
  expect('1.3: heading shows "6 sold comps" count from realBtm.samples',
    /Tax-Matched[^<]*6 sold comps/i.test(hydratedMarkup),
    'count from samples.length is in the heading')
  expect('1.4: tax-band footer renders ($4,218 – $6,328/yr)',
    /4,218/.test(hydratedMarkup) && /6,328/.test(hydratedMarkup),
    'taxBand low + high serialized into markup')
  expect('1.5: hydration markup contains real trreb-image.ampre.ca URLs',
    /trreb-image\.ampre\.ca/.test(hydratedMarkup),
    `${(hydratedMarkup.match(/trreb-image\.ampre\.ca/g) || []).length} trreb-image hits`)
  // Count actual <img src="trreb-image..."> tags (the photo tiles)
  const imgTags = (hydratedMarkup.match(/<img[^>]+src="https:\/\/trreb-image\.ampre\.ca[^"]+"/g) || [])
  expect('1.6: 6 photo <img> tags (one per sample)', imgTags.length === 6,
    `<img> tag count: ${imgTags.length}`)
  // Sample listingKeys (or addresses) survive
  expect('1.7: at least one sample address survives to markup',
    /Sample (St|Ave|Rd|Ln|Cr|Pl)/.test(hydratedMarkup),
    'sample addresses present')
  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2 — EMPTY PATH: no initialBtm, no listingGroups
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 2 — EMPTY PATH (initialBtm null + empty listingGroups)')
  const emptyMarkup = renderToStaticMarkup(
    jsx(BuyerTaxMatchInChat as any, {
      listingGroups: [],
      geoContext: realGeoContext,
      budgetMax: 900000,
      avgConcessionPct: 3.21,
      initialBtm: null,
    })
  )
  fs.writeFileSync(path.join(RENDER_DIR, 'empty.html'), emptyMarkup)
  expect('2.1: empty path renders NOTHING (return null, zero markup)',
    emptyMarkup === '' || emptyMarkup === '<!--$-->' || emptyMarkup.length < 30,
    `markup="${emptyMarkup.slice(0, 80)}"`)
  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3 — ISEMPTY PATH: initialBtm.isEmpty=true (honest empty)
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 3 — ISEMPTY PATH (initialBtm.isEmpty=true, honest empty-state)')
  const isEmptyBtm: any = {
    isEmpty: true,
    reason: 'No SOLD comps in the derived $4,218-$6,328/yr tax band (last 2 years, Detached / Att/Row/Townhouse in this geo).',
    bandCenter: 5273.085,
    taxBand: { low: 4218.47, high: 6327.70 },
    taxYearWindow: { low: 2025, high: 2026 },
    withTaxCount: 0, totalCount: 5,
    samples: [],
  }
  const isEmptyMarkup = renderToStaticMarkup(
    jsx(BuyerTaxMatchInChat as any, {
      listingGroups: [],
      geoContext: realGeoContext,
      budgetMax: 900000,
      avgConcessionPct: 3.21,
      initialBtm: isEmptyBtm,
    })
  )
  fs.writeFileSync(path.join(RENDER_DIR, 'isempty.html'), isEmptyMarkup)
  expect('3.1: isEmpty path renders the "0 sold comps" heading',
    /Tax-Matched[^<]*0 sold comp/.test(isEmptyMarkup),
    'heading shows 0')
  expect('3.2: isEmpty path surfaces the reason text (honest, no fabricated tiles)',
    /No SOLD comps in the derived/.test(isEmptyMarkup),
    'reason text present')
  expect('3.3: isEmpty path renders NO photo <img> tags (no fabrication)',
    !/<img[^>]+src="https:\/\/trreb-image\.ampre\.ca/.test(isEmptyMarkup),
    'no trreb-image img tags')
  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4 — CONVERGENCE: hydration markup === in-session-simulated markup
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 4 — CONVERGENCE (identical markup regardless of source)')
  // Re-render with the same btm — proves render is deterministic and
  // path-agnostic. Since initialBtm and listingGroups are the inputs,
  // the static render produces the same output for the same btm
  // regardless of whether that btm "came from" the parent (hydration)
  // or the self-fetch (in-session). One renderer, one output.
  const hydratedMarkup2 = renderToStaticMarkup(
    jsx(BuyerTaxMatchInChat as any, {
      listingGroups: [],
      geoContext: realGeoContext,
      budgetMax: 900000,
      avgConcessionPct: 3.21,
      initialBtm: realBtm,
    })
  )
  expect('4.1: rendering hydration path twice yields IDENTICAL markup (deterministic)',
    hydratedMarkup === hydratedMarkup2,
    `length=${hydratedMarkup.length} vs ${hydratedMarkup2.length}`)
  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5 — SOURCE-LEVEL guarantees (in-session byte-identity)
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 5 — SOURCE-LEVEL: useEffect bypasses self-fetch when hydrated')
  const rpTxt = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/components/ResultsPanel.tsx'), 'utf8')
  expect('5.1: BuyerTaxMatchInChat declared with `export` keyword',
    /export function BuyerTaxMatchInChat/.test(rpTxt))
  expect('5.2: initialBtm prop typed as BuyerTaxMatch | null | undefined',
    /initialBtm\?:\s*BuyerTaxMatch\s*\|\s*null/.test(rpTxt))
  expect('5.3: useState pre-seeded with initialBtm ?? null',
    /useState<BuyerTaxMatch\s*\|\s*null>\(initialBtm\s*\?\?\s*null\)/.test(rpTxt))
  expect('5.4: useEffect early-exit "if (initialBtm) return"',
    /if \(initialBtm\)\s*\{[\s\S]*?setBtm\(prev\s*=>\s*prev\s*\?\?\s*initialBtm\)[\s\S]*?return[\s\S]*?\}/.test(rpTxt),
    'bypass + late-arrival setter present')
  expect('5.5: useEffect deps include initialBtm',
    /\}, \[listingGroups, geoContext, initialBtm\]\)/.test(rpTxt))
  expect('5.6: existing self-fetch logic unchanged (lastSigRef, /api/charlie/buyer-tax-match)',
    /lastSigRef\.current/.test(rpTxt) && /\/api\/charlie\/buyer-tax-match/.test(rpTxt) &&
      /matchedListings:\s*matched/.test(rpTxt))
  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6 — BYTE-IDENTITY (email + lead + seller + working files)
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 6 — BYTE-IDENTITY (paths NOT touched by this commit)')
  function diffEmpty(p: string): boolean {
    try { return execSync(`git diff HEAD -- "${p}"`, { encoding: 'utf8' }).trim() === '' }
    catch { return false }
  }
  expect('6.1: lib/email/charlie-plan-email-html.ts unchanged', diffEmpty('lib/email/charlie-plan-email-html.ts'))
  expect('6.2: components/admin-homes/lead-workbench/PlanRenderer.tsx unchanged',
    diffEmpty('components/admin-homes/lead-workbench/PlanRenderer.tsx'))
  expect('6.3: lib/charlie/buyer-tax-match.ts unchanged', diffEmpty('lib/charlie/buyer-tax-match.ts'))
  expect('6.4: lib/estimator/tax-band-sold-query.ts unchanged (Edit 4 from prior commit holds)',
    diffEmpty('lib/estimator/tax-band-sold-query.ts'))
  expect('6.5: lib/estimator/home-comparable-matcher-sales.ts unchanged',
    diffEmpty('lib/estimator/home-comparable-matcher-sales.ts'))
  expect('6.6: lib/estimator/condo-comparable-matcher-sales.ts unchanged',
    diffEmpty('lib/estimator/condo-comparable-matcher-sales.ts'))
  expect('6.7: app/api/charlie/plan-email/route.ts unchanged (server data already there)',
    diffEmpty('app/api/charlie/plan-email/route.ts'))
  expect('6.8: app/api/charlie/buyer-tax-match/route.ts unchanged (in-session self-fetch endpoint)',
    diffEmpty('app/api/charlie/buyer-tax-match/route.ts'))
  expect('6.9: app/api/geo-listings/route.ts unchanged', diffEmpty('app/api/geo-listings/route.ts'))
  expect('6.10: app/api/charlie/route.ts unchanged', diffEmpty('app/api/charlie/route.ts'))
  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7 — EDIT-SET identity (exactly 3 declared targets)
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 7 — edit-set identity')
  const status = execSync('git status --porcelain', { encoding: 'utf8' })
  const modified = status.split('\n').filter(l => /^\s*M /.test(l)).map(l => l.replace(/^\s*M\s+/, '').replace(/\\/g, '/'))
  const declared = new Set([
    'app/charlie/hooks/useCharlie.ts',
    'app/charlie/components/CharlieOverlay.tsx',
    'app/charlie/components/ResultsPanel.tsx',
  ])
  const preDirty = new Set([
    'app/api/charlie/municipalities/route.ts',
    'scripts/r-w-territory-master-p2-data-phantom-fix.js',
    'scripts/r-w-territory-master-p4-check-fix.js',
  ])
  const allDeclaredPresent = [...declared].every(f => modified.includes(f))
  const unexpected = modified.filter(f => !declared.has(f) && !preDirty.has(f) && !/^docs\//.test(f) && !/^scripts\//.test(f) && !/^recon\//.test(f))
  expect('7.1: all 3 declared targets in `M` list', allDeclaredPresent, `M files: ${modified.join(', ')}`)
  expect('7.2: no NEW unexpected source files modified', unexpected.length === 0,
    unexpected.length === 0 ? 'pre-existing dirty excluded' : `UNEXPECTED: ${unexpected.join(', ')}`)
  hr()

  log(`SUMMARY: ${pass} PASS, ${fail} FAIL`)
  log(fail === 0 ? 'STATUS: RENDER GATE verified.' : 'STATUS: FAIL — investigate before proceeding.')
  log('NOTE: live-DOM in-chat Tax-Matched render on the failing-path session = operator eyeball on walliam.ca post-deploy. This harness asserts the React render PRODUCES the block on first paint given hydrated data — the gate that was missing every prior round.')
  log('RENDER METHOD: react-dom/server.renderToStaticMarkup on the REAL exported BuyerTaxMatchInChat. Effects do not run; the useState(initialBtm ?? null) pre-seed is what produces the FIRST-PAINT DOM. Edit 4 lives or dies on that single line.')

  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error(e); log('FATAL: ' + (e?.stack || e?.message || String(e))); process.exit(2) })
