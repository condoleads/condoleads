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

  // Home/Residential fields
  property_subtype?: string | null
  approximate_age?: string | null
  legal_stories?: string | null
  new_construction_yn?: boolean | null

  // Lot fields
  lot_width?: string | null
  lot_depth?: string | null
  lot_size_area?: number | null
  lot_size_area_units?: string | null
  lot_size_dimensions?: string | null
  lot_size_range_acres?: string | null
  lot_type?: string | null
  lot_shape?: string | null
  lot_features?: string[] | null
  lot_irregularities?: string | null
  frontage_length?: string | null

  // Basement
  basement?: string | string[] | null
  basement_yn?: boolean | null

  // Garage
  garage_yn?: boolean | null
  attached_garage_yn?: boolean | null
  garage_type?: string | null
  garage_parking_spaces?: number | null

  // Heating/Cooling
  heat_source?: string | null
  cooling?: string[] | null

  // Construction & Exterior
  construction_materials?: string[] | null
  foundation_details?: string[] | null
  roof?: string[] | null
  exterior_features?: string[] | null
  structure_type?: string[] | null

  // Special features
  fireplace_yn?: boolean | null
  fireplaces_total?: number | null
  pool_features?: string[] | null
  waterfront_yn?: boolean | null

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
