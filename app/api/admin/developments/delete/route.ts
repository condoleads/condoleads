import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: NextRequest) {
  try {
    const { developmentId } = await request.json()

    if (!developmentId) {
      return NextResponse.json({ error: 'Development ID required' }, { status: 400 })
    }

    console.log('🗑️ Deleting development:', developmentId)

    // 1. Remove development_id from all buildings (don't delete buildings, just unlink)
    const { error: buildingsError } = await supabase
      .from('buildings')
      .update({ development_id: null })
      .eq('development_id', developmentId)

    if (buildingsError) {
      console.error('Error unlinking buildings:', buildingsError)
    }

    // 2. Delete agent assignments for this development
    const { error: agentsError } = await supabase
      .from('development_agents')
      .delete()
      .eq('development_id', developmentId)

    if (agentsError) {
      console.error('Error deleting development agents:', agentsError)
    }

    // 3. Delete the development
    const { error: deleteError } = await supabase
      .from('developments')
      .delete()
      .eq('id', developmentId)

    if (deleteError) {
      console.error('Delete development error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    console.log('✅ Development deleted successfully')
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete development error:', error)
    return NextResponse.json({ error: 'Failed to delete development' }, { status: 500 })
  }
}