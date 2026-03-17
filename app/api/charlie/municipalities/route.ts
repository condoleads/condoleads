// app/api/charlie/municipalities/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const search = req.nextUrl.searchParams.get('q') || ''

  try {
    let query = supabase
      .from('municipalities')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(20)

    if (search.trim()) {
      // Toronto special case — match all Toronto districts
      if (search.toLowerCase().startsWith('tor')) {
        query = query.ilike('name', 'Toronto%')
      } else {
        query = query.ilike('name', `%${search.trim()}%`)
      }
    } else {
      // Default: only return municipalities with active/closed listings
      query = query.not('name', 'is', null)
    }

    const { data, error } = await query
    if (error) throw error

    // Deduplicate Toronto districts → single "Toronto" entry
    const seen = new Set<string>()
    const results: { id: string; name: string; displayName: string }[] = []

    for (const m of data || []) {
      const displayName = m.name.toLowerCase().startsWith('toronto') ? 'Toronto' : m.name
      if (seen.has(displayName)) continue
      seen.add(displayName)
      results.push({ id: m.id, name: m.name, displayName })
    }

    return NextResponse.json({ success: true, municipalities: results })
  } catch (err: any) {
    console.error('[municipalities]', err)
    return NextResponse.json({ success: false, municipalities: [], error: err.message })
  }
}