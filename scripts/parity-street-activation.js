// h5 parity classification harness.
//
// Compares pre-activation baseline (parity-sf-sold-baseline.json from c57c2dd
// state) against post-activation probe output for the same 50 subjects.
// For each subject classifies the divergence:
//   - NO same-street comp in pool  → MUST byte-identical
//   - HAS ≥1 same-street comp      → expected (delta on affected comp = 15 or 20)
//
// Same-street comp detection: post-activation, the probe returns each comp's
// listing_key + close_price + match_score. We need to determine, for each
// comp, whether it shares the subject's street. We do this by pulling the
// subject + each comp's unparsed_address from DB and parsing both, then
// comparing through the SAME normalizer (subject.street_name is dedicated;
// comp parses unparsed_address via the same logic the matcher uses).

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const BASE_URL = 'http://localhost:3009'
const OUTPUT_DIR = path.resolve(__dirname, '..', 'scripts-output')
const BASELINE_FILE = path.join(OUTPUT_DIR, 'parity-sf-sold-baseline.json')
const VERIFY_FILE   = path.join(OUTPUT_DIR, 'parity-h5-street-verify.json')
const REPORT_FILE   = path.join(OUTPUT_DIR, 'parity-h5-street-classification.txt')

const AS_OF_DATE = '2026-06-08T00:00:00.000Z'

// Mirrors lib/estimator/home-comparable-matcher-sales.ts:normalizePlaceName.
function normalizePlaceName(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/\s+(Main|BSMT|Upper|Lower|Rear|Apt|Unit)\s*$/i, '').trim().toLowerCase()
  return cleaned.length > 0 ? cleaned : null
}

// Mirrors lib/estimator/home-comparable-matcher-sales.ts:extractStreetName.
function extractStreetName(address) {
  if (!address) return null
  const streetPart = address.split(',')[0]?.trim()
  if (!streetPart) return null
  const parts = streetPart.split(' ')
  if (parts.length < 2) return null
  return normalizePlaceName(parts.slice(1).join(' '))
}

function extractStreetNumber(address) {
  if (!address) return null
  const streetPart = address.split(',')[0]?.trim()
  if (!streetPart) return null
  const num = parseInt(streetPart.split(' ')[0], 10)
  return Number.isNaN(num) ? null : num
}
const isOdd = n => n % 2 !== 0

async function _probeOnce(subjectId) {
  const res = await fetch(`${BASE_URL}/api/parity-probe-sf-sold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId: subjectId, asOfDate: AS_OF_DATE }),
  })
  if (!res.ok) return { error: `HTTP ${res.status}` }
  return await res.json()
}
// Sequential-pass flake protection (mirrors parity-sf-sold-baseline.js): the
// matcher is deterministic per direct isolated probe, but under sustained
// 50-subject load the dev-server occasionally returns HTTP non-200 or
// CONTACT/0 from webpack-cache/DB-pooler transients. One retry after 750ms.
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

;(async () => {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('Missing baseline at', BASELINE_FILE); process.exit(1)
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
  const subjectIds = Object.keys(baseline)
  console.log(`Loaded ${subjectIds.length} baseline subjects\n`)

  // Pull each subject's street_name + street_number from DB (the activation
  // input, what the probe will use to score).
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432',':6543') })
  await c.connect()
  const subjMeta = {}
  for (const id of subjectIds) {
    const r = await c.query(
      `SELECT id, listing_key, street_name, street_number, unparsed_address FROM mls_listings WHERE id = $1`,
      [id]
    )
    if (r.rows.length > 0) subjMeta[id] = r.rows[0]
  }

  // Capture verify (post-activation) — same probe call as the original parity
  // harness, but we'll then enrich with same-street comp detection by pulling
  // each comp's unparsed_address.
  const verify = {}
  let idx = 0
  for (const id of subjectIds) {
    idx++
    process.stdout.write(`  [${String(idx).padStart(2)}/${subjectIds.length}] ${baseline[id].subject?.listing_key} ... `)
    const p = await probe(id)
    if (p.error) {
      verify[id] = { error: p.error }; console.log(`✗ ${p.error}`); continue
    }
    // Pull each comp's unparsed_address from DB so we can detect same-street.
    const compKeys = p.result.comparables.map(x => x.listing_key).filter(Boolean)
    let compMeta = []
    if (compKeys.length > 0) {
      const r = await c.query(
        `SELECT listing_key, unparsed_address FROM mls_listings WHERE listing_key = ANY($1)`,
        [compKeys]
      )
      compMeta = r.rows
    }
    const compAddrMap = {}
    for (const cm of compMeta) compAddrMap[cm.listing_key] = cm.unparsed_address
    verify[id] = {
      subject: { id, listing_key: baseline[id].subject?.listing_key, property_subtype: baseline[id].subject?.property_subtype },
      tier: p.result.tier,
      geoLevel: p.result.geoLevel,
      bestMatchScore: p.result.bestMatchScore,
      comparables: p.result.comparables.map(x => ({
        key: x.listing_key,
        price: x.close_price,
        score: x.match_score,
        unparsed_address: compAddrMap[x.listing_key] || null,
      })),
    }
    console.log(`tier=${p.result.tier} comps=${p.result.comparables.length}`)
  }
  await c.end()
  fs.writeFileSync(VERIFY_FILE, JSON.stringify(verify, null, 2))
  console.log(`\n  → wrote ${VERIFY_FILE}\n`)

  // ============ Classification ============
  console.log('=== PER-SUBJECT CLASSIFICATION ===\n')
  const lines = []
  const header = '| # | listing_key | subtype | same-street? | comp delta | tier change | verdict |'
  const sep    = '|---|-------------|---------|--------------|------------|-------------|---------|'
  console.log(header); console.log(sep)
  lines.push(header); lines.push(sep)

  let identical = 0, expected = 0, investigate = 0, errors = 0
  idx = 0
  for (const id of subjectIds) {
    idx++
    const b = baseline[id], v = verify[id]
    if (!b || !v || v.error) {
      const row = `| ${idx} | ${b?.subject?.listing_key || id} | - | - | - | - | ERROR ${v?.error || 'no verify'} |`
      console.log(row); lines.push(row); errors++; continue
    }

    // Determine subject's normalized street name + number
    const meta = subjMeta[id] || {}
    const subjNameNorm = normalizePlaceName(meta.street_name)
    const subjNum = (() => {
      const n = parseInt(String(meta.street_number ?? ''), 10)
      return Number.isNaN(n) ? null : n
    })()

    // For each comp in the verify result, detect whether it's same-street.
    // (Pre-activation baseline didn't capture unparsed_address, so we use the
    // post-activation comp's unparsed_address — same-street status is a
    // function of the comp pool, not the activation, so this is safe.)
    let sameStreetCompCount = 0
    let maxBonusEligible = 0
    for (const c of v.comparables) {
      const cName = extractStreetName(c.unparsed_address)
      if (cName && subjNameNorm && cName === subjNameNorm) {
        sameStreetCompCount++
        const cNum = extractStreetNumber(c.unparsed_address)
        const bonus = (subjNum != null && cNum != null && isOdd(cNum) === isOdd(subjNum)) ? 20 : 15
        if (bonus > maxBonusEligible) maxBonusEligible = bonus
      }
    }

    // Find matching baseline comp scores by listing_key
    const bScoresByKey = {}
    for (const bc of b.comparables || []) bScoresByKey[bc.key] = bc.score
    const vScoresByKey = {}
    for (const vc of v.comparables) vScoresByKey[vc.key] = vc.score

    // Compute deltas on overlapping listing_keys
    const deltas = []
    for (const key of Object.keys(vScoresByKey)) {
      const oldScore = bScoresByKey[key]
      const newScore = vScoresByKey[key]
      if (oldScore != null && newScore != null) {
        const d = newScore - oldScore
        if (d !== 0) deltas.push({ key, old: oldScore, new: newScore, delta: d })
      }
    }

    const tierChanged = b.tier !== v.tier
    const order_or_membership_changed = (() => {
      const bKeys = (b.comparables || []).map(x => x.key)
      const vKeys = v.comparables.map(x => x.key)
      if (bKeys.length !== vKeys.length) return true
      for (let i = 0; i < bKeys.length; i++) if (bKeys[i] !== vKeys[i]) return true
      return false
    })()
    const anyChange = deltas.length > 0 || tierChanged || order_or_membership_changed ||
                      (b.bestMatchScore || 0) !== (v.bestMatchScore || 0)

    const deltaSet = [...new Set(deltas.map(d => d.delta))].sort((a,b)=>a-b)
    const validDeltaSet = deltaSet.every(d => d === 15 || d === 20)
    const compDeltaStr = deltas.length === 0 ? '0' : deltas.map(d => `${d.key}+${d.delta}`).join(', ')

    let verdict
    if (!anyChange) {
      verdict = sameStreetCompCount === 0 ? '✓ byte-identical (no SS comp)' : '✓ byte-identical (SS comp present but unaffected)'
      identical++
    } else if (sameStreetCompCount === 0) {
      verdict = '⚠ INVESTIGATE — diverged with NO same-street comp'
      investigate++
    } else if (!validDeltaSet) {
      verdict = `⚠ INVESTIGATE — delta set ${JSON.stringify(deltaSet)} not in {15,20}`
      investigate++
    } else {
      verdict = '✓ expected-unbreak'
      expected++
    }
    const tierStr = tierChanged ? `${b.tier}→${v.tier}` : b.tier
    const row = `| ${idx} | ${b.subject?.listing_key} | ${b.subject?.property_subtype} | ${sameStreetCompCount > 0 ? 'y('+sameStreetCompCount+')' : 'n'} | ${compDeltaStr} | ${tierStr} | ${verdict} |`
    console.log(row); lines.push(row)
  }

  console.log('')
  console.log(`SUMMARY: ${identical} byte-identical, ${expected} expected-unbreak, ${investigate} INVESTIGATE, ${errors} errors (of ${subjectIds.length})`)
  lines.push(''); lines.push(`SUMMARY: ${identical} byte-identical, ${expected} expected-unbreak, ${investigate} INVESTIGATE, ${errors} errors (of ${subjectIds.length})`)
  fs.writeFileSync(REPORT_FILE, lines.join('\n'))
  console.log(`Report: ${REPORT_FILE}`)
  process.exit(investigate > 0 ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
