import { createClient } from '@/lib/supabase/server';
import type { ResolvedAccess, MarketStats, AreaCard } from './types';

const CONDO_SUBTYPES = [
  'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
  'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'
];
const HOMES_SUBTYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
  'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
];
// Note: Supabase column is 'property_subtype' not 'property_sub_type'

export async function fetchMarketStats(access: ResolvedAccess): Promise<MarketStats> {
  const supabase = createClient();
  const geoIds = access.isAllMLS ? null : (access.municipalityIds.length > 0 ? access.municipalityIds : null);

  // Use geo_analytics (pre-computed nightly) — instant, no table scans
  let analyticsQuery = supabase
    .from('geo_analytics')
    .select('geo_id, track, active_count, closed_sale_count_90')
    .eq('geo_type', 'municipality')
    .eq('period_type', 'rolling_12mo');

  if (geoIds) analyticsQuery = analyticsQuery.in('geo_id', geoIds);

  const [{ data: analyticsRows }, { data: buildingData }] = await Promise.all([
    analyticsQuery.limit(1000),
    geoIds
      ? supabase.from('communities').select('id').in('municipality_id', geoIds).limit(10000)
          .then(async ({ data: comms }) => {
            const cIds = comms?.map(c => c.id) ?? [];
            return cIds.length > 0
              ? supabase.from('buildings').select('id').in('community_id', cIds).limit(50000)
              : { data: [] };
          })
      : supabase.from('buildings').select('id', { count: 'exact', head: false }).limit(1),
  ]);

  let activeCondos = 0, activeHomes = 0, soldThisMonth = 0;

  for (const row of analyticsRows ?? []) {
    if (row.track === 'condo') {
      activeCondos += row.active_count ?? 0;
    }
    if (row.track === 'homes') {
      activeHomes += row.active_count ?? 0;
    }
  }

  soldThisMonth = 0; // removed — mls_listings query times out, geo_analytics has no monthly breakdown yet

  // PSF from analytics
  const condoRows = analyticsRows?.filter(r => r.track === 'condo' && r.active_count > 0) ?? [];
  // Get median_psf from geo_analytics for a quick average
  let psfQuery = supabase
    .from('geo_analytics')
    .select('median_psf')
    .eq('geo_type', 'municipality')
    .eq('track', 'condo')
    .eq('period_type', 'rolling_12mo')
    .not('median_psf', 'is', null)
    .limit(100);
  if (geoIds) psfQuery = psfQuery.in('geo_id', geoIds);
  const { data: psfRows } = await psfQuery;
  const avgPsf = psfRows?.length
    ? Math.round(psfRows.reduce((s, r) => s + Number(r.median_psf), 0) / psfRows.length)
    : 0;

  // Buildings count
  const { count: buildingsCount } = await (geoIds
    ? supabase.from('buildings').select('*', { count: 'exact', head: true }).in('community_id',
        (await supabase.from('communities').select('id').in('municipality_id', geoIds).limit(10000)).data?.map(c => c.id) ?? [])
    : supabase.from('buildings').select('*', { count: 'exact', head: true }));

  console.log('[fetchMarketStats] results:', { activeCondos, activeHomes, buildingsCount, soldThisMonth, avgPsf });
  return {
    activeCondos,
    activeHomes,
    buildingsCount: buildingsCount ?? 0,
    avgPsf,
    soldThisMonth,
    leasedThisMonth: 0,
    totalListings: 0,
  };
}

export async function fetchTopAreas(access: ResolvedAccess, limit = 6): Promise<AreaCard[]> {
  const supabase = createClient();

  // Use pre-computed geo_analytics for fast municipality counts
  // This avoids scanning mls_listings entirely
  let analyticsQuery = supabase
    .from('geo_analytics')
    .select('geo_id, track, active_count')
    .eq('geo_type', 'municipality')
    .eq('period_type', 'rolling_12mo')
    .not('active_count', 'is', null)
    .gt('active_count', 0)
    .limit(1000);

  if (!access.isAllMLS && access.municipalityIds.length > 0) {
    analyticsQuery = analyticsQuery.in('geo_id', access.municipalityIds);
  }

  // Condo-track PSF + trend per municipality (for AreaCard display)
  let psfTrendQuery = supabase
    .from('geo_analytics')
    .select('geo_id, median_psf, psf_trend_pct')
    .eq('geo_type', 'municipality')
    .eq('track', 'condo')
    .eq('period_type', 'rolling_12mo')
    .not('median_psf', 'is', null)
    .limit(1000);
  if (!access.isAllMLS && access.municipalityIds.length > 0) {
    psfTrendQuery = psfTrendQuery.in('geo_id', access.municipalityIds);
  }

  const [{ data: analyticsRows }, { data: munis }, { data: psfTrendRows }] = await Promise.all([
    analyticsQuery,
    supabase.from('municipalities').select('id, name, slug').limit(500),
    psfTrendQuery,
  ]);

  if (!analyticsRows?.length || !munis?.length) return [];

  const muniMap = new Map(munis.map(m => [m.id, m]));

  // Aggregate counts per municipality
  const condoMap = new Map<string, number>();
  const homeMap = new Map<string, number>();

  for (const row of analyticsRows) {
    if (row.track === 'condo') condoMap.set(row.geo_id, (condoMap.get(row.geo_id) ?? 0) + (row.active_count ?? 0));
    if (row.track === 'homes') homeMap.set(row.geo_id, (homeMap.get(row.geo_id) ?? 0) + (row.active_count ?? 0));
  }

  // Build PSF + trend maps from the dedicated query
  const psfMap = new Map<string, number>();
  const trendMap = new Map<string, number>();
  for (const row of psfTrendRows ?? []) {
    if (row.median_psf != null) psfMap.set(row.geo_id, Math.round(Number(row.median_psf)));
    if (row.psf_trend_pct != null) trendMap.set(row.geo_id, Number(row.psf_trend_pct));
  }

  // Get building counts in one query
  const muniIds = [...new Set([...condoMap.keys(), ...homeMap.keys()])];
  const { data: communityRows } = await supabase
    .from('communities')
    .select('id, municipality_id')
    .in('municipality_id', muniIds)
    .limit(10000);

  const communityIds = communityRows?.map(c => c.id) ?? [];
  const communityToMuni = new Map(communityRows?.map(c => [c.id, c.municipality_id]) ?? []);

  const { data: bldgRows } = communityIds.length > 0
    ? await supabase.from('buildings').select('community_id').in('community_id', communityIds).limit(50000)
    : { data: [] };

  const buildingMap = new Map<string, number>();
  bldgRows?.forEach((r: any) => {
    const muniId = communityToMuni.get(r.community_id);
    if (muniId) buildingMap.set(muniId, (buildingMap.get(muniId) ?? 0) + 1);
  });

  const cards: AreaCard[] = muniIds
    .map(id => {
      const muni = muniMap.get(id);
      if (!muni) return null;
      return {
        id: muni.id,
        name: muni.name,
        slug: muni.slug,
        type: 'municipality' as const,
        condoCount: condoMap.get(id) ?? 0,
        homeCount: homeMap.get(id) ?? 0,
        buildingCount: buildingMap.get(id) ?? 0,
        avgPsf: psfMap.get(id) ?? 0,
        trend: trendMap.has(id)
          ? `${trendMap.get(id)! >= 0 ? '+' : ''}${trendMap.get(id)!.toFixed(1)}%`
          : '+0.0%',
      };
    })
    .filter(Boolean)
    .filter((c: any) => c.condoCount + c.homeCount > 0)
    .sort((a: any, b: any) => (b.condoCount + b.homeCount) - (a.condoCount + a.homeCount))
    .slice(0, limit) as AreaCard[];

  return cards;
}