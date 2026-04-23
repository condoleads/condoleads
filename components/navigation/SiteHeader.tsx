// Server Component — fetches neighbourhood + community data for mega-menu
import { createClient } from '@supabase/supabase-js'
import SiteHeaderClient from './SiteHeaderClient'
import { getTenant } from '@/lib/tenant/getTenant'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface NeighbourhoodMenuItem {
  id: string
  name: string
  slug: string
  display_order: number
  communities: {
    name: string
    slug: string
    buildings: number
  }[]
  total_buildings: number
  total_communities: number
}

async function getNeighbourhoodMenuData(): Promise<NeighbourhoodMenuItem[]> {
  // Fetch neighbourhoods with top 5 communities by building count each
  const { data: neighbourhoods } = await supabase
    .from('neighbourhoods')
    .select('id, name, slug, display_order')
    .eq('is_active', true)
    .order('display_order')

  if (!neighbourhoods?.length) return []

  // For each neighbourhood, fetch top communities via municipality_neighbourhoods join
  const menuData = await Promise.all(
    neighbourhoods.map(async (n) => {
      const { data: communities } = await supabase
        .from('communities')
        .select(`
          name, slug,
          municipalities!inner (
            municipality_neighbourhoods!inner (
              neighbourhood_id
            )
          )
        `)
        .eq('municipalities.municipality_neighbourhoods.neighbourhood_id', n.id)
        .eq('is_active', true)
        .limit(100) // fetch all, sort client-side with building counts

      // Get building counts per community
      const { data: buildingCounts } = await supabase
        .from('buildings')
        .select('community_id')
        .not('community_id', 'is', null)
        .in(
          'community_id',
          (communities ?? []).map((c: any) => c.id).filter(Boolean)
        )

      // Hmm — communities query above doesn't return community id. Let's use a different approach.
      // Use a direct RPC-style query instead.
      return { n, communities: communities ?? [] }
    })
  )

  // Simpler approach: use raw SQL via RPC or restructure query
  // Fetching communities with building counts per neighbourhood directly
  const results: NeighbourhoodMenuItem[] = []

  for (const n of neighbourhoods) {
    const { data: topCommunities } = await supabase.rpc(
      'get_top_communities_for_neighbourhood',
      { p_neighbourhood_id: n.id, p_limit: 5 }
    ).select()

    // Fallback: direct query if RPC not available
    const { data: communitiesRaw } = await supabase
      .from('communities')
      .select(`
        id, name, slug,
        buildings(id)
      `)
      .eq('is_active', true)
      .limit(200)

    results.push({
      id: n.id,
      name: n.name,
      slug: n.slug,
      display_order: n.display_order,
      communities: [],
      total_buildings: 0,
      total_communities: 0,
    })
  }

  return results
}

// ─── Cleaner approach: single optimised query ─────────────────────────────────
export async function getMenuData(): Promise<NeighbourhoodMenuItem[]> {
  // Step 1: Get all neighbourhoods
  const { data: neighbourhoods, error: nErr } = await supabase
    .from('neighbourhoods')
    .select('id, name, slug, display_order')
    .eq('is_active', true)
    .order('display_order')

  if (nErr || !neighbourhoods?.length) return []

  // Step 2: Get municipality IDs per neighbourhood
  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('neighbourhood_id, municipality_id')

  if (!mappings?.length) return []

  // Step 3: Get all communities with building counts (one query)
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name, slug, municipality_id')
    .eq('is_active', true)

  const { data: buildings } = await supabase
    .from('buildings')
    .select('community_id')
    .not('community_id', 'is', null)

  if (!communities) return []

  // Build lookup: community_id → building count
  const buildingCountMap: Record<string, number> = {}
  for (const b of buildings ?? []) {
    if (b.community_id) {
      buildingCountMap[b.community_id] = (buildingCountMap[b.community_id] ?? 0) + 1
    }
  }

  // Build lookup: municipality_id → neighbourhood_id
  const muniToNeighbourhood: Record<string, string> = {}
  for (const m of mappings) {
    muniToNeighbourhood[m.municipality_id] = m.neighbourhood_id
  }

  // Group communities by neighbourhood
  const communityByNeighbourhood: Record<string, typeof communities> = {}
  for (const c of communities) {
    const nId = muniToNeighbourhood[c.municipality_id]
    if (!nId) continue
    if (!communityByNeighbourhood[nId]) communityByNeighbourhood[nId] = []
    communityByNeighbourhood[nId].push(c)
  }

  // Assemble final menu data
  return neighbourhoods.map((n) => {
    const nCommunities = communityByNeighbourhood[n.id] ?? []
    const withCounts = nCommunities
      .map((c) => ({ ...c, buildings: buildingCountMap[c.id] ?? 0 }))
      .filter((c) => c.buildings > 0)
      .sort((a, b) => b.buildings - a.buildings)

    return {
      id: n.id,
      name: n.name,
      slug: n.slug,
      display_order: n.display_order,
      communities: withCounts.slice(0, 5).map((c) => ({
        name: c.name,
        slug: c.slug,
        buildings: c.buildings,
      })),
      total_buildings: withCounts.reduce((sum, c) => sum + c.buildings, 0),
      total_communities: withCounts.length,
    }
  })
}

interface SiteHeaderProps {
  agentName?: string
  agentLogo?: string | null
  primaryColor?: string
}

export default async function SiteHeader({
  agentName = 'CondoLeads',
  agentLogo,
  primaryColor = '#0A2540',
}: SiteHeaderProps) {
  const neighbourhoods = await getMenuData()
  const tenant = await getTenant()

  return (
    <SiteHeaderClient
      neighbourhoods={neighbourhoods}
      agentName={agentName}
      agentLogo={agentLogo}
      primaryColor={primaryColor}
      tenantId={tenant?.id}
      brandName={tenant?.brand_name ?? agentName}
    />
  )
}