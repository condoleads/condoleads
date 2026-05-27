// scripts/patch-pins-list-route-p5.js
// W-TERRITORY-MASTER P5: fix pins list route to query listing_key (real column)
// instead of mls_number (does not exist on mls_listings).
//
// mls_listings columns confirmed via scripts/p5-recon-mls-cols.js:
//   - listing_key   varchar NOT NULL   (this IS the MLS number, e.g. 'X11930580')
//   - No 'mls_number' column exists.
//
// The list route's select needs to read listing_key. The response field name
// remains listing_mls_number so PinsView doesn't need to know about the schema
// detail; it's a UI-stable contract.
//
// Idempotent.

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  process.cwd(),
  'app',
  'api',
  'admin-homes',
  'territory',
  'pins',
  'route.ts'
)

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: pins/route.ts not found at', TARGET)
  process.exit(1)
}

const original = fs.readFileSync(TARGET, 'utf8')

// Idempotency check
if (original.includes("'id, listing_key,") && !original.includes("'id, mls_number,")) {
  console.log('pins/route.ts already patched (uses listing_key). No changes needed.')
  process.exit(0)
}

const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const backup = `${TARGET}.backup_${ts}`
fs.writeFileSync(backup, original, 'utf8')
console.log('Backup written:', backup)

function applyAnchor(text, oldStr, newStr, label) {
  const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const count = (text.match(new RegExp(escaped, 'g')) || []).length
  if (count !== 1) {
    throw new Error(`Anchor "${label}" matched ${count} times (expected 1). Aborting.`)
  }
  return text.replace(oldStr, newStr)
}

let patched = original

// 1. SELECT column list: mls_number -> listing_key
patched = applyAnchor(
  patched,
  "    .select('id, mls_number, unparsed_address, property_type, list_price, standard_status')",
  "    .select('id, listing_key, unparsed_address, property_type, list_price, standard_status')",
  'select column list'
)

// 2. Listing accessor: listing.mls_number -> listing.listing_key
patched = applyAnchor(
  patched,
  '      listing_mls_number: listing?.mls_number ?? null,',
  '      listing_mls_number: listing?.listing_key ?? null,',
  'listing_mls_number accessor'
)

fs.writeFileSync(TARGET, patched, 'utf8')
console.log('Patched:', TARGET)
console.log('  + select uses listing_key (real column on mls_listings)')
console.log('  + listing_mls_number response field stays the same UI contract')