'use server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'
import { headers } from 'next/headers'

interface CreateLeadFromRegistrationParams {
  userId: string
  fullName: string
  email: string
  phone?: string
  registrationSource: string
  registrationUrl?: string
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
  listingId?: string
  listingAddress?: string
  unitNumber?: string
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
      console.log(` Lead assigned to agent via subdomain: ${subdomain} -> ${agentId}`)
    } else {
      // No subdomain (main site) - default to Mary (admin)
      agentId = 'd5ab9f8b-5819-4363-806c-a414657e7763'
      console.log(' Lead assigned to default admin (no subdomain)')
    }

    // Enhanced source mapping with specific action types
    const sourceMap: Record<string, string> = {
      'home_page': 'registration',
      'listing_card': 'property_inquiry',
      'estimator': 'estimator',
      'building_page': 'contact_form',
      'contact_form': 'contact_form',
      'message_agent': 'contact_form',
      'sale_offer': 'sale_evaluation_request',
      'building_visit': 'building_visit_request',
      'property_inquiry': 'property_inquiry'
    }
    
    const leadSource = sourceMap[params.registrationSource] || 'registration'
    
    // Enhanced source URL with subdomain tracking
    // Extract building from URL if not provided
    let finalBuildingId = params.buildingId
    if (!finalBuildingId && params.registrationUrl) {
      // Try to extract building slug from URL (e.g., /one-bedford-1-bedford-rd-toronto)
      // Extract slug from full URL or path
      const url = new URL(params.registrationUrl, 'https://condoleads.ca')
      const pathSegments = url.pathname.split('/').filter(s => s)
      const slug = pathSegments[0] // First segment after domain
      
      if (slug && slug !== 'estimator' && slug !== 'dashboard' && slug !== 'login') {
        // Look up building by slug
        const { data: building } = await supabase
            .from('buildings')
            .select('id, building_name, canonical_address')
            .eq('slug', slug)
            .single()
        if (building) {
            finalBuildingId = building.id
            // Also capture building name/address if not provided
            if (!params.buildingName) {
              params.buildingName = building.building_name
            }
            if (!params.buildingAddress) {
              params.buildingAddress = building.canonical_address
            }
            console.log('📍 Extracted building from URL:', slug, '→', building.id, building.building_name)
          }
      }
    }

    const sourceUrl = subdomain 
      ? `https://${subdomain}.condoleads.ca${params.registrationUrl || ''}` 
      : params.registrationUrl

    // Determine if this should force create a new lead
    // Form submissions and registration always create new leads
    const formSubmissionSources = [
      'contact_form', 
      'listing_card', 
      'building_page',
      'message_agent',
      'sale_offer',
      'building_visit',
      'property_inquiry',
      'home_page'  // Registration also creates new lead
    ]
    const shouldForceNewLead = formSubmissionSources.includes(params.registrationSource)

    if (shouldForceNewLead) {
      console.log(' Form submission/Registration detected - creating NEW lead')
    }

    // Use the new createLead function which sends emails!
    const result = await getOrCreateLead({
      agentId: agentId,
      contactName: params.fullName,
      contactEmail: params.email,
      contactPhone: params.phone,
      source: leadSource as any,
      sourceUrl: sourceUrl,
      buildingId: finalBuildingId,
      listingId: params.listingId,
      message: params.message || ("New user registration" + (params.buildingName ? " for " + params.buildingName : "") + (params.unitNumber ? " Unit " + params.unitNumber : "") + (params.buildingAddress ? " (" + params.buildingAddress + ")" : "") + " via " + params.registrationSource + (subdomain ? " on " + subdomain + ".condoleads.ca" : "")),
      estimatedValueMin: params.estimatedValueMin,
      estimatedValueMax: params.estimatedValueMax,
      propertyDetails: {
          ...(params.propertyDetails || {}),
          buildingName: params.buildingName,
          buildingAddress: params.buildingAddress,
          unitNumber: params.unitNumber
        },
      forceNew: shouldForceNewLead
    })

    if (!result.success) {
      console.error(' Error creating lead from registration')
      return { success: false, error: 'Failed to create lead' }
    }

    console.log(' Lead created successfully with email notification:', result.lead?.id)

    // Track registration activity with building info
    if (result.lead?.id) {
      await trackActivity({
        contactEmail: params.email,
        agentId: agentId,
        activityType: 'registration',
        activityData: {
          buildingId: finalBuildingId,
          buildingName: params.buildingName,
          buildingAddress: params.buildingAddress,
          listingId: params.listingId,
          unitNumber: params.unitNumber,
          registrationSource: params.registrationSource
        }
      }).catch(err => console.error('Failed to track registration activity:', err))
    }

    return { success: true, leadId: result.lead?.id }

  } catch (error) {
    console.error(' Unexpected error creating lead:', error)
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


