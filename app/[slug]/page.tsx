import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { calculateAverage, calculateInventoryRate, extractAmenities, extractFeeIncludes } from '@/lib/utils/calculations'
import BuildingHero from './components/BuildingHero'
import BuildingHighlights from './components/BuildingHighlights'
import ListingSection from './components/ListingSection'
import MarketStats from './components/MarketStats'
import BuildingAmenities from './components/BuildingAmenities'
import PriceChart from './components/PriceChart'
import TransactionHistory from './components/TransactionHistory'
import TransactionInsights from './components/TransactionInsights'
import BuildingMap from './components/BuildingMap'
import BuildingReviews from './components/BuildingReviews'
import StickyNav from './components/StickyNav'
import ListYourUnit from './components/ListYourUnit'
import SEODescription from './components/SEODescription'
import EstimatorSeller from '@/app/estimator/components/EstimatorSeller'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data: building } = await supabase
    .from('buildings')
    .select('building_name, canonical_address')
    .eq('slug', params.slug)
    .single()

  if (!building) {
    return { title: 'Building Not Found' }
  }

  return {
    title: `${building.building_name} - Toronto Condos | CondoLeads`,
    description: `View available units, market stats, and amenities for ${building.building_name} at ${building.canonical_address}`,
  }
}

export default async function BuildingPage({ params }: { params: { slug: string } }) {
  const { data: building } = await supabase
    .from('buildings')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!building) {
    notFound()
  }

 const { data: listings } = await supabase
  .from('mls_listings')
  .select(`
    *,
    media (
      id,
      media_url,
      variant_type,
      order_number,
      preferred_photo_yn
    )
  `)
  .eq('building_id', building.id)
  .order('list_price', { ascending: false })

  const allListings = listings || []
  const activeListings = allListings.filter(l => l.standard_status === 'Active')
  const closedListings = allListings.filter(l => l.standard_status === 'Closed')
  
  const activeSales = activeListings.filter(l => l.list_price > 10000)
  const activeRentals = activeListings.filter(l => l.list_price <= 10000)
  const closedSales = closedListings.filter(l => l.list_price > 10000)
  const closedRentals = closedListings.filter(l => l.list_price <= 10000)

  const amenities = extractAmenities(allListings)
  const feeIncludes = extractFeeIncludes(allListings)

  const avgSalePrice = activeSales.length > 0
    ? calculateAverage(activeSales.map(l => l.list_price))
    : closedSales.length > 0
    ? calculateAverage(closedSales.map(l => l.list_price))
    : 0

  const salesPrices = closedSales.map(l => l.list_price)
  const highestSale = salesPrices.length > 0 ? Math.max(...salesPrices) : 0
  const lowestSale = salesPrices.length > 0 ? Math.min(...salesPrices) : 0

  const listingsWithFees = allListings.filter(l => l.association_fee && l.association_fee > 0)
  const avgMaintenanceFee = listingsWithFees.length > 0
    ? calculateAverage(listingsWithFees.map(l => l.association_fee!))
    : 0

  const inventoryRate = calculateInventoryRate(activeSales.length, building.total_units)

  const closedSalesWithDays = closedSales.filter(l => l.days_on_market !== null && l.days_on_market !== undefined)
  const avgDaysOnMarketSale = closedSalesWithDays.length > 0
    ? calculateAverage(closedSalesWithDays.map(l => l.days_on_market!))
    : 0

  const closedRentalsWithDays = closedRentals.filter(l => l.days_on_market !== null && l.days_on_market !== undefined)
  const avgDaysOnMarketLease = closedRentalsWithDays.length > 0
    ? calculateAverage(closedRentalsWithDays.map(l => l.days_on_market!))
    : 0

  const stats = {
    avgSalePrice,
    avgRent: 0,
    inventoryRate,
    highestSale,
    lowestSale,
    avgMaintenanceFee,
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <StickyNav />
      
      <BuildingHero 
        building={building}
        activeSalesCount={activeSales.length}
        activeRentalsCount={activeRentals.length}
        closedSalesCount={closedSales.length}
        closedRentalsCount={closedRentals.length}
        avgSalePrice={avgSalePrice}
        avgDaysOnMarketSale={avgDaysOnMarketSale}
        avgDaysOnMarketLease={avgDaysOnMarketLease}
      />
      
    <div id="listings">
  <ListingSection
    activeSales={activeSales}
    activeRentals={activeRentals}
    closedSales={closedSales}
    closedRentals={closedRentals}
    buildingId={building.id}
    buildingName={building.building_name}
  />
</div>
      
      <div id="highlights">
        <BuildingHighlights 
          building={building}
          listings={allListings}
        />
      </div>
      
      <div id="market-stats">
        <MarketStats stats={stats} yearBuilt={building.year_built} />
      </div>
      
      {amenities.length > 0 && (
        <div id="amenities">
          <BuildingAmenities amenities={amenities} feeIncludes={feeIncludes} />
        </div>
      )}
      
<div id="price-trends">
  <PriceChart closedSales={closedSales} closedRentals={closedRentals} />
</div>
      
      <TransactionInsights 
        activeSales={activeSales}
        closedSales={closedSales}
        activeRentals={activeRentals}
        closedRentals={closedRentals}
        totalUnits={building.total_units}
      />
      
      <div id="transaction-history">
        <TransactionHistory 
          closedSales={closedSales}
          closedRentals={closedRentals}
          highestSale={highestSale}
        />
      </div>
      
      <div id="location">
  <BuildingMap
    latitude={building.latitude}
    longitude={building.longitude}
    buildingName={building.building_name}
    address={building.full_address}
  />
</div>

      <div id="reviews">
  <BuildingReviews
    buildingId={building.id}
    buildingName={building.building_name}
  />
</div>
<div id="list-your-unit">
  <EstimatorSeller
    buildingId={building.id}
    buildingName={building.building_name}
  />
</div>

      <ListYourUnit buildingName={building.building_name} />
      
      <SEODescription 
        building={building}
        totalListings={allListings.length}
        avgPrice={avgSalePrice}
      />
    </div>
  )
}







