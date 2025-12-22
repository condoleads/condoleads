'use client'

import { usePathname } from 'next/navigation'
import ChatWidget from './ChatWidget'

interface ChatWidgetWrapperProps {
  agent: {
    id: string
    full_name: string
  }
  building?: {
    id: string
    building_name: string
    canonical_address: string
  } | null
  listing?: {
    id: string
    unit_number?: string
    list_price?: number
    bedrooms_total?: number
    bathrooms_total?: number
  } | null
}

export default function ChatWidgetWrapper({ agent, building, listing }: ChatWidgetWrapperProps) {
  const pathname = usePathname()

  // Determine page type
  let pageType: 'home' | 'building' | 'property' = 'home'
  if (listing) {
    pageType = 'property'
  } else if (building) {
    pageType = 'building'
  }

  // Skip chat on admin/dashboard pages
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/login')) {
    return null
  }

  const context = {
    pageType,
    buildingName: building?.building_name,
    buildingAddress: building?.canonical_address,
    buildingId: building?.id,
    listingId: listing?.id,
    unitNumber: listing?.unit_number,
    listPrice: listing?.list_price,
    bedrooms: listing?.bedrooms_total,
    bathrooms: listing?.bathrooms_total,
    agentId: agent.id,
    agentName: agent.full_name
  }

  return <ChatWidget context={context} />
}