'use server'

import { createClient } from '@/lib/supabase/server'
import { createLead } from '@/lib/actions/leads'

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
    // Default agent ID (Mary Smith)
    const DEFAULT_AGENT_ID = 'd5ab9f8b-5819-4363-806c-a414657e7763'

    // Map registration sources to valid lead sources
    const sourceMap: Record<string, string> = {
      'home_page': 'registration',
      'listing_card': 'property_inquiry',
      'estimator': 'estimator',
      'building_page': 'building_page',
      'contact_form': 'contact_form'
    }

    const leadSource = sourceMap[params.registrationSource] || 'registration'

    // Use the new createLead function which sends emails!
    const result = await createLead({
      agentId: DEFAULT_AGENT_ID,
      contactName: params.fullName,
      contactEmail: params.email,
      contactPhone: params.phone,
      source: leadSource as any,
      sourceUrl: params.registrationUrl,
      buildingId: params.buildingId,
      listingId: params.listingId,
      message: params.message || `New user registration via ${params.registrationSource}`,
      estimatedValueMin: params.estimatedValueMin,
      estimatedValueMax: params.estimatedValueMax,
      propertyDetails: params.propertyDetails
    })

    if (!result.success) {
      console.error('Error creating lead from registration:', result.error)
      return { success: false, error: result.error }
    }

    console.log(' Lead created successfully with email notification:', result.lead?.id)
    return { success: true, leadId: result.lead?.id }

  } catch (error) {
    console.error(' Unexpected error creating lead:', error)
    return { success: false, error: 'Failed to create lead' }
  }
}
