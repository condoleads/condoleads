// scripts/patch-w-geo-count-fix-pages.js
// W-GEO-COUNT-FIX: swap Closed-status exact-count calls from supabase-js to
// pg-direct (lib/db/pg.ts) on the 4 geo SSR pages, drop the silent ?? 0/|| 0
// fallback (countDirect returns a real number or throws), and add a page-level
// graceful degrade OUTSIDE the unstable_cache boundary so a thrown count
// error renders a "counts temporarily unavailable" view instead of 500-ing
// the whole page (and is never cached -- next request retries fresh).
//
// Files touched (4, all backed up timestamped):
//   1. app/comprehensive-site/toronto/[neighbourhood]/page.tsx
//   2. app/[slug]/AreaPage.tsx
//   3. app/[slug]/CommunityPage.tsx
//   4. app/[slug]/MunicipalityPage.tsx

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

// Shared graceful-degrade JSX, identical across pages.
const DEGRADE_JSX = `(
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Counts temporarily unavailable</h1>
          <p className="text-gray-600">Please refresh in a moment.</p>
        </div>
      </div>
    )`

// ============================================================================
// 1. NEIGHBOURHOOD PAGE
// ============================================================================
patchFile('app/comprehensive-site/toronto/[neighbourhood]/page.tsx', [
  // N-A: import countDirect.
  [
    `import { unstable_cache } from 'next/cache'
import NeighbourhoodPageTabs from '@/app/[slug]/components/NeighbourhoodPageTabs'`,
    `import { unstable_cache } from 'next/cache'
import { countDirect } from '@/lib/db/pg'
import NeighbourhoodPageTabs from '@/app/[slug]/components/NeighbourhoodPageTabs'`,
    'neighbourhood: import countDirect'
  ],

  // N-B: destructure -- soldCount/leasedCount go from { count } objects to bare numbers.
  [
    `    { count: forSaleCount },
    { count: forLeaseCount },
    { count: soldCount },
    { count: leasedCount },
  ] = await Promise.all([`,
    `    { count: forSaleCount },
    { count: forLeaseCount },
    soldCount,
    leasedCount,
  ] = await Promise.all([`,
    'neighbourhood: destructure soldCount/leasedCount as bare numbers'
  ],

  // N-C: swap the two supabase Closed-status queries for countDirect.
  [
    `    // W-HOME-AND-NEIGHBOURHOOD Fix 2 (2026-06-02): Closed/Sold count.
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale'),
    // W-HOME-AND-NEIGHBOURHOOD Fix 2 (2026-06-02): Closed/Leased count.
    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Lease'),
  ])`,
    `    // W-GEO-COUNT-FIX (2026-06-02): Closed/Sold via pg-direct.
    // High-volume geos exceeded the PostgREST 8s authenticator timeout on
    // exact counts (silently degraded to null then to 0 via ?? 0, cached
    // by unstable_cache for 5 minutes). pg-direct (30s ceiling) returns
    // the real number or throws; a thrown timeout is not cached.
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    // W-GEO-COUNT-FIX (2026-06-02): Closed/Leased via pg-direct.
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status: 'Closed',
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
  ])`,
    'neighbourhood: swap Closed/Sold + Closed/Leased to countDirect'
  ],

  // N-D: initialCounts -- drop ?? 0 (real numbers now).
  [
    `  const initialCounts = {
    forSale: forSaleCount ?? 0,
    forLease: forLeaseCount ?? 0,
    sold: soldCount ?? 0,
    leased: leasedCount ?? 0,
  }`,
    `  const initialCounts = {
    forSale: forSaleCount ?? 0,
    forLease: forLeaseCount ?? 0,
    sold: soldCount,
    leased: leasedCount,
  }`,
    'neighbourhood: initialCounts sold/leased are numbers'
  ],

  // N-E: stats return -- drop ?? 0 on sold/leased.
  [
    `    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
      sold: soldCount ?? 0,
      leased: leasedCount ?? 0,
    },`,
    `    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
      sold: soldCount,
      leased: leasedCount,
    },`,
    'neighbourhood: stats sold/leased are numbers'
  ],

  // N-F: page-level try/catch around the cached data fetch (degrade).
  [
    `export default async function NeighbourhoodPage({ params }: Props) {
  const data = await getNeighbourhoodData(params.neighbourhood)
  if (!data) notFound()`,
    `export default async function NeighbourhoodPage({ params }: Props) {
  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  // A pg-direct count timeout throws; unstable_cache does not cache rejected
  // promises, so the next request retries fresh rather than serving a stale 0.
  let data: Awaited<ReturnType<typeof getNeighbourhoodData>>
  try {
    data = await getNeighbourhoodData(params.neighbourhood)
  } catch (err) {
    console.error('[NeighbourhoodPage] data fetch failed:', err)
    return ` + DEGRADE_JSX + `
  }
  if (!data) notFound()`,
    'neighbourhood: page-level graceful degrade'
  ],
])

// ============================================================================
// 2. AREAPAGE
// ============================================================================
patchFile('app/[slug]/AreaPage.tsx', [
  // A-A: import countDirect.
  [
    `import { unstable_cache } from 'next/cache'
import GeoPageTabs from './components/GeoPageTabs'`,
    `import { unstable_cache } from 'next/cache'
import { countDirect } from '@/lib/db/pg'
import GeoPageTabs from './components/GeoPageTabs'`,
    'AreaPage: import countDirect'
  ],

  // A-B: swap main Sold + Lease supabase queries to countDirect.
  [
    `      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Sale'),
      supabase.from('mls_listings').select('id', { count: 'exact', head: true })
        .eq(geoFilter.column, geoFilter.value)
        .eq('standard_status', 'Closed')
        .eq('available_in_vow', true)
        .eq('transaction_type', 'For Lease'),
      supabase.from('treb_areas').select('id, name, slug').order('name'),`,
    `      // W-GEO-COUNT-FIX (2026-06-02): Closed counts via pg-direct (see lib/db/pg.ts).
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Sale',
        available_in_vow: true,
      }),
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Lease',
        available_in_vow: true,
      }),
      supabase.from('treb_areas').select('id, name, slug').order('name'),`,
    'AreaPage: swap main Sold + Leased to countDirect'
  ],

  // A-C: swap 4 split-type Closed queries.
  [
    `      // W-HOME-AND-NEIGHBOURHOOD Fix 2 part-2 (2026-06-02): Closed counts
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
    `      // W-GEO-COUNT-FIX (2026-06-02): split-type Closed counts via pg-direct
      // (same threshold concern as main sold/leased; see lib/db/pg.ts).
      // home Sold
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      // home Leased
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: HOME_SUBTYPES,
      }),
      // condo Sold
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
      // condo Leased
      countDirect({
        geo: { kind: 'area_id', value: geoFilter.value },
        standard_status: 'Closed',
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: CONDO_SUBTYPES,
      }),
    ])`,
    'AreaPage: swap 4 split-type Closed to countDirect'
  ],

  // A-D: counts object -- sold/leased are bare numbers.
  [
    `    const counts = {
      forSale: forSaleCount.count || 0,
      forLease: forLeaseCount.count || 0,
      sold: soldCount.count || 0,
      leased: leasedCount.count || 0,
    }`,
    `    const counts = {
      forSale: forSaleCount.count || 0,
      forLease: forLeaseCount.count || 0,
      sold: soldCount,
      leased: leasedCount,
    }`,
    'AreaPage: counts sold/leased are numbers'
  ],

  // A-E: homeCounts.
  [
    `    const homeCounts = {
      forSale: homeForSaleCount.count || 0,
      forLease: homeForLeaseCount.count || 0,
      sold: homeSoldCount.count || 0,
      leased: homeLeasedCount.count || 0,
    }`,
    `    const homeCounts = {
      forSale: homeForSaleCount.count || 0,
      forLease: homeForLeaseCount.count || 0,
      sold: homeSoldCount,
      leased: homeLeasedCount,
    }`,
    'AreaPage: homeCounts sold/leased are numbers'
  ],

  // A-F: condoCounts.
  [
    `    const condoCounts = {
      forSale: condoForSaleCount.count || 0,
      forLease: condoForLeaseCount.count || 0,
      sold: condoSoldCount.count || 0,
      leased: condoLeasedCount.count || 0,
    }`,
    `    const condoCounts = {
      forSale: condoForSaleCount.count || 0,
      forLease: condoForLeaseCount.count || 0,
      sold: condoSoldCount,
      leased: condoLeasedCount,
    }`,
    'AreaPage: condoCounts sold/leased are numbers'
  ],

  // A-G: page-level graceful degrade outside the cache.
  [
    `  const [data, agent, tenantId] = await Promise.all([
    getAreaData(area.id),
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])`,
    `  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  // unstable_cache does not cache rejected promises (Next.js skips caching
  // on rejection), so a thrown pg-direct timeout is retried on the next
  // request rather than serving a stale 0.
  const dataPromise = getAreaData(area.id).catch((err) => {
    console.error('[AreaPage] data fetch failed:', err)
    return null
  })
  const [dataMaybe, agent, tenantId] = await Promise.all([
    dataPromise,
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])
  if (dataMaybe === null) {
    return ` + DEGRADE_JSX + `
  }
  const data = dataMaybe`,
    'AreaPage: page-level graceful degrade'
  ],
])

// ============================================================================
// 3. COMMUNITYPAGE
// ============================================================================
patchFile('app/[slug]/CommunityPage.tsx', [
  // C-A: import countDirect.
  [
    `import { unstable_cache } from 'next/cache'
import GeoPageTabs from './components/GeoPageTabs'`,
    `import { unstable_cache } from 'next/cache'
import { countDirect } from '@/lib/db/pg'
import GeoPageTabs from './components/GeoPageTabs'`,
    'CommunityPage: import countDirect'
  ],

  // C-B: swap 2 Closed-status queries.
  [
    `    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Closed')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Closed')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease'),
    supabase.from('communities').select('id, name, slug').eq('municipality_id', municipalityId).order('name'),`,
    `    // W-GEO-COUNT-FIX (2026-06-02): Closed counts via pg-direct (see lib/db/pg.ts).
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'community_id', value: communityId },
      standard_status: 'Closed',
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    supabase.from('communities').select('id, name, slug').eq('municipality_id', municipalityId).order('name'),`,
    'CommunityPage: swap Closed Sold + Leased to countDirect'
  ],

  // C-C: counts object -- sold/leased bare.
  [
    `  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount.count || 0,
    leased: leasedCount.count || 0,
  }`,
    `  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount,
    leased: leasedCount,
  }`,
    'CommunityPage: counts sold/leased are numbers'
  ],

  // C-D: page-level graceful degrade.
  [
    `  const [data, agent, tenantId] = await Promise.all([
    getCommunityData(community.id, community.municipality_id),
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])`,
    `  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  const dataPromise = getCommunityData(community.id, community.municipality_id).catch((err) => {
    console.error('[CommunityPage] data fetch failed:', err)
    return null
  })
  const [dataMaybe, agent, tenantId] = await Promise.all([
    dataPromise,
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])
  if (dataMaybe === null) {
    return ` + DEGRADE_JSX + `
  }
  const data = dataMaybe`,
    'CommunityPage: page-level graceful degrade'
  ],
])

// ============================================================================
// 4. MUNICIPALITYPAGE
// ============================================================================
patchFile('app/[slug]/MunicipalityPage.tsx', [
  // M-A: import countDirect.
  [
    `import { unstable_cache } from 'next/cache'
import GeoPageTabs from './components/GeoPageTabs'`,
    `import { unstable_cache } from 'next/cache'
import { countDirect } from '@/lib/db/pg'
import GeoPageTabs from './components/GeoPageTabs'`,
    'MunicipalityPage: import countDirect'
  ],

  // M-B: swap 2 Closed-status queries.
  [
    `    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Closed')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Sale'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .eq(geoFilter.column, geoFilter.value)
      .eq('standard_status', 'Closed')
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease'),
    supabase.from('municipalities').select('id, name, slug').eq('area_id', areaId).order('name'),`,
    `    // W-GEO-COUNT-FIX (2026-06-02): Closed counts via pg-direct (see lib/db/pg.ts).
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'municipality_id', value: municipalityId },
      standard_status: 'Closed',
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    supabase.from('municipalities').select('id, name, slug').eq('area_id', areaId).order('name'),`,
    'MunicipalityPage: swap Closed Sold + Leased to countDirect'
  ],

  // M-C: counts object -- sold/leased bare.
  [
    `  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount.count || 0,
    leased: leasedCount.count || 0,
  }`,
    `  const counts = {
    forSale: forSaleCount.count || 0,
    forLease: forLeaseCount.count || 0,
    sold: soldCount,
    leased: leasedCount,
  }`,
    'MunicipalityPage: counts sold/leased are numbers'
  ],

  // M-D: page-level graceful degrade.
  [
    `  const [data, agent, tenantId] = await Promise.all([
    getMunicipalityData(municipality.id, municipality.area_id),
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])`,
    `  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  const dataPromise = getMunicipalityData(municipality.id, municipality.area_id).catch((err) => {
    console.error('[MunicipalityPage] data fetch failed:', err)
    return null
  })
  const [dataMaybe, agent, tenantId] = await Promise.all([
    dataPromise,
    getAgentFromHost(host),
    getCurrentTenantId(),
  ])
  if (dataMaybe === null) {
    return ` + DEGRADE_JSX + `
  }
  const data = dataMaybe`,
    'MunicipalityPage: page-level graceful degrade'
  ],
])

console.log('\nW-GEO-COUNT-FIX page swap PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
