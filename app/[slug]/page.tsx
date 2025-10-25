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
import BuildingSchema from './components/BuildingSchema'
import { AgentCard } from '@/components/AgentCard'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, canonical_address, year_built, total_units')
    .eq('slug', params.slug)
    .single()

  if (!building) {
    return { title: 'Building Not Found' }
  }

  // Fetch listings for richer metadata
  const { data: listings, error } = await supabase
    .from('mls_listings')
    .select('list_price, bedrooms_total, transaction_type, standard_status')
    .eq('building_id', building.id)
    console.log(' LISTINGS DEBUG:', { count: listings?.length, error, buildingId: building.id, firstListing: listings?.[0] })

  const activeSales = listings?.filter(l => l.transaction_type === 'For Sale' && l.standard_status === 'Active') || []
  const activeRentals = listings?.filter(l => l.transaction_type === 'For Lease' && l.standard_status === 'Active') || []
  
  // Calculate price range
  const salePrices = activeSales.map(l => l.list_price).filter(p => p > 0)
  const minPrice = salePrices.length > 0 ? Math.min(...salePrices) : null
  const maxPrice = salePrices.length > 0 ? Math.max(...salePrices) : null
  
  // Get bedroom range
  const bedrooms = listings?.map(l => l.bedrooms_total).filter(b => b !== null) || []
  const minBed = bedrooms.length > 0 ? Math.min(...bedrooms) : null
  const maxBed = bedrooms.length > 0 ? Math.max(...bedrooms) : null

  // Build dynamic description
  let description = `${building.building_name} at ${building.canonical_address} in Toronto. `
  
  if (activeSales.length > 0) {
    description += `${activeSales.length} unit${activeSales.length > 1 ? 's' : ''} for sale`
    if (minPrice && maxPrice) {
      description += ` from $${Math.round(minPrice/1000)}K to $${Math.round(maxPrice/1000)}K`
    }
    description += `. `
  }
  
  if (activeRentals.length > 0) {
    description += `${activeRentals.length} unit${activeRentals.length > 1 ? 's' : ''} for rent. `
  }
  
  if (minBed !== null && maxBed !== null) {
    description += `${minBed === maxBed ? minBed : `${minBed}-${maxBed}`} bedroom units available. `
  }
  
  if (building.year_built) {
    description += `Built in ${building.year_built}. `
  }
  
  if (building.total_units) {
    description += `${building.total_units} total units. `
  }
  
  description += `View floor plans, amenities, market stats, and transaction history.`

 const title = `${building.building_name} Condos - ${building.canonical_address} | Toronto Real Estate`
  
  return {
    title,
    description,
    keywords: [
      building.building_name,
      'Toronto condos',
      'condos for sale',
      'condos for rent',
      building.canonical_address,
      'Toronto real estate',
      'condo listings',
      'GTA condos'
    ],
    openGraph: {
      title,
      description,
      url: `https://condoleads.com/${params.slug}`,
      siteName: 'CondoLeads',
      locale: 'en_CA',
      type: 'website',
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
          alt: `${building.building_name} - Toronto Condos`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.jpg'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    alternates: {
      canonical: `https://condoleads.com/${params.slug}`,
    },
  }
}

export default async function BuildingPage({ params }: { params: { slug: string } }) {
  const { data: building } = await supabase
    .from('buildings')
    .select('*')
    .eq('slug', params.slug)
    .single()

  console.log(' BUILDING DEBUG:', { slug: params.slug, buildingId: building?.id, buildingName: building?.building_name })

  if (!building) {
    notFound()
  }

  // Fetch the agent assigned to this building
  const supabaseServer = createClient()
  const { data: agentBuilding } = await supabaseServer
    .from('agent_buildings')
    .select('agents (*)')
    .eq('building_id', building.id)
    .single()
  
  const agent = agentBuilding?.agents
  console.log(' AGENT DEBUG:', { agent, agentBuilding, buildingId: building.id })
  
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
  
  const activeSales = activeListings.filter(l => l.transaction_type === 'For Sale')
  const activeRentals = activeListings.filter(l => l.transaction_type === 'For Lease')
  const closedSales = closedListings.filter(l => l.transaction_type === 'For Sale')
  const closedRentals = closedListings.filter(l => l.transaction_type === 'For Lease')

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
      <BuildingSchema 
        building={building}
        activeSales={activeSales}
        activeRentals={activeRentals}
        avgPrice={avgSalePrice}
      />
      <StickyNav />
      
      <BuildingHero 
        building={building}
        slug={params.slug}
        activeSalesCount={activeSales.length}
        activeRentalsCount={activeRentals.length}
        closedSalesCount={closedSales.length}
        closedRentalsCount={closedRentals.length}
        avgSalePrice={avgSalePrice}
        avgDaysOnMarketSale={avgDaysOnMarketSale}
        avgDaysOnMarketLease={avgDaysOnMarketLease}
      />
      
      {/* Main Content Grid with Agent Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          
          {/* Main Content - 3 columns */}
          <div className="lg:col-span-3 space-y-12">
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

            <ListYourUnit buildingName={building.building_name} buildingId={building.id} agentId={agent?.id || ""} />
            
            <SEODescription 
              building={building}
              totalListings={allListings.length}
              avgPrice={avgSalePrice}
            />
          </div>
          
          {/* Agent Sidebar - 1 column, sticky */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {agent && <AgentCard agent={agent} />}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}

