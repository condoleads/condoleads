const fs = require('fs')
const path = process.argv[2]
const label = process.argv[3] || path
const h = fs.readFileSync(path, 'utf8')
const m = h.match(/<script type="application\/ld\+json"[^>]*>({[^<]*?"@type":"RealEstateListing"[^<]*?})<\/script>/)
if (!m) { console.log('  ' + label.padEnd(24) + ' NO_SCHEMA'); process.exit(0) }
const o = JSON.parse(m[1])
const beds = 'numberOfBedrooms' in o.about ? String(o.about.numberOfBedrooms) : 'OMIT'
const baths = 'numberOfBathroomsTotal' in o.about ? String(o.about.numberOfBathroomsTotal) : 'OMIT'
const sqft = 'floorSize' in o.about ? JSON.stringify(o.about.floorSize) : 'OMIT'
const price = o.offers && o.offers.price != null ? String(o.offers.price) : 'OMIT'
const avail = ((o.offers && o.offers.availability) || '').replace('https://schema.org/', '')
const biz = ((o.offers && o.offers.businessFunction) || '').replace('https://schema.org/', '')
console.log(
  '  ' + label.padEnd(24) +
  ' about=' + o.about['@type'].padEnd(22) +
  ' beds=' + beds.padEnd(4) +
  ' baths=' + baths.padEnd(4) +
  ' price=' + price.padEnd(10) +
  ' avail=' + avail.padEnd(10) +
  ' biz=' + biz.padEnd(8)
)
