// app/api/charlie/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { generatePropertySlug, generateHomePropertySlug } from '@/lib/utils/slugs'
import { CHARLIE_TOOLS } from '@/app/charlie/lib/charlie-tools'
import { buildCharlieSystemPrompt } from '@/app/charlie/lib/charlie-prompts'

const anthropic = new Anthropic()

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { messages, sessionId, userId, geoContext } = await req.json()
  console.log('[CHARLIE] request received, sessionId:', sessionId, 'userId:', userId)

  const supabase = createServiceClient()

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

  const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName) + geoReminder

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
                if (!userId) {
                  send({ type: 'gate', reason: 'register' })
                  send({ type: 'done' })
                  controller.close()
                  return
                }

                // Check plan usage against limits
                if (sessionData) {
                  const cfg = sessionData.agentConfig
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

                  if (plansUsed >= totalAllowed) {
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
      .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, median_lease_price, gross_rental_yield_pct, psf_trend_pct, dom_trend_pct, bedroom_breakdown, subtype_breakdown, price_trend_monthly')
      .eq('geo_type', input.geoType)
      .eq('geo_id', input.geoId)
      .eq('track', input.track)
      .eq('period_type', 'rolling_12mo')
      .maybeSingle()
    return { analytics: data, geoType: input.geoType, geoId: input.geoId, track: input.track }
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
    return { listings: data.listings || [], total: data.total || 0 }
  }

  return { error: 'Unknown tool' }
}