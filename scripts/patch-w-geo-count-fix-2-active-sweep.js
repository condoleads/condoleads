// scripts/patch-w-geo-count-fix-2-active-sweep.js
// W-GEO-COUNT-FIX-2: sweep the remaining Active mls_listings count:'exact'
// calls to pg-direct via countDirect's new standard_status_in array variant.
// Same root cause + same fix as W-GEO-COUNT-FIX (Closed): supabase-js
// count:'exact' silently degrades to null under PostgREST contention, then
// `?? 0`/`|| 0` coerces to 0, then unstable_cache poisons it for 5 minutes.
//
// Files touched (4):
//   1. app/comprehensive-site/toronto/[neighbourhood]/page.tsx  (3 Active sites)
//   2. app/[slug]/AreaPage.tsx                                  (6 Active sites)
//   3. app/[slug]/CommunityPage.tsx                             (2 Active sites)
//   4. app/[slug]/MunicipalityPage.tsx                          (2 Active sites)
//
// Out of scope (intentionally left on supabase-js):
//   - buildings table count (9,835 rows total; 3,383 under Toronto-area;
//     EXPLAIN: 2.9ms -- genuinely small + simple, won't hit the 8s ceiling
//     even under contention)
//   - LISTING_SELECT initialListings fetch (data fetch, not a count -- the
//     supabase-js 8s ceiling on count:'exact' is the issue; .limit(24) data
//     fetches are fast)
//   - treb_areas list (tiny static list, not a count)
//   - Admin/api/sync routes (out of scope, not user-facing geo pages)

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

const ACTIVE_STATUS_IN_LITERAL = `['Active', 'Active Under Contract', 'Pending']`

// ============================================================================
// 1. NEIGHBOURHOOD page.tsx -- 3 Active sites
// ============================================================================
patchFile('app/comprehensive-site/toronto/[neighbourhood]/page.tsx', [
  // N-A: activeCount (overall) -- swap supabase-js -> countDirect
  [
    `    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending']),
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .in('property_subtype', ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
        'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']),
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .in('property_subtype', ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
        'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']),`,
    `    // W-GEO-COUNT-FIX-2 (2026-06-02): Active overall -- pg-direct (same
    // contention class as Closed; see lib/db/pg.ts anti-poisoning invariant).
    // No transaction_type filter here -- we want both For Sale + For Lease.
    // BUT countDirect requires transaction_type. We sum two pg-direct calls
    // for forSale+forLease below instead of one combined call. To avoid an
    // extra query for the overall, we keep the existing "active = forSale +
    // forLease" derivation downstream via the two main count calls.
    // For now, satisfy the Promise.all shape with an array-of-two-counts via
    // both transaction types using the multi-status countDirect.
    Promise.all([
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Sale',
        available_in_vow: true,
      }),
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Lease',
        available_in_vow: true,
      }),
    ]).then(([s, l]) => s + l),
    // Active condos (For Sale + For Lease combined to match prior semantics).
    Promise.all([
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
          'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'],
      }),
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
          'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'],
      }),
    ]).then(([s, l]) => s + l),
    // Active homes (For Sale + For Lease combined).
    Promise.all([
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
          'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'],
      }),
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
          'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'],
      }),
    ]).then(([s, l]) => s + l),`,
    'neighbourhood: swap 3 Active counts (overall/condo/home) to countDirect'
  ],

  // N-B: forSaleCount + forLeaseCount (Active by txn) -- already partial-active in the prior section; these are the SEPARATE forSale/forLease counts after buildings.
  [
    `    // FIX: forSaleCount and initialTotal were duplicated — now one query serves both
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('transaction_type', 'For Lease'),`,
    `    // W-GEO-COUNT-FIX-2 (2026-06-02): Active forSale + forLease via pg-direct.
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),`,
    'neighbourhood: swap Active forSale + forLease to countDirect'
  ],

  // N-C: destructure -- activeCount/condoCount/homeCount/forSaleCount/forLeaseCount were { count: x } object shape; now bare numbers.
  [
    `  const [
    { count: activeCount },
    { count: condoCount },
    { count: homeCount },
    { count: buildingCount },
    { data: initialListingsRaw },
    { count: forSaleCount },
    { count: forLeaseCount },
    soldCount,
    leasedCount,
  ] = await Promise.all([`,
    `  const [
    activeCount,
    condoCount,
    homeCount,
    { count: buildingCount },
    { data: initialListingsRaw },
    forSaleCount,
    forLeaseCount,
    soldCount,
    leasedCount,
  ] = await Promise.all([`,
    'neighbourhood: destructure - active/condo/home/forSale/forLease are bare numbers'
  ],

  // N-D: initialCounts -- drop ?? 0 on forSale/forLease (now numbers; sold/leased already bare from prior fix).
  [
    `  const initialCounts = {
    forSale: forSaleCount ?? 0,
    forLease: forLeaseCount ?? 0,
    sold: soldCount,
    leased: leasedCount,
  }`,
    `  const initialCounts = {
    forSale: forSaleCount,
    forLease: forLeaseCount,
    sold: soldCount,
    leased: leasedCount,
  }`,
    'neighbourhood: initialCounts forSale/forLease bare'
  ],

  // N-E: stats return -- drop ?? 0 on active/condos/homes.
  [
    `    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
      sold: soldCount,
      leased: leasedCount,
    },`,
    `    stats: {
      active: activeCount,
      condos: condoCount,
      homes: homeCount,
      buildings: buildingCount ?? 0,
      sold: soldCount,
      leased: leasedCount,
    },`,
    'neighbourhood: stats active/condos/homes bare'
  ],

  // N-F: initialTotal -- drop ?? 0 on forSaleCount.
  [
    `    initialTotal: forSaleCount ?? 0,`,
    `    initialTotal: forSaleCount,`,
    'neighbourhood: initialTotal forSaleCount bare'
  ],
])

// ============================================================================
// 2. AREAPAGE -- 6 Active sites (main forSale/forLease + 4 split-type)
// ============================================================================
patchFile('app/[slug]/AreaPage.tsx', [
  // A-A: main Active forSale + forLease
  [
    `      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale'),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease'),`,
    `      // W-GEO-COUNT-FIX-2 (2026-06-02): Active counts via pg-direct.
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Sale',
        available_in_vow: true,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Lease',
        available_in_vow: true,
      }),`,
    'AreaPage: swap main Active forSale + forLease to countDirect'
  ],

  // A-B: split-type Active home/condo (4 sites)
  [
    `      // homeCounts
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .in('property_subtype', HOME_SUBTYPES),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', HOME_SUBTYPES),
      // condoCounts
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale')
        .in('property_subtype', CONDO_SUBTYPES),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease')
        .in('property_subtype', CONDO_SUBTYPES),`,
    `      // W-GEO-COUNT-FIX-2 (2026-06-02): split-type Active counts via pg-direct.
      // homeCounts
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      // condoCounts
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),`,
    'AreaPage: swap 4 split-type Active counts to countDirect'
  ],

  // A-C: counts.forSale/forLease -- drop .count || 0 (bare numbers now)
  [
    `    const counts = {
      forSale: forSaleCount.count || 0,
      forLease: forLeaseCount.count || 0,
      sold: soldCount,
      leased: leasedCount,
    }`,
    `    const counts = {
      forSale: forSaleCount,
      forLease: forLeaseCount,
      sold: soldCount,
      leased: leasedCount,
    }`,
    'AreaPage: counts forSale/forLease bare'
  ],

  // A-D: homeCounts -- drop .count || 0 on forSale/forLease
  [
    `    const homeCounts = {
      forSale: homeForSaleCount.count || 0,
      forLease: homeForLeaseCount.count || 0,
      sold: homeSoldCount,
      leased: homeLeasedCount,
    }`,
    `    const homeCounts = {
      forSale: homeForSaleCount,
      forLease: homeForLeaseCount,
      sold: homeSoldCount,
      leased: homeLeasedCount,
    }`,
    'AreaPage: homeCounts forSale/forLease bare'
  ],

  // A-E: condoCounts
  [
    `    const condoCounts = {
      forSale: condoForSaleCount.count || 0,
      forLease: condoForLeaseCount.count || 0,
      sold: condoSoldCount,
      leased: condoLeasedCount,
    }`,
    `    const condoCounts = {
      forSale: condoForSaleCount,
      forLease: condoForLeaseCount,
      sold: condoSoldCount,
      leased: condoLeasedCount,
    }`,
    'AreaPage: condoCounts forSale/forLease bare'
  ],
])

// ============================================================================
// 3. COMMUNITYPAGE -- 2 Active sites
// ============================================================================
patchFile('app/[slug]/CommunityPage.tsx', [
  // C-A: swap Active forSale + forLease
  [
    `    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease'),`,
    `    // W-GEO-COUNT-FIX-2 (2026-06-02): Active counts via pg-direct.
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),`,
    'CommunityPage: swap Active forSale + forLease to countDirect'
  ],

  // C-B: counts -- drop .count || 0
  [
    `  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount,
    leased: leasedCount,
  }`,
    `  const counts = {
    forSale: forSaleCount,
    forLease: forLeaseCount,
    sold: soldCount,
    leased: leasedCount,
  }`,
    'CommunityPage: counts forSale/forLease bare'
  ],
])

// ============================================================================
// 4. MUNICIPALITYPAGE -- 2 Active sites
// ============================================================================
patchFile('app/[slug]/MunicipalityPage.tsx', [
  // M-A: swap Active forSale + forLease
  [
    `    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease'),`,
    `    // W-GEO-COUNT-FIX-2 (2026-06-02): Active counts via pg-direct.
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status_in: ${ACTIVE_STATUS_IN_LITERAL},
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),`,
    'MunicipalityPage: swap Active forSale + forLease to countDirect'
  ],

  // M-B: counts -- drop .count || 0
  [
    `  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount,
    leased: leasedCount,
  }`,
    `  const counts = {
    forSale: forSaleCount,
    forLease: forLeaseCount,
    sold: soldCount,
    leased: leasedCount,
  }`,
    'MunicipalityPage: counts forSale/forLease bare'
  ],
])

console.log('\nW-GEO-COUNT-FIX-2 Active sweep PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
