'use server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { sendActivityEmail } from '@/lib/email/sendActivityEmail'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  tenantId: string                  // REQUIRED — every lead is scoped to a tenant
  agentId?: string                  // Optional — if missing, resolved via resolve_agent_for_context
  buildingId?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
  source?: string
  sourceUrl?: string
  listingId?: string
  communityId?: string
  municipalityId?: string
  areaId?: string
  userId?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}

// Resolve agent via RPC scoped to tenant.
// Returns null if no agent matches the context (lead routes to admin in that case).
async function resolveAgentForLead(
  supabase: ReturnType<typeof createServiceClient>,
  params: CreateLeadParams
): Promise<string | null> {
  if (params.agentId) return params.agentId

  const { data: agentId, error } = await supabase.rpc('resolve_agent_for_context', {
    p_listing_id: params.listingId || null,
    p_building_id: params.buildingId || null,
    p_community_id: params.communityId || null,
    p_municipality_id: params.municipalityId || null,
    p_area_id: params.areaId || null,
    p_user_id: params.userId || null,
    p_tenant_id: params.tenantId,
  })

  if (error) {
    console.error('[leads] resolve_agent_for_context RPC error:', error)
    return null
  }
  return (agentId as string) || null
}

// Smart lead handler — prevents duplicates, scoped per tenant.
// Duplicate detection key: (contact_email, tenant_id).
// Same email can legitimately be a lead on multiple tenants.
export async function getOrCreateLead(params: CreateLeadParams & { forceNew?: boolean }) {
  if (!params.tenantId) {
    return { success: false, error: 'tenantId is required' }
  }

  const supabase = createServiceClient()

  // Force new on form submissions
  if (params.forceNew) {
    console.log('[leads] Force creating new lead:', params.contactEmail, 'tenant:', params.tenantId)
    return await createLead(params)
  }

  // Per-tenant duplicate check
  const { data: existingLead, error: searchError } = await supabase
    .from('leads')
    .select('id, contact_email, agent_id, tenant_id')
    .eq('contact_email', params.contactEmail)
    .eq('tenant_id', params.tenantId)
    .maybeSingle()

  if (existingLead && !searchError) {
    console.log('[leads] Lead exists for tenant — bumping updated_at:', existingLead.id)
    await supabase
      .from('leads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existingLead.id)
    return { success: true, lead: existingLead, isNew: false }
  }

  console.log('[leads] Creating new lead for:', params.contactEmail, 'tenant:', params.tenantId)
  return await createLead(params)
}

export async function createLead(params: CreateLeadParams) {
  console.log('[leads] CREATE LEAD:', { tenantId: params.tenantId, email: params.contactEmail })

  if (!params.tenantId) {
    return { success: false, error: 'tenantId is required' }
  }

  const supabase = createServiceClient()

  // Resolve agent if not provided
  const resolvedAgentId = await resolveAgentForLead(supabase, params)
  if (!resolvedAgentId) {
    console.warn('[leads] No agent resolved for tenant', params.tenantId, '— lead will route to admin only')
  }

  // Source detection from referer if not explicit
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
      tenant_id: params.tenantId,
      agent_id: resolvedAgentId,
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

  if (error) {
    console.error('[leads] Insert error:', error)
    return { success: false, error: error.message }
  }

  console.log('[leads] Lead created:', lead.id)

  // Fetch agent details for email cascade (only if agent was resolved)
  let agent: any = null
  if (resolvedAgentId) {
    const { data: agentData } = await supabase
      .from('agents')
      .select('full_name, email, parent_id')
      .eq('id', resolvedAgentId)
      .single()
    agent = agentData
  }

  // Notify the assigned agent
  if (agent?.email) {
    try {
      console.log('[leads] Notifying agent:', agent.email)
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
    } catch (emailError) {
      console.error('[leads] Agent email error:', emailError)
    }
  }

  await delay(600)

  // Notify manager (parent agent) if subscribed
  let manager: any = null
  if (agent?.parent_id) {
    const { data: managerData } = await supabase
      .from('agents')
      .select('id, full_name, email, receive_team_lead_emails')
      .eq('id', agent.parent_id)
      .single()
    manager = managerData

    if (manager?.receive_team_lead_emails && manager.email) {
      try {
        console.log('[leads] Notifying manager:', manager.email)
        await sendActivityEmail({
          leadId: lead.id,
          activityType: source,
          agentEmail: manager.email,
          agentName: manager.full_name || 'Manager',
          buildingName: params.propertyDetails?.buildingName,
          buildingAddress: params.propertyDetails?.buildingAddress,
          unitNumber: params.propertyDetails?.unitNumber,
          message: params.message,
          isManagerNotification: true,
          teamAgentName: agent.full_name
        })
      } catch (err) {
        console.error('[leads] Manager email error:', err)
      }
    }
  }

  await delay(600)

  // Notify admins with receive_all_lead_emails — scoped to tenant
  const { data: admins } = await supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('receive_all_lead_emails', true)
    .eq('is_active', true)
    .eq('tenant_id', params.tenantId)

  if (admins && admins.length > 0) {
    for (const admin of admins) {
      if (admin.email && admin.email !== agent?.email && admin.email !== manager?.email) {
        try {
          console.log('[leads] Notifying admin:', admin.email)
          await sendActivityEmail({
            leadId: lead.id,
            activityType: source,
            agentEmail: admin.email,
            agentName: admin.full_name || 'Admin',
            buildingName: params.propertyDetails?.buildingName,
            buildingAddress: params.propertyDetails?.buildingAddress,
            unitNumber: params.propertyDetails?.unitNumber,
            message: params.message,
            isAdminNotification: true,
            teamAgentName: agent?.full_name,
            teamManagerName: manager?.full_name
          })
        } catch (err) {
          console.error('[leads] Admin email error:', err)
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
  if (notes) updateData.notes = notes

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
          parent_id
        )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching all leads for admin:', error)
    return { success: false, leads: [], error: error.message }
  }

  const parentIds = [...new Set(leads?.filter(l => l.agents?.parent_id).map(l => l.agents.parent_id))]

  let parentMap: Record<string, string> = {}
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('agents')
      .select('id, full_name')
      .in('id', parentIds)

    if (parents) {
      parentMap = parents.reduce((acc, p) => ({ ...acc, [p.id]: p.full_name }), {})
    }
  }

  const leadsWithParent = leads?.map(lead => ({
    ...lead,
    agents: lead.agents ? {
      ...lead.agents,
      parent: lead.agents.parent_id ? { full_name: parentMap[lead.agents.parent_id] } : null
    } : null
  }))

  return { success: true, leads: leadsWithParent || [] }
}