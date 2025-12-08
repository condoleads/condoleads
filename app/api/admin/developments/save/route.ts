import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { id, name, slug, description, buildingIds } = await request.json()

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 })
    }

    // Check if slug already exists (for new or different development)
    const { data: existingSlug } = await supabase
      .from('developments')
      .select('id')
      .eq('slug', slug)
      .neq('id', id || '')
      .single()

    if (existingSlug) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 400 })
    }

    let developmentId = id

    if (id) {
      // Update existing development
      const { error: updateError } = await supabase
        .from('developments')
        .update({ name, slug, description, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) {
        throw updateError
      }
    } else {
      // Create new development
      const { data: newDev, error: insertError } = await supabase
        .from('developments')
        .insert({ name, slug, description })
        .select()
        .single()

      if (insertError) {
        throw insertError
      }
      developmentId = newDev.id
    }

    // Update building assignments if provided
    if (buildingIds !== undefined) {
      // Remove development_id from all buildings currently assigned to this development
      await supabase
        .from('buildings')
        .update({ development_id: null })
        .eq('development_id', developmentId)

      // Assign selected buildings to this development
      if (buildingIds.length > 0) {
        await supabase
          .from('buildings')
          .update({ development_id: developmentId })
          .in('id', buildingIds)
      }
    }

    console.log('✅ Development saved:', developmentId)
    return NextResponse.json({ success: true, developmentId })

  } catch (error: any) {
    console.error('Save development error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}