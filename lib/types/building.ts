export interface Building {
  id: string
  building_name: string
  canonical_address: string
  slug: string
  total_units: number | null
  total_floors: number | null
  year_built: number | null
  city_district: string | null
}

export interface MLSListing {
  id: string
  building_id: string
  listing_id: string | null
  unit_number: string
  list_price: number
  close_price: number | null
  standard_status: 'Active' | 'Closed'
  transaction_type: 'For Sale' | 'For Lease'
  bedrooms_total: number
  bathrooms_total_integer: number
  building_area_total: number | null
  square_foot_source: string | null
  living_area_range: string | null
  association_fee: number | null
  association_amenities: string[]
  association_fee_includes: string[]
  close_date: string | null
  days_on_market: number | null
  property_management_company: string | null
  tax_annual_amount: number | null
  tax_year: number | null
  parking_total: number | null
  locker: string | null
  listing_key: string | null
  unparsed_address: string | null
  property_type: string | null
  architectural_style?: string[] | null
  condo_corp_number?: number | null
  laundry_features?: string[] | null
  parking_features?: string[] | null
  neighborhood?: string | null
  heat_type?: string | null
  listing_contract_date?: string | null
  media?: Array<{
    id: string
    media_url: string
    variant_type: string
    order_number: number | null
    preferred_photo_yn: boolean | null
  }>
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
