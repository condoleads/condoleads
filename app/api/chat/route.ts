import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateLead } from '@/lib/actions/leads'

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
    listingId?: string
    unitNumber?: string
    listPrice?: number
    bedrooms?: number
    bathrooms?: number
    agentId: string
    agentName: string
  }
  leadInfo?: {
    name?: string
    email?: string
    phone?: string
  }
}

function buildSystemPrompt(context: ChatRequest['context']): string {
  const basePrompt = `You are a friendly, professional real estate assistant for a Toronto condo specialist team. Your role is to:
1. Answer questions about condos, buildings, and listings
2. Help visitors find the right condo for their needs
3. Prequalify leads by understanding their budget, timeline, and preferences
4. Capture contact information when appropriate
5. Schedule viewings or connect them with an agent when ready

Guidelines:
- Be warm, helpful, and conversational
- Keep responses concise (2-3 sentences usually)
- Ask one question at a time to prequalify
- When someone seems interested, naturally ask for their contact info
- If they provide contact info, confirm you'll have the agent reach out
- Never make up information about specific listings or prices
- If you don't know something specific, offer to have the agent follow up

Agent for this site: ${context.agentName}
`

  if (context.pageType === 'home') {
    return basePrompt + `
The visitor is on the homepage browsing available buildings.
Help them explore options and find what they're looking for.
Ask about their preferences: location, budget, size, timeline.`
  }

  if (context.pageType === 'building') {
    return basePrompt + `
The visitor is viewing: ${context.buildingName}
Address: ${context.buildingAddress}

Help them learn about this building - amenities, units available, pricing trends.
If they're interested, help prequalify them and capture their info.`
  }

  if (context.pageType === 'property') {
    return basePrompt + `
The visitor is viewing a specific unit:
Building: ${context.buildingName}
${context.unitNumber ? `Unit: ${context.unitNumber}` : ''}
${context.listPrice ? `List Price: $${context.listPrice.toLocaleString()}` : ''}
${context.bedrooms ? `Bedrooms: ${context.bedrooms}` : ''}
${context.bathrooms ? `Bathrooms: ${context.bathrooms}` : ''}

They're likely interested in this specific unit. Answer questions about it.
Help them schedule a viewing or make an offer if interested.
Capture their contact info to have the agent follow up.`
  }

  return basePrompt
}

function extractLeadInfo(messages: ChatMessage[]): { name?: string; email?: string; phone?: string } {
  const allText = messages.map(m => m.content).join(' ')

  // Extract email
  const emailMatch = allText.match(/[\w.-]+@[\w.-]+\.\w+/)
  const email = emailMatch ? emailMatch[0] : undefined

  // Extract phone (various formats)
  const phoneMatch = allText.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/)
  const phone = phoneMatch ? phoneMatch[0] : undefined

  // Extract name (harder - look for "I'm X" or "My name is X" patterns)
  const namePatterns = [
    /(?:I'm|I am|my name is|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+here/i
  ]
  let name: string | undefined
  for (const pattern of namePatterns) {
    const match = allText.match(pattern)
    if (match) {
      name = match[1]
      break
    }
  }

  return { name, email, phone }
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { messages, context, leadInfo } = body

    // Get agent's API key from database
    const supabase = createClient()
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('anthropic_api_key, full_name')
      .eq('id', context.agentId)
      .single()

    if (agentError || !agent) {
      console.error('Error fetching agent:', agentError)
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    if (!agent.anthropic_api_key) {
      console.error('Agent does not have an Anthropic API key configured:', context.agentId)
      return NextResponse.json(
        { error: 'AI chat is not configured for this agent. Please contact the agent directly.' },
        { status: 400 }
      )
    }

    // Create Anthropic client with agent's API key
    const anthropic = new Anthropic({
      apiKey: agent.anthropic_api_key
    })

    // Build system prompt based on context
    const systemPrompt = buildSystemPrompt(context)

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Extract lead info from conversation
    const extractedInfo = extractLeadInfo(messages)
    const finalLeadInfo = {
      name: leadInfo?.name || extractedInfo.name,
      email: leadInfo?.email || extractedInfo.email,
      phone: leadInfo?.phone || extractedInfo.phone
    }

    // If we have email, create/update lead
    let leadCreated = false
    if (finalLeadInfo.email && context.agentId) {
      try {
        await getOrCreateLead({
          agentId: context.agentId,
          contactName: finalLeadInfo.name || 'Chat Visitor',
          contactEmail: finalLeadInfo.email,
          contactPhone: finalLeadInfo.phone || '',
          source: 'ai_chatbot',
          buildingId: context.buildingId,
          listingId: context.listingId,
          propertyDetails: {
            buildingName: context.buildingName,
            buildingAddress: context.buildingAddress,
            unitNumber: context.unitNumber
          },
          message: `AI Chat Conversation:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}\nassistant: ${assistantMessage}`
        })
        leadCreated = true
      } catch (err) {
        console.error('Error creating lead from chat:', err)
      }
    }

    return NextResponse.json({
      message: assistantMessage,
      leadInfo: finalLeadInfo,
      leadCreated
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    )
  }
}