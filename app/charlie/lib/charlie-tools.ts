// app/charlie/lib/charlie-tools.ts
export const CHARLIE_TOOLS = [
  {
    name: 'resolve_geo',
    description: 'Resolve a place name like "Whitby" or "Downtown Toronto" to a geo ID and type for use in other tools.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name e.g. "Whitby", "Mississauga", "King West"' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_market_analytics',
    description: 'Get market analytics for a geographic area. Call this as soon as the buyer or seller mentions a target area.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community', 'area', 'neighbourhood'] },
        geoId: { type: 'string' },
        track: { type: 'string', enum: ['condo', 'homes'] }
      },
      required: ['geoType', 'geoId', 'track']
    }
  },
  {
    name: 'search_listings',
    description: 'Search MLS listings from the database. Call after confirming area, budget, and property type.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community', 'area'] },
        geoId: { type: 'string' },
        minPrice: { type: 'number' },
        maxPrice: { type: 'number' },
        beds: { type: 'number' },
        baths: { type: 'number' },
        propertyCategory: { type: 'string', enum: ['condo', 'homes', 'all'] },
        status: { type: 'string', enum: ['for-sale', 'for-lease', 'sold'] },
        propertySubtype: { type: 'string', description: 'e.g. Detached, Semi-Detached, Condo Apt, Condo Townhouse, Att/Row/Townhouse, Vacant Land' },
        limit: { type: 'number', description: 'Default 10' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc', 'newest', 'default'], description: 'Sort order. Use price_asc for lowest priced.' },
        listedAfterDays: { type: 'number', description: 'Only show listings listed within this many days. Use 7 for new listings this week.' },
        minSqft: { type: 'number', description: 'Minimum square footage' },
        maxSqft: { type: 'number', description: 'Maximum square footage' },
        hasParking: { type: 'boolean', description: 'Filter for listings with parking' },
        hasLocker: { type: 'boolean', description: 'Filter for listings with locker' },
        soldOverAsking: { type: 'boolean', description: 'Filter for listings that sold over asking price' }
      },
      required: ['geoType', 'geoId']
    }
  },
  {
    name: 'get_comparables',
    description: 'Get recent sold listings as comparables for a seller. Use when seller flow is active.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community'] },
        geoId: { type: 'string' },
        propertyCategory: { type: 'string', enum: ['condo', 'homes'] },
        minPrice: { type: 'number' },
        maxPrice: { type: 'number' }
      },
      required: ['geoType', 'geoId']
    }
  },
  {
    name: 'get_building_intelligence',
    description: 'Get building-specific intelligence: recent sold prices, active listings, and performance stats for a specific condo building. Call this whenever user asks about a specific building or when building_id is in context.',
    input_schema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'Building UUID from database' },
        building_slug: { type: 'string', description: 'Building slug e.g. x2-condos-101-charles-st-e-toronto — use if no building_id' }
      }
    }
  },


  {
    name: 'get_inventory_rankings',
    description: 'Get areas ranked by inventory levels. Use when user asks which areas have most/least listings, where supply is highest/lowest, or fastest moving markets.',
    input_schema: {
      type: 'object',
      properties: {
        parentGeoType: { type: 'string', enum: ['municipality', 'area'] },
        parentGeoId: { type: 'string' },
        track: { type: 'string', enum: ['condo', 'homes'] },
        sort: { type: 'string', enum: ['most_inventory', 'least_inventory', 'fastest_moving'], description: 'Default most_inventory' },
        limit: { type: 'number', description: 'Default 5' }
      },
      required: ['parentGeoType', 'parentGeoId', 'track']
    }
  },
  {
    name: 'get_seasonal_trends',
    description: 'Get best months to buy or sell based on historical data. Use when user asks about timing, best season, spring vs fall market.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community', 'area'] },
        geoId: { type: 'string' },
        track: { type: 'string', enum: ['condo', 'homes'] }
      },
      required: ['geoType', 'geoId', 'track']
    }
  },
  {
    name: 'get_building_directory',
    description: 'List all condo buildings in an area. Use when user asks to see all buildings, browse buildings, or get a building directory.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community'] },
        geoId: { type: 'string' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc', 'newest', 'largest', 'active_count'], description: 'Default active_count' },
        limit: { type: 'number', description: 'Default 10' }
      },
      required: ['geoType', 'geoId']
    }
  },
  {
    name: 'search_buildings',
    description: 'Search condo buildings by location and filters. Use when user asks about buildings, maintenance fees, building prices, or wants to compare buildings.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community', 'area'] },
        geoId: { type: 'string' },
        maxAvgPrice: { type: 'number', description: 'Max average sale price filter' },
        minAvgPrice: { type: 'number', description: 'Min average sale price filter' },
        maxMaintenanceFee: { type: 'number', description: 'Max median maintenance fee' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc', 'active_count', 'newest'], description: 'Sort order. Use price_asc for most affordable buildings.' },
        limit: { type: 'number', description: 'Default 5, max 10' }
      },
      required: ['geoType', 'geoId']
    }
  },
  {
    name: 'get_price_trends',
    description: 'Get price trend data over time for an area. Use when user asks if prices are rising or falling, best time to buy/sell, or year-over-year changes.',
    input_schema: {
      type: 'object',
      properties: {
        geoType: { type: 'string', enum: ['municipality', 'community', 'area'] },
        geoId: { type: 'string' },
        track: { type: 'string', enum: ['condo', 'homes'] },
        months: { type: 'number', description: '6, 12, or 24 months of data. Default 12.' }
      },
      required: ['geoType', 'geoId', 'track']
    }
  },
  {
    name: 'compare_geo',
    description: 'Compare market data between 2-4 geographic areas side by side. Use when user mentions multiple areas or asks which area is better.',
    input_schema: {
      type: 'object',
      properties: {
        geos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              geoType: { type: 'string' },
              geoId: { type: 'string' },
              geoName: { type: 'string' }
            }
          },
          description: 'Array of 2-4 geo areas to compare'
        },
        track: { type: 'string', enum: ['condo', 'homes'] }
      },
      required: ['geos', 'track']
    }
  },
  {
    name: 'get_investment_rankings',
    description: 'Get top ranked areas for investment based on price, PSF, volume or DOM. Use when user asks about investment, ROI, best areas to invest.',
    input_schema: {
      type: 'object',
      properties: {
        parentGeoType: { type: 'string', enum: ['municipality', 'area'] },
        parentGeoId: { type: 'string' },
        track: { type: 'string', enum: ['condo', 'homes'] },
        rankBy: { type: 'string', enum: ['median_sale_price', 'avg_psf', 'closed_sale_count_90', 'closed_avg_dom_90'], description: 'What to rank by' },
        limit: { type: 'number', description: 'Default 5' }
      },
      required: ['parentGeoType', 'parentGeoId', 'track']
    }
  },

  {
    name: 'generate_plan',
    description: 'Generate a buyer plan or seller strategy document. Call this when you have enough information. For buyers: need area + budget + listings. For sellers: need area + property type + comparables.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['buyer', 'seller'] },
        geoName: { type: 'string' },
        budgetMin: { type: 'number' },
        budgetMax: { type: 'number' },
        propertyType: { type: 'string' },
        bedrooms: { type: 'number' },
        timeline: { type: 'string' },
        goal: { type: 'string' },
        estimatedValueMin: { type: 'number' },
        estimatedValueMax: { type: 'number' },
        summary: { type: 'string' }
      },
      required: ['type', 'geoName']
    }
  }
]