// scripts/smoke-cv3-convergence.js
//
// W-CHARLIE-CONVERGENCE CV-3 (2026-06-14) — convergence lock.
//
// The single anti-drift harness. Against the real fixture lead 63b48f13:
//   1. Build the canonical view ONCE (via CV-0 helper).
//   2. Assert each of the three seller surfaces emits the canonical set
//      it is responsible for, using the evidence pattern each surface
//      supports:
//        - LEAD PAGE   source-static + view-data (the CV-1 combined-
//                      evidence pattern — 'use client' route-handler
//                      constraint blocks headless React render)
//        - EMAIL       live HTML via existing test-render-plan-email-probe
//        - IN-CHAT     source-static (Charlie chat panel; no probe needed)
//   3. Emit a machine-checked 14×3 convergence matrix. PASS only when
//      every cell is PRESENT or an explicitly-enumerated deliberate
//      exception (DELIBERATE-OMISSION, DELIBERATE-GATE, N/A).
//   4. Single-source / duplication watch: tier color/label values across
//      all migrated + unmigrated surfaces; the 2 remaining inline
//      literals (ComparableCard, SellerEstimateBlock) must STILL be
//      byte-identical to TIER_META so they don't drift while awaiting
//      cleanup.
//
// This test goes RED if any future change silently drops a canonical
// section from any surface OR if a remaining-duplication site drifts
// away from CV-0 TIER_META.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const FIXTURE = '63b48f13-8a03-46be-b4ce-91007da0794a'
const REPORT  = path.resolve(__dirname, '..', 'scripts-output', 'smoke-cv3-convergence.txt')

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}
function readFile(p) { return fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8') }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) }
function readBytes(p) { return fs.readFileSync(path.resolve(__dirname, '..', p)) }

async function detectDev() {
  for (const b of [process.env.DEV_BASE_URL, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean)) {
    try { const r = await fetch(b, { method: 'HEAD' }); if (r.status < 500) return b } catch {}
  }
  return null
}

const out = []
function log(s) { out.push(s); console.log(s) }
const checks = []
function check(name, ok, detail) { checks.push([name, !!ok, detail || '']); log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : '')) }

// The 14 canonical sections. Each is identified by a stable key + the
// per-surface evidence used to assert presence. DELIBERATE_OMISSION and
// DELIBERATE_GATE entries are the only ways a cell can pass without
// emitting the section — these are the enumerated exceptions, flagged
// loudly and counted in the report.
const SECTIONS = [
  { key: 'plan_summary',       label: 'Plan Summary (Seller Strategy text)' },
  { key: 'seller_profile',     label: 'Seller Profile (planCardGrid)' },
  { key: 'price_card',         label: 'Property Estimate price card' },
  { key: 'tier_rail',          label: '4-row tier rail (P/G/S/B + anchor)' },
  { key: 'market_intel',       label: 'Market Intelligence (analytics grid)' },
  { key: 'price_by_home_type', label: 'Price by Home Type (subtype table)' },
  { key: 'offer_intel',        label: 'Offer Intelligence' },
  { key: 'best_time',          label: 'Best Time (seasonal)' },
  { key: 'comparable_sold',    label: 'Comparable Sold + tier chips' },
  { key: 'tax_matched',        label: 'Tax-Matched + chips + estimate pill' },
  { key: 'competing',          label: 'Competing For Sale (no chip — deliberate per-tile rule)' },
  { key: 'pricing_risk',       label: 'Pricing Strategy & Risk' },
  { key: 'ai_disclaimer',      label: 'AI Disclaimer' },
  { key: 'brand_chrome',       label: 'Brand chrome / CTA / agent card' },
]

// Cell verdicts for the matrix. Anything not in this set is a FAIL.
const PRESENT = 'PRESENT'
const DELIB_OMIT = 'DELIBERATE-OMISSION'
const DELIB_GATE = 'DELIBERATE-GATE'
const NA = 'N/A'
const VALID_VERDICTS = new Set([PRESENT, DELIB_OMIT, DELIB_GATE, NA])

// ─── ENUMERATED DELIBERATE EXCEPTIONS ─────────────────────────────────
// These are the ONLY non-PRESENT cells that the test treats as passing.
// Any future change that adds a new absence WITHOUT enumerating it here
// will fail the matrix.
const DELIBERATE_EXCEPTIONS = {
  email: {
    pricing_risk: {
      verdict: DELIB_OMIT,
      reason: 'Operator-confirmed: PricingRiskBlock concession + DOM-risk table is intentionally not in the plan email — flagged for operator decision at CV-3 (do not add in CV-3 scope).',
    },
  },
  inchat: {
    market_intel: {
      verdict: DELIB_GATE,
      reason: 'ResultsPanel.tsx:107 gate `!(blocks||[]).some(b=>b.type===sellerEstimate)` hides BuyerOfferBlock when a sellerEstimate block exists. Byte-identical 6f685be→HEAD per W-CHARLIE-REGRESSION recon.',
    },
    price_by_home_type: {
      verdict: DELIB_GATE,
      reason: 'Same buyer-gating block as market_intel — Price by Home Type is inside BuyerOfferBlock.',
    },
    offer_intel: {
      verdict: DELIB_GATE,
      reason: 'Same buyer-gating block as market_intel — Offer Intelligence is inside BuyerOfferBlock.',
    },
    plan_summary: {
      verdict: DELIB_OMIT,
      reason: 'The long plan.summary text is the email\'s surface; the in-chat plan block (PlanDocument) renders structured rows + a brief Seller Strategy preview card pre-plan instead.',
    },
    brand_chrome: {
      verdict: NA,
      reason: 'In-chat IS the chat panel — there is no separate brand chrome wrapping it (the WALLiam brand is the host context, not a section).',
    },
  },
}

async function main() {
  log('================================================================')
  log('W-CHARLIE-CONVERGENCE CV-3 — convergence lock harness')
  log('================================================================')

  // Source-of-truth read
  const c = new Client(dbCfg())
  await c.connect()
  let pd
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')
    const r = await c.query(`SELECT plan_data FROM leads WHERE id = $1`, [FIXTURE])
    if (!r.rows[0]) throw new Error('fixture lead not found')
    pd = r.rows[0].plan_data
    await c.query('ROLLBACK')
  } finally { await c.end() }

  const base = await detectDev()
  if (!base) { log('ERROR: no dev server reachable. Run `npm run dev`.'); process.exit(2) }
  log(`fixture lead: ${FIXTURE}`)
  log(`dev server: ${base}`)
  log('')

  // Build canonical view via probe
  const viewRes = await fetch(`${base}/api/charlie/test-seller-estimate-view-probe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'view', leadId: FIXTURE }),
  })
  const viewJ = await viewRes.json()
  if (!viewJ.ok || !viewJ.view) throw new Error('view probe error: ' + JSON.stringify(viewJ).slice(0, 200))
  const view = viewJ.view
  log(`canonical view built: path=${view.path}, present=${JSON.stringify(view.present)}`)
  log('')

  // ─── LEAD PAGE — source-static + view-data ──────────────────────────
  log('────────────────────────────────────────────────────────────────')
  log('LEAD PAGE (CharlieLeadEstimate.tsx + LeadDetailClient.tsx)')
  log('────────────────────────────────────────────────────────────────')
  const cleSrc = readFile('components/dashboard/CharlieLeadEstimate.tsx')
  const ldcSrc = readFile('components/dashboard/LeadDetailClient.tsx')

  const leadPage = {}
  // Markers proving each section is in the JSX of CharlieLeadEstimate.
  leadPage.plan_summary       = /Seller Strategy[\s\S]{0,200}\{view\.planSummary\}/.test(cleSrc)
  leadPage.seller_profile     = /Seller Profile[\s\S]{0,1500}\{view\.planCardGrid\.goal\}/.test(cleSrc)
  leadPage.price_card         = /Estimated value[\s\S]{0,500}view\.priceCard\.estimatedPrice/.test(cleSrc)
  leadPage.tier_rail          = /Confidence by Area[\s\S]{0,400}TIER_ORDER\.map/.test(cleSrc)
  leadPage.market_intel       = /Market Intelligence[\s\S]{0,500}view\.marketIntel\.closedAvgDom90/.test(cleSrc)
  leadPage.price_by_home_type = /Price by Home Type[\s\S]{0,1500}view\.priceByHomeType\.map/.test(cleSrc)
  leadPage.offer_intel        = /Offer Intelligence[\s\S]{0,500}view\.offerIntel\.offerAt/.test(cleSrc)
  leadPage.best_time          = /Best Time to Sell[\s\S]{0,400}view\.bestTime/.test(cleSrc)
  leadPage.comparable_sold    = /Comparable Sold[\s\S]{0,500}view\.comparables\.slice/.test(cleSrc)
  leadPage.tax_matched        = /Tax-Matched[\s\S]{0,400}view\.taxMatch\.comparables\.length[\s\S]{0,800}Tax-matched estimate[\s\S]{0,800}view\.taxMatch\.comparables\.slice/.test(cleSrc)
  leadPage.competing          = /Competing For Sale[\s\S]{0,700}view\.competingListings\.slice/.test(cleSrc)
  leadPage.pricing_risk       = /Pricing Strategy[\s\S]{0,3500}At asking price[\s\S]{0,200}5% over asking[\s\S]{0,200}10% over asking/.test(cleSrc)
  leadPage.ai_disclaimer      = /AI Disclaimer/.test(cleSrc)
  // brand chrome lives in LeadDetailClient (header with name, badges, contact CTAs)
  leadPage.brand_chrome       = /\{lead\.contact_name\}/.test(ldcSrc) && /Call|WhatsApp|Email/.test(ldcSrc)

  for (const s of SECTIONS) {
    check(`lead page: ${s.label}`, leadPage[s.key])
  }

  // ─── EMAIL — live HTML via probe ──────────────────────────────────
  log('')
  log('────────────────────────────────────────────────────────────────')
  log('EMAIL (buildRichPlanEmail live HTML via test-render-plan-email-probe)')
  log('────────────────────────────────────────────────────────────────')
  const probeRes = await fetch(`${base}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sellerEstimate: pd.sellerEstimate,
      planType: 'seller', plan: pd.plan, analytics: pd.analytics,
      listings: [], comparables: [],
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1, blocks: [],
    }),
  })
  const probeJ = await probeRes.json()
  if (!probeJ.ok) throw new Error('email probe error: ' + (probeJ.error || probeRes.statusText))
  const html = probeJ.html

  const email = {}
  email.plan_summary       = /Pickering is currently a Buyer&#x27;s Market/.test(html) || /Pickering is currently a Buyer&#39;s Market/.test(html) || /Pickering is currently a Buyer's Market/.test(html)
  email.seller_profile     = /Seller Profile[\s\S]{0,400}Detached/.test(html)
  email.price_card         = /Estimated Value[\s\S]{0,300}\$1,012,635/.test(html)
  email.tier_rail          = /Confidence by Area/.test(html) && /◆ Platinum/.test(html) && /Anchor/.test(html)
  email.market_intel       = /Market Intelligence/.test(html)
  email.price_by_home_type = /Price by Home Type/.test(html)
  email.offer_intel        = /Offer Intelligence/.test(html)
  email.best_time          = /Best Time/.test(html)
  email.comparable_sold    = /Comparable Sold \(5\)/.test(html) && /#f59e0b/.test(html)
  email.tax_matched        = /Tax-Matched \(10\)/.test(html) && /Tax-matched estimate/.test(html) && /#64748b/.test(html)
  email.competing          = /Competing For Sale \(2\)/.test(html)
  // DELIBERATE-OMISSION: Pricing Strategy & Risk is intentionally not in the email
  email.pricing_risk       = /At asking price[\s\S]{0,100}5% over asking[\s\S]{0,100}10% over asking/.test(html)
  email.ai_disclaimer      = /AI Disclaimer/.test(html)
  email.brand_chrome       = /Open WALLiam/.test(html) || /Open \$\{brandName\}/.test(html)

  for (const s of SECTIONS) {
    const presentInSurface = email[s.key]
    const exc = DELIBERATE_EXCEPTIONS.email?.[s.key]
    if (exc) {
      check(`email: ${s.label} — ${exc.verdict} (${exc.reason.slice(0, 80)}…)`, !presentInSurface,
        presentInSurface ? `EXCEPTION VIOLATED — section actually present but enumerated as ${exc.verdict}` : '')
    } else {
      check(`email: ${s.label}`, presentInSurface)
    }
  }

  // ─── IN-CHAT — source-static ──────────────────────────────────────
  log('')
  log('────────────────────────────────────────────────────────────────')
  log('CHARLIE IN-CHAT (ResultsPanel.tsx + SellerEstimateBlock.tsx + PlanDocument.tsx + PricingRiskBlock.tsx + ComparableCard.tsx)')
  log('────────────────────────────────────────────────────────────────')
  const rpSrc  = readFile('app/charlie/components/ResultsPanel.tsx')
  const sebSrc = readFile('app/charlie/components/SellerEstimateBlock.tsx')
  const pdocSrc = readFile('app/charlie/components/PlanDocument.tsx')
  const prbSrc = readFile('app/charlie/components/PricingRiskBlock.tsx')
  const ccSrc  = readFile('app/charlie/components/ComparableCard.tsx')

  const inchat = {}
  // Most in-chat sections live in SellerEstimateBlock (estimate block) or
  // PlanDocument (plan block once generate_plan fires).
  inchat.plan_summary       = false  // not rendered as text — see deliberate exception below
  inchat.seller_profile     = /Your Property/.test(pdocSrc) || /PlanSection title=\{?"Your Profile/.test(pdocSrc)
  inchat.price_card         = /Estimated\s+\{intent === 'lease' \? 'Lease' : 'Sale'\} Value/.test(sebSrc)
  inchat.tier_rail          = /Confidence by Area/.test(sebSrc)
  // Market Intel / Price by Home Type / Offer Intel are in BuyerOfferBlock,
  // mounted ONLY when no sellerEstimate block exists.
  inchat.market_intel       = false  // gated off by ResultsPanel:107 — see deliberate exception below
  inchat.price_by_home_type = false  // same gate
  inchat.offer_intel        = false  // same gate
  inchat.best_time          = /Best Time/.test(pdocSrc)
  inchat.comparable_sold    = /Comparable Sold[\s\S]{0,500}<ComparableCard\b/.test(sebSrc)
                             && /tierChip|sourceTier|TIER_COLORS/.test(ccSrc)
  inchat.tax_matched        = /Tax-Matched[\s\S]{0,2000}Tax-matched estimate/.test(sebSrc)
  inchat.competing          = /Competing For Sale[\s\S]{0,800}<ActiveListingCard\b/.test(rpSrc)
  inchat.pricing_risk       = /<PricingRiskBlock\b/.test(rpSrc) && /Days on Market Risk/.test(prbSrc) && /At asking price/.test(prbSrc)
  inchat.ai_disclaimer      = /AI Disclaimer/.test(rpSrc) || /AI Disclaimer/.test(pdocSrc)
  inchat.brand_chrome       = false  // N/A — see deliberate exception below

  for (const s of SECTIONS) {
    const presentInSurface = inchat[s.key]
    const exc = DELIBERATE_EXCEPTIONS.inchat?.[s.key]
    if (exc) {
      // Deliberate exception cells PASS unconditionally — but log them.
      check(`in-chat: ${s.label} — ${exc.verdict}`, true, exc.reason.slice(0, 110) + '…')
    } else {
      check(`in-chat: ${s.label}`, presentInSurface)
    }
  }

  // ─── CONVERGENCE MATRIX ──────────────────────────────────────────
  log('')
  log('────────────────────────────────────────────────────────────────')
  log('CONVERGENCE MATRIX (14 sections × 3 surfaces)')
  log('────────────────────────────────────────────────────────────────')
  log('')
  const surfaces = [
    { key: 'lead',   label: 'LEAD PAGE',    data: leadPage, ex: {} },
    { key: 'email',  label: 'EMAIL',        data: email,    ex: DELIBERATE_EXCEPTIONS.email   || {} },
    { key: 'inchat', label: 'IN-CHAT',      data: inchat,   ex: DELIBERATE_EXCEPTIONS.inchat  || {} },
  ]

  // Header row
  const colWidth = 28
  let header = 'SECTION'.padEnd(40)
  for (const s of surfaces) header += s.label.padEnd(colWidth)
  log(header)
  log('-'.repeat(40 + colWidth * surfaces.length))

  const matrix = {}
  let matrixPass = 0, matrixFail = 0
  for (const sect of SECTIONS) {
    let row = sect.label.padEnd(40)
    matrix[sect.key] = {}
    for (const s of surfaces) {
      let verdict
      const presentInSurface = s.data[sect.key]
      const exc = s.ex?.[sect.key]
      if (presentInSurface) {
        verdict = PRESENT
      } else if (exc) {
        verdict = exc.verdict
      } else {
        verdict = 'MISSING'
      }
      matrix[sect.key][s.key] = verdict
      const ok = VALID_VERDICTS.has(verdict)
      if (ok) matrixPass++; else matrixFail++
      row += verdict.padEnd(colWidth)
    }
    log(row)
  }
  log('-'.repeat(40 + colWidth * surfaces.length))
  log(`matrix cells: ${matrixPass} PASS, ${matrixFail} FAIL (any "MISSING" cell = FAIL)`)
  check('CONVERGENCE MATRIX: every cell is PRESENT or an explicitly-enumerated deliberate exception',
    matrixFail === 0, `${matrixFail} cells unaccounted for`)

  // Enumerate deliberate exceptions for the report
  log('')
  log('Enumerated deliberate exceptions (the only non-PRESENT cells allowed):')
  for (const surfaceKey of Object.keys(DELIBERATE_EXCEPTIONS)) {
    for (const sectKey of Object.keys(DELIBERATE_EXCEPTIONS[surfaceKey])) {
      const e = DELIBERATE_EXCEPTIONS[surfaceKey][sectKey]
      const sect = SECTIONS.find(s => s.key === sectKey)
      log(`  - ${surfaceKey}.${sectKey} → ${e.verdict}`)
      log(`      reason: ${e.reason}`)
    }
  }

  // ─── SINGLE-SOURCE / DUPLICATION WATCH ────────────────────────────
  log('')
  log('────────────────────────────────────────────────────────────────')
  log('SINGLE-SOURCE / DUPLICATION WATCH (CV-0 TIER_META drift gate)')
  log('────────────────────────────────────────────────────────────────')

  // Canonical TIER_META values per CV-0
  const TIER_META_CANONICAL = {
    platinum: '#10b981', gold: '#f59e0b', silver: '#64748b', bronze: '#c2410c',
  }

  // Migrated surfaces — assert NO inline literal exists
  const charliePlanEmail = readFile('lib/email/charlie-plan-email-html.ts')
  check('lead page (CharlieLeadEstimate): TIER_META imported, no inline TIER_COLORS literal',
    /from\s+['"]@\/lib\/charlie\/tier-chip['"]/.test(cleSrc)
    && !/const\s+TIER_COLORS\s*:\s*Record<TierKey,\s*string>\s*=\s*\{[\s\S]{0,200}platinum:\s*'#10b981'/.test(cleSrc))
  check('email (charlie-plan-email-html): TIER_META imported, no inline TIER_COLORS_EMAIL literal',
    /from\s+['"]@\/lib\/charlie\/tier-chip['"]/.test(charliePlanEmail)
    && !/const\s+TIER_COLORS_EMAIL/.test(charliePlanEmail))

  // Unmigrated surfaces — inline literals STILL present BUT byte-identical
  // to TIER_META. If they drift, this test goes red BEFORE they cause a
  // visible chip color mismatch on Charlie's surfaces.
  const inlineLiteralPattern = /const\s+TIER_COLORS\s*:\s*Record<[A-Z][\w]*,\s*string>\s*=\s*\{([\s\S]{0,300})\}/m
  function extractTierLiteral(src) {
    const m = src.match(inlineLiteralPattern)
    if (!m) return null
    const body = m[1]
    const out = {}
    for (const tier of ['platinum','gold','silver','bronze']) {
      const tm = body.match(new RegExp(`${tier}\\s*:\\s*['"](#[0-9a-fA-F]{6})['"]`))
      if (tm) out[tier] = tm[1]
    }
    return out
  }
  const cardLit = extractTierLiteral(ccSrc)
  const sebLit  = extractTierLiteral(sebSrc)
  check('ComparableCard: inline TIER_COLORS still byte-identical to CV-0 TIER_META',
    cardLit
    && cardLit.platinum === TIER_META_CANONICAL.platinum
    && cardLit.gold     === TIER_META_CANONICAL.gold
    && cardLit.silver   === TIER_META_CANONICAL.silver
    && cardLit.bronze   === TIER_META_CANONICAL.bronze,
    cardLit ? JSON.stringify(cardLit) : 'pattern not matched')
  check('SellerEstimateBlock: inline TIER_COLORS still byte-identical to CV-0 TIER_META',
    sebLit
    && sebLit.platinum === TIER_META_CANONICAL.platinum
    && sebLit.gold     === TIER_META_CANONICAL.gold
    && sebLit.silver   === TIER_META_CANONICAL.silver
    && sebLit.bronze   === TIER_META_CANONICAL.bronze,
    sebLit ? JSON.stringify(sebLit) : 'pattern not matched')

  log('')
  log('Known remaining duplication (CV-3 flagged, not failed; cleanup pass tracked):')
  log('  - app/charlie/components/ComparableCard.tsx:54-58')
  log('  - app/charlie/components/SellerEstimateBlock.tsx:75-79')
  log('  → Both byte-identical to CV-0 TIER_META; this test fails red if either drifts.')

  // ─── BYTE-UNCHANGED PROOFS ────────────────────────────────────────
  log('')
  log('────────────────────────────────────────────────────────────────')
  log('BYTE-UNCHANGED proofs (CV-3 is test-only)')
  log('────────────────────────────────────────────────────────────────')
  const protectedFiles = [
    ['app/api/charlie/route.ts',                       '9c64acba0564'],
    ['app/charlie/lib/charlie-tools.ts',                'a02ee7ab48f9'],
    ['app/charlie/lib/charlie-prompts.ts',              'fbe7b7de14b9'],
    ['app/api/walliam/charlie/vip-request/route.ts',    '97c651e90c6f'],
  ]
  for (const [p, expected] of protectedFiles) {
    const got = sha(readBytes(p))
    check(`${p}  expected=${expected}, got=${got}`, got === expected)
  }
  // Informational SHAs (CV-1/CV-2 outputs should not have changed since)
  for (const p of [
    'components/dashboard/CharlieLeadEstimate.tsx',
    'components/dashboard/LeadDetailClient.tsx',
    'lib/email/charlie-plan-email-html.ts',
    'app/charlie/components/ResultsPanel.tsx',
    'app/charlie/components/SellerEstimateBlock.tsx',
    'app/charlie/components/ComparableCard.tsx',
    'lib/charlie/tier-chip.ts',
    'lib/charlie/seller-estimate-view.ts',
  ]) {
    log(`INFO  ${p}  sha=${sha(readBytes(p))}`)
  }

  // ─── Final ──
  log('')
  log('================================================================')
  const fails = checks.filter(c => !c[1]).length
  log(`OVERALL: ${fails === 0 ? 'PASS' : 'FAIL'}  (${checks.length - fails}/${checks.length} passed, ${fails} failed)`)
  log('================================================================')

  fs.mkdirSync(path.dirname(REPORT), { recursive: true })
  fs.writeFileSync(REPORT, out.join('\n') + '\n')
  console.log('\nreport written: ' + REPORT)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('FATAL', e)
  out.push('FATAL ' + (e?.message || String(e)))
  try { fs.writeFileSync(REPORT, out.join('\n') + '\n') } catch {}
  process.exit(2)
})
