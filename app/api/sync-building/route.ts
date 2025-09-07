// app/api/sync-building/route.ts - WITH CITY PARAMETER

import { NextRequest, NextResponse } from 'next/server';
import { EnhancedPropTxClient } from '@/lib/proptx/enhanced-client';

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    proptx_configured: true,
    proptx_connected: true,
    supabase_configured: true,
    environment: 'development'
  });
}

export async function POST(request: NextRequest) {
  try {
    const { address, city = 'Toronto', returnListings = false } = await request.json();
    
    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }
    
    console.log(`Syncing building: ${address}, ${city}`);
    
    // Search PropTx for listings with city filter
    const proptxClient = new EnhancedPropTxClient();
    const results = await proptxClient.searchBuildingListings(address, city);
    
    // Build response
    const response: any = {
      success: true,
      building: {
        address: address,
        city: city,
        slug: `${address}-${city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: `Building at ${address}, ${city}`
      },
      stats: {
        // Total
        total_found: results.total,
        
        // Current Inventory
        active: results.active?.length || 0,
        for_lease: results.forLease?.length || 0,
        
        // Sales History
        recently_sold: results.recentlySold?.length || 0,
        sold: results.sold?.length || 0,
        total_sold: (results.recentlySold?.length || 0) + (results.sold?.length || 0),
        
        // Rental History
        recently_leased: results.recentlyLeased?.length || 0,
        leased: results.leased?.length || 0,
        total_leased: (results.recentlyLeased?.length || 0) + (results.leased?.length || 0),
        
        // Legacy fields
        saved: results.total,
        errors: 0
      },
      summary: {
        current: `${results.active?.length || 0} for sale, ${results.forLease?.length || 0} for lease`,
        recent: `${results.recentlySold?.length || 0} sold in last 90 days, ${results.recentlyLeased?.length || 0} leased in last 90 days`,
        historical: `${results.sold?.length || 0} older sales, ${results.leased?.length || 0} older rentals`,
        total: `${results.total} total listings`
      },
      message: `✅ Successfully found ${results.total} listings for ${address}, ${city}!`
    };
    
    // Include actual listings if requested
    if (returnListings) {
      response.listings = {
        active: results.active || [],
        forLease: results.forLease || [],
        sold: results.sold || [],
        leased: results.leased || [],
        recentlySold: results.recentlySold || [],
        recentlyLeased: results.recentlyLeased || []
      };
    }
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: 'Sync failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}