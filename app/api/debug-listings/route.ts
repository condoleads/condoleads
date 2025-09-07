import { NextRequest, NextResponse } from 'next/server';
import { EnhancedPropTxClient } from '@/lib/proptx/enhanced-client';

export async function POST(request: NextRequest) {
  try {
    const { address, city } = await request.json();
    
    const client = new EnhancedPropTxClient();
    const results = await client.searchBuildingListings(address, city);
    
    return NextResponse.json({
      success: true,
      data: results,
      stats: {
        total: results.total,
        active: results.active?.length || 0,
        forLease: results.forLease?.length || 0,
        sold: results.sold?.length || 0,
        leased: results.leased?.length || 0
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch listings', details: error.message },
      { status: 500 }
    );
  }
}
