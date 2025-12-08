import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: NextRequest) {
  try {
    const { buildingId } = await request.json()
    
    if (!buildingId) {
      return NextResponse.json({ error: 'Building ID required' }, { status: 400 })
    }

    console.log('🗑️ Deleting building:', buildingId)

    // Get listing IDs first for cascading deletes
    const { data: listings } = await supabase
      .from('mls_listings')
      .select('id')
      .eq('building_id', buildingId)
    
    const listingIds = listings?.map(l => l.id) || []

    if (listingIds.length > 0) {
      // 1. Delete media
      const { error: mediaError } = await supabase
        .from('media')
        .delete()
        .in('listing_id', listingIds)
      if (mediaError) console.error('Media delete error:', mediaError)

      // 2. Delete rooms
      const { error: roomsError } = await supabase
        .from('rooms')
        .delete()
        .in('listing_id', listingIds)
      if (roomsError) console.error('Rooms delete error:', roomsError)

      // 3. Delete open houses
      const { error: openHousesError } = await supabase
        .from('open_houses')
        .delete()
        .in('listing_id', listingIds)
      if (openHousesError) console.error('Open houses delete error:', openHousesError)
    }

    // 4. Delete listings
    const { error: listingsError } = await supabase
      .from('mls_listings')
      .delete()
      .eq('building_id', buildingId)
    if (listingsError) console.error('Listings delete error:', listingsError)

    // 5. Delete sync history
    const { error: syncError } = await supabase
      .from('sync_history')
      .delete()
      .eq('building_id', buildingId)
    if (syncError) console.error('Sync history delete error:', syncError)

    // 6. Delete agent assignments
    const { error: agentError } = await supabase
      .from('agent_buildings')
      .delete()
      .eq('building_id', buildingId)
    if (agentError) console.error('Agent buildings delete error:', agentError)

    // 7. Finally delete the building
    const { error: buildingError } = await supabase
      .from('buildings')
      .delete()
      .eq('id', buildingId)
    
    if (buildingError) {
      console.error('Building delete error:', buildingError)
      return NextResponse.json({ error: buildingError.message }, { status: 500 })
    }

    console.log('✅ Building deleted successfully')
    return NextResponse.json({ success: true, deletedListings: listingIds.length })

  } catch (error) {
    console.error('Delete building error:', error)
    return NextResponse.json({ error: 'Failed to delete building' }, { status: 500 })
  }
}