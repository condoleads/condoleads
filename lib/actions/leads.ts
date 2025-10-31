'use server'

import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { sendLeadNotificationToAgent } from '@/lib/email/resend'

// Create service role client that bypasses RLS
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  // Send email notification to agent
  try {
    console.log(' Fetching agent details for email...')
    
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('full_name, email, notification_email')
      .eq('id', params.agentId)
      .single()

    if (agentError) {
      console.error(' Error fetching agent:', agentError)
    } else if (agent) {
      // Use notification_email if set, otherwise fallback to email
      const emailTo = agent.notification_email || agent.email
      
      console.log(' Sending email to agent:', emailTo)
      
      // Get building and listing details for the email
      let buildingName = undefined
      let listingAddress = undefined
      
      if (params.buildingId) {
        const { data: building } = await supabase
          .from('buildings')
          .select('building_name')
          .eq('id', params.buildingId)
          .single()
        buildingName = building?.building_name
      }
      
      if (params.listingId) {
        const { data: listing } = await supabase
          .from('mls_listings')
          .select('unparsed_address')
          .eq('id', params.listingId)
          .single()
        listingAddress = listing?.unparsed_address
      }

      const emailResult = await sendLeadNotificationToAgent({
        agentEmail: emailTo,
        agentName: agent.full_name,
        leadName: params.contactName,
        leadEmail: params.contactEmail,
        leadPhone: params.contactPhone,
        source: params.source,
        buildingName,
        listingAddress,
        message: params.message,
        estimatedValue: params.estimatedValueMin && params.estimatedValueMax 
          ? `$${params.estimatedValueMin?.toLocaleString()} - $${params.estimatedValueMax?.toLocaleString()}`
          : undefined
      })

      if (emailResult.success) {
        console.log(' Email sent successfully to agent')
      } else {
        console.error(' Failed to send email:', emailResult.error)
      }
    }
  } catch (emailError) {
    console.error(' Exception while sending email:', emailError)
    // Don't fail the lead creation if email fails
  }

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
