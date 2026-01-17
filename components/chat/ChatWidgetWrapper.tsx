// components/chat/ChatWidgetWrapper.tsx
'use client'

import { usePathname } from 'next/navigation'
import ChatWidget from './ChatWidget'
import ChatLocked from './ChatLocked'

interface ChatWidgetWrapperProps {
  agent: {
    id: string
    full_name: string
    ai_chat_enabled?: boolean
    anthropic_api_key?: string | null
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
  user?: {
    id: string
    email: string
    name?: string
  } | null
}

export default function ChatWidgetWrapper({ 
  agent, 
  building, 
  listing, 
  user 
}: ChatWidgetWrapperProps) {
  const pathname = usePathname()

  // Skip chat on admin/dashboard pages
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return null
  }

  // Check if AI chat is enabled for this agent
  const aiEnabled = agent.ai_chat_enabled && agent.anthropic_api_key
  
  // If AI not enabled, don't show chat at all
  if (!aiEnabled) {
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