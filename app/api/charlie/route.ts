// app/api/charlie/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { generatePropertySlug, generateHomePropertySlug } from '@/lib/utils/slugs'
import { CHARLIE_TOOLS } from '@/app/charlie/lib/charlie-tools'
import { buildCharlieSystemPrompt } from '@/app/charlie/lib/charlie-prompts'

export const maxDuration = 60 // seconds

function createAnthropicClient(apiKey?: string | null) {
  return new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { messages, sessionId, userId, geoContext } = await req.json()
  const tenantId = req.headers.get('x-tenant-id') || null
  console.log('[CHARLIE] request received, sessionId:', sessionId, 'userId:', userId)

  const supabase = createServiceClient()

  // Load tenant API key for this request
  let anthropicApiKey: string | null = null
  if (tenantId) {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('anthropic_api_key')
      .eq('id', tenantId)
      .single()
    anthropicApiKey = tenantRow?.anthropic_api_key || null
  }
  const anthropic = createAnthropicClient(anthropicApiKey)

  // Resolve agent + session from WALLiam session (NOT getAgentFromHost)
  let agentId: string | null = null
  let agentName = 'your agent'
  let brokerageName: string | null = null
  let sessionData: any = null

  if (sessionId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .select(`
        id, agent_id, user_id, status, source,
        buyer_plans_used, seller_plans_used,
        vip_messages_granted, manual_approvals_count
      `)
      .eq('id', sessionId)
      .eq('source', 'walliam')
      .single()

    if (session) {
      sessionData = session
      agentId = session.agent_id

      if (agentId) {
        const { data: agent } = await supabase
          .from('agents')
          .select('full_name, brokerage_name, ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap')
          .eq('id', agentId)
          .single()

        if (agent) {
          agentName = agent.full_name || 'your agent'
          brokerageName = agent.brokerage_name || null
          sessionData.agentConfig = agent
        }
      }
    }
  }

  const geoReminder = geoContext ? `

CURRENT GEO CONTEXT - use these EXACT values in ALL tool calls:
geoType: ${geoContext.geoType}
geoId: ${geoContext.geoId}
geoName: ${geoContext.geoName}
NEVER truncate the geoId.` : ''

  // Pre-load building intelligence if on a building page
  let buildingContext = ''
  if (geoContext?.building_id) {
    try {
      const buildingIntel = await executeTool('get_building_intelligence', { building_id: geoContext.building_id }, agentId, geoContext)
      if (buildingIntel && !buildingIntel.error) {
        const b = buildingIntel.building
        const s = buildingIntel.stats
        buildingContext = `

CURRENT BUILDING CONTEXT (pre-loaded — use this data directly):
Building: ${b?.building_name} at ${b?.canonical_address}
Total Units: ${b?.total_units || 'N/A'} | Year Built: ${b?.year_built || 'N/A'}
Active For Sale: ${s?.active_for_sale} | Sold Last 90 Days: ${s?.sold_last_90}
Median Sale Price: ${s?.median_sale_price?.toLocaleString() || 'N/A'} | Avg DOM: ${s?.avg_dom || 'N/A'} days
Avg Concession: ${s?.avg_concession_pct || 0}% below asking
Recent Sales: ${(buildingIntel.recent_sales || []).map((s: any) => `Unit ${s.unit_number}: ${s.bedrooms_total}BR sold ${s.close_price?.toLocaleString()} (${s.days_on_market} DOM)`).join(', ')}
Active Listings: ${(buildingIntel.active_listings || []).map((l: any) => `Unit ${l.unit_number}: ${l.bedrooms_total}BR at ${l.list_price?.toLocaleString()}`).join(', ') || 'None'}

  Building URL: https://walliam.ca/${b?.slug}
Use this data to answer building-specific questions immediately without calling get_building_intelligence again.`
      }
    } catch (e) {
      console.error('[CHARLIE] building pre-load error:', e)
    }
  }


  // Pre-load geo analytics if on a geo page (municipality/community/area)
  let geoAnalyticsContext = ''
  const geoPreloadId = geoContext?.municipality_id || geoContext?.community_id || geoContext?.area_id
  const geoPreloadType = geoContext?.municipality_id ? 'municipality' : geoContext?.community_id ? 'community' : geoContext?.area_id ? 'area' : null
  if (geoPreloadId && geoPreloadType && !geoContext?.building_id) {
    try {
      const { createClient: _sc } = await import('@supabase/supabase-js')
      const _db = _sc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data: geoA } = await _db
        .from('geo_analytics')
        .select('median_sale_price, avg_psf, closed_avg_dom_90, absorption_rate_pct, months_of_inventory, pct_sold_over_ask, avg_concession_pct, bedroom_breakdown, sale_to_list_ratio, active_count, closed_sale_count_90')
        .eq('geo_type', geoPreloadType)
        .eq('geo_id', geoPreloadId)
        .eq('period_type', 'rolling_12mo')
        .maybeSingle()
      if (geoA) {
        const absorption = geoA.absorption_rate_pct || 0
        const marketCondition = absorption > 60 ? "Seller's Market" : absorption < 40 ? "Buyer's Market" : "Balanced Market"
        const moi = geoA.months_of_inventory || 0
        const urgency = moi < 2 ? 'High' : moi < 4 ? 'Medium' : 'Low'
        const overAsk = geoA.pct_sold_over_ask || 0
        const underAsk = (100 - overAsk - (geoA.sale_to_list_ratio || 0))
        const negotiation = overAsk > 50 ? 'Over Ask' : moi > 4 ? 'Under Ask' : 'At Ask'
        let bedroomText = ''
        if (geoA.bedroom_breakdown) {
          try {
            const bd = typeof geoA.bedroom_breakdown === 'string' ? JSON.parse(geoA.bedroom_breakdown) : geoA.bedroom_breakdown
            bedroomText = Object.entries(bd).map(([k,v]: any) => `${k}BR: $${v?.median_price?.toLocaleString() || 'N/A'}`).join(', ')
          } catch {}
        }
        geoAnalyticsContext = `

CURRENT GEO ANALYTICS (pre-loaded — use this data directly, do not call get_market_analytics again):
Market Condition: ${marketCondition} | Urgency: ${urgency} | Negotiation: ${negotiation}
Median Sale Price: $${geoA.median_sale_price?.toLocaleString() || "N/A"} | Avg PSF: $${geoA.avg_psf?.toLocaleString() || "N/A"}
Avg DOM: ${geoA.closed_avg_dom_90 || "N/A"} days | Months of Inventory: ${moi}
Avg Concession: ${geoA.avg_concession_pct || 0}% below asking | Active Listings: ${geoA.active_count || 0}
${bedroomText ? `Price by Bedrooms: ${bedroomText}` : ""}
Use these exact numbers when answering market questions.`
      }
    } catch (e) {
      console.error('[CHARLIE] geo pre-load error:', e)
    }
  }
  const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName) + geoReminder + buildingContext + geoAnalyticsContext

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      console.log('[CHARLIE] stream started, messages:', JSON.stringify(messages?.slice(-1)))
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let currentMessages = [...messages]
        let continueLoop = true

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: systemPrompt,
            tools: CHARLIE_TOOLS as any,
            messages: currentMessages,
            stream: false,
          })

          // Collect text + tool uses
          let textContent = ''
          const toolUses: any[] = []

          for (const block of response.content) {
            if (block.type === 'text') {
              textContent += block.text
            } else if (block.type === 'tool_use') {
              toolUses.push(block)
            }
          }

          // Stream text word by word
          if (textContent) {
            const words = textContent.split(' ')
            for (const word of words) {
              send({ type: 'text', content: word + ' ' })
              await new Promise(r => setTimeout(r, 18))
            }
          }

          // Handle tool calls
          if (toolUses.length > 0) {
            const toolResults = []

            for (const tool of toolUses) {
              // ── PLAN GATING ──────────────────────────────────────────────
              if (tool.name === 'generate_plan') {
                const planType = tool.input?.type as 'buyer' | 'seller' | undefined

                // Anonymous user — must register first
                const effectiveUserId = userId || sessionData?.user_id || null
                if (!effectiveUserId) {
                  send({ type: 'gate', reason: 'register' })
                  send({ type: 'done' })
                  controller.close()
                  return
                }

                // Check plan usage against limits
                if (sessionData) {
                  // Load VIP config from tenant
                  let cfg = { ai_free_messages: 1, ai_auto_approve_limit: 2, ai_manual_approve_limit: 3, ai_hard_cap: 10 }
                  if (tenantId) {
                    const { data: tenantCfg } = await supabase.from('tenants').select('ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, vip_auto_approve').eq('id', tenantId).single()
                    if (tenantCfg) cfg = tenantCfg
                  }
                  const freePlans = cfg?.ai_free_messages ?? 1
                  const isVip = sessionData.status === 'vip'
                  const manualApprovalsCount = sessionData.manual_approvals_count || 0
                  let totalAllowed = freePlans
                  if (isVip) {
                    totalAllowed += cfg?.ai_auto_approve_limit ?? 2
                    totalAllowed += (cfg?.ai_manual_approve_limit ?? 3) * manualApprovalsCount
                  }
                  totalAllowed = Math.min(totalAllowed, cfg?.ai_hard_cap ?? 10)

                  const plansUsed = planType === 'seller'
                    ? (sessionData.seller_plans_used || 0)
                    : (sessionData.buyer_plans_used || 0)

                  if (plansUsed >= totalAllowed && !(cfg as any).vip_auto_approve) {
                    send({ type: 'gate', reason: 'vip_required', planType })
                    send({ type: 'done' })
                    controller.close()
                    return
                  }

                  // Allowed — increment plan counter
                  const updateField = planType === 'seller'
                    ? { seller_plans_used: plansUsed + 1 }
                    : { buyer_plans_used: plansUsed + 1 }

                  await supabase
                    .from('chat_sessions')
                    .update({
                      ...updateField,
                      last_activity_at: new Date().toISOString(),
                    })
                    .eq('id', sessionId)

                  // Notify frontend — registered user used a VIP credit

                  // Low credit warning email — fire when 1 plan remaining
                  const plansRemaining = totalAllowed - (plansUsed + 1)
                  if (plansRemaining === 1 && sessionData?.user_id) {
                    fetch(new URL('/api/email/low-credits', process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca').toString(), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: sessionData.user_id,
                        creditType: 'plan',
                        remaining: 1,
                        sessionId,
                      }),
                    }).catch(err => console.error('[charlie] low credit email error:', err))
                  }
                  send({ type: 'vip_credit_used', plansUsed: plansUsed + 1, totalAllowed, planType })
                  // Send plan email notification to user
                }
              }
              // ── END PLAN GATING ──────────────────────────────────────────

              const result = await executeTool(tool.name, tool.input, agentId, geoContext)
              send({ type: 'tool_result', tool: tool.name, data: result })
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: tool.id,
                content: JSON.stringify(result),
              })
            }

            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: response.content },
              { role: 'user', content: toolResults },
            ]
          } else {
            continueLoop = false
          }

          if (response.stop_reason === 'end_turn' && toolUses.length === 0) {
            continueLoop = false
          }
        }

        // Update session activity
        if (sessionId) {
          await supabase
            .from('chat_sessions')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', sessionId)
        }

        send({ type: 'done' })
        controller.close()
      } catch (err: any) {
        send({ type: 'error', message: err.message })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}

async function executeTool(name: string, input: any, agentId: string | null, geoContext?: any): Promise<any> {
  const supabase = createServiceClient()

  if (name === 'resolve_geo') {
    const { data: muni } = await supabase
      .from('municipalities')
      .select('id, name, slug, area_id')
      .ilike('name', `%${input.query}%`)
      .limit(1)
      .single()
    if (muni) return { geoType: 'municipality', geoId: muni.id, geoName: muni.name, slug: muni.slug }

    const { data: comm } = await supabase
      .from('communities')
      .select('id, name, slug, municipality_id')
      .ilike('name', `%${input.query}%`)
      .limit(1)
      .single()
    if (comm) return { geoType: 'community', geoId: comm.id, geoName: comm.name, slug: comm.slug }

    const { data: area } = await supabase
      .from('treb_areas')
      .select('id, name, slug')
      .ilike('name', `%${input.query}%`)
      .limit(1)
      .single()
    if (area) return { geoType: 'area', geoId: area.id, geoName: area.name, slug: area.slug }

    return { error: 'Location not found', query: input.query }
  }

  if (name === 'get_market_analytics') {
    const { data } = await supabase
      .from('geo_analytics')
      .select('median_psf, avg_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, months_of_inventory, active_count, closed_sale_count_90, median_lease_price, gross_rental_yield_pct, psf_trend_pct, dom_trend_pct, bedroom_breakdown, subtype_breakdown, price_trend_monthly, insight_seasonal, avg_concession_pct, pct_sold_over_ask, pct_sold_under_ask, pct_sold_at_ask, median_sale_price, avg_sale_price, p25_sale_price, p75_sale_price, stale_listing_pct, new_listings_7d')
      .eq('geo_type', input.geoType)
      .eq('geo_id', input.geoId)
      .eq('track', input.track)
      .eq('period_type', 'rolling_12mo')
      .maybeSingle()
    // Compute derived insights from raw analytics
    let computed: any = {}
    if (data) {
      // Market condition
      const absorption = data.absorption_rate_pct || 0
      computed.market_condition = absorption > 60 ? "Seller's Market" : absorption < 40 ? "Buyer's Market" : "Balanced Market"

      // Negotiation signal
      const overAsk = data.pct_sold_over_ask || 0
      const underAsk = data.pct_sold_under_ask || 0
      computed.negotiation_signal = overAsk > underAsk ? 'Over Ask' : underAsk > overAsk ? 'Under Ask' : 'At Ask'

      // Urgency
      const moi = data.months_of_inventory || 99
      computed.urgency = moi < 2 ? 'High' : moi < 4 ? 'Medium' : 'Low'

      // Bedroom pricing from bedroom_breakdown JSONB
      if (data.bedroom_breakdown) {
        try {
          const bd = typeof data.bedroom_breakdown === 'string' ? JSON.parse(data.bedroom_breakdown) : data.bedroom_breakdown
          computed.bedroom_pricing = bd
        } catch {}
      }
    }
    return { analytics: data, computed, geoType: input.geoType, geoId: input.geoId, track: input.track }
  }

  if (name === 'search_listings') {
    console.log('[CHARLIE search_listings]', JSON.stringify(input))
    const params = new URLSearchParams()
    params.set('geoType', input.geoType)
    params.set('geoId', input.geoId)
    params.set('tab', input.status === 'for-lease' ? 'for-lease' : 'for-sale')
    params.set('page', '1')
    params.set('pageSize', String(input.limit || 10))
    if (input.propertyCategory && input.propertyCategory !== 'all') params.set('propertyCategory', input.propertyCategory)
    if (input.minPrice) params.set('minPrice', String(input.minPrice))
    if (input.maxPrice) params.set('maxPrice', String(input.maxPrice))
    if (input.beds && input.beds > 0) params.set('beds', String(input.beds))
    if (input.baths && input.baths > 0) params.set('baths', String(input.baths))
    if (input.sort) params.set('sort', input.sort)
    if (input.propertySubtype) params.set('propertySubtype', input.propertySubtype)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/geo-listings?${params.toString()}`)
    const data = await res.json()
    const cat = input.propertyCategory === 'condo' ? 'Condos' : input.propertyCategory === 'homes' ? 'Homes' : 'Listings'
    const sortLabel = input.sort === 'price_asc' ? '(Lowest Priced)' : ''
    const geoName = geoContext ? geoContext.geoName : ''
    const CONDO_TYPES = ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment', 'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']
    const listingsWithSlugs = (data.listings || []).map((l: any) => {
      const isHome = l.property_type === 'Residential Freehold' || (!CONDO_TYPES.includes(l.property_subtype) && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].includes(l.property_subtype))
      const slug = isHome ? generateHomePropertySlug(l) : generatePropertySlug(l)
      return { ...l, _slug: slug, _isHome: isHome }
    })
    return { listings: listingsWithSlugs, total: data.total || 0, label: (cat + ' in ' + geoName + ' ' + sortLabel).trim() }
  }

  if (name === 'get_building_intelligence') {
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
    const concessions = sales.map((s: any) => s.close_price && s.list_price ? ((s.list_price - s.close_price) / s.list_price * 100) : null).filter((v: any): v is number => v !== null)
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

  if (name === 'generate_plan') {
    return {
      type: input.type,
      geoName: input.geoName,
      budgetMin: input.budgetMin || null,
      budgetMax: input.budgetMax || null,
      propertyType: input.propertyType || null,
      bedrooms: input.bedrooms || null,
      timeline: input.timeline || null,
      goal: input.goal || null,
      estimatedValueMin: input.estimatedValueMin || null,
      estimatedValueMax: input.estimatedValueMax || null,
        summary: input.summary || null,
      planReady: true,
    }
  }

  if (name === 'get_comparables') {
    const params = new URLSearchParams()
    params.set('geoType', input.geoType)
    params.set('geoId', input.geoId)
    params.set('tab', 'sold')
    params.set('page', '1')
    params.set('pageSize', '6')
    if (input.propertyCategory) params.set('propertyCategory', input.propertyCategory)
    if (input.minPrice) params.set('minPrice', String(input.minPrice))
    if (input.maxPrice) params.set('maxPrice', String(input.maxPrice))

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/geo-listings?${params.toString()}`)
    const data = await res.json()
    const CONDO_TYPES = ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment', 'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']
    const listingsWithSlugs = (data.listings || []).map((l: any) => {
      const isHome = l.property_type === 'Residential Freehold' || (!CONDO_TYPES.includes(l.property_subtype) && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].includes(l.property_subtype))
      const slug = isHome ? generateHomePropertySlug(l) : generatePropertySlug(l)
      return { ...l, _slug: slug, _isHome: isHome }
    })
    return { listings: listingsWithSlugs, total: data.total || 0 }
  }


  if (name === 'search_buildings') {
    const { geoType, geoId, sort = 'active_count', limit = 5 } = input
    const baseUrl = 'https://walliam.ca'
    let communityIds: string[] = []
    if (geoType === 'municipality') {
      const { data: comms } = await supabase.from('communities').select('id').eq('municipality_id', geoId)
      communityIds = (comms || []).map((c: any) => c.id)
    } else if (geoType === 'community') {
      communityIds = [geoId]
    }
    if (communityIds.length === 0) return { buildings: [] }
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, year_built, total_units, cover_photo_url')
      .in('community_id', communityIds)
      .limit(500)
    const bIds = (buildings || []).map((b: any) => b.id)
    if (bIds.length === 0) return { buildings: [] }
    const { data: analytics } = await supabase
      .from('geo_analytics')
      .select('geo_id, active_count, median_sale_price, avg_psf, median_maint_fee, gross_rental_yield_pct, closed_sale_count_90')
      .eq('geo_type', 'building')
      .eq('period_type', 'rolling_12mo')
      .eq('track', 'condo')
      .in('geo_id', bIds)
      .limit(1000)
    const aMap: any = {}
    for (const a of (analytics || [])) aMap[a.geo_id] = a
    let results = (buildings || []).map((b: any) => ({ ...b, url: baseUrl + '/' + b.slug, ...(aMap[b.id] || {}) }))
    if (sort === 'price_asc') results.sort((a: any, b: any) => (a.median_sale_price || Infinity) - (b.median_sale_price || Infinity))
    else if (sort === 'price_desc') results.sort((a: any, b: any) => (b.median_sale_price || 0) - (a.median_sale_price || 0))
    else if (sort === 'maintenance_asc') results.sort((a: any, b: any) => (a.median_maint_fee || Infinity) - (b.median_maint_fee || Infinity))
    else results.sort((a: any, b: any) => (b.active_count || 0) - (a.active_count || 0))
    return { buildings: results.slice(0, limit) }
  }

  if (name === 'compare_geo') {
    const { geoIds, geoType, track = 'condo' } = input
    if (!geoIds || !Array.isArray(geoIds)) return { error: 'geoIds array required' }
    const baseUrl = 'https://walliam.ca'
    const comparisons = await Promise.all(geoIds.map(async (id: string) => {
      const { data: analytics } = await supabase
        .from('geo_analytics')
        .select('median_sale_price, avg_psf, psf_trend_pct, active_count, months_of_inventory, sale_to_list_ratio, pct_sold_over_ask, avg_concession_pct, closed_avg_dom_90, gross_rental_yield_pct, median_maint_fee, absorption_rate_pct, bedroom_breakdown')
        .eq('geo_type', geoType)
        .eq('geo_id', id)
        .eq('period_type', 'rolling_12mo')
        .eq('track', track)
        .single()
      let geoName = '', geoSlug = ''
      if (geoType === 'municipality') {
        const { data: m } = await supabase.from('municipalities').select('name, slug').eq('id', id).single()
        geoName = m?.name || ''; geoSlug = m?.slug || ''
      } else if (geoType === 'community') {
        const { data: cm } = await supabase.from('communities').select('name, slug').eq('id', id).single()
        geoName = cm?.name || ''; geoSlug = cm?.slug || ''
      }
      return { geoId: id, name: geoName, slug: geoSlug, url: baseUrl + '/' + geoSlug, analytics: analytics || null }
    }))
    return { comparisons, track }
  }

  if (name === 'get_price_trends') {
    const { geoType, geoId, track = 'condo' } = input
    const { data: analytics } = await supabase
      .from('geo_analytics')
      .select('price_trend_monthly, dom_trend_monthly, volume_trend_monthly, lease_trend_monthly, median_sale_price, avg_psf, psf_trend_pct, insight_seasonal, median_lease_price')
      .eq('geo_type', geoType)
      .eq('geo_id', geoId)
      .eq('period_type', 'rolling_12mo')
      .eq('track', track)
      .single()
    if (!analytics) return { error: 'No price trend data available for this area' }
    return {
      price_trend_monthly: analytics.price_trend_monthly,
      dom_trend_monthly: analytics.dom_trend_monthly,
      volume_trend_monthly: analytics.volume_trend_monthly,
      lease_trend_monthly: analytics.lease_trend_monthly,
      current_median_sale: analytics.median_sale_price,
      current_avg_psf: analytics.avg_psf,
      psf_trend_pct: analytics.psf_trend_pct,
      current_median_lease: analytics.median_lease_price,
      insight_seasonal: analytics.insight_seasonal,
    }
  }

  if (name === 'get_investment_rankings') {
    const { parentGeoType, parentGeoId, track = 'condo', rankingType = 'best_yield' } = input
    const baseUrl = 'https://walliam.ca'
    const { data } = await supabase
      .from('geo_rankings')
      .select('ranking_type, ranked_entity, results')
      .eq('parent_geo_type', parentGeoType)
      .eq('parent_geo_id', parentGeoId)
      .eq('track', track)
      .eq('ranking_type', rankingType)
      .limit(5)
    if (!data || data.length === 0) return { rankings: [], ranking_type: rankingType }
    const results = (data[0]?.results || []).map((r: any) => ({ ...r, url: baseUrl + '/' + r.entity_slug }))
    return { ranking_type: rankingType, track, ranked_entity: data[0]?.ranked_entity, rankings: results }
  }

  if (name === 'get_inventory_rankings') {
    const { parentGeoType, parentGeoId, track = 'condo' } = input
    const baseUrl = 'https://walliam.ca'
    const { data } = await supabase
      .from('geo_rankings')
      .select('ranking_type, ranked_entity, results')
      .eq('parent_geo_type', parentGeoType)
      .eq('parent_geo_id', parentGeoId)
      .eq('track', track)
      .in('ranking_type', ['fastest_selling', 'slowest_moving', 'highest_price_reduction', 'best_concession_opportunity'])
      .limit(20)
    if (!data || data.length === 0) return { rankings: {} }
    const grouped: any = {}
    for (const row of data) {
      grouped[row.ranking_type] = (row.results || []).map((r: any) => ({ ...r, url: baseUrl + '/' + r.entity_slug }))
    }
    return { rankings: grouped, track }
  }

  if (name === 'get_seasonal_trends') {
    const { geoType, geoId, track = 'condo' } = input
    const { data: analytics } = await supabase
      .from('geo_analytics')
      .select('insight_seasonal, insight_value_migration, insight_demand_mismatch, insight_reentry, insight_concession_matrix, median_sale_price, active_count, months_of_inventory, new_listings_7d')
      .eq('geo_type', geoType)
      .eq('geo_id', geoId)
      .eq('period_type', 'rolling_12mo')
      .eq('track', track)
      .single()
    if (!analytics) return { error: 'No seasonal data available for this area' }
    return {
      insight_seasonal: analytics.insight_seasonal,
      insight_value_migration: analytics.insight_value_migration,
      insight_demand_mismatch: analytics.insight_demand_mismatch,
      insight_reentry: analytics.insight_reentry,
      insight_concession_matrix: analytics.insight_concession_matrix,
      context: { median_sale_price: analytics.median_sale_price, active_count: analytics.active_count, months_of_inventory: analytics.months_of_inventory, new_listings_7d: analytics.new_listings_7d }
    }
  }

  if (name === 'get_building_directory') {
    const { geoType, geoId, limit = 20 } = input
    const baseUrl = 'https://walliam.ca'
    let communityIds: string[] = []
    if (geoType === 'municipality') {
      const { data: comms } = await supabase.from('communities').select('id').eq('municipality_id', geoId)
      communityIds = (comms || []).map((c: any) => c.id)
    } else if (geoType === 'community') {
      communityIds = [geoId]
    }
    if (communityIds.length === 0) return { buildings: [] }
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, year_built, total_units')
      .in('community_id', communityIds)
      .order('building_name')
      .limit(limit)
    return { buildings: (buildings || []).map((b: any) => ({ ...b, url: baseUrl + '/' + b.slug })) }
  }

  return { error: 'Unknown tool' }
}