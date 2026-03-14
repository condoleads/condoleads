// app/api/charlie/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { generatePropertySlug, generateHomePropertySlug } from '@/lib/utils/slugs'
import { CHARLIE_TOOLS } from '@/app/charlie/lib/charlie-tools'
import { buildCharlieSystemPrompt } from '@/app/charlie/lib/charlie-prompts'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const { messages, sessionId, geoContext } = await req.json()
  const headersList = headers()
  const host = headersList.get('host') || ''

  const agent = await getAgentFromHost(host)
  const agentName = agent?.full_name || 'your agent'
  const brokerageName = agent?.brokerage_name || null
  const agentId = agent?.id || null

  const geoReminder = geoContext ? `

CURRENT GEO CONTEXT - use these EXACT values in ALL tool calls:
geoType: ${geoContext.geoType}
geoId: ${geoContext.geoId}
geoName: ${geoContext.geoName}
NEVER truncate the geoId.` : ""
const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName) + geoReminder

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let currentMessages = [...messages]
        let continueLoop = true

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            tools: CHARLIE_TOOLS as any,
            messages: currentMessages,
            stream: false,
          })

          // Collect text content
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
              const result = await executeTool(tool.name, tool.input, agentId, geoContext)
              send({ type: 'tool_result', tool: tool.name, data: result })
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: tool.id,
                content: JSON.stringify(result),
              })
            }

            // Add assistant message + tool results and continue
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
  const supabase = createClient()

  if (name === 'resolve_geo') {
    const query = input.query?.toLowerCase()
    // Try municipality first
    const { data: muni } = await supabase
      .from('municipalities')
      .select('id, name, slug, area_id')
      .ilike('name', `%${input.query}%`)
      .limit(1)
      .single()
    if (muni) return { geoType: 'municipality', geoId: muni.id, geoName: muni.name, slug: muni.slug }

    // Try community
    const { data: comm } = await supabase
      .from('communities')
      .select('id, name, slug, municipality_id')
      .ilike('name', `%${input.query}%`)
      .limit(1)
      .single()
    if (comm) return { geoType: 'community', geoId: comm.id, geoName: comm.name, slug: comm.slug }

    // Try area
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
      .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, median_lease_price, gross_rental_yield_pct, psf_trend_pct, dom_trend_pct')
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
    params.set('pageSize', String(input.limit || 6))
    if (input.propertyCategory && input.propertyCategory !== 'all') params.set('propertyCategory', input.propertyCategory)
    if (input.minPrice) params.set('minPrice', String(input.minPrice))
    if (input.maxPrice) params.set('maxPrice', String(input.maxPrice))
    if (input.beds && input.beds > 0) params.set('beds', String(input.beds))
    if (input.baths && input.baths > 0) params.set('baths', String(input.baths))
    if (input.sort) params.set('sort', input.sort)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/geo-listings?${params.toString()}`)
    const data = await res.json()
    const cat = input.propertyCategory === "condo" ? "Condos" : input.propertyCategory === "homes" ? "Homes" : "Listings"
    const sortLabel = input.sort === "price_asc" ? "(Lowest Priced)" : ""
    const geoName = geoContext ? geoContext.geoName : ""
    const CONDO_TYPES = ['Condo Apartment','Condo Townhouse','Co-op Apartment','Common Element Condo','Leasehold Condo','Detached Condo','Co-Ownership Apartment']
    const listingsWithSlugs = (data.listings || []).map((l: any) => {
      const isHome = l.property_type === 'Residential Freehold' || (!CONDO_TYPES.includes(l.property_subtype) && ['Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex','Fourplex','Multiplex'].includes(l.property_subtype))
      const slug = isHome ? generateHomePropertySlug(l) : generatePropertySlug(l)
      return { ...l, _slug: slug, _isHome: isHome }
    })
    return { listings: listingsWithSlugs, total: data.total || 0, label: (cat + " in " + geoName + " " + sortLabel).trim() }
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