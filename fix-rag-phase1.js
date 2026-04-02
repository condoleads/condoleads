// fix-rag-phase1.js — Add get_building_intelligence tool + handler + prompt upgrade
const fs = require('fs')

function fix(filePath, o, n, label) {
  let c = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
  if (!c.includes(o)) { console.error(`❌ ${label}`); process.exit(1) }
  fs.writeFileSync(filePath, c.replace(o, n), 'utf8')
  console.log(`✅ ${label}`)
}

// ── 1. Add tool to charlie-tools.ts
fix(
  'app/charlie/lib/charlie-tools.ts',
  `  {
    name: 'generate_plan',`,
  `  {
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
    name: 'generate_plan',`,
  'Fix 1 — add get_building_intelligence tool'
)

// ── 2. Add executeTool handler in route.ts
fix(
  'app/api/charlie/route.ts',
  `  if (name === 'generate_plan') {`,
  `  if (name === 'get_building_intelligence') {
    // Resolve building_id from slug if needed
    let buildingId = input.building_id
    if (!buildingId && input.building_slug) {
      const { data: b } = await supabase.from('buildings').select('id').eq('slug', input.building_slug).single()
      buildingId = b?.id
    }
    if (!buildingId) return { error: 'Building not found' }

    // Get building details
    const { data: building } = await supabase
      .from('buildings')
      .select('id, building_name, canonical_address, total_units, year_built, slug')
      .eq('id', buildingId)
      .single()

    // Get recent sold listings (last 90 days)
    const { data: recentSales } = await supabase
      .from('mls_listings')
      .select('unit_number, close_price, close_date, bedrooms_total, living_area_range, days_on_market, list_price')
      .eq('building_id', buildingId)
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale')
      .gte('close_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('close_date', { ascending: false })
      .limit(5)

    // Get active listings
    const { data: activeListings } = await supabase
      .from('mls_listings')
      .select('unit_number, list_price, bedrooms_total, living_area_range, days_on_market')
      .eq('building_id', buildingId)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('transaction_type', 'For Sale')
      .order('list_price', { ascending: true })
      .limit(5)

    // Compute building stats from recent sales
    const sales = recentSales || []
    const prices = sales.map((s: any) => s.close_price).filter(Boolean)
    const concessions = sales.map((s: any) => s.close_price && s.list_price ? ((s.list_price - s.close_price) / s.list_price * 100) : null).filter((v: any) => v !== null)
    const doms = sales.map((s: any) => s.days_on_market).filter(Boolean)

    const stats = {
      sold_last_90: sales.length,
      median_sale_price: prices.length ? Math.round(prices.sort((a: number, b: number) => a - b)[Math.floor(prices.length / 2)]) : null,
      avg_sale_price: prices.length ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : null,
      avg_dom: doms.length ? Math.round(doms.reduce((a: number, b: number) => a + b, 0) / doms.length) : null,
      avg_concession_pct: concessions.length ? Math.round(concessions.reduce((a: number, b: number) => a + b, 0) / concessions.length * 10) / 10 : null,
      active_for_sale: (activeListings || []).length,
    }

    return {
      building,
      stats,
      recent_sales: sales,
      active_listings: activeListings || [],
    }
  }

  if (name === 'generate_plan') {`,
  'Fix 2 — add executeTool handler'
)

// ── 3. Upgrade system prompt with building + data usage rules
fix(
  'app/charlie/lib/charlie-prompts.ts',
  `IMPORTANT: When tool results arrive, weave them naturally into conversation.`,
  `BUILDING INTELLIGENCE RULES:
- If geoContext includes building_id OR user asks about a specific building, call get_building_intelligence immediately.
- Never answer building-specific price questions from general market data.
- Always cite actual sold units: "Unit 619 sold for $630K (2BR, 83 DOM)"
- If building has active listings, mention them: "Currently 1 unit listed at $395K"

MARKET DATA USAGE RULES:
- Always use specific numbers from tool results. Never say "prices are competitive" — say "$751K median".
- For bedroom questions: extract from bedroom_breakdown in analytics to give bedroom-specific pricing.
- For seller negotiation: always mention avg_concession_pct. "Sellers here accept X% below asking on average."
- For urgency: state months_of_inventory. "Only 1.8 months of inventory — act quickly."
- Always cite data period: "In the last 90 days..." or "Over the past 12 months..."
- Market condition: absorption_rate > 60% = Seller's Market, < 40% = Buyer's Market, else Balanced.

IMPORTANT: When tool results arrive, weave them naturally into conversation.`,
  'Fix 3 — upgrade system prompt'
)

console.log('\n✅ RAG Phase 1 complete')