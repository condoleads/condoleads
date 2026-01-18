// components/chat/ChatWidgetWrapper.tsx
'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ChatWidget from './ChatWidget'
import ChatLocked from './ChatLocked'

interface ChatWidgetWrapperProps {
  agent: {
    id: string
    full_name: string
    ai_chat_enabled?: boolean
    has_api_key?: boolean
    ai_welcome_message?: string | null
    ai_vip_message_threshold?: number | null
  }
  building?: {
    id: string
    building_name: string
    canonical_address: string
    community_id?: string
  } | null
  listing?: {
    id: string
    unit_number?: string
    list_price?: number
    bedrooms_total?: number
    bathrooms_total?: number
  } | null
}

export default function ChatWidgetWrapper({
  agent,
  building,
  listing
}: ChatWidgetWrapperProps) {
  const pathname = usePathname()
  const [user, setUser] = useState<{ id: string; email: string; name?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          name: authUser.user_metadata?.full_name
        })
      }
      setIsLoading(false)
    }

    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name
        })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Skip chat on admin/dashboard pages
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return null
  }

  // Check if AI chat is enabled for this agent
  const aiEnabled = agent.ai_chat_enabled && agent.has_api_key

  // If AI not enabled, don't show chat at all
  if (!aiEnabled) {
    return null
  }

  // Show nothing while checking auth (prevents hydration mismatch)
  if (isLoading) {
    return null
  }

  // If user not logged in, show locked state
  if (!user) {
    return <ChatLocked agentName={agent.full_name} />
  }

  // Determine page type
  let pageType: 'home' | 'building' | 'property' = 'home'
  if (listing) {
    pageType = 'property'
  } else if (building) {
    pageType = 'building'
  }

  const context = {
    pageType,
    buildingName: building?.building_name,
    buildingAddress: building?.canonical_address,
    buildingId: building?.id,
    communityId: building?.community_id,
    listingId: listing?.id,
    unitNumber: listing?.unit_number,
    listPrice: listing?.list_price,
    bedrooms: listing?.bedrooms_total,
    bathrooms: listing?.bathrooms_total,
    agentId: agent.id,
    agentName: agent.full_name,
    welcomeMessage: agent.ai_welcome_message || undefined,
    vipThreshold: agent.ai_vip_message_threshold || 5
  }

  return (
    <ChatWidget
      context={context}
      user={user}
    />
  )
}
