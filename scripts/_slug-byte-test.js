require('tsx/cjs')
const { buildPropertySlug } = require('../lib/utils/property-slug.ts')

const HOME_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex']

// Verbatim from app/charlie/components/ComparableCard.tsx:87-107
function oldCharlieComp(c) {
  if (!c.listingKey) return null
  const mls = c.listingKey.toLowerCase()
  const rawAddr = (c.unparsedAddress || '').split(',')[0].trim()
  const unitStr = c.unitNumber || ''
  const withoutUnit = unitStr
    ? rawAddr.replace(new RegExp('\\s+' + unitStr + '\\s*$'), '').trim()
    : rawAddr
  const addr = withoutUnit
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const isCondo = !HOME_TYPES.includes(c.propertySubtype || '')
  const city = (c.unparsedAddress || '').split(',')[1]?.trim().split(' ')[0].toLowerCase() || ''
  return isCondo
    ? (unitStr ? `${addr}-unit-${unitStr}-${mls}` : `${addr}-unit-${mls}`)
    : `${addr}-${city ? city + '-' : ''}${mls}`
}

// Verbatim from app/charlie/components/ActiveListingCard.tsx:33-53 (snake_case)
function oldCharlieActive(l) {
  if (!l.listing_key) return null
  const mls = l.listing_key.toLowerCase()
  const rawAddr = (l.unparsed_address || '').split(',')[0].trim()
  const unitStr = l.unit_number || ''
  const withoutUnit = unitStr
    ? rawAddr.replace(new RegExp('\\s+' + unitStr + '\\s*$'), '').trim()
    : rawAddr
  const addr = withoutUnit
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const isCondo = !HOME_TYPES.includes(l.property_subtype || '')
  const city = (l.unparsed_address || '').split(',')[1]?.trim().split(' ')[0].toLowerCase() || ''
  return isCondo
    ? (unitStr ? `${addr}-unit-${unitStr}-${mls}` : `${addr}-unit-${mls}`)
    : `${addr}-${city ? city + '-' : ''}${mls}`
}

const fixtures = [
  { tag: 'home-detached',  c: { listingKey: 'E12856240', unparsedAddress: '421 Pineview Lane, Pickering, ON L1V 6X4', propertySubtype: 'Detached', unitNumber: null } },
  { tag: 'home-semi',      c: { listingKey: 'X13013782', unparsedAddress: '123 Main Street, Toronto, ON M5V 1A1', propertySubtype: 'Semi-Detached', unitNumber: null } },
  { tag: 'home-townhouse', c: { listingKey: 'W12345678', unparsedAddress: '5 King Road, Brampton, ON L6Y 1A1', propertySubtype: 'Att/Row/Townhouse', unitNumber: null } },
  { tag: 'condo-with-unit', c: { listingKey: 'C99887766', unparsedAddress: '15 Iceboat Terrace 2706, Toronto, ON M5V 4A8', propertySubtype: 'Condo Apartment', unitNumber: '2706' } },
  { tag: 'condo-no-unit-in-addr', c: { listingKey: 'C12345001', unparsedAddress: '15 Iceboat Terrace, Toronto, ON M5V 4A8', propertySubtype: 'Condo Apartment', unitNumber: '2706' } },
  { tag: 'condo-no-unit-at-all', c: { listingKey: 'C11223344', unparsedAddress: '100 Yonge Street, Toronto, ON M5C 1A1', propertySubtype: 'Condo Apartment', unitNumber: null } },
  { tag: 'home-apostrophe', c: { listingKey: 'E22334455', unparsedAddress: "4256 St. Andrew's Crescent, Mississauga, ON L5R 3X1", propertySubtype: 'Detached', unitNumber: null } },
  { tag: 'no-listingKey',   c: { listingKey: null, unparsedAddress: '1 Foo Lane, Toronto, ON', propertySubtype: 'Detached', unitNumber: null } },
]

let fail = 0
console.log('=== ComparableCard parity (camelCase) ===')
for (const f of fixtures) {
  const old = oldCharlieComp(f.c)
  const fresh = buildPropertySlug(f.c)
  const same = old === fresh
  if (!same) fail++
  console.log(`${same ? 'OK  ' : 'DIFF'}  ${f.tag.padEnd(24)}  old=${JSON.stringify(old)}  new=${JSON.stringify(fresh)}`)
}

console.log('=== ActiveListingCard parity (snake_case via mapping) ===')
for (const f of fixtures) {
  const snake = {
    listing_key: f.c.listingKey,
    unparsed_address: f.c.unparsedAddress,
    property_subtype: f.c.propertySubtype,
    unit_number: f.c.unitNumber,
  }
  const old = oldCharlieActive(snake)
  // Map snake → camel to feed the helper
  const fresh = buildPropertySlug({
    listingKey: snake.listing_key,
    unparsedAddress: snake.unparsed_address,
    propertySubtype: snake.property_subtype,
    unitNumber: snake.unit_number,
  })
  const same = old === fresh
  if (!same) fail++
  console.log(`${same ? 'OK  ' : 'DIFF'}  ${f.tag.padEnd(24)}  old=${JSON.stringify(old)}  new=${JSON.stringify(fresh)}`)
}

console.log(fail === 0 ? `\nBYTE-IDENTICAL PASS across ${fixtures.length * 2} fixtures` : `\nBYTE-IDENTICAL FAIL — ${fail} divergence(s)`)
process.exit(fail === 0 ? 0 : 1)
