'use server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateLead } from '@/lib/actions/leads'
import { headers } from 'next/headers'

interface CreateLeadFromRegistrationParams {
  userId: string
  fullName: string
  email: string
  phone?: string
  registrationSource: string
  registrationUrl?: string
  buildingId?: string
  listingId?: string
  message?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}

export async function createLeadFromRegistration(params: CreateLeadFromRegistrationParams) {
  try {
    const supabase = createClient()
    
    // Get subdomain from request headers
    const headersList = headers()
    const host = headersList.get('host') || ''
    const subdomain = extractSubdomain(host)
    
    // Find agent by subdomain
    let agentId: string
    
    if (subdomain) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .single()
      
      agentId = agent?.id || 'd5ab9f8b-5819-4363-806c-a414657e7763' // Fallback to Mary
      console.log(`?? Lead assigned to agent via subdomain: ${subdomain} -> ${agentId}`)
    } else {
      // No subdomain (main site) - default to Mary (admin)
      agentId = 'd5ab9f8b-5819-4363-806c-a414657e7763'
      console.log(' Lead assigned to default admin (no subdomain)')
    }

    // Map registration sources to valid lead sources
    const sourceMap: Record<string, string> = {
      'home_page': 'registration',
      'listing_card': 'property_inquiry',
      'estimator': 'estimator',
      'building_page': 'building_page',
      'contact_form': 'contact_form'
    }
    
    const leadSource = sourceMap[params.registrationSource] || 'registration'
    
    // Enhanced source URL with subdomain tracking
    const sourceUrl = subdomain 
      ? `https://${subdomain}.condoleads.ca${params.registrationUrl || ''}` 
      : params.registrationUrl

    // Use the new createLead function which sends emails!
    const result = await getOrCreateLead({
      agentId: agentId,
      contactName: params.fullName,
      contactEmail: params.email,
      contactPhone: params.phone,
      source: leadSource as any,
      sourceUrl: sourceUrl,
      buildingId: params.buildingId,
      listingId: params.listingId,
      message: params.message ? `${params.message} ${subdomain ? `(via ${subdomain}.condoleads.ca)` : ""}` : `New user registration via ${params.registrationSource} ${subdomain ? `on ${subdomain}.condoleads.ca` : ""}`,
      estimatedValueMin: params.estimatedValueMin,
      estimatedValueMax: params.estimatedValueMax,
      propertyDetails: params.propertyDetails
    })

    if (!result.success) {
      console.error('Error creating lead from registration')
      return { success: false, error: 'Failed to create lead' }
    }

    console.log(' Lead created successfully with email notification:', result.lead?.id)
    return { success: true, leadId: result.lead?.id }
  } catch (error) {
    console.error('? Unexpected error creating lead:', error)
    return { success: false, error: 'Failed to create lead' }
  }
}

// Helper function to extract subdomain
function extractSubdomain(host: string): string | null {
  const parts = host.split('.')
  
  // Handle localhost
  if (host.includes('localhost')) return null
  
  // condoleads.ca or www.condoleads.ca
  if (parts.length === 2 || (parts.length === 3 && parts[0] === 'www')) {
    return null
  }
  
  // subdomain.condoleads.ca
  if (parts.length >= 3) {
    return parts[0]
  }
  
  return null
}
