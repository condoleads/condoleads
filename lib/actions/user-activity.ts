'use server'

/**
 * User activity tracking — tenant-scoped.
 *
 * Architectural role (W-TENANT-AUTH File 7):
 *   - Every activity row is tenant-scoped. tenantId is REQUIRED on writes.
 *   - Read functions are tenant-scoped — same email can legitimately be a user on
 *     multiple tenants; queries must specify which.
 *   - Email->agent fallback inside trackActivity is scoped by (contact_email, tenant_id)
 *     so the same email on multiple tenants doesn't cross-contaminate agent assignment.
 *
 * Server-to-server callers pass tenantId directly. Client components MUST go through
 * a server-action wrapper (File 7c) — they never pass tenantId themselves.
 */

import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

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

export type ActivityType =
  // Lead Generation
  | 'registration'
  | 'contact_form'
  | 'property_inquiry'
  | 'unit_history_inquiry'
  // Service Requests
  | 'sale_evaluation_request'
  | 'lease_evaluation_request'
  | 'building_visit_request'
  | 'sale_offer_inquiry'
  | 'lease_offer_inquiry'
  // Estimator
  | 'estimator'
  | 'estimator_used'
  | 'estimator_contact_submitted'
  // Content Viewing
  | 'viewed_sold_listings'
  | 'viewed_leased_listings'
  | 'viewed_transaction_history'
  | 'viewed_unit_history'
  | 'viewed_single_listing'
  // Engagement
  | 'clicked_get_estimate_cta'
  | 'unlocked_gated_content'

interface TrackActivityParams {
  tenantId: string                  // REQUIRED — every activity row is tenant-scoped
  contactEmail: string
  agentId?: string
  activityType: ActivityType
  activityData?: any
  pageUrl?: string
}

export async function trackActivity(params: TrackActivityParams) {
  if (!params.tenantId) {
    console.error('[trackActivity] tenantId is required')
    return { success: false, error: 'tenantId required' }
  }

  console.log('[trackActivity]', {
    tenant: params.tenantId,
    email: params.contactEmail,
    type: params.activityType
  })

  try {
    const supabase = createServiceClient()

    const headersList = headers()
    const userAgent = headersList.get('user-agent') || ''
    const referer = headersList.get('referer') || params.pageUrl || ''

    // Email->agent fallback, scoped by tenant.
    // Without tenant scoping this would route tenant-2's activity to walliam's agents.
    let agentId = params.agentId
    if (!agentId && params.contactEmail) {
      const { data: lead } = await supabase
        .from('leads')
        .select('agent_id')
        .eq('contact_email', params.contactEmail)
        .eq('tenant_id', params.tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      agentId = lead?.agent_id || undefined
    }

    const { data, error } = await supabase
      .from('user_activities')
      .insert({
        tenant_id: params.tenantId,
        contact_email: params.contactEmail,
        agent_id: agentId || null,
        activity_type: params.activityType,
        activity_data: params.activityData || {},
        page_url: referer,
        user_agent: userAgent
      })
      .select()
      .single()

    if (error) {
      console.error('[trackActivity] insert error:', error)
      return { success: false, error: error.message }
    }

    console.log('[trackActivity] tracked:', {
      email: params.contactEmail,
      type: params.activityType,
      agent: agentId
    })

    // Activity-on-lead linkage logging (preserved from prior version).
    // Actual email cascade lives in getOrCreateLead, not here.
    if (agentId) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('id')
        .eq('contact_email', params.contactEmail)
        .eq('tenant_id', params.tenantId)
        .eq('agent_id', agentId)
        .maybeSingle()
      if (leadData?.id) {
        console.log('[trackActivity] activity linked to lead:', leadData.id)
      }
    }

    return { success: true, activity: data }

  } catch (err: any) {
    console.error('[trackActivity] exception:', err)
    return { success: false, error: 'Failed to track activity' }
  }
}

/**
 * getUserActivities — fetch all activities for a contactEmail, scoped to tenant.
 *
 * In multi-tenant, the same email can legitimately be a user on multiple tenants.
 * tenantId is required so callers explicitly state which tenant's activities they want.
 */
export async function getUserActivities(contactEmail: string, tenantId: string) {
  if (!tenantId) {
    console.error('[getUserActivities] tenantId is required')
    return { success: false, activities: [] }
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .eq('contact_email', contactEmail)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user activities:', error)
    return { success: false, activities: [] }
  }

  return { success: true, activities: data || [] }
}

/**
 * getAgentActivities — fetch all activities assigned to an agentId.
 *
 * agentId is intrinsically tenant-scoped (agents.tenant_id FK) so no extra tenant
 * filter is required on this query — but for defense-in-depth we accept tenantId
 * as an optional parameter and filter on it when provided.
 */
export async function getAgentActivities(agentId: string, tenantId?: string) {
  const supabase = createServiceClient()

  let query = supabase
    .from('user_activities')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching agent activities:', error)
    return { success: false, activities: [] }
  }

  return { success: true, activities: data || [] }
}

/**
 * getAllActivities — admin-only listing.
 *
 * tenantId is required. An admin on tenant-1 must NOT see tenant-2's activity stream.
 * This was a Rule Zero violation in the original (no scoping at all).
 */
export async function getAllActivities(tenantId: string, limit: number = 100) {
  if (!tenantId) {
    console.error('[getAllActivities] tenantId is required')
    return { success: false, activities: [] }
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('user_activities')
    .select(`
      *,
      agents (
        id,
        full_name,
        email,
        subdomain
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching all activities:', error)
    return { success: false, activities: [] }
  }

  return { success: true, activities: data || [] }
}

/**
 * calculateEngagementScore — derive a 0-100 engagement score for a user on a tenant.
 *
 * Wraps getUserActivities so it inherits the tenant scoping. Same user can have
 * different engagement scores on different tenants — each tenant sees its own picture.
 */
export async function calculateEngagementScore(contactEmail: string, tenantId: string) {
  if (!tenantId) {
    console.error('[calculateEngagementScore] tenantId is required')
    return { score: 0, status: 'cold' as const, activityCount: 0 }
  }

  const { activities } = await getUserActivities(contactEmail, tenantId)

  const scoring = {
    registration: 10,
    estimator_used: 20,
    viewed_sold_listings: 15,
    viewed_leased_listings: 15,
    viewed_single_listing: 10,
    sale_evaluation_request: 25,
    lease_evaluation_request: 25,
    building_visit_request: 25,
    estimator_contact_submitted: 30,
    property_inquiry: 20,
    contact_form: 15,
    viewed_transaction_history: 10,
    viewed_unit_history: 10,
    unlocked_gated_content: 10,
    clicked_get_estimate_cta: 5
  }

  let score = 0
  activities.forEach((activity: any) => {
    score += scoring[activity.activity_type as keyof typeof scoring] || 0
  })

  score = Math.min(score, 100)

  let status: 'hot' | 'warm' | 'cold'
  if (score >= 75) status = 'hot'
  else if (score >= 50) status = 'warm'
  else status = 'cold'

  return {
    score,
    status,
    activityCount: activities.length
  }
}