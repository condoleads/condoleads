// app/api/listings/[buildingId]/route.ts - Create this file
import { NextResponse } from 'next/server';
import { DatabaseClient } from '@/lib/supabase/client';

export async function GET(
  request: Request,
  { params }: { params: { buildingId: string } }
) {
  try {
    const { buildingId } = params;
    
    if (!buildingId) {
      return NextResponse.json({ error: 'Building ID is required' }, { status: 400 });
    }
    
    const db = new DatabaseClient();
    const listings = await db.getListingsForBuilding(buildingId);
    
    return NextResponse.json(listings);
  } catch (error) {
    console.error('Listings API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' }, 
      { status: 500 }
    );
  }
}