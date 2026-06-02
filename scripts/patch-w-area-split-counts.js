// scripts/patch-w-area-split-counts.js
// W-HOME-AND-NEIGHBOURHOOD Fix 2 (part 2 -- AreaPage split-by-type):
//   AreaPage.tsx had hardcoded sold:0 / leased:0 in homeCounts and condoCounts
//   (the by-property-type count breakdown shown on the Homes / Condos sub-tabs).
//   Same root-cause class as the neighbourhood fix -- compute at SSR by adding
//   4 new count queries (home-sold, home-leased, condo-sold, condo-leased)
//   that match the existing home/condo Active queries but flip status to
//   'Closed' and transaction_type appropriately.
//
// File touched (1): app/[slug]/AreaPage.tsx
//
// Three edits:
//   1. Promise.all destructure -- add 4 new tuple slots.
//   2. Promise.all append -- 4 new count queries reusing HOME_SUBTYPES /
//      CONDO_SUBTYPES helpers already in scope.
//   3. homeCounts.sold/leased and condoCounts.sold/leased read real values.

const fs = require('fs')
const path = require('path')

const TS = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const ROOT = path.resolve(__dirname, '..')

function backup (relPath) {
  const abs = path.join(ROOT, relPath)
  const bak = abs + '.backup_' + TS
  fs.copyFileSync(abs, bak)
  console.log('  backup:', path.basename(bak))
}
function read (relPath) { return fs.readFileSync(path.join(ROOT, relPath), 'utf8') }
function write (relPath, content) { fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8') }

function replaceExact (content, oldStr, newStr, label) {
  let idx = content.indexOf(oldStr)
  if (idx !== -1) {
    if (content.indexOf(oldStr, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (LF): ' + label)
    return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length)
  }
  const oldCRLF = oldStr.replace(/\r?\n/g, '\r\n')
  const newCRLF = newStr.replace(/\r?\n/g, '\r\n')
  idx = content.indexOf(oldCRLF)
  if (idx !== -1) {
    if (content.indexOf(oldCRLF, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (CRLF): ' + label)
    return content.slice(0, idx) + newCRLF + content.slice(idx + oldCRLF.length)
  }
  throw new Error('ANCHOR NOT FOUND (LF + CRLF): ' + label)
}

function patchFile (relPath, edits) {
  console.log('\n[file]', relPath)
  backup(relPath)
  let c = read(relPath)
  for (const [oldStr, newStr, label] of edits) {
    c = replaceExact(c, oldStr, newStr, label)
    console.log('  ok:', label)
  }
  write(relPath, c)
}

patchFile('app/[slug]/AreaPage.tsx', [
  // Edit 1: Promise.all destructure -- add 4 new slots after condoForLeaseCount.
  [
    `      homeForSaleCount,
      homeForLeaseCount,
      condoForSaleCount,
      condoForLeaseCount,
    ] = await Promise.all([`,
    `      homeForSaleCount,
      homeForLeaseCount,
      condoForSaleCount,
      condoForLeaseCount,
      // W-HOME-AND-NEIGHBOURHOOD Fix 2 part-2 (2026-06-02): split-type sold/leased.
      homeSoldCount,
      homeLeasedCount,
      condoSoldCount,
      condoLeasedCount,
    ] = await Promise.all([`,
    'AreaPage: destructure 4 new split-type sold/leased'
  ],

  // Edit 2: Promise.all append -- 4 new queries. Anchor on the existing
  // condoForLeaseCount query (the last one before the closing ]) of the
  // Promise.all). Uses .in('property_subtype', HOME_SUBTYPES|CONDO_SUBTYPES)
  // matching the existing patterns + flipped status / transaction.
  [
    `      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', CONDO_SUBTYPES),
    ])`,
    `      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', CONDO_SUBTYPES),
      // W-HOME-AND-NEIGHBOURHOOD Fix 2 part-2 (2026-06-02): Closed counts
      // by property type. Matches existing Active home/condo filter pattern,
      // flipping standard_status -> 'Closed'.
      // home Sold
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .in('property_subtype', HOME_SUBTYPES),
      // home Leased
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', HOME_SUBTYPES),
      // condo Sold
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .in('property_subtype', CONDO_SUBTYPES),
      // condo Leased
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', CONDO_SUBTYPES),
    ])`,
    'AreaPage: append 4 split-type sold/leased queries'
  ],

  // Edit 3a: homeCounts.sold/leased use real values.
  [
    `    const homeCounts = {
      forSale: homeForSaleCount.count || 0,
      forLease: homeForLeaseCount.count || 0,
      sold: 0,
      leased: 0,
    }`,
    `    const homeCounts = {
      forSale: homeForSaleCount.count || 0,
      forLease: homeForLeaseCount.count || 0,
      sold: homeSoldCount.count || 0,
      leased: homeLeasedCount.count || 0,
    }`,
    'AreaPage: homeCounts sold/leased -> real'
  ],

  // Edit 3b: condoCounts.sold/leased use real values.
  [
    `    const condoCounts = {
      forSale: condoForSaleCount.count || 0,
      forLease: condoForLeaseCount.count || 0,
      sold: 0,
      leased: 0,
    }`,
    `    const condoCounts = {
      forSale: condoForSaleCount.count || 0,
      forLease: condoForLeaseCount.count || 0,
      sold: condoSoldCount.count || 0,
      leased: condoLeasedCount.count || 0,
    }`,
    'AreaPage: condoCounts sold/leased -> real'
  ],
])

console.log('\nW-HOME-AND-NEIGHBOURHOOD Fix 2 (AreaPage split-type) PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
