export interface Building {
  id: string
  building_name: string
  canonical_address: string
  slug: string
  total_units: number | null
  total_floors: number | null
  year_built: number | null
}

export interface MLSListing {
  id: string
  building_id: string
  listing_id: string | null
  unit_number: string
  list_price: number
  standard_status: 'Active' | 'Closed'
  bedrooms_total: number
  bathrooms_total_integer: number
  building_area_total: number | null
  living_area_range: string | null
  association_fee: number | null
  association_amenities: string[]
  association_fee_includes: string[]
  close_date: string | null
  days_on_market: number | null
  property_management_company: string | null
}

export interface BuildingStats {
  avgSalePrice: number
  avgRent: number
  inventoryRate: number
  highestSale: number
  lowestSale: number
  avgMaintenanceFee: number
}

export interface BuildingPageData {
  building: Building
  activeSales: MLSListing[]
  activeRentals: MLSListing[]
  closedSales: MLSListing[]
  closedRentals: MLSListing[]
  stats: BuildingStats
  amenities: string[]
  feeIncludes: string[]
}
