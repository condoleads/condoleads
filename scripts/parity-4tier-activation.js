// h7 (4-tier Platinum/Gold/Silver/Bronze activation) parity classifier.
//
// Diffs the on-disk 03b85f9 baseline (scripts-output/parity-sf-sold-baseline.json)
// against post-h7 verify (running dev server at localhost:3000). For each of the
// 50 baseline subjects, fetch the new probe output (which now carries tiers +
// bestGeoTier) and classify per the LOCK:
//
//   byte-identical           : platinum.count<3 AND new bestGeoTier matches
//                              the tier today's matcher would have chosen AND
//                              best-tier comparables (key+score+adjusted_price
//                              order) byte-equal baseline.
//   expected-platinum-anchor : platinum.count>=3 AND new bestGeoTier=='platinum'
//                              (price intentionally moves to street median).
//   expected-bronze-fill     : baseline geoLevel='none' (today CONTACT) AND
//                              new bronze.count>=3 (former-empty now priced).
//   INVESTIGATE              : anything else — STOP, report, do not commit.
//
// Top-level price/comparables/geoLevel must be IDENTICAL on the byte-identical
// cohort. The "context tiers becoming visible" must NOT perturb the price path.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const BASE_URL = 'http://localhost:3000'
const OUTPUT_DIR = path.resolve(__dirname, '..', 'scripts-output')
const BASELINE_FILE = path.join(OUTPUT_DIR, 'parity-sf-sold-baseline.json')
const VERIFY_FILE   = path.join(OUTPUT_DIR, 'parity-h7-4tier-verify.json')
const REPORT_FILE   = path.join(OUTPUT_DIR, 'parity-h7-4tier-classification.txt')

const AS_OF_DATE = '2026-06-08T00:00:00.000Z'  // matches baseline capture

async function _probeOnce(subjectId) {
  const res = await fetch(`${BASE_URL}/api/parity-probe-sf-sold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId: subjectId, asOfDate: AS_OF_DATE }),
  })
  if (!res.ok) return { error: `HTTP ${res.status}` }
  return await res.json()
}

// Sequential-pass retry-on-empty (same pattern as h5/h6 harnesses).
async function probe(subjectId) {
  const first = await _probeOnce(subjectId)
  const tier = first?.result?.tier
  const compCount = first?.result?.comparables?.length ?? 0
  if (first?.error || (tier === 'CONTACT' && compCount === 0)) {
    await new Promise(r => setTimeout(r, 750))
    const second = await _probeOnce(subjectId)
    const secondGood = !second?.error && (second?.result?.tier !== 'CONTACT' || (second?.result?.comparables?.length ?? 0) > 0)
    if (secondGood) return second
  }
  return first
}

// Map today's geoLevel onto the inferred bestGeoTier under the new model.
// SF path today never produced 'street' or 'area' — those map to the new
// tiers as "didn't exist" → not a possible baseline mapping. (If we see
// 'street' or 'area' in a SF baseline, it's a pre-existing data quirk and
// the subject will fall into INVESTIGATE for explicit review.)
function inferBaselineGeoTier(baselineGeoLevel) {
  switch (baselineGeoLevel) {
    case 'community':    return 'gold'
    case 'municipality': return 'silver'
    case 'area':         return 'bronze'
    case 'street':       return 'platinum'
    case 'none':         return 'none'
    default:             return null
  }
}

function compsEqual(baseComps, newComps) {
  if (!Array.isArray(baseComps) || !Array.isArray(newComps)) return false
  if (baseComps.length !== newComps.length) return false
  for (let i = 0; i < baseComps.length; i++) {
    const b = baseComps[i]
    const n = newComps[i]
    if (b.key !== n.listing_key) return false
    if (Number(b.price) !== Number(n.close_price)) return false
    if (Number(b.score) !== Number(n.match_score)) return false
    const ba = b.adjusted_price ?? null
    const na = n.adjusted_price ?? null
    if ((ba === null) !== (na === null)) return false
    if (ba !== null && Number(ba) !== Number(na)) return false
  }
  return true
}

;(async () => {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('Missing baseline at', BASELINE_FILE)
    process.exit(1)
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
  const subjectIds = Object.keys(baseline)
  console.log(`Loaded ${subjectIds.length} baseline subjects from 03b85f9 snapshot\n`)

  const verify = {}
  let idx = 0
  for (const id of subjectIds) {
    idx++
    const b = baseline[id]
    process.stdout.write(`  [${String(idx).padStart(2)}/${subjectIds.length}] ${b.subject?.listing_key} ... `)
    const p = await probe(id)
    if (p?.error) {
      verify[id] = { error: p.error }
      console.log(`ERR ${p.error}`)
      continue
    }
    const r = p.result
    verify[id] = {
      tier: r.tier,
      geoLevel: r.geoLevel,
      bestGeoTier: r.bestGeoTier,
      bestMatchScore: r.bestMatchScore,
      estimatedPrice: r.estimatedPrice,
      tiers: r.tiers,
      comparables: r.comparables,
    }
    const platCount = r.tiers?.platinum?.count ?? 0
    const bronzeCount = r.tiers?.bronze?.count ?? 0
    console.log(`tier=${r.tier} geo=${r.geoLevel} best=${r.bestGeoTier} plat=${platCount} bronze=${bronzeCount}`)
  }
  fs.writeFileSync(VERIFY_FILE, JSON.stringify(verify, null, 2))
  console.log(`\n→ wrote ${VERIFY_FILE}\n`)

  // ============ Classification ============
  console.log('=== PER-SUBJECT CLASSIFICATION ===\n')
  const lines = []
  const header = '| # | listing_key | subtype | base_geo | new_best | plat | bronze | verdict |'
  const sep    = '|---|-------------|---------|----------|----------|------|--------|---------|'
  console.log(header); lines.push(header)
  console.log(sep);    lines.push(sep)

  let identical = 0, platAnchor = 0, bronzeFill = 0, investigate = 0, errors = 0
  idx = 0
  for (const id of subjectIds) {
    idx++
    const b = baseline[id]
    const v = verify[id]
    if (!b || !v || v.error) {
      const row = `| ${idx} | ${b?.subject?.listing_key || id} | - | - | - | - | - | ERROR ${v?.error || 'no verify'} |`
      console.log(row); lines.push(row); errors++; continue
    }

    const inferredBaseGeoTier = inferBaselineGeoTier(b.geoLevel)
    const newBest = v.bestGeoTier
    const platCount = v.tiers?.platinum?.count ?? 0
    const bronzeCount = v.tiers?.bronze?.count ?? 0
    const baseGeoLevel = b.geoLevel
    const newGeoLevel = v.geoLevel

    let verdict
    // expected-platinum-anchor: platinum took over from gold (or any other)
    if (platCount >= 3 && newBest === 'platinum') {
      verdict = '✓ expected-platinum-anchor'
      platAnchor++
    }
    // expected-bronze-fill: baseline was CONTACT/none, new bronze fills it
    else if (baseGeoLevel === 'none' && newBest === 'bronze' && bronzeCount >= 3) {
      verdict = '✓ expected-bronze-fill'
      bronzeFill++
    }
    // byte-identical: platinum didn't anchor, new bestGeoTier maps to old geoLevel, comps equal
    else if (
      platCount < 3 &&
      newBest === inferredBaseGeoTier &&
      newGeoLevel === baseGeoLevel &&
      (b.bestMatchScore ?? null) === (v.bestMatchScore ?? null) &&
      compsEqual(b.comparables, v.comparables) &&
      b.tier === v.tier
    ) {
      verdict = '✓ byte-identical'
      identical++
    }
    else {
      verdict = '⚠ INVESTIGATE'
      investigate++
    }

    const tierStr = b.tier === v.tier ? b.tier : `${b.tier}→${v.tier}`
    const geoStr = baseGeoLevel === newGeoLevel ? baseGeoLevel : `${baseGeoLevel}→${newGeoLevel}`
    const row = `| ${idx} | ${b.subject?.listing_key} | ${b.subject?.property_subtype} | ${geoStr} | ${newBest} | ${platCount} | ${bronzeCount} | ${verdict} (tier=${tierStr}) |`
    console.log(row); lines.push(row)
  }

  console.log('')
  const summary = `SUMMARY: ${identical} byte-identical, ${platAnchor} expected-platinum-anchor, ${bronzeFill} expected-bronze-fill, ${investigate} INVESTIGATE, ${errors} errors (of ${subjectIds.length})`
  console.log(summary)
  lines.push('')
  lines.push(summary)
  fs.writeFileSync(REPORT_FILE, lines.join('\n'))
  console.log(`\nReport: ${REPORT_FILE}`)
  process.exit(investigate > 0 ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
