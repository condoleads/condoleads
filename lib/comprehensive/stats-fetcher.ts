import { createClient } from '@supabase/supabase-js';
import type { ResolvedAccess, MarketStats, AreaCard, CONDO_SUBTYPES, HOMES_SUBTYPES } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Fetch market stats scoped to agent's geographic access.
 * If isAllMLS, no geo filter applied (full database).
 */
export async function fetchMarketStats(access: ResolvedAccess): Promise<MarketStats> {
  // Build base query conditions
  const geoFilter = access.isAllMLS ? null : access.communityIds;

  // Active condos
  let condoQuery = supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('standard_status', 'Active')
    .in('property_sub_type', [
      'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
      'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'
    ]);
  if (geoFilter && geoFilter.length > 0) {
    condoQuery = condoQuery.in('community_id', geoFilter);
  }
  const { count: activeCondos } = await condoQuery;

  // Active homes
  let homesQuery = supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('standard_status', 'Active')
    .in('property_sub_type', [
      'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
      'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
    ]);
  if (geoFilter && geoFilter.length > 0) {
    homesQuery = homesQuery.in('community_id', geoFilter);
  }
  const { count: activeHomes } = await homesQuery;

  // Buildings count
  let buildingsQuery = supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true });
  if (geoFilter && geoFilter.length > 0) {
    buildingsQuery = buildingsQuery.in('community_id', geoFilter);
  }
  const { count: buildingsCount } = await buildingsQuery;

  // Average PSF (from active listings that have list_price and living_area)
  let psfQuery = supabase
    .from('mls_listings')
    .select('list_price, living_area')
    .eq('standard_status', 'Active')
    .not('list_price', 'is', null)
    .not('living_area', 'is', null)
    .gt('living_area', 0)
    .limit(1000);
  if (geoFilter && geoFilter.length > 0) {
    psfQuery = psfQuery.in('community_id', geoFilter);
  }
  const { data: psfData } = await psfQuery;

  let avgPsf = 0;
  if (psfData && psfData.length > 0) {
    const totalPsf = psfData.reduce((sum, l) => {
      const psf = Number(l.list_price) / Number(l.living_area);
      return sum + (isFinite(psf) ? psf : 0);
    }, 0);
    avgPsf = Math.round(totalPsf / psfData.length);
  }

  // Sold this month
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  let soldQuery = supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('standard_status', 'Closed')
    .eq('transaction_type', 'For Sale')
    .gte('close_date', firstOfMonth.toISOString());
  if (geoFilter && geoFilter.length > 0) {
    soldQuery = soldQuery.in('community_id', geoFilter);
  }
  const { count: soldThisMonth } = await soldQuery;

  // Leased this month
  let leasedQuery = supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true })
    .eq('standard_status', 'Closed')
    .eq('transaction_type', 'For Lease')
    .gte('close_date', firstOfMonth.toISOString());
  if (geoFilter && geoFilter.length > 0) {
    leasedQuery = leasedQuery.in('community_id', geoFilter);
  }
  const { count: leasedThisMonth } = await leasedQuery;

  // Total listings
  let totalQuery = supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true });
  if (geoFilter && geoFilter.length > 0) {
    totalQuery = totalQuery.in('community_id', geoFilter);
  }
  const { count: totalListings } = await totalQuery;

  return {
    activeCondos: activeCondos ?? 0,
    activeHomes: activeHomes ?? 0,
    buildingsCount: buildingsCount ?? 0,
    avgPsf,
    soldThisMonth: soldThisMonth ?? 0,
    leasedThisMonth: leasedThisMonth ?? 0,
    totalListings: totalListings ?? 0,
  };
}

/**
 * Fetch top areas/municipalities ranked by listing activity.
 * Returns cards for the NeighborhoodExplorer section.
 */
export async function fetchTopAreas(access: ResolvedAccess, limit: number = 6): Promise<AreaCard[]> {
  // If ALL MLS  show top municipalities by activity
  // If specific geo  show the assigned municipalities/communities

  if (access.isAllMLS) {
    // Get municipalities with most active listings
    const { data } = await supabase
      .from('municipalities')
      .select(`
        id, name, slug,
        area:treb_areas!inner(id, name, slug)
      `)
      .limit(200);

    if (!data) return [];

    // Count active listings per municipality
    const cards: AreaCard[] = [];
    for (const muni of data.slice(0, 30)) {
      const { count: condoCount } = await supabase
        .from('mls_listings')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', muni.id)
        .eq('standard_status', 'Active')
        .in('property_sub_type', [
          'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
          'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'
        ]);

      const { count: homeCount } = await supabase
        .from('mls_listings')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', muni.id)
        .eq('standard_status', 'Active')
        .in('property_sub_type', [
          'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
          'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
        ]);

      const { count: buildingCount } = await supabase
        .from('buildings')
        .select('id', { count: 'exact', head: true })
        .in('community_id', 
          (await supabase
            .from('communities')
            .select('id')
            .eq('municipality_id', muni.id)
          ).data?.map(c => c.id) ?? []
        );

      const total = (condoCount ?? 0) + (homeCount ?? 0);
      if (total > 0) {
        cards.push({
          id: muni.id,
          name: muni.name,
          slug: muni.slug,
          type: 'municipality',
          condoCount: condoCount ?? 0,
          homeCount: homeCount ?? 0,
          buildingCount: buildingCount ?? 0,
          avgPsf: 0, // TODO: calculate per municipality
          trend: '+0.0%', // TODO: calculate from historical data
        });
      }
    }

    // Sort by total listings descending, take top N
    return cards
      .sort((a, b) => (b.condoCount + b.homeCount) - (a.condoCount + a.homeCount))
      .slice(0, limit);
  }

  // Specific geography  show assigned municipalities
  const cards: AreaCard[] = [];
  for (const muniId of access.municipalityIds) {
    const { data: muni } = await supabase
      .from('municipalities')
      .select('id, name, slug')
      .eq('id', muniId)
      .single();

    if (!muni) continue;

    const { count: condoCount } = await supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .eq('municipality_id', muniId)
      .eq('standard_status', 'Active')
      .in('property_sub_type', [
        'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
        'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'
      ]);

    const { count: homeCount } = await supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .eq('municipality_id', muniId)
      .eq('standard_status', 'Active')
      .in('property_sub_type', [
        'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
        'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
      ]);

    const muniCommunities = access.communityIds.length > 0
      ? access.communityIds
      : (await supabase
          .from('communities')
          .select('id')
          .eq('municipality_id', muniId)
        ).data?.map(c => c.id) ?? [];

    const { count: buildingCount } = await supabase
      .from('buildings')
      .select('id', { count: 'exact', head: true })
      .in('community_id', muniCommunities);

    cards.push({
      id: muni.id,
      name: muni.name,
      slug: muni.slug,
      type: 'municipality',
      condoCount: condoCount ?? 0,
      homeCount: homeCount ?? 0,
      buildingCount: buildingCount ?? 0,
      avgPsf: 0,
      trend: '+0.0%',
    });
  }

  return cards
    .sort((a, b) => (b.condoCount + b.homeCount) - (a.condoCount + a.homeCount))
    .slice(0, limit);
}
