// app/api/chat/vip-upgrade/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, phone } = await request.json()
    const supabase = createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify session belongs to user and get current message count
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*, agents(full_name, email, notification_email)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Calculate new message limit: current count + 10
    const currentCount = session.message_count || 0
    const newLimit = currentCount + 10

    // Update session with VIP status and message grant
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        status: 'vip',
        vip_accepted_at: new Date().toISOString(),
        vip_phone: phone || null,
        vip_messages_granted: newLimit,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Error upgrading to VIP:', updateError)
      return NextResponse.json(
        { error: 'Failed to upgrade' },
        { status: 500 }
      )
    }

    console.log('VIP Upgrade:', { sessionId, currentCount, newLimit, phone: phone ? 'provided' : 'none' })

    // Update lead if exists, or create one
    if (session.lead_id) {
      await supabase
        .from('leads')
        .update({
          contact_phone: phone || undefined,
          quality: 'hot',
          notes: `VIP upgrade from AI chat - granted ${newLimit} messages`,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.lead_id)
    } else {
      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      // Create new lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          agent_id: session.agent_id,
          contact_name: profile?.full_name || 'VIP Chat User',
          contact_email: user.email,
          contact_phone: phone || '',
          source: 'ai_chatbot_vip',
          quality: 'hot',
          status: 'new',
          notes: `VIP upgrade from AI chat - granted ${newLimit} messages`
        })
        .select()
        .single()

      if (newLead) {
        // Link lead to session
        await supabase
          .from('chat_sessions')
          .update({ lead_id: newLead.id })
          .eq('id', sessionId)
      }
    }

    return NextResponse.json({
      success: true,
      messagesRemaining: 10,
      messageLimit: newLimit,
      message: 'Upgraded to VIP successfully'
    })

  } catch (error) {
    console.error('VIP upgrade error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
