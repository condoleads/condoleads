import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get sync history with building names
    const { data: history, error } = await supabase
      .from('sync_history')
      .select(`
        id,
        building_id,
        sync_type,
        listings_found,
        listings_created,
        listings_updated,
        listings_unchanged,
        media_records_created,
        room_records_created,
        open_house_records_created,
        sync_status,
        started_at,
        completed_at,
        duration_seconds,
        error_details,
        triggered_by,
        buildings (
          building_name
        )
      `)
      .order('started_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching sync history:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten building name
    const formattedHistory = (history || []).map((record: any) => ({
      ...record,
      building_name: record.buildings?.building_name || 'Unknown',
      buildings: undefined
    }));

    return NextResponse.json({ history: formattedHistory });
  } catch (error: any) {
    console.error('Sync history API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync history', details: error.message },
      { status: 500 }
    );
  }
}