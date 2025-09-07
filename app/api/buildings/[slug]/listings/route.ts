// app/api/buildings/[slug]/listings/route.ts - CREATE THIS FILE
import { NextResponse } from 'next/server';
import { DatabaseClient } from '../../../../../lib/supabase/client';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const db = new DatabaseClient();
    
    // Get building info
    const { data: building, error: buildingError } = await db.supabase
      .from('buildings')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (buildingError || !building) {
      return NextResponse.json({
        success: false,
        error: 'Building not found'
      }, { status: 404 });
    }
    
    // Get all listings for this building
    const { data: allListings, error: listingsError } = await db.supabase
      .from('mls_listings')
      .select('*')
      .eq('building_id', building.id)
      .order('listing_date', { ascending: false });
    
    if (listingsError) {
      console.error('Error fetching listings:', listingsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch listings'
      }, { status: 500 });
    }
    
    const listings = allListings || [];
    
    // Categorize listings
    const forSale = listings.filter(l => l.status === 'A');
    const forLease = listings.filter(l => l.status === 'L' || (l.status === 'A' && l.price < 10000)); // Assume low prices are rentals
    
    // Recent sold (last 6 months)
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const recentSold = listings.filter(l => 
      l.status === 'S' && 
      l.sold_date && 
      new Date(l.sold_date) >= sixMonthsAgo
    );
    
    // Recent leased (last 6 months)  
    const recentLeased = listings.filter(l => 
      l.status === 'L' && 
      l.updated_at && 
      new Date(l.updated_at) >= sixMonthsAgo
    );
    
    // Calculate building-specific analytics
    const analytics = calculateBuildingAnalytics(listings, building);
    
    return NextResponse.json({
      success: true,
      building,
      forSale: forSale.map(transformListing),
      forLease: forLease.map(transformListing),
      recentSold: recentSold.map(transformListing),
      recentLeased: recentLeased.map(transformListing),
      analytics,
      summary: {
        totalListings: listings.length,
        forSaleCount: forSale.length,
        forLeaseCount: forLease.length,
        soldCount: recentSold.length,
        leasedCount: recentLeased.length
      }
    });
    
  } catch (error) {
    console.error('Building listings API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

function transformListing(listing: any) {
  return {
    id: listing.id,
    mls_number: listing.mls_number,
    price: listing.price,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    unit_number: listing.unit_number,
    status: listing.status,
    photos: listing.photos || [],
    description: listing.description,
    listing_date: listing.listing_date,
    sold_date: listing.sold_date,
    days_on_market: listing.days_on_market,
    updated_at: listing.updated_at
  };
}

function calculateBuildingAnalytics(listings: any[], building: any) {
  const totalUnits = building.static_content?.unit_count || listings.length;
  
  // Current active listings
  const activeSale = listings.filter(l => l.status === 'A' && l.price >= 10000);
  const activeLease = listings.filter(l => l.status === 'L' || (l.status === 'A' && l.price < 10000));
  
  // Recent activity (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentSold = listings.filter(l => 
    l.status === 'S' && 
    l.sold_date && 
    new Date(l.sold_date) >= ninetyDaysAgo
  );
  const recentLeased = listings.filter(l => 
    l.status === 'L' && 
    l.updated_at && 
    new Date(l.updated_at) >= ninetyDaysAgo
  );
  
  // Price calculations
  const saleListings = listings.filter(l => l.status === 'A' && l.price >= 10000);
  const leaseListings = listings.filter(l => l.status === 'L' || (l.status === 'A' && l.price < 10000));
  const soldListings = listings.filter(l => l.status === 'S');
  
  const avgSalePrice = saleListings.length > 0 
    ? saleListings.reduce((sum, l) => sum + l.price, 0) / saleListings.length 
    : 0;
    
  const avgLeasePrice = leaseListings.length > 0 
    ? leaseListings.reduce((sum, l) => sum + l.price, 0) / leaseListings.length 
    : 0;
  
  // Days on market
  const listingsWithDOM = listings.filter(l => l.days_on_market > 0);
  const avgDaysOnMarket = listingsWithDOM.length > 0
    ? Math.round(listingsWithDOM.reduce((sum, l) => sum + l.days_on_market, 0) / listingsWithDOM.length)
    : 0;
  
  // Price per sqft
  const listingsWithSqft = saleListings.filter(l => l.sqft > 0);
  const avgPricePerSqft = listingsWithSqft.length > 0
    ? Math.round(listingsWithSqft.reduce((sum, l) => sum + (l.price / l.sqft), 0) / listingsWithSqft.length)
    : 0;
  
  // Price trend (compare recent sales to older sales)
  const priceTrend = calculatePriceTrend(soldListings);
  
  // Market activity level
  const totalRecentActivity = recentSold.length + recentLeased.length;
  const marketActivity = totalRecentActivity >= 5 ? 'high' : totalRecentActivity >= 2 ? 'medium' : 'low';
  
  // Occupancy rate (rough estimate)
  const occupiedUnits = totalUnits - activeSale.length - activeLease.length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  
  return {
    total_units_tracked: listings.length,
    total_units_building: totalUnits,
    active_for_sale: activeSale.length,
    active_for_lease: activeLease.length,
    sold_last_90_days: recentSold.length,
    leased_last_90_days: recentLeased.length,
    avg_sale_price: Math.round(avgSalePrice),
    avg_lease_price: Math.round(avgLeasePrice),
    avg_days_on_market: avgDaysOnMarket,
    price_per_sqft: avgPricePerSqft,
    occupancy_rate: Math.max(0, Math.min(100, occupancyRate)),
    price_trend: priceTrend,
    market_activity: marketActivity,
    inventory_turnover: totalUnits > 0 ? Math.round((totalRecentActivity / totalUnits) * 100) : 0
  };
}

function calculatePriceTrend(soldListings: any[]) {
  if (soldListings.length < 4) return 'stable';
  
  // Sort by sold date
  const sorted = soldListings
    .filter(l => l.sold_date && l.price > 0)
    .sort((a, b) => new Date(a.sold_date).getTime() - new Date(b.sold_date).getTime());
  
  if (sorted.length < 4) return 'stable';
  
  // Compare first quarter to last quarter
  const quarterSize = Math.floor(sorted.length / 4);
  const firstQuarter = sorted.slice(0, quarterSize);
  const lastQuarter = sorted.slice(-quarterSize);
  
  const firstAvg = firstQuarter.reduce((sum, l) => sum + l.price, 0) / firstQuarter.length;
  const lastAvg = lastQuarter.reduce((sum, l) => sum + l.price, 0) / lastQuarter.length;
  
  const change = (lastAvg - firstAvg) / firstAvg;
  
  if (change > 0.05) return 'rising';
  if (change < -0.05) return 'falling';
  return 'stable';
}