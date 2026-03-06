import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type SearchResultType = 'neighbourhood' | 'community' | 'building' | 'municipality'

export interface SearchResult {
  type: SearchResultType
  name: string
  slug: string
  subtitle: string
  url: string
  icon: 'map' | 'building' | 'home' | 'area'
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const pattern = `%${q}%`

  const [neighbourhoodsRes, communitiesRes, buildingsRes, municipalitiesRes] =
    await Promise.all([
      // 1. Toronto Neighbourhoods (consumer-friendly groupings)
      supabase
        .from('neighbourhoods')
        .select('id, name, slug')
        .ilike('name', pattern)
        .eq('is_active', true)
        .order('display_order')
        .limit(3),

      // 2. Communities — with municipality name as context
      supabase
        .from('communities')
        .select('id, name, slug, municipalities(name, slug)')
        .ilike('name', pattern)
        .eq('is_active', true)
        .limit(5),

      // 3. Buildings — by name
      supabase
        .from('buildings')
        .select('id, name, slug, address')
        .ilike('name', pattern)
        .limit(4),

      // 4. Non-Toronto municipalities (Burlington, Mississauga, etc.)
      // Exclude Toronto C01–C15/E01–E11/W01–W10 codes — users browse those via neighbourhood
      supabase
        .from('municipalities')
        .select('id, name, slug, treb_areas(name)')
        .ilike('name', pattern)
        .not('name', 'ilike', 'Toronto C%')
        .not('name', 'ilike', 'Toronto E%')
        .not('name', 'ilike', 'Toronto W%')
        .eq('is_active', true)
        .limit(3),
    ])

  const results: SearchResult[] = []

  // --- Neighbourhoods (highest priority for Toronto searches) ---
  for (const n of neighbourhoodsRes.data ?? []) {
    results.push({
      type: 'neighbourhood',
      name: n.name,
      slug: n.slug,
      subtitle: 'Toronto Neighbourhood',
      url: `/toronto/${n.slug}`,
      icon: 'map',
    })
  }

  // --- Non-Toronto Municipalities ---
  for (const m of municipalitiesRes.data ?? []) {
    const area = Array.isArray(m.treb_areas) ? m.treb_areas[0] : m.treb_areas
    results.push({
      type: 'municipality',
      name: m.name,
      slug: m.slug,
      subtitle: area?.name ?? 'Ontario',
      url: `/${m.slug}`,
      icon: 'area',
    })
  }

  // --- Communities ---
  for (const c of communitiesRes.data ?? []) {
    const muni = Array.isArray(c.municipalities) ? c.municipalities[0] : c.municipalities
    const muniName = muni?.name ?? ''
    // Replace "Toronto C01" style with just "Toronto" for cleaner display
    const subtitle = muniName.match(/^Toronto [CEW]\d+$/)
      ? 'Toronto'
      : muniName

    results.push({
      type: 'community',
      name: c.name,
      slug: c.slug,
      subtitle,
      url: `/${c.slug}`,
      icon: 'home',
    })
  }

  // --- Buildings ---
  for (const b of buildingsRes.data ?? []) {
    results.push({
      type: 'building',
      name: b.name,
      slug: b.slug,
      subtitle: b.address ?? 'Condo Building',
      url: `/${b.slug}`,
      icon: 'building',
    })
  }

  return NextResponse.json({ results: results.slice(0, 10) })
}