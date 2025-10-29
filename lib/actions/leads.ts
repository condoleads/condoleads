'use server'

import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

// Create service role client that bypasses RLS
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Uses service role key
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

interface CreateLeadParams {
  agentId: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  source: 'registration' | 'estimator' | 'property_inquiry' | 'contact_form' | 'building_page'
  sourceUrl?: string
  buildingId?: string
  listingId?: string
  message?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}

export async function createLead(params: CreateLeadParams) {
  console.log(' CREATE LEAD CALLED:', params)
  
  const supabase = createServiceClient()
  
  // Get current URL for source tracking
  const headersList = headers()
  const sourceUrl = params.sourceUrl || headersList.get('referer') || ''
  
  // Determine lead quality based on source
  let quality = 'cold'
  if (params.source === 'estimator' || params.message) {
    quality = 'warm'
  }
  if (params.source === 'contact_form' && params.message) {
    quality = 'hot'
  }
  
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      agent_id: params.agentId,
      contact_name: params.contactName,
      contact_email: params.contactEmail,
      contact_phone: params.contactPhone,
      source: params.source,
      source_url: sourceUrl,
      building_id: params.buildingId,
      listing_id: params.listingId,
      message: params.message,
      estimated_value_min: params.estimatedValueMin,
      estimated_value_max: params.estimatedValueMax,
      property_details: params.propertyDetails,
      quality,
      status: 'new'
    })
    .select()
    .single()
  
  console.log(' INSERT RESULT:', { data: lead, error })
  
  if (error) {
    console.error(' Error creating lead:', error)
    return { success: false, error: error.message }
  }
  
  console.log(' LEAD CREATED SUCCESSFULLY:', lead.id)
  
  // TODO: Send email notification to agent
  // TODO: Send email notification to admin
  
  return { success: true, lead }
}

export async function updateLeadStatus(leadId: string, status: string, notes?: string) {
  const supabase = createServiceClient()
  
  const updateData: any = {
    status,
    last_contact_at: new Date().toISOString()
  }
  
  if (notes) {
    updateData.notes = notes
  }
  
  const { error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', leadId)
  
  if (error) {
    console.error('Error updating lead:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

export async function getAgentLeads(agentId: string) {
  const supabase = createServiceClient()
  
  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      *,
      buildings (
        building_name,
        slug
      ),
      mls_listings (
        unit_number,
        list_price
      )
    `)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching leads:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true, leads }
}
