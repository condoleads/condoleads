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
  buildingId?: string  // Optional - captured when available
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
  source?: string
  propertyDetails?: any
}

export async function createLead(params: CreateLeadParams) {
  console.log(' CREATE LEAD CALLED:', params)

  const supabase = createServiceClient()

  // Get current URL for source tracking
  const headersList = headers()
  const referer = headersList.get('referer') || ''
  
  let source = params.source || 'contact_form'
  if (referer.includes('/estimator')) {
    source = 'estimator'
  } else if (referer.includes('/register')) {
    source = 'registration'
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      agent_id: params.agentId,
      building_id: params.buildingId || null,
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

  // Send email notification to agent
  try {
    await sendLeadNotificationToAgent({
      agentEmail: params.contactEmail,
      leadId: lead.id,
      contactName: params.contactName,
      contactEmail: params.contactEmail,
      source: source
    })
  } catch (emailError) {
    console.error(' Error sending notification email:', emailError)
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
