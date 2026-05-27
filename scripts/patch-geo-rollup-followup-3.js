// scripts/patch-geo-rollup-followup-3.js
// W-TERRITORY-MASTER P5.2c-followup-3.
// Replace the slow correlated COUNT(*) subquery in geo-rollup/route.ts with
// MV-backed subqueries. Semantic change: filter from `available_in_vow = true`
// to `original_entry_timestamp >= now() - 2 years` (the canonical MV filter).
//
// Per-level MV mapping:
//   area         -> SUM(cnt) FROM area_listing_counts_mv WHERE area_id = g.id
//   municipality -> COALESCE((SELECT listing_count FROM mv_municipality_counts
//                              WHERE municipality_id = g.id), 0)
//   community    -> COALESCE((SELECT listing_count FROM mv_community_counts
//                              WHERE community_id = g.id), 0)
//   neighbourhood -> 0 (mls_listings has no neighbourhood_id; unchanged)

const fs = require('fs')
const path = require('path')

const TARGET = 'app/api/admin-homes/territory/geo-rollup/route.ts'

console.log('=== Read file ===')
const original = fs.readFileSync(TARGET, 'utf8')
console.log('  bytes:', Buffer.byteLength(original, 'utf8'))
console.log('  lines:', original.split(/\r?\n/).length)

console.log('')
console.log('=== ASCII purity check (original) ===')
let nonAscii = 0
for (let i = 0; i < original.length; i++) {
  if (original.charCodeAt(i) > 127) nonAscii++
}
console.log('  non-ASCII chars:', nonAscii)
if (nonAscii > 0) {
  throw new Error('Original file has ' + nonAscii + ' non-ASCII chars. Aborting -- clean those first.')
}

console.log('')
console.log('=== Verify pre-state markers (v1 baseline) ===')

// The exact line we replace. Detected via .endsWith match on the trimmed
// content so CRLF/LF variance doesn't matter.
const OLD_LISTING_BLOCK_PATTERN = `  let listingCountExpr = "0::int"
  if (mlsCol) {
    listingCountExpr = "(SELECT COUNT(*)::int FROM mls_listings ml WHERE ml." + mlsCol + " = g.id AND ml.available_in_vow = true)"
  }`

// Normalize line endings for the search (file is CRLF, JS string literal is LF).
const detectedNL = original.includes('\r\n') ? '\r\n' : '\n'
console.log('  file line ending:', detectedNL === '\r\n' ? 'CRLF' : 'LF')

const oldBlockNormalized = OLD_LISTING_BLOCK_PATTERN.split('\n').join(detectedNL)

if (!original.includes(oldBlockNormalized)) {
  throw new Error('Old listingCountExpr block not found in source. Aborting -- file may have drifted from recon snapshot.')
}
console.log('  v1 baseline block PRESENT (in CRLF form)')

const v1ForbiddenMarkers = [
  // After the patch, the slow VOW correlated subquery must be gone.
  '" = g.id AND ml.available_in_vow = true)"',
]
for (const m of v1ForbiddenMarkers) {
  if (!original.includes(m)) {
    throw new Error('Expected v1 forbidden marker is already absent: ' + m + '. Aborting -- file may have already been patched.')
  }
}

console.log('')
console.log('=== Build replacement block ===')

// We replace one if-block with a switch by level. The geo-rollup route already
// has `level` in scope as a `const level: Level`. So we use it directly.
const NEW_LISTING_BLOCK_PATTERN = `  // P5.2c-followup-3: replace slow correlated COUNT(*) with MV-backed lookup.
  // Semantic change from VOW-filter to 2-year filter (matches the rest of the
  // system; the MVs are the canonical "recent listing count" source -- see
  // mv_municipality_counts / mv_community_counts / area_listing_counts_mv).
  let listingCountExpr = "0::int"
  if (level === 'area') {
    listingCountExpr = "COALESCE((SELECT SUM(cnt)::int FROM area_listing_counts_mv WHERE area_id = g.id), 0)"
  } else if (level === 'municipality') {
    listingCountExpr = "COALESCE((SELECT listing_count::int FROM mv_municipality_counts WHERE municipality_id = g.id), 0)"
  } else if (level === 'community') {
    listingCountExpr = "COALESCE((SELECT listing_count::int FROM mv_community_counts WHERE community_id = g.id), 0)"
  }
  // neighbourhood: mls_listings has no neighbourhood_id; listing_count stays 0.`

const newBlockNormalized = NEW_LISTING_BLOCK_PATTERN.split('\n').join(detectedNL)

// Pre-write ASCII check on new content
let newNonAscii = 0
for (let i = 0; i < newBlockNormalized.length; i++) {
  if (newBlockNormalized.charCodeAt(i) > 127) newNonAscii++
}
console.log('  new block non-ASCII chars:', newNonAscii)
if (newNonAscii > 0) {
  throw new Error('New block has ' + newNonAscii + ' non-ASCII chars. ABORT.')
}

console.log('')
console.log('=== Apply edit ===')
// Count occurrences to make sure exactly one match
const occurrences = original.split(oldBlockNormalized).length - 1
console.log('  old-block occurrences:', occurrences)
if (occurrences !== 1) {
  throw new Error('Expected exactly 1 occurrence of old block, got ' + occurrences + '. ABORT.')
}

const next = original.replace(oldBlockNormalized, newBlockNormalized)
console.log('  bytes after edit:', Buffer.byteLength(next, 'utf8'))

console.log('')
console.log('=== Post-state marker checks ===')
const v2Markers = [
  'P5.2c-followup-3: replace slow correlated COUNT',
  "level === 'area'",
  "level === 'municipality'",
  "level === 'community'",
  'FROM area_listing_counts_mv WHERE area_id = g.id',
  'FROM mv_municipality_counts WHERE municipality_id = g.id',
  'FROM mv_community_counts WHERE community_id = g.id',
]
for (const m of v2Markers) {
  if (!next.includes(m)) {
    throw new Error('v2 marker missing: ' + m + '. ABORT WITHOUT WRITING.')
  }
  console.log('  PRESENT (v2):', m.slice(0, 70))
}

const v2Forbidden = [
  'AND ml.available_in_vow = true)',
  '(SELECT COUNT(*)::int FROM mls_listings ml WHERE ml.',
]
for (const m of v2Forbidden) {
  if (next.includes(m)) {
    throw new Error('v2 forbidden marker still present: ' + m + '. ABORT WITHOUT WRITING.')
  }
  console.log('  ABSENT (forbidden):', m.slice(0, 70))
}

// ASCII post-write
let postNonAscii = 0
for (let i = 0; i < next.length; i++) {
  if (next.charCodeAt(i) > 127) postNonAscii++
}
console.log('  post-edit non-ASCII:', postNonAscii)
if (postNonAscii > 0) throw new Error('Post-edit content has non-ASCII chars. ABORT.')

console.log('')
console.log('=== Backup + write ===')
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = TARGET + '.backup_' + ts
fs.writeFileSync(backupPath, original, 'utf8')
console.log('  backed up to:', backupPath)

fs.writeFileSync(TARGET, next, 'utf8')
console.log('  wrote:', TARGET)

console.log('')
console.log('=== Read-back verification ===')
const readBack = fs.readFileSync(TARGET, 'utf8')
let rbNonAscii = 0
for (let i = 0; i < readBack.length; i++) if (readBack.charCodeAt(i) > 127) rbNonAscii++
console.log('  read-back bytes:', Buffer.byteLength(readBack, 'utf8'))
console.log('  read-back non-ASCII:', rbNonAscii)
if (rbNonAscii !== 0) throw new Error('Read-back non-ASCII. RESTORE FROM BACKUP: ' + backupPath)
for (const m of v2Markers) {
  if (!readBack.includes(m)) throw new Error('Read-back missing v2 marker: ' + m + '. RESTORE FROM BACKUP: ' + backupPath)
}
for (const m of v2Forbidden) {
  if (readBack.includes(m)) throw new Error('Read-back still has v1 forbidden marker: ' + m + '. RESTORE FROM BACKUP: ' + backupPath)
}
console.log('  all v2 markers present, all v1 markers absent')

console.log('')
console.log('=== PATCH COMPLETE ===')