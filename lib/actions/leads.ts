'use server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { sendActivityEmail } from '@/lib/email/sendActivityEmail'
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
  buildingId?: string  // Optional - captured when available
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
  source?: string
  sourceUrl?: string
  listingId?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}


// Smart lead handler - prevents duplicates, maintains single lead per email per agent
export async function getOrCreateLead(params: CreateLeadParams & { forceNew?: boolean }) {
  const supabase = createServiceClient()
  
  // If forceNew is true (form submissions), always create new lead
  if (params.forceNew) {
    console.log('Force creating new lead for form submission:', params.contactEmail)
    return await createLead(params)
  }
  
  // Check if lead already exists for this email + agent combination
  const { data: existingLead, error: searchError } = await supabase
    .from('leads')
    .select('id, contact_email, agent_id')
    .eq('contact_email', params.contactEmail)
    .eq('agent_id', params.agentId)
    .single()
  
  if (existingLead && !searchError) {
    console.log('Lead already exists:', existingLead.id)
    
    // Update last activity timestamp
    await supabase
      .from('leads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existingLead.id)
    
    return { 
      success: true, 
      lead: existingLead,
      isNew: false 
    }
  }
  
  // Lead doesn't exist, create new one
  console.log(' Creating new lead for:', params.contactEmail)
  return await createLead(params)
}
export async function createLead(params: CreateLeadParams) {
  console.log(' CREATE LEAD CALLED:', params)

  const supabase = createServiceClient()

  // Get current URL for source tracking
  const headersList = headers()
  const referer = headersList.get('referer') || ''
  
  let source = params.source
    if (!source) {
      if (referer.includes('/estimator')) {
        source = 'estimator'
      } else if (referer.includes('/register')) {
        source = 'registration'
      } else {
        source = 'contact_form'
      }
    }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      agent_id: params.agentId,
      building_id: params.buildingId || null,
        listing_id: params.listingId || null,
        source_url: params.sourceUrl || null,
        estimated_value_min: params.estimatedValueMin || null,
        estimated_value_max: params.estimatedValueMax || null,
        property_details: params.propertyDetails || null,
        contact_name: params.contactName,
      contact_email: params.contactEmail,
      contact_phone: params.contactPhone,
      message: params.message,
      source: source,
      quality: 'cold',
      status: 'new',
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  console.log(' INSERT RESULT:', { data: lead, error })

  if (error) {
    console.error(' Error creating lead:', error)
    return { success: false, error: error.message }
  }

  console.log(' LEAD CREATED SUCCESSFULLY:', lead.id)

  // Fetch agent details for email
  const { data: agent } = await supabase
    .from('agents')
    .select('full_name, email, parent_id')
    .eq('id', params.agentId)
    .single()


  // Send email notification to agent for NEW leads
  if (agent?.email) {
    try {
      console.log(' Sending email for new lead:', { leadId: lead.id, source, agentEmail: agent.email })
      await sendActivityEmail({
        leadId: lead.id,
        activityType: source,
        agentEmail: agent.email,
        agentName: agent.full_name || 'Agent',
        buildingName: params.propertyDetails?.buildingName,
        buildingAddress: params.propertyDetails?.buildingAddress,
        unitNumber: params.propertyDetails?.unitNumber,
        message: params.message
      })
      console.log(' Email sent successfully')
    } catch (emailError) {
      console.error(' Error sending email:', emailError)
    }
  } else {
    console.log(' No agent email found, skipping notification')
  }

  // Send email to manager (parent) if they have receive_team_lead_emails enabled
  if (agent?.parent_id) {
    const { data: manager } = await supabase
      .from('agents')
      .select('id, full_name, email, receive_team_lead_emails')
      .eq('id', agent.parent_id)
      .single()

    if (manager?.receive_team_lead_emails && manager.email) {
      try {
        console.log('Sending email to manager:', manager.email)
        await sendActivityEmail({
          leadId: lead.id,
          activityType: source,
          agentEmail: manager.email,
          agentName: manager.full_name || 'Manager',
          buildingName: params.propertyDetails?.buildingName,
          buildingAddress: params.propertyDetails?.buildingAddress,
          unitNumber: params.propertyDetails?.unitNumber,
          message: params.message
        })
        console.log('Manager email sent')
      } catch (err) {
        console.error('Manager email error:', err)
      }
    }
  }

  // Send email to admins with receive_all_lead_emails enabled
  const { data: admins } = await supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('receive_all_lead_emails', true)
    .eq('is_active', true)

  if (admins && admins.length > 0) {
    for (const admin of admins) {
      if (admin.email && admin.email !== agent?.email) {
        try {
          console.log('Sending email to admin:', admin.email)
          await sendActivityEmail({
            leadId: lead.id,
            activityType: source,
            agentEmail: admin.email,
            agentName: admin.full_name || 'Admin',
            buildingName: params.propertyDetails?.buildingName,
            buildingAddress: params.propertyDetails?.buildingAddress,
            unitNumber: params.propertyDetails?.unitNumber,
            message: params.message
          })
          console.log('Admin email sent to', admin.email)
        } catch (err) {
          console.error('Admin email error:', err)
        }
      }
    }
  }

  return { success: true, lead }
}

export async function updateLeadStatus(leadId: string, status: string, notes?: string) {
  const supabase = createServiceClient()

  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  }

  if (notes) {
    updateData.notes = notes
  }

  const { error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', leadId)

  if (error) {
    console.error('Error updating lead status:', error)
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
        id,
        building_name,
        canonical_address
      ),
      mls_listings (
        id,
        unit_number,
        unparsed_address
      )
    `)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching leads:', error)
    return { success: false, leads: [], error: error.message }
  }

  return { success: true, leads: leads || [] }
}


export async function getAllLeadsForAdmin() {
  const supabase = createServiceClient()

  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      *,
      buildings (
        id,
        building_name,
        canonical_address
      ),
      mls_listings (
        id,
        unit_number,
        unparsed_address
      ),
      agents!leads_agent_id_fkey (
          id,
          full_name,
          email,
          subdomain,
          parent_id,
          parent:agents!parent_id(id, full_name)
        )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching all leads for admin:', error)
    return { success: false, leads: [], error: error.message }
  }

  return { success: true, leads: leads || [] }
}




