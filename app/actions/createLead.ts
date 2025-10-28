'use server'

import { createClient } from '@/lib/supabase/server'

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

    // Create lead record
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        agent_id: DEFAULT_AGENT_ID,
        user_id: params.userId,
        contact_name: params.fullName,
        contact_email: params.email,
        contact_phone: params.phone || null,
        source: leadSource,
        source_url: params.registrationUrl || null,
        building_id: params.buildingId || null,
        listing_id: params.listingId || null,
        message: params.message || `New user registration via ${params.registrationSource}`,
        estimated_value_min: params.estimatedValueMin || null,
        estimated_value_max: params.estimatedValueMax || null,
        property_details: params.propertyDetails || null,
        quality: 'warm',
        status: 'new',
        notes: null,
        last_contact_at: null,
        next_followup_at: null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating lead from registration:', error)
      return { success: false, error: error.message }
    }

    console.log('Lead created successfully:', lead.id)
    return { success: true, leadId: lead.id }

  } catch (error) {
    console.error('Unexpected error creating lead:', error)
    return { success: false, error: 'Failed to create lead' }
  }
}
