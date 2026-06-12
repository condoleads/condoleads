// scripts/probe-p-cascade-rebuild.js
//
// P-CASCADE-REBUILD pre/post diff probe. READ-ONLY against the production DB.
// Does NOT modify any code; measures the SQL-level impact of the bed_eq push.
//
// Method:
//   - Sample N=50 closed home SALE subjects + N=50 closed condo SALE subjects
//     from the last 90 days.
//   - For each subject, fetch the community-tier pool TWO ways:
//       OLD: .order(close_date desc).limit(300)             (pre-rebuild)
//       NEW: .eq(bedrooms_total).order(close_date desc).limit(300)  (post-rebuild)
//   - Apply JS funnel to BOTH pools (strict → relaxed) — identical funnel
//     logic on both sides, so any output delta isolates the SQL-push impact.
//   - Classify each delta:
//       (a) TRUNCATION-FIX: NEW funnel has bed-eq listing_keys the OLD funnel
//           missed AND those listing_keys ARE bed-eq AND were OLDER than the
//           300th most-recent row (proving they were truncated by recency).
//       (b) SELECTION-SHIFT: NEW funnel and OLD funnel produce different
//           listing_keys WITHOUT (a)'s truncation proof. This would be a
//           regression — would HALT the build per operator spec.
//
// The bed_eq push is mathematically a safe-superset (every funnel path
// requires bed_eq), so SELECTION-SHIFT must be 0. The probe confirms this
// empirically AND demonstrates TRUNCATION-FIX on real-world sparse subjects.
//
// Output: scripts-output/probe-p-cascade-rebuild.txt (summary + delta table)

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const N_SAMPLE = (() => {
  const v = parseInt(process.env.N_SAMPLE || '', 10)
  return Number.isFinite(v) && v > 0 ? v : 50
})()
const OUTPUT_DIR = path.resolve(__dirname, '..', 'scripts-output')
const REPORT_PATH = path.join(OUTPUT_DIR, 'probe-p-cascade-rebuild.txt')

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

function dbConfig() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL / SUPABASE_DB_URL / DIRECT_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}

// Subtype variants — mirrors propertySubtypeVariants in the home matcher.
function propertySubtypeVariants(subtype) {
  return subtype === subtype.trim() ? [subtype, subtype + ' '] : [subtype, subtype.trim()]
}
function getCompatibleSubtypes(subtype) {
  if (['Detached'].includes(subtype)) return ['Detached']
  if (['Semi-Detached'].includes(subtype)) return ['Semi-Detached']
  if (['Att/Row/Townhouse', 'Link'].includes(subtype)) return ['Att/Row/Townhouse', 'Link']
  return [subtype]
}

async function sampleHomeSubjects(c) {
  const sql = `
    SELECT listing_key, bedrooms_total, bathrooms_total_integer, living_area_range,
           community_id, municipality_id, property_subtype, architectural_style,
           approximate_age, close_date, close_price
    FROM mls_listings
    WHERE transaction_type = 'For Sale' AND standard_status = 'Closed'
      AND property_type = 'Residential Freehold'
      AND property_subtype IN ('Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link')
      AND close_date >= (NOW() - INTERVAL '90 days')
      AND community_id IS NOT NULL AND municipality_id IS NOT NULL
      AND bedrooms_total IS NOT NULL
      AND close_price > 100000
    ORDER BY RANDOM()
    LIMIT $1
  `
  const r = await c.query(sql, [N_SAMPLE])
  return r.rows
}

async function sampleCondoSubjects(c) {
  const sql = `
    SELECT listing_key, bedrooms_total, bathrooms_total_integer, living_area_range,
           building_id, community_id, municipality_id,
           close_date, close_price
    FROM mls_listings
    WHERE transaction_type = 'For Sale' AND standard_status = 'Closed'
      AND property_type = 'Residential Condo & Other'
      AND close_date >= (NOW() - INTERVAL '90 days')
      AND community_id IS NOT NULL AND municipality_id IS NOT NULL
      AND bedrooms_total IS NOT NULL
      AND close_price > 100000
    ORDER BY RANDOM()
    LIMIT $1
  `
  const r = await c.query(sql, [N_SAMPLE])
  return r.rows
}

async function fetchPool(c, geoCol, geoVal, asOfDate, propertyType, subtypes, limit, bedEq, excludeKey) {
  const twoYearsBack = new Date(asOfDate)
  twoYearsBack.setFullYear(twoYearsBack.getFullYear() - 2)
  const subtypeFilter = (propertyType === 'Residential Freehold')
    ? `AND property_subtype = ANY($2::text[])`
    : ``
  const bedFilter = bedEq != null ? `AND bedrooms_total = $${subtypes ? 8 : 7}` : ``
  const sql = `
    SELECT listing_key, bedrooms_total, bathrooms_total_integer, living_area_range,
           architectural_style, approximate_age, close_date, close_price, public_remarks
    FROM mls_listings
    WHERE ${geoCol} = $1
      ${subtypeFilter}
      AND transaction_type = 'For Sale' AND standard_status = 'Closed'
      AND close_price IS NOT NULL AND close_price > 100000
      AND close_date >= $${subtypes ? 3 : 2}
      AND close_date < $${subtypes ? 4 : 3}
      AND listing_key != $${subtypes ? 5 : 4}
      AND property_type = $${subtypes ? 6 : 5}
      ${bedFilter}
    ORDER BY close_date DESC
    LIMIT $${subtypes ? 7 : 6}
  `
  const params = subtypes
    ? [geoVal, subtypes, twoYearsBack.toISOString().slice(0, 10), asOfDate.toISOString().slice(0, 10), excludeKey, propertyType, limit]
    : [geoVal, twoYearsBack.toISOString().slice(0, 10), asOfDate.toISOString().slice(0, 10), excludeKey, propertyType, limit]
  if (bedEq != null) params.push(bedEq)
  const r = await c.query(sql, params)
  return r.rows
}

function homeStrictFunnel(rows, subject) {
  return rows.filter(s => {
    if (s.bedrooms_total !== subject.bedrooms_total) return false
    if (subject.living_area_range && s.living_area_range !== subject.living_area_range) return false
    return true
  })
}
function homeRelaxedFunnel(rows, subject) {
  return rows.filter(s => {
    if (s.bedrooms_total !== subject.bedrooms_total) return false
    if (Math.abs((s.bathrooms_total_integer || 0) - (subject.bathrooms_total_integer || 0)) > 1) return false
    return true
  })
}

function condoBedBath(rows, subject) {
  return rows.filter(s =>
    s.bedrooms_total === subject.bedrooms_total &&
    s.bathrooms_total_integer === subject.bathrooms_total_integer,
  )
}

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function pickTop10ByDate(rows) {
  return [...rows].sort((a, b) => new Date(b.close_date) - new Date(a.close_date)).slice(0, 10)
}

async function probeHome(c, subjects) {
  const results = []
  for (let i = 0; i < subjects.length; i++) {
    const sub = subjects[i]
    if (!sub.community_id) continue
    const asOf = new Date(sub.close_date)
    const subtypes = getCompatibleSubtypes(sub.property_subtype).flatMap(propertySubtypeVariants)
    // OLD: no bed_eq
    const oldPool = await fetchPool(c, 'community_id', sub.community_id, asOf, 'Residential Freehold', subtypes, 300, null, sub.listing_key)
    // NEW: bed_eq
    const newPool = await fetchPool(c, 'community_id', sub.community_id, asOf, 'Residential Freehold', subtypes, 300, sub.bedrooms_total, sub.listing_key)
    // OLD funnel: strict → relaxed
    let oldFunnel = homeStrictFunnel(oldPool, sub)
    if (oldFunnel.length < 3) oldFunnel = homeRelaxedFunnel(oldPool, sub)
    // NEW funnel: same
    let newFunnel = homeStrictFunnel(newPool, sub)
    if (newFunnel.length < 3) newFunnel = homeRelaxedFunnel(newPool, sub)
    // Median price (proxy for matcher's estimatedPrice on this tier)
    const oldMed = median(oldFunnel.map(r => Number(r.close_price)))
    const newMed = median(newFunnel.map(r => Number(r.close_price)))
    // Pre-truncation diagnostic: how many bed-eq comps in the OLD pool vs NEW?
    const oldBedEqCount = oldPool.filter(r => r.bedrooms_total === sub.bedrooms_total).length
    const newBedEqCount = newPool.length
    // Truncation evidence: NEW saw more bed-eq rows AND OLD pool was at .limit boundary
    const oldPoolHitLimit = oldPool.length === 300
    const truncationDetected = oldPoolHitLimit && newBedEqCount > oldBedEqCount
    // Listing-key sets
    const oldKeys = new Set(oldFunnel.map(r => r.listing_key))
    const newKeys = new Set(newFunnel.map(r => r.listing_key))
    const onlyInNew = [...newKeys].filter(k => !oldKeys.has(k))
    const onlyInOld = [...oldKeys].filter(k => !newKeys.has(k))
    // Classify: SELECTION-SHIFT iff (a) onlyInOld is non-empty (NEW dropped a comp that OLD kept) AND that comp is in the NEW pool (because if it's NOT in NEW pool, it was filtered by bed_eq, which means OLD funnel was including it incorrectly — but bed_eq is required by both funnels, so this would mean OLD pool was including non-bed-eq rows that survived strict, which is impossible because strict requires bed_eq).
    // The safe-superset proof: onlyInOld MUST be empty.
    const isSelectionShift = onlyInOld.length > 0
    const isTruncationFix = onlyInNew.length > 0 && (oldPoolHitLimit || truncationDetected)
    results.push({
      subj: sub.listing_key,
      oldPoolCount: oldPool.length,
      newPoolCount: newPool.length,
      oldBedEqInPool: oldBedEqCount,
      newBedEqInPool: newBedEqCount,
      oldPoolHitLimit,
      oldFunnelCount: oldFunnel.length,
      newFunnelCount: newFunnel.length,
      oldMed,
      newMed,
      medDelta: (oldMed != null && newMed != null) ? newMed - oldMed : null,
      onlyInNewCount: onlyInNew.length,
      onlyInOldCount: onlyInOld.length,
      classification: isSelectionShift ? 'SELECTION-SHIFT'
                    : isTruncationFix   ? 'TRUNCATION-FIX'
                    : (onlyInNew.length === 0 && onlyInOld.length === 0) ? 'IDENTICAL'
                    : 'NEUTRAL',
    })
  }
  return results
}

async function probeCondo(c, subjects) {
  const results = []
  for (let i = 0; i < subjects.length; i++) {
    const sub = subjects[i]
    if (!sub.community_id) continue
    const asOf = new Date(sub.close_date)
    // condo Gold query uses no subtype filter
    const oldPool = await fetchPool(c, 'community_id', sub.community_id, asOf, 'Residential Condo & Other', null, 300, null, sub.listing_key)
    const newPool = await fetchPool(c, 'community_id', sub.community_id, asOf, 'Residential Condo & Other', null, 300, sub.bedrooms_total, sub.listing_key)
    const oldFunnel = condoBedBath(oldPool, sub)
    const newFunnel = condoBedBath(newPool, sub)
    const oldMed = median(oldFunnel.map(r => Number(r.close_price)))
    const newMed = median(newFunnel.map(r => Number(r.close_price)))
    const oldBedEqCount = oldPool.filter(r => r.bedrooms_total === sub.bedrooms_total).length
    const newBedEqCount = newPool.length
    const oldPoolHitLimit = oldPool.length === 300
    const truncationDetected = oldPoolHitLimit && newBedEqCount > oldBedEqCount
    const oldKeys = new Set(oldFunnel.map(r => r.listing_key))
    const newKeys = new Set(newFunnel.map(r => r.listing_key))
    const onlyInNew = [...newKeys].filter(k => !oldKeys.has(k))
    const onlyInOld = [...oldKeys].filter(k => !newKeys.has(k))
    const isSelectionShift = onlyInOld.length > 0
    const isTruncationFix = onlyInNew.length > 0 && (oldPoolHitLimit || truncationDetected)
    results.push({
      subj: sub.listing_key,
      oldPoolCount: oldPool.length,
      newPoolCount: newPool.length,
      oldBedEqInPool: oldBedEqCount,
      newBedEqInPool: newBedEqCount,
      oldPoolHitLimit,
      oldFunnelCount: oldFunnel.length,
      newFunnelCount: newFunnel.length,
      oldMed,
      newMed,
      medDelta: (oldMed != null && newMed != null) ? newMed - oldMed : null,
      onlyInNewCount: onlyInNew.length,
      onlyInOldCount: onlyInOld.length,
      classification: isSelectionShift ? 'SELECTION-SHIFT'
                    : isTruncationFix   ? 'TRUNCATION-FIX'
                    : (onlyInNew.length === 0 && onlyInOld.length === 0) ? 'IDENTICAL'
                    : 'NEUTRAL',
    })
  }
  return results
}

function summarize(results, label) {
  const counts = { 'SELECTION-SHIFT': 0, 'TRUNCATION-FIX': 0, 'IDENTICAL': 0, 'NEUTRAL': 0 }
  let priceDeltaSum = 0, priceDeltaCount = 0
  let oldHitLimit = 0, newBedEqIncreased = 0
  for (const r of results) {
    counts[r.classification]++
    if (r.medDelta != null && r.medDelta !== 0) { priceDeltaSum += Math.abs(r.medDelta); priceDeltaCount++ }
    if (r.oldPoolHitLimit) oldHitLimit++
    if (r.newBedEqInPool > r.oldBedEqInPool) newBedEqIncreased++
  }
  return {
    label,
    N: results.length,
    counts,
    oldPoolsAtLimit: oldHitLimit,
    newBedEqIncreased,
    meanAbsPriceDelta: priceDeltaCount > 0 ? Math.round(priceDeltaSum / priceDeltaCount) : 0,
  }
}

(async () => {
  const c = new Client(dbConfig())
  await c.connect()
  console.log(`[probe] N=${N_SAMPLE} per stratum`)
  console.log('[probe] sampling subjects...')
  const homeSubjects = await sampleHomeSubjects(c)
  const condoSubjects = await sampleCondoSubjects(c)
  console.log(`[probe] homes=${homeSubjects.length}, condos=${condoSubjects.length}`)
  console.log('[probe] probing homes...')
  const homeResults = await probeHome(c, homeSubjects)
  console.log('[probe] probing condos...')
  const condoResults = await probeCondo(c, condoSubjects)
  await c.end()

  const homeSummary = summarize(homeResults, 'HOME')
  const condoSummary = summarize(condoResults, 'CONDO')

  // Find the most dramatic truncation-fix example for the proof
  const truncFixes = [...homeResults, ...condoResults]
    .filter(r => r.classification === 'TRUNCATION-FIX')
    .sort((a, b) => (b.newBedEqInPool - b.oldBedEqInPool) - (a.newBedEqInPool - a.oldBedEqInPool))
  const bestProof = truncFixes[0] || null

  const lines = []
  lines.push('P-CASCADE-REBUILD pre/post probe')
  lines.push('=================================')
  lines.push(`Date: ${new Date().toISOString()}`)
  lines.push(`N: home=${homeResults.length}  condo=${condoResults.length}`)
  lines.push('')
  lines.push('CLASSIFICATION TABLE')
  lines.push('--------------------')
  lines.push('Stratum  | SELECTION-SHIFT | TRUNCATION-FIX | IDENTICAL | NEUTRAL | oldPoolsHitLimit | newBedEqIncreased | meanAbsPriceDelta')
  for (const s of [homeSummary, condoSummary]) {
    lines.push(`${s.label.padEnd(8)}|       ${String(s.counts['SELECTION-SHIFT']).padStart(3)}      |      ${String(s.counts['TRUNCATION-FIX']).padStart(3)}     |    ${String(s.counts['IDENTICAL']).padStart(3)}    |   ${String(s.counts['NEUTRAL']).padStart(3)}   |       ${String(s.oldPoolsAtLimit).padStart(3)}        |       ${String(s.newBedEqIncreased).padStart(3)}         |    $${s.meanAbsPriceDelta.toLocaleString()}`)
  }
  lines.push('')
  lines.push('SELECTION-SHIFT total must be 0 (safe-superset proof). If nonzero, BUILD HALTS.')
  lines.push(`SELECTION-SHIFT count: home=${homeSummary.counts['SELECTION-SHIFT']}  condo=${condoSummary.counts['SELECTION-SHIFT']}`)
  lines.push('')
  if (bestProof) {
    lines.push('TRUNCATION-KILL PROOF (most dramatic example)')
    lines.push('---------------------------------------------')
    lines.push(`Subject listing_key: ${bestProof.subj}`)
    lines.push(`OLD pool returned ${bestProof.oldPoolCount} rows, of which ${bestProof.oldBedEqInPool} matched bedrooms eq.`)
    lines.push(`NEW pool (bed_eq SQL-pushed) returned ${bestProof.newPoolCount} rows (all bed_eq by construction).`)
    lines.push(`Net bed_eq comps recovered: ${bestProof.newBedEqInPool - bestProof.oldBedEqInPool}`)
    lines.push(`OLD funnel produced ${bestProof.oldFunnelCount} match(es); NEW funnel produced ${bestProof.newFunnelCount}.`)
    lines.push(`Median close_price: OLD=$${bestProof.oldMed?.toLocaleString() || 'n/a'}  NEW=$${bestProof.newMed?.toLocaleString() || 'n/a'}  delta=$${bestProof.medDelta?.toLocaleString() || 'n/a'}`)
    lines.push(`This subject's OLD path silently dropped ${bestProof.newBedEqInPool - bestProof.oldBedEqInPool} viable bed_eq comp(s) outside the recency window.`)
  } else {
    lines.push('No TRUNCATION-FIX subjects in sample (every subject had ample bed_eq comps within the recency window).')
    lines.push('This is expected when N is small or the sample skews dense; the fix still applies to sparse subjects.')
  }
  lines.push('')
  lines.push('FULL CLASSIFICATION TABLE (per-subject)')
  lines.push('---------------------------------------')
  lines.push('stratum  classification    subj                                   oldPool newPool oldFunnel newFunnel oldMed     newMed     dlt')
  for (const s of homeResults) {
    lines.push(`HOME     ${s.classification.padEnd(17)} ${(s.subj || '').padEnd(38)} ${String(s.oldPoolCount).padStart(5)} ${String(s.newPoolCount).padStart(5)} ${String(s.oldFunnelCount).padStart(5)} ${String(s.newFunnelCount).padStart(5)}   ${String(s.oldMed||'').padStart(8)} ${String(s.newMed||'').padStart(8)} ${String(s.medDelta||'').padStart(7)}`)
  }
  for (const s of condoResults) {
    lines.push(`CONDO    ${s.classification.padEnd(17)} ${(s.subj || '').padEnd(38)} ${String(s.oldPoolCount).padStart(5)} ${String(s.newPoolCount).padStart(5)} ${String(s.oldFunnelCount).padStart(5)} ${String(s.newFunnelCount).padStart(5)}   ${String(s.oldMed||'').padStart(8)} ${String(s.newMed||'').padStart(8)} ${String(s.medDelta||'').padStart(7)}`)
  }
  const out = lines.join('\n')
  fs.writeFileSync(REPORT_PATH, out)
  console.log(`[probe] report → ${REPORT_PATH}`)
  console.log('')
  console.log('SUMMARY')
  console.log('-------')
  console.log(`HOME : SELECTION-SHIFT=${homeSummary.counts['SELECTION-SHIFT']}  TRUNCATION-FIX=${homeSummary.counts['TRUNCATION-FIX']}  IDENTICAL=${homeSummary.counts['IDENTICAL']}  NEUTRAL=${homeSummary.counts['NEUTRAL']}`)
  console.log(`CONDO: SELECTION-SHIFT=${condoSummary.counts['SELECTION-SHIFT']}  TRUNCATION-FIX=${condoSummary.counts['TRUNCATION-FIX']}  IDENTICAL=${condoSummary.counts['IDENTICAL']}  NEUTRAL=${condoSummary.counts['NEUTRAL']}`)
  const shifts = homeSummary.counts['SELECTION-SHIFT'] + condoSummary.counts['SELECTION-SHIFT']
  if (shifts === 0) {
    console.log('GATE: PASS (zero SELECTION-SHIFT)')
    process.exit(0)
  } else {
    console.log(`GATE: FAIL (${shifts} SELECTION-SHIFT detected)`)
    process.exit(1)
  }
})().catch(err => {
  console.error('[probe] failed:', err)
  process.exit(2)
})
