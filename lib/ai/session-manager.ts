// lib/ai/session-manager.ts
import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

export interface ChatSession {
  id: string
  sessionToken: string
  agentId: string
  userId: string
  status: 'active' | 'vip' | 'closed'
  messageCount: number
  vipPromptedAt: string | null
  vipAcceptedAt: string | null
  vipPhone: string | null
  currentPageType: string | null
  currentPageId: string | null
  currentPageSlug: string | null
  preferences: Record<string, unknown>
  buildingsDiscussed: string[]
  listingsDiscussed: string[]
  leadId: string | null
}

export async function getOrCreateSession(
  agentId: string,
  userId: string
): Promise<ChatSession | null> {
  const supabase = createClient()

  // Try to find existing active session
  const { data: existing, error: findError } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .in('status', ['active', 'vip'])
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .single()

  if (existing && !findError) {
    return mapSessionFromDb(existing)
  }

  // Create new session
  const sessionToken = uuidv4()
  const { data: newSession, error: createError } = await supabase
    .from('chat_sessions')
    .insert({
      agent_id: agentId,
      user_id: userId,
      session_token: sessionToken,
      status: 'active',
      message_count: 0
    })
    .select()
    .single()

  if (createError) {
    console.error('Error creating chat session:', createError)
    return null
  }

  return mapSessionFromDb(newSession)
}

export async function getSessionByToken(sessionToken: string): Promise<ChatSession | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('session_token', sessionToken)
    .single()

  if (error || !data) return null
  return mapSessionFromDb(data)
}

export async function updateSessionContext(
  sessionId: string,
  context: {
    pageType?: string
    pageId?: string
    pageSlug?: string
    buildingId?: string
    listingId?: string
  }
): Promise<void> {
  const supabase = createClient()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (context.pageType) updates.current_page_type = context.pageType
  if (context.pageId) updates.current_page_id = context.pageId
  if (context.pageSlug) updates.current_page_slug = context.pageSlug

  // Add to arrays if provided
  if (context.buildingId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('buildings_discussed')
      .eq('id', sessionId)
      .single()

    const buildings = session?.buildings_discussed || []
    if (!buildings.includes(context.buildingId)) {
      updates.buildings_discussed = [...buildings, context.buildingId]
    }
  }

  if (context.listingId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('listings_discussed')
      .eq('id', sessionId)
      .single()

    const listings = session?.listings_discussed || []
    if (!listings.includes(context.listingId)) {
      updates.listings_discussed = [...listings, context.listingId]
    }
  }

  await supabase
    .from('chat_sessions')
    .update(updates)
    .eq('id', sessionId)
}

export async function markVipPrompted(sessionId: string): Promise<void> {
  const supabase = createClient()

  await supabase
    .from('chat_sessions')
    .update({
      vip_prompted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
}

export async function upgradeToVip(
  sessionId: string,
  phone?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('chat_sessions')
    .update({
      status: 'vip',
      vip_accepted_at: new Date().toISOString(),
      vip_phone: phone || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)

  if (error) {
    console.error('Error upgrading to VIP:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  pageContext?: Record<string, unknown>,
  marketDataUsed?: Record<string, unknown>,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<void> {
  const supabase = createClient()

  await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      page_context: pageContext || null,
      market_data_used: marketDataUsed || null,
      tokens_used: tokensUsed || null,
      response_time_ms: responseTimeMs || null
    })
}

export async function getSessionMessages(
  sessionId: string,
  limit = 50
): Promise<{ role: string; content: string }[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Error fetching messages:', error)
    return []
  }

  return data || []
}

export async function linkSessionToLead(sessionId: string, leadId: string): Promise<void> {
  const supabase = createClient()

  await supabase
    .from('chat_sessions')
    .update({
      lead_id: leadId,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
}

export async function checkShouldPromptVip(
  session: ChatSession,
  vipThreshold: number
): Promise<boolean> {
  // Already VIP
  if (session.status === 'vip') return false
  
  // Already prompted and declined recently (within 5 messages)
  if (session.vipPromptedAt) {
    const promptedCount = session.messageCount
    // Don't prompt again until 5 more messages after last prompt
    if (promptedCount < vipThreshold + 5) return false
  }

  // Check if at threshold
  return session.messageCount >= vipThreshold
}

function mapSessionFromDb(data: Record<string, unknown>): ChatSession {
  return {
    id: data.id as string,
    sessionToken: data.session_token as string,
    agentId: data.agent_id as string,
    userId: data.user_id as string,
    status: data.status as 'active' | 'vip' | 'closed',
    messageCount: data.message_count as number,
    vipPromptedAt: data.vip_prompted_at as string | null,
    vipAcceptedAt: data.vip_accepted_at as string | null,
    vipPhone: data.vip_phone as string | null,
    currentPageType: data.current_page_type as string | null,
    currentPageId: data.current_page_id as string | null,
    currentPageSlug: data.current_page_slug as string | null,
    preferences: (data.preferences as Record<string, unknown>) || {},
    buildingsDiscussed: (data.buildings_discussed as string[]) || [],
    listingsDiscussed: (data.listings_discussed as string[]) || [],
    leadId: data.lead_id as string | null
  }
}