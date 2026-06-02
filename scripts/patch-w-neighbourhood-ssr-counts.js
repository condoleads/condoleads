// scripts/patch-w-neighbourhood-ssr-counts.js
// W-HOME-AND-NEIGHBOURHOOD Fix 2 (Option B -- SSR-side):
//   Compute sold + leased counts at SSR for /toronto/[neighbourhood], matching
//   the proven CommunityPage/MunicipalityPage filter pattern
//   (available_in_vow=true + standard_status='Closed' + transaction_type='For Sale'|'For Lease').
//
// File touched (1): app/comprehensive-site/toronto/[neighbourhood]/page.tsx
//
// Four edits in the same file:
//   1. Promise.all -- add 2 new count queries (sold + leased) at the end.
//   2. Tuple destructure -- pick up the 2 new counts.
//   3. initialCounts -- replace hardcoded sold:0/leased:0 with real counts.
//      Also remove the lying comment at line 138.
//   4. Cached return value (stats object) -- add sold + leased.
//   5. GeoHero <stats> prop -- replace hardcoded 0s with stats.sold / stats.leased.

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

patchFile('app/comprehensive-site/toronto/[neighbourhood]/page.tsx', [
  // ============================================================================
  // Edit 1: Promise.all destructure -- pick up two new counts after forLeaseCount
  // and update the lying comment at the start of the block.
  // ============================================================================
  [
    `  // FIX: run all queries in parallel
  // FIX: initialTotal and forSaleCount were identical queries — merged into one
  // FIX: sold/leased counts deferred — not needed on initial SSR render, fetched by tabs on demand
  const [
    { count: activeCount },
    { count: condoCount },
    { count: homeCount },
    { count: buildingCount },
    { data: initialListingsRaw },
    { count: forSaleCount },
    { count: forLeaseCount },
  ] = await Promise.all([`,
    `  // FIX: run all queries in parallel
  // FIX: initialTotal and forSaleCount were identical queries — merged into one
  // W-HOME-AND-NEIGHBOURHOOD Fix 2 (2026-06-02): sold/leased counts are now
  // computed at SSR (Option B) so they appear in initial HTML with no client
  // flicker. Matches the CommunityPage/MunicipalityPage filter pattern:
  //   available_in_vow=true + standard_status='Closed' + transaction_type.
  const [
    { count: activeCount },
    { count: condoCount },
    { count: homeCount },
    { count: buildingCount },
    { data: initialListingsRaw },
    { count: forSaleCount },
    { count: forLeaseCount },
    { count: soldCount },
    { count: leasedCount },
  ] = await Promise.all([`,
    'page.tsx: Promise.all destructure + comment rewrite'
  ],

  // ============================================================================
  // Edit 2: append the two new SQL queries to the Promise.all argument list,
  // matching CommunityPage's proven Closed+vow+transaction filter.
  // Insert RIGHT BEFORE the closing ]) of the Promise.all -- the existing tail
  // is the For Lease forLeaseCount query; the new queries come AFTER it.
  // ============================================================================
  [
    `    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('transaction_type', 'For Lease'),
  ])`,
    `    supabase.from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('transaction_type', 'For Lease'),
    // W-HOME-AND-NEIGHBOURHOOD Fix 2 (2026-06-02): Closed/Sold count.
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
    'page.tsx: Promise.all append sold+leased queries'
  ],

  // ============================================================================
  // Edit 3: initialCounts uses real soldCount / leasedCount. Remove the
  // lying comment ("removed from SSR -- NeighbourhoodPageTabs fetches them").
  // ============================================================================
  [
    `  // FIX: sold/leased counts removed from SSR — NeighbourhoodPageTabs fetches them
  // when the user clicks those tabs via the API route
  const initialCounts = {
    forSale: forSaleCount ?? 0,
    forLease: forLeaseCount ?? 0,
    sold: 0,
    leased: 0,
  }`,
    `  const initialCounts = {
    forSale: forSaleCount ?? 0,
    forLease: forLeaseCount ?? 0,
    sold: soldCount ?? 0,
    leased: leasedCount ?? 0,
  }`,
    'page.tsx: initialCounts uses real sold+leased'
  ],

  // ============================================================================
  // Edit 4: return stats includes sold + leased so the GeoHero consumer can
  // read them (replacing its own hardcoded 0s).
  // ============================================================================
  [
    `    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
    },`,
    `    stats: {
      active: activeCount ?? 0,
      condos: condoCount ?? 0,
      homes: homeCount ?? 0,
      buildings: buildingCount ?? 0,
      sold: soldCount ?? 0,
      leased: leasedCount ?? 0,
    },`,
    'page.tsx: return stats includes sold+leased'
  ],

  // ============================================================================
  // Edit 5: GeoHero <stats> prop reads stats.sold + stats.leased.
  // ============================================================================
  [
    `        stats={{
          active: stats?.active ?? 0,
          sold: 0,
          leased: 0,
          buildings: stats?.buildings ?? 0,
        }}`,
    `        stats={{
          active: stats?.active ?? 0,
          sold: stats?.sold ?? 0,
          leased: stats?.leased ?? 0,
          buildings: stats?.buildings ?? 0,
        }}`,
    'page.tsx: GeoHero stats prop reads real sold+leased'
  ],
])

console.log('\nW-HOME-AND-NEIGHBOURHOOD Fix 2 (neighbourhood SSR) PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
