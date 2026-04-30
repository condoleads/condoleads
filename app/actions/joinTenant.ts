'use server'

/**
 * joinTenant
 *
 * Idempotent server action — "register or sign-in this user on this tenant."
 *
 * Architectural role (W-TENANT-AUTH Phase 3):
 *   - Single entry point for RegisterModal after BOTH successful signUp (Path A — new auth user)
 *     and successful signIn (Paths B & C — existing auth, returning OR new-to-tenant).
 *   - Server-side: reads `x-tenant-id` from headers (set by middleware). Client never passes
 *     tenantId.
 *   - Idempotent: if the user already has a `tenant_users` row for this tenant, the insert
 *     is a no-op (ON CONFLICT DO NOTHING via upsert). Returning users get a fast path with
 *     no lead duplication, no welcome-email re-send.
 *   - When tenant-2 onboards: an existing user (with auth.users row but no tenant_users row
 *     for tenant-2) hitting the registration form on tenant-2's domain gets a fresh
 *     tenant_users + lead + welcome email — fully captured in tenant-2's pipeline.
 *
 * Flow:
 *   1. Read x-tenant-id header. Bail loudly if missing.
 *   2. Upsert tenant_users(user_id, tenant_id) — returns whether row was newly inserted.
 *   3. If newly inserted (true new-to-tenant relationship):
 *        - Call assign-user-agent route (writes tenant_users.assigned_agent_id).
 *        - Call getOrCreateLead with tenantId scope.
 *        - Fire-and-forget welcome email.
 *   4. If already existed: skip 3, just return success.
 */

import { headers } from 'next/headers'
import { createClient as createServerClient } from '@supabase/supabase-js'
import { getOrCreateLead } from '@/lib/actions/leads'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface JoinTenantParams {
  userId: string
  fullName: string
  email: string
  phone?: string
  registrationSource?: string
  registrationUrl?: string
  marketingConsent?: boolean
  // Property/listing context for agent resolution
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
  listingId?: string
  listingAddress?: string
  unitNumber?: string
  communityId?: string
  municipalityId?: string
  areaId?: string
  message?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}

interface JoinTenantResult {
  success: boolean
  isNewToTenant?: boolean
  leadId?: string
  agentId?: string | null
  error?: string
}

export async function joinTenant(params: JoinTenantParams): Promise<JoinTenantResult> {
  const headersList = headers()
  const tenantId = headersList.get('x-tenant-id')

  if (!tenantId) {
    console.error('[joinTenant] x-tenant-id header missing')
    return { success: false, error: 'Tenant context unavailable.' }
  }

  if (!params.userId) {
    return { success: false, error: 'userId required' }
  }

  const supabase = createServiceClient()

  // Step 1: Upsert tenant_users row, detect whether it was a new insert.
  // Strategy: SELECT first to check existence, then INSERT if missing. This is two
  // round-trips but gives us a reliable "isNewToTenant" signal — Supabase's upsert
  // doesn't cleanly return "was this an insert vs update" for our schema.
  const { data: existing, error: selectError } = await supabase
    .from('tenant_users')
    .select('user_id, tenant_id, assigned_agent_id')
    .eq('user_id', params.userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (selectError) {
    console.error('[joinTenant] tenant_users select error:', selectError)
    return { success: false, error: selectError.message }
  }

  const isNewToTenant = !existing

  if (isNewToTenant) {
    const { error: insertError } = await supabase
      .from('tenant_users')
      .insert({
        user_id: params.userId,
        tenant_id: tenantId,
        registration_source: params.registrationSource || 'unknown',
        registration_url: params.registrationUrl || null,
        marketing_consent: params.marketingConsent ?? false,
      })

    if (insertError) {
      // If concurrent insert beat us, treat as not-new and continue
      if (insertError.code === '23505') {
        console.log('[joinTenant] race detected — row created concurrently, treating as existing')
      } else {
        console.error('[joinTenant] tenant_users insert error:', insertError)
        return { success: false, error: insertError.message }
      }
    } else {
      console.log('[joinTenant] new tenant_users row:', { userId: params.userId, tenantId })
    }
  } else {
    console.log('[joinTenant] returning user on tenant:', { userId: params.userId, tenantId })
  }

  // Step 2: For new-to-tenant relationships, do the full registration cascade.
  // Returning users skip — they already have an agent assigned and a lead from before.
  if (!isNewToTenant) {
    return { success: true, isNewToTenant: false, agentId: existing?.assigned_agent_id ?? null }
  }

  // Step 2a: assign-user-agent (per-tenant agent assignment)
  // This route reads x-tenant-id itself and writes to tenant_users.assigned_agent_id.
  // Fire-and-forget pattern preserved from prior architecture, but we await so we can
  // pass the resolved agent_id to the lead.
  let resolvedAgentId: string | null = null
  try {
    const proto = headersList.get('x-forwarded-proto') || 'https'
    const host = headersList.get('host') || ''
    const baseUrl = `${proto}://${host}`

    const assignResp = await fetch(`${baseUrl}/api/walliam/assign-user-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        user_id: params.userId,
        listing_id: params.listingId || null,
        building_id: params.buildingId || null,
        community_id: params.communityId || null,
        municipality_id: params.municipalityId || null,
        area_id: params.areaId || null,
      }),
    })

    if (assignResp.ok) {
      const assignData = await assignResp.json()
      resolvedAgentId = assignData.agent_id || null
      console.log('[joinTenant] agent assigned:', resolvedAgentId)
    } else {
      console.warn('[joinTenant] assign-user-agent non-OK:', assignResp.status)
    }
  } catch (err) {
    console.error('[joinTenant] assign-user-agent error:', err)
    // Continue — lead can still be created without agent (routes to admin)
  }

  // Step 2b: Create the lead
  let leadId: string | undefined
  try {
    const leadResult = await getOrCreateLead({
      tenantId,
      agentId: resolvedAgentId || undefined,
      userId: params.userId,
      contactName: params.fullName,
      contactEmail: params.email,
      contactPhone: params.phone,
      message: params.message,
      source: params.registrationSource || 'registration',
      sourceUrl: params.registrationUrl,
      buildingId: params.buildingId,
      listingId: params.listingId,
      communityId: params.communityId,
      municipalityId: params.municipalityId,
      areaId: params.areaId,
      estimatedValueMin: params.estimatedValueMin,
      estimatedValueMax: params.estimatedValueMax,
      propertyDetails: {
        ...(params.propertyDetails || {}),
        buildingName: params.buildingName,
        buildingAddress: params.buildingAddress,
        unitNumber: params.unitNumber,
        listingAddress: params.listingAddress,
      },
    })

    if (leadResult.success && leadResult.lead) {
      leadId = leadResult.lead.id
      console.log('[joinTenant] lead created:', leadId)
    } else {
      console.error('[joinTenant] lead creation failed:', leadResult.error)
    }
  } catch (err) {
    console.error('[joinTenant] lead creation error:', err)
  }

  // Step 2c: Welcome email (fire-and-forget — don't block return on email failure)
  try {
    const proto = headersList.get('x-forwarded-proto') || 'https'
    const host = headersList.get('host') || ''
    const baseUrl = `${proto}://${host}`

    fetch(`${baseUrl}/api/email/welcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        userId: params.userId,
        email: params.email,
        fullName: params.fullName,
      }),
    }).catch(err => console.error('[joinTenant] welcome email error:', err))

    // Mark welcome_email_sent on tenant_users (best-effort)
    await supabase
      .from('tenant_users')
      .update({ welcome_email_sent: true, updated_at: new Date().toISOString() })
      .eq('user_id', params.userId)
      .eq('tenant_id', tenantId)
  } catch (err) {
    console.error('[joinTenant] welcome email setup error:', err)
  }

  return {
    success: true,
    isNewToTenant: true,
    leadId,
    agentId: resolvedAgentId,
  }
}