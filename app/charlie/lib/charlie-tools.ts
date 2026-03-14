// app/charlie/lib/charlie-tools.ts
// Tool definitions Charlie can invoke during conversation

export const CHARLIE_TOOLS = [
  {
    name: 'resolve_geo',
    description: 'Resolve a place name like "Whitby" or "Downtown Toronto" to a geo ID and type for use in other tools.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name e.g. "Whitby", "Mississauga", "King West"' }
      },
      required: ['query',
  {
    name: 'generate_plan',
    description: 'Generate a buyer plan or seller strategy document. Call this when you have enough information to create a complete plan. For buyers: need area + budget + listings. For sellers: need area + property type + comparables.',
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
      },
      required: ['type', 'geoName']
    }
  }
]
    }
  },
  {
    name: 'get_market_analytics',
    description: 'Get market analytics for a geographic area. Call this as soon as the buyer or seller mentions a target area. Returns PSF, DOM, sale-to-list ratio, market condition, and trends.',
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
        limit: { type: 'number', description: 'Default 6' },
        sort: { type: 'string', enum: ['price_asc', 'price_desc', 'newest', 'default'], description: 'Sort order. Use price_asc for lowest priced.' }
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
  }
]