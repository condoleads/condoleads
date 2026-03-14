// app/charlie/lib/charlie-plan.ts
import { createClient } from '@/lib/supabase/server'

export interface BuyerProfile {
  geoName: string
  geoType: string
  geoId: string
  budgetMin?: number
  budgetMax?: number
  propertyType?: string
  bedrooms?: number
  timeline?: string
}

export interface SellerProfile {
  geoName: string
  geoType: string
  geoId: string
  propertyType?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  timeline?: string
  goal?: string
}

export interface LeadData {
  agentId?: string
  name: string
  email: string
  phone?: string
  intent: 'buyer' | 'seller'
  buyerProfile?: BuyerProfile
  sellerProfile?: SellerProfile
  listings?: any[]
  analytics?: any
}

export async function saveLead(data: LeadData): Promise<{ id: string } | null> {
  const supabase = createClient()

  const profile = data.intent === 'buyer' ? data.buyerProfile : data.sellerProfile

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      agent_id: data.agentId || null,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      intent: data.intent,
      geo_name: profile?.geoName,
      geo_type: profile?.geoType,
      geo_id: profile?.geoId,
      budget_min: data.buyerProfile?.budgetMin || null,
      budget_max: data.buyerProfile?.budgetMax || null,
      property_type: profile?.propertyType || null,
      bedrooms: data.buyerProfile?.bedrooms || null,
      estimated_value_min: data.sellerProfile?.estimatedValueMin || null,
      estimated_value_max: data.sellerProfile?.estimatedValueMax || null,
      timeline: profile?.timeline || null,
      plan_type: data.intent,
      listings: data.listings ? JSON.stringify(data.listings) : null,
      analytics: data.analytics ? JSON.stringify(data.analytics) : null,
      session_summary: {},
    })
    .select('id')
    .single()

  if (error) {
    console.error('[charlie-plan] saveLead error:', error)
    return null
  }

  return lead
}