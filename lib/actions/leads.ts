'use server'
// lib/actions/leads.ts
// Tenant-aware lead creation with full Lead+Email contract compliance (W-HIERARCHY H3.9).
//
// W-HIERARCHY H3.9 (2026-05-03):
//   - walkHierarchy captures full chain (manager_id, area_manager_id, tenant_admin_id) — was: single parent_id query
//   - Insert payload now includes manager_id, area_manager_id, tenant_admin_id (was: agent_id only)
//   - Email fan-out replaced: was 3 sequential sendActivityEmail calls (agent → manager → admin loop with receive_*_emails flags),
//     now single getLeadEmailRecipients + sendTenantEmail with TO/CC/BCC (open chain, no suppression per Q1)
//   - F67 try/catch standard: TenantEmailNotConfigured warn, TenantEmailFailed error, AdminPlatformUnreachable soft-fail
//   - F51 (W-TENANT-AUTH coordination) retired
//
// Option A (locked 2026-05-03): dup-branch in getOrCreateLead stays silent.
// When a lead already exists for (contact_email, tenant_id), updated_at is bumped, no email fires.
// Re-engagement signaling is out of W-HIERARCHY scope; future lead-lifecycle work can revisit.

import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import {
  sendTenantEmail,
  TenantEmailNotConfigured,
  TenantEmailFailed,
  getLeadEmailRecipients,
  AdminPlatformUnreachable,
} from '@/lib/admin-homes/lead-email-recipients'

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
//
// Option A: dup branch is silent. Bumps updated_at, no email.
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
    // Option A: silent re-engagement bump. No email fires on dup.
    console.log('[leads] Lead exists for tenant — bumping updated_at (Option A: silent):', existingLead.id)
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

  // ─── Resolve agent (tenant-scoped RPC) ─────────────────────────────────────
  const resolvedAgentId = await resolveAgentForLead(supabase, params)
  if (!resolvedAgentId) {
    console.warn('[leads] No agent resolved for tenant', params.tenantId, '— lead will route to admin only')
  }

  // ─── Walker: capture full hierarchy chain ──────────────────────────────────
  let chainManagerId: string | null = null
  let chainAreaManagerId: string | null = null
  let chainTenantAdminId: string | null = null

  if (resolvedAgentId) {
    const chain = await walkHierarchy(resolvedAgentId, supabase)
    chainManagerId = chain.manager_id
    chainAreaManagerId = chain.area_manager_id
    chainTenantAdminId = chain.tenant_admin_id
  }

  // ─── Source detection from referer if not explicit ─────────────────────────
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

  // ─── Insert lead row with full hierarchy chain (Lead+Email contract) ───────
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      tenant_id: params.tenantId,
      agent_id: resolvedAgentId,
      manager_id: chainManagerId,
      area_manager_id: chainAreaManagerId,
      tenant_admin_id: chainTenantAdminId,
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
      assignment_source: resolvedAgentId ? 'geo' : 'admin',
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

  // ─── Chain notification: single helper-driven send (F67 try/catch) ─────────
  // Replaces the prior 3-step loop (agent → manager → admin) with one send
  // that hits the full 6-layer chain via the recipients helper.
  let recipients
  try {
    recipients = await getLeadEmailRecipients(params.tenantId, resolvedAgentId, supabase)
  } catch (err) {
    if (err instanceof AdminPlatformUnreachable) {
      console.error('[leads] admin platform unreachable:', err.message)
      recipients = null
    } else {
      throw err
    }
  }

  if (recipients) {
    const html = buildLeadEmail({
      contactName: params.contactName,
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone,
      message: params.message,
      source,
      buildingName: params.propertyDetails?.buildingName,
      buildingAddress: params.propertyDetails?.buildingAddress,
      unitNumber: params.propertyDetails?.unitNumber,
    })
    const subject = `✦ New Lead — ${params.contactName} — ${source}`

    try {
      await sendTenantEmail({
        tenantId: params.tenantId,
        to: recipients.to,
        cc: recipients.cc.length > 0 ? recipients.cc : undefined,
        bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
        subject,
        html,
      })
    } catch (err) {
      if (err instanceof TenantEmailNotConfigured) {
        console.warn('[leads] tenant email not configured:', err.message)
      } else if (err instanceof TenantEmailFailed) {
        console.error('[leads] resend send failed:', err.message)
      } else {
        console.error('[leads] unexpected email error:', err)
      }
    }
  }

  return { success: true, lead }
}

// ─── Email body ──────────────────────────────────────────────────────────────
// Mirrors the visual shape used by walliam/contact for consistency across all
// chain notifications. No agent-specific branding here — the helper resolves
// recipients per tenant; this template is content-only.
function buildLeadEmail(params: {
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
  source: string
  buildingName?: string
  buildingAddress?: string
  unitNumber?: string
}): string {
  const { contactName, contactEmail, contactPhone, message, source, buildingName, buildingAddress, unitNumber } = params
  const propertyLine = buildingName || buildingAddress
    ? `${buildingName || ''}${buildingAddress ? ' — ' + buildingAddress : ''}${unitNumber ? ' #' + unitNumber : ''}`
    : null

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 18px; font-weight: 700; color: #fff;">New Lead</div>
        <div style="font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px;">${source}</div>
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size: 14px;">
          <tr><td style="color: #64748b; width: 120px;">Name</td><td style="font-weight: 700; color: #0f172a;">${contactName}</td></tr>
          <tr><td style="color: #64748b;">Email</td><td><a href="mailto:${contactEmail}" style="color: #1d4ed8;">${contactEmail}</a></td></tr>
          ${contactPhone ? `<tr><td style="color: #64748b;">Phone</td><td><a href="tel:${contactPhone}" style="color: #1d4ed8;">${contactPhone}</a></td></tr>` : ''}
          ${propertyLine ? `<tr><td style="color: #64748b;">Property</td><td style="color: #0f172a;">${propertyLine}</td></tr>` : ''}
          ${message ? `<tr><td style="color: #64748b; vertical-align: top;">Message</td><td style="color: #0f172a;">${message}</td></tr>` : ''}
        </table>
        <div style="margin-top: 20px; text-align: center;">
          <a href="mailto:${contactEmail}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            Reply to ${contactName}
          </a>
        </div>
      </div>
    </div>
  `
}

// ─── Untouched read/update helpers ───────────────────────────────────────────

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
