// scripts/patch-smoke-runner-p5.js
// Fix mls_number -> listing_key in the smoke runner.
// Confirmed via scripts/p5-recon-mls-cols.js: mls_listings has listing_key
// (varchar NOT NULL), not mls_number.

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  process.cwd(),
  'scripts',
  'r-w-territory-master-p5-smoke.js'
)

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: smoke runner not found at', TARGET)
  process.exit(1)
}

const original = fs.readFileSync(TARGET, 'utf8')

// Idempotency: if there are no more mls_number references in column lists, we're done.
const mlsNumberRefs = (original.match(/mls_number/g) || []).length
if (mlsNumberRefs === 0) {
  console.log('Smoke runner already patched (no mls_number refs). No changes needed.')
  process.exit(0)
}
console.log(`Found ${mlsNumberRefs} reference(s) to mls_number. Patching.`)

const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const backup = `${TARGET}.backup_${ts}`
fs.writeFileSync(backup, original, 'utf8')
console.log('Backup written:', backup)

// Detect line endings
const usesCRLF = original.includes('\r\n')
const NL = usesCRLF ? '\r\n' : '\n'

function replace(text, oldStr, newStr, label) {
  const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = text.match(new RegExp(escaped, 'g')) || []
  if (matches.length !== 1) {
    throw new Error(`Edit "${label}": found ${matches.length} matches (expected 1)`)
  }
  return text.replace(oldStr, newStr)
}

let next = original

// The smoke runner has ONE place that selects mls_number — the listing
// discovery query in step 0. Patch the SELECT column list and the
// console.log that references the discovered MLS string.
next = replace(next,
  `      SELECT id, mls_number, property_type, area_id, municipality_id, community_id, building_id`,
  `      SELECT id, listing_key, property_type, area_id, municipality_id, community_id, building_id`,
  'listing discovery SELECT'
)

next = replace(next,
  `    console.log('  Test listing:', listingRow.mls_number, listingId)`,
  `    console.log('  Test listing:', listingRow.listing_key, listingId)`,
  'console.log mls_number'
)

// Sanity: zero remaining mls_number refs (unless they appear in comments, which is fine — but let's check)
const remaining = (next.match(/mls_number/g) || []).length
if (remaining > 0) {
  // Show context of remaining refs
  console.warn(`WARNING: ${remaining} reference(s) to mls_number still remain after patch.`)
  const lines = next.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes('mls_number')) {
      console.warn(`  line ${i + 1}: ${line.trim()}`)
    }
  })
  console.warn('Review and re-patch manually if any are functional (not just comments).')
}

fs.writeFileSync(TARGET, next, 'utf8')
console.log('Patched:', TARGET)
console.log('  + listing discovery SELECT uses listing_key')
console.log('  + console.log uses listing_key')