// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getBuildingMarketContext, getCommunityMarketContext, getListingMarketContext, buildMarketDataPrompt, MarketContext } from '@/lib/ai/context-builder'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  context: {
    pageType: 'home' | 'building' | 'property'
    buildingName?: string
    buildingAddress?: string
    buildingId?: string
    communityId?: string
    listingId?: string
    unitNumber?: string
    listPrice?: number
    bedrooms?: number
    bathrooms?: number
    agentId: string
    agentName: string
    vipThreshold: number
  }
  sessionId?: string
  userId?: string
}

function buildSystemPrompt(
  context: ChatRequest['context'], 
  agentCustomPrompt: string | null,
  marketDataPrompt: string,
  isVip: boolean
): string {
  const basePrompt = `You are a friendly, professional real estate assistant for ${context.agentName}, a Toronto condo specialist. Your role is to:
1. Answer questions about condos, buildings, and listings using REAL market data
2. Help visitors find the right condo for their needs
3. Provide accurate pricing and investment insights
4. Connect serious buyers with ${context.agentName} when ready

Guidelines:
- Be warm, helpful, and conversational
- Keep responses concise (2-3 sentences usually, more for detailed questions)
- ALWAYS use the market data provided below when answering pricing/investment questions
- Cite data sources: "Based on X transactions..." or "The average in this building..."
- If you don't have specific data, say so honestly
- ${isVip ? 'This is a VIP user - provide extra detailed analysis and recommendations' : 'Encourage the user to become a VIP for unlimited access'}

${agentCustomPrompt ? `\nAgent's Custom Instructions:\n${agentCustomPrompt}\n` : ''}
`

  let pageContext = ''
  if (context.pageType === 'home') {
    pageContext = `
The visitor is on the homepage browsing available buildings.
Help them explore options based on their preferences: location, budget, size, timeline.`
  } else if (context.pageType === 'building') {
    pageContext = `
The visitor is viewing: ${context.buildingName}
Address: ${context.buildingAddress}

Help them understand this building's value, pricing trends, and investment potential.`
  } else if (context.pageType === 'property') {
    pageContext = `
The visitor is viewing a specific unit:
Building: ${context.buildingName}
${context.unitNumber ? `Unit: ${context.unitNumber}` : ''}
${context.listPrice ? `List Price: $${context.listPrice.toLocaleString()}` : ''}
${context.bedrooms ? `Bedrooms: ${context.bedrooms}` : ''}
${context.bathrooms ? `Bathrooms: ${context.bathrooms}` : ''}

Answer questions about this specific unit. Help them understand if it's a good value.`
  }

  return basePrompt + pageContext + marketDataPrompt
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body: ChatRequest = await request.json()
    const { messages, context, sessionId, userId } = body

    const supabase = createClient()
    
    // Verify userId from request body (client already authenticated via ChatWidgetWrapper)
    if (!userId) {
      console.log(' Chat API auth check: No userId provided')
      return NextResponse.json(
        { error: 'Please log in to use the chat' },
        { status: 401 }
      )
    }
    
    console.log(' Chat API auth check: userId verified', { userId })
    const user = { id: userId }

    // Get agent's settings
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('anthropic_api_key, full_name, ai_chat_enabled, ai_system_prompt, ai_vip_message_threshold')
      .eq('id', context.agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    if (!agent.ai_chat_enabled || !agent.anthropic_api_key) {
      return NextResponse.json(
        { error: 'AI chat is not enabled for this agent.' },
        { status: 400 }
      )
    }

    // Get or verify session
    let session = null
    let messageCount = 0
    let isVip = false

    if (sessionId) {
      const { data: existingSession } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single()

      if (existingSession) {
        session = existingSession
        messageCount = existingSession.message_count || 0
        isVip = existingSession.status === 'vip'
      }
    }

    // Build market data context
    const marketContext: MarketContext = {}

    if (context.buildingId) {
      marketContext.building = await getBuildingMarketContext(context.buildingId) || undefined
      
      // Get community context if we have building
      if (context.communityId) {
        marketContext.community = await getCommunityMarketContext(context.communityId) || undefined
      }
    }

    if (context.listingId && marketContext.building) {
      marketContext.listing = await getListingMarketContext(context.listingId, marketContext.building) || undefined
    }

    const marketDataPrompt = buildMarketDataPrompt(marketContext)

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      context, 
      agent.ai_system_prompt, 
      marketDataPrompt,
      isVip
    )

    // Create Anthropic client
    const anthropic = new Anthropic({
      apiKey: agent.anthropic_api_key
    })

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: isVip ? 1000 : 500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    const responseTime = Date.now() - startTime
    const tokensUsed = response.usage?.input_tokens + response.usage?.output_tokens

    // Save messages to database
    if (session) {
      // Save user message
      const userMsg = messages[messages.length - 1]
      await supabase.from('chat_messages').insert({
        session_id: session.id,
        role: 'user',
        content: userMsg.content,
        page_context: {
          pageType: context.pageType,
          buildingId: context.buildingId,
          listingId: context.listingId
        }
      })

      // Save assistant message
      await supabase.from('chat_messages').insert({
        session_id: session.id,
        role: 'assistant',
        content: assistantMessage,
        market_data_used: marketContext,
        tokens_used: tokensUsed,
        response_time_ms: responseTime
      })

      // Update session context
      await supabase
        .from('chat_sessions')
        .update({
          current_page_type: context.pageType,
          current_page_id: context.buildingId || context.listingId,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', session.id)
    }

    // Check if should show VIP prompt
    const vipThreshold = agent.ai_vip_message_threshold || 5
    const newMessageCount = messageCount + 1
    let showVipPrompt = false

    if (!isVip && session) {
      // Show VIP prompt at threshold, and every 5 messages after if declined
      if (newMessageCount === vipThreshold) {
        showVipPrompt = true
      } else if (session.vip_prompted_at && newMessageCount >= vipThreshold + 5) {
        // Check if 5 messages since last prompt
        const messagesSincePrompt = newMessageCount - vipThreshold
        if (messagesSincePrompt % 5 === 0) {
          showVipPrompt = true
        }
      }
    }

    return NextResponse.json({
      message: assistantMessage,
      messageCount: newMessageCount,
      sessionStatus: isVip ? 'vip' : 'active',
      showVipPrompt,
      tokensUsed,
      responseTimeMs: responseTime
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    )
  }
}
