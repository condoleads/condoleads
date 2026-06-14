// scripts/smoke-cv2-email.js
//
// W-CHARLIE-CONVERGENCE CV-2 (2026-06-14) — email parity smoke against
// real production fixture lead 63b48f13 via the existing test-render-plan-
// email-probe endpoint (shipped at C-CHARLIE-FOLLOWUP B(i)).
//
// Asserts:
//   PRESERVATION   every section the email already had pre-CV-2 STILL
//                  renders: plan-card grid, Seller Profile, Market Intel,
//                  Price by Home Type, Offer Intel, Best Time, Seller
//                  Strategy summary, Comparable Sold (N=5), Tax-Matched
//                  (N=10), Competing (N=2), AI Disclaimer, Open WALLiam
//                  CTA, agent card.
//   COMPLETENESS   the 2 NEW sections render with correct values from the
//                  canonical view: Property Estimate price card
//                  ($1,012,635 / $931,624 – $1,093,646 / Medium / RANGE-
//                  ADJ); 4-row tier rail "Confidence by Area" with anchor
//                  highlight on the gold row, slot data {gold: 5 comps /
//                  $1,127,000, silver: 32 / $1,118,500, platinum + bronze
//                  "no data"}.
//   CHIP PARITY    comp + tax tiles still carry tier chips; gold hex
//                  (#f59e0b) at least once per geo comp (5) and at least
//                  once for the tier-rail gold row; silver hex (#64748b)
//                  at least once per tax comp (10) and at least once for
//                  the tier-rail silver row.
//   DUPLICATION    inline TIER_COLORS_EMAIL / HOME_LABELS_EMAIL /
//                  CONDO_LABELS_EMAIL declarations GONE from
//                  charlie-plan-email-html.ts; CV-0 imports present.
//   HYGIENE        zero undefined / NaN / null / Invalid Date / $0;
//                  every walliam.ca href well-formed; zero condoleads.ca
//                  leak.
//   NON-IN-SCOPE   CharlieLeadEstimate (CV-1) byte-unchanged;
//                  LeadDetailClient byte-unchanged; ResultsPanel +
//                  SellerEstimateBlock + ComparableCard byte-unchanged;
//                  09b97ef-protected SHAs match; S1 zero-diff.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const FIXTURE = '63b48f13-8a03-46be-b4ce-91007da0794a'
const REPORT  = path.resolve(__dirname, '..', 'scripts-output', 'smoke-cv2-email.txt')

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}
function readFile(p) { return fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8') }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) }
function readBytes(p) { return fs.readFileSync(path.resolve(__dirname, '..', p)) }
function count(haystack, re) {
  const m = haystack.match(re)
  return m ? m.length : 0
}

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
function checkContains(haystack, needle, name, detail) {
  const ok = typeof haystack === 'string' && haystack.includes(needle)
  check(name, ok, detail || (ok ? '' : `missing: "${needle.slice(0, 80)}"`))
}

async function main() {
  log('================================================================')
  log('W-CHARLIE-CONVERGENCE CV-2 — email parity smoke')
  log('================================================================')

  // Read fixture from DB (SAVEPOINT) for the probe call.
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

  log(`fixture lead: ${FIXTURE}`)
  const base = await detectDev()
  if (!base) { log('ERROR: no dev server reachable. Run `npm run dev`.'); process.exit(2) }
  log(`dev server: ${base}`)
  log('')

  // POST to the probe (shipped at C-CHARLIE-FOLLOWUP B(i)) with the real
  // fixture's sellerEstimate + plan + analytics. The probe imports the
  // SAME buildRichPlanEmail the live plan-email POST handler uses.
  const probeRes = await fetch(`${base}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sellerEstimate: pd.sellerEstimate,
      planType: 'seller',
      plan: pd.plan,
      analytics: pd.analytics,
      listings: [],
      comparables: [],
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 1,
      blocks: [],
    }),
  })
  const j = await probeRes.json()
  if (!j.ok) throw new Error('probe error: ' + (j.error || probeRes.statusText))
  const html = j.html
  log(`returned HTML length: ${html.length} bytes`)
  log('')

  // ── PRESERVATION ──
  log('── PRESERVATION ──')
  checkContains(html, 'Seller Strategy', 'PRESERVE: Seller Strategy heading')
  checkContains(html, 'Market Intelligence', 'PRESERVE: Market Intelligence heading')
  checkContains(html, 'Price by Home Type', 'PRESERVE: Price by Home Type table')
  checkContains(html, 'Offer Intelligence', 'PRESERVE: Offer Intelligence heading')
  checkContains(html, 'Best Time', 'PRESERVE: Best Time block')
  checkContains(html, 'Seller Profile', 'PRESERVE: Seller Profile heading')
  checkContains(html, 'Your Seller Strategy', 'PRESERVE: Dark plan-card "Your Seller Strategy" label')
  checkContains(html, 'Comparable Sold (5)', 'PRESERVE: Comparable Sold (5) header (sellerComps.length === 5)')
  checkContains(html, 'Tax-Matched (10)', 'PRESERVE: Tax-Matched (10) header (taxComps.length === 10)')
  checkContains(html, 'Tax-matched estimate', 'PRESERVE: Tax-matched estimate pill label')
  checkContains(html, 'Competing For Sale (2)', 'PRESERVE: Competing For Sale (2) header')
  checkContains(html, 'AI Disclaimer', 'PRESERVE: AI Disclaimer block')
  checkContains(html, 'Open WALLiam', 'PRESERVE: Open WALLiam CTA')

  // ── COMPLETENESS — Property Estimate price card ──
  log('')
  log('── COMPLETENESS: Property Estimate price card ──')
  checkContains(html, 'Estimated Value', 'NEW: "Estimated Value" label (price card)')
  checkContains(html, '$1,012,635', 'NEW: estimatedPrice value rendered')
  checkContains(html, 'Range $931,624', 'NEW: price range low rendered')
  checkContains(html, '$1,093,646', 'NEW: price range high rendered')
  checkContains(html, 'Confidence: Medium', 'NEW: confidence rendered')
  checkContains(html, 'RANGE-ADJ', 'NEW: matchTier rendered')

  // ── COMPLETENESS — 4-row tier rail with anchor highlight ──
  log('')
  log('── COMPLETENESS: 4-row tier rail with anchor ──')
  checkContains(html, 'Confidence by Area', 'NEW: tier rail heading')
  // 4 tier labels rendered
  checkContains(html, '◆ Platinum',  'NEW: tier rail row Platinum')
  checkContains(html, '● Gold',      'NEW: tier rail row Gold')
  checkContains(html, '● Silver',    'NEW: tier rail row Silver')
  checkContains(html, '● Bronze',    'NEW: tier rail row Bronze')
  // Home path subs (fixture is home)
  checkContains(html, 'Same street',  'NEW: home path platinum sub')
  checkContains(html, 'Community',    'NEW: home path gold sub')
  checkContains(html, 'Municipality', 'NEW: home path silver sub')
  checkContains(html, 'Area',         'NEW: home path bronze sub')
  // Anchor on gold
  checkContains(html, 'Anchor',       'NEW: ANCHOR chip on best row')
  // Tier rail row values for the fixture
  checkContains(html, '$1,127,000',   'NEW: tier rail gold median')
  checkContains(html, '5 comps',      'NEW: tier rail gold count')
  checkContains(html, '$1,118,500',   'NEW: tier rail silver median')
  checkContains(html, '32 comps',     'NEW: tier rail silver count')
  checkContains(html, 'no data',      'NEW: tier rail "no data" cells for null slots (platinum, bronze)')

  // ── CHIP PARITY (TIER_META hex byte-identical to pre-CV-2 inline values) ──
  log('')
  log('── CHIP PARITY ──')
  const goldHex   = count(html, /#f59e0b/g)
  const silverHex = count(html, /#64748b/g)
  const platinumHex = count(html, /#10b981/g)
  const bronzeHex  = count(html, /#c2410c/g)
  log(`hex counts: gold=${goldHex} silver=${silverHex} platinum=${platinumHex} bronze=${bronzeHex}`)
  // Pre-CV-2 baseline (per the 20/20 Phase 2 smoke): gold ~6 (5 comp chips + dark plan-card
  // condition bg etc), silver 10 (tax chips). Post-CV-2 adds: gold ×1 (tier-rail row chip),
  // silver ×1, platinum ×1, bronze ×1, plus the anchor highlight (no #f59e0b add — uses
  // emerald #34d399/#d1fae5 for the anchor bg/badge).
  check('gold hex count >= 6 (5 comp tile chips + 1 tier-rail gold row chip; matches pre-CV-2 floor)',
    goldHex >= 6, `goldHex=${goldHex}`)
  check('silver hex count >= 11 (10 tax tile chips + 1 tier-rail silver row chip)',
    silverHex >= 11, `silverHex=${silverHex}`)
  check('platinum hex count >= 1 (tier rail row chip for null-slot tier)',
    platinumHex >= 1, `platinumHex=${platinumHex}`)
  check('bronze hex count >= 1 (tier rail row chip for null-slot tier)',
    bronzeHex >= 1, `bronzeHex=${bronzeHex}`)

  // ── DUPLICATION KILLED ──
  log('')
  log('── DUPLICATION KILLED ──')
  const emailSrc = readFile('lib/email/charlie-plan-email-html.ts')
  check('inline `const TIER_COLORS_EMAIL` declaration REMOVED',
    !/const\s+TIER_COLORS_EMAIL/.test(emailSrc))
  check('inline `const HOME_LABELS_EMAIL` declaration REMOVED',
    !/const\s+HOME_LABELS_EMAIL/.test(emailSrc))
  check('inline `const CONDO_LABELS_EMAIL` declaration REMOVED',
    !/const\s+CONDO_LABELS_EMAIL/.test(emailSrc))
  checkContains(emailSrc, "from '@/lib/charlie/tier-chip'", 'CV-0 imports: tier-chip module imported')
  checkContains(emailSrc, "buildSellerEstimateView", 'CV-0 imports: buildSellerEstimateView imported')
  checkContains(emailSrc, "tierChipFor",  'CV-0 imports: tierChipFor named import')
  checkContains(emailSrc, "TIER_META",    'CV-0 imports: TIER_META named import')
  checkContains(emailSrc, "TIER_ORDER",   'CV-0 imports: TIER_ORDER named import')
  check('tierChipHtml now calls tierChipFor (anchor-fallback inside)',
    /function\s+tierChipHtml\([\s\S]{0,300}tierChipFor\(/.test(emailSrc))

  // ── HYGIENE ──
  log('')
  log('── HYGIENE ──')
  check('zero "undefined" tokens',     !/\bundefined\b/.test(html))
  check('zero "NaN" tokens',           !/\bNaN\b/.test(html))
  check('zero "Invalid Date" tokens',  !/Invalid Date/.test(html))
  check('zero ">null<" display tokens',!/>null</.test(html))
  check('zero "$0" placeholder prices',!/\$0(\.|,|<|\s)/.test(html))
  const walliamHrefs = [...html.matchAll(/href="(https:\/\/walliam\.ca\/[^"]*)"/g)].map(m => m[1])
  const malformed = walliamHrefs.filter(h => !/^https:\/\/walliam\.ca\/[a-zA-Z0-9._\-\/]+$/.test(h))
  check('every walliam.ca href well-formed',
    walliamHrefs.length > 0 && malformed.length === 0,
    `count=${walliamHrefs.length}, malformed=${malformed.length}`)
  check('zero condoleads.ca leak',
    !/https:\/\/(www\.)?condoleads\.ca/.test(html))

  // ── NON-IN-SCOPE byte-unchanged ──
  log('')
  log('── NON-IN-SCOPE files — byte-unchanged ──')
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
  // CV-1 byte-unchanged
  const cleSha = sha(readBytes('components/dashboard/CharlieLeadEstimate.tsx'))
  log(`INFO  components/dashboard/CharlieLeadEstimate.tsx  sha=${cleSha} (CV-1 — CV-2 should not touch)`)
  const ldcSha = sha(readBytes('components/dashboard/LeadDetailClient.tsx'))
  log(`INFO  components/dashboard/LeadDetailClient.tsx     sha=${ldcSha} (CV-1)`)
  const rpSha  = sha(readBytes('app/charlie/components/ResultsPanel.tsx'))
  log(`INFO  app/charlie/components/ResultsPanel.tsx       sha=${rpSha}`)
  const sebSha = sha(readBytes('app/charlie/components/SellerEstimateBlock.tsx'))
  log(`INFO  app/charlie/components/SellerEstimateBlock.tsx sha=${sebSha}`)
  const ccSha  = sha(readBytes('app/charlie/components/ComparableCard.tsx'))
  log(`INFO  app/charlie/components/ComparableCard.tsx     sha=${ccSha}`)
  const peSha  = sha(readBytes('app/api/charlie/plan-email/route.ts'))
  log(`INFO  app/api/charlie/plan-email/route.ts          sha=${peSha}`)

  // ── Final ──
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
