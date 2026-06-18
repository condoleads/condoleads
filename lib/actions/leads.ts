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
import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'
import { buildBaseUrl } from '@/lib/utils/tenant-brand'
// P-WORKING-DOC (2026-06-12): shared 3-section render helper. ONE renderer
// reused by agent + buyer + VIP emails. Reads strictly from the persisted JSON
// — does NOT re-run the matcher.
import {
  type WorkingDoc,
  resolveListingIds,
  collectListingKeys,
  renderWorkingDocSections,
  renderEstimateHeader,
} from '@/lib/email/working-doc-render'

import { deriveLeadOriginRoute } from '@/lib/utils/lead-origin-route'
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

  // Phase 2 cache-first: read materialized mls_listings.assigned_agent_id when
  // a listing context is supplied. v16 model: the cache holds the v16-correct
  // agent. Falls through to the RPC on NULL cache (new listing without resolve-
  // at-insert -- see F-RESOLVE-AT-INSERT-PRIORITY).
  if (params.listingId) {
    const { data: cached, error: cacheError } = await supabase
      .from('mls_listings')
      .select('assigned_agent_id, agents!mls_listings_assigned_agent_id_fkey!inner(tenant_id, is_active, is_selling)')
      .eq('id', params.listingId)
      .eq('agents.tenant_id', params.tenantId)
      .eq('agents.is_active', true)
      .eq('agents.is_selling', true)
      .maybeSingle()
    if (!cacheError && cached?.assigned_agent_id) return cached.assigned_agent_id
  }

  const { data: agentId, error } = await supabase.rpc('resolve_agent_for_context', {
    p_listing_id: params.listingId || null,
    p_building_id: params.buildingId || null,
    p_neighbourhood_id: null,
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

  // Per-tenant duplicate check.
  // When listingId is provided, narrow the key to (email, tenant, listing_id) so
  // the same person inquiring about DIFFERENT subjects produces distinct leads.
  // When listingId is absent, key falls back to (email, tenant) — preserves
  // existing behavior for callers without a listing context (registration,
  // homepage contact form, building-level evaluation/visit, etc.).
  let query = supabase
    .from('leads')
    .select('id, contact_email, agent_id, tenant_id, listing_id')
    .eq('contact_email', params.contactEmail)
    .eq('tenant_id', params.tenantId)
  if (params.listingId) {
    query = query.eq('listing_id', params.listingId)
  }
  const { data: existingLead, error: searchError } = await query.maybeSingle()

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
      // W-ESTIMATOR-USERID-INSERT-AND-COMPETING-DIAG D1 (2026-06-18):
      // the param has flowed in through CreateLeadParams.userId
      // (L69) since at least 3d7e946, but the INSERT silently
      // omitted the column. recon/estimator-d1-d3-confirm.txt
      // traced it: layers 1–3 of the thread were correct; layer 4
      // (this INSERT) was missing the key, so every lead defaulted
      // user_id NULL on insert and leadFamily aggregation in
      // app/admin-homes/leads/[id]/page.tsx:91 short-circuited.
      // Adding the key is strictly additive: callers that pass
      // userId now write it; callers that don't pass `undefined`
      // → `|| null` → byte-equivalent to pre-fix NULL.
      user_id: params.userId || null,
      building_id: params.buildingId || null,
      listing_id: params.listingId || null,
      source_url: params.sourceUrl || referer || null,
      estimated_value_min: params.estimatedValueMin || null,
      estimated_value_max: params.estimatedValueMax || null,
      property_details: params.propertyDetails || null,
      contact_name: params.contactName,
      contact_email: params.contactEmail,
      contact_phone: params.contactPhone,
      message: params.message,
      source: source,
      lead_origin_route: deriveLeadOriginRoute(source),
      assignment_source: resolvedAgentId ? 'geo' : 'admin',
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
    // P-WORKING-DOC (2026-06-12): plumb tenant.domain + brand_name so the
    // template can build tenant-correct property hrefs via buildBaseUrl.
    // ONE select per send. Tenant context already required for sendTenantEmail
    // (it fetches the same row); CLAIMED-UNVERIFIED whether the two selects
    // could be coalesced — kept separate for now to avoid touching the
    // sendTenantEmail internals.
    let tenantDomain: string | null = null
    let tenantBrandName: string | null = null
    try {
      const { data: tRow } = await supabase
        .from('tenants')
        .select('domain, brand_name, name')
        .eq('id', params.tenantId)
        .maybeSingle()
      tenantDomain = (tRow as any)?.domain ?? null
      tenantBrandName = (tRow as any)?.brand_name ?? (tRow as any)?.name ?? null
    } catch (e) {
      console.warn('[leads] tenant.domain lookup failed; will fall back to NEXT_PUBLIC_APP_URL:', e)
    }
    const baseUrl = buildBaseUrl(tenantDomain)

    // Pull the persisted workingDoc (the source of truth for all 3 sections).
    // The client submit already built it; no matcher re-run.
    const workingDoc: WorkingDoc | null = (params.propertyDetails as any)?.workingDoc ?? null

    // Batch resolve listing_key -> mls_listings.id for tenant-correct hrefs
    // on tiles that don't already carry an id (CompetingListing already has
    // id; ComparableSale carries listingKey only).
    const idMap: Record<string, string> = workingDoc
      ? await resolveListingIds(supabase, collectListingKeys(workingDoc))
      : {}

    // ─── Agent email — enriched from stub to full working document ───────
    const html = buildLeadEmail({
      contactName: params.contactName,
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone,
      message: params.message,
      source,
      sourceUrl: params.sourceUrl || referer || null,
      buildingName: params.propertyDetails?.buildingName,
      buildingAddress: params.propertyDetails?.buildingAddress,
      unitNumber: params.propertyDetails?.unitNumber,
      workingDoc,
      baseUrl,
      idMap,
      brandName: tenantBrandName,
    })
    const subject = `✦ New Lead — ${params.contactName} — ${source}`

    try {
      const sendResult = await sendTenantEmail({
        tenantId: params.tenantId,
        to: recipients.to,
        cc: recipients.cc.length > 0 ? recipients.cc : undefined,
        bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
        subject,
        html,
      })
      if (lead?.id) {
        await logEmailRecipients({
          supabase,
          tenantId: params.tenantId,
          leadId: lead.id,
          agentId: resolvedAgentId,
          recipients,
          subject,
          templateKey: 'leads_helper_new_lead_notification',
          resendMessageId: sendResult.id,
        })
      }
    } catch (err) {
      if (err instanceof TenantEmailNotConfigured) {
        console.warn('[leads] tenant email not configured:', err.message)
      } else if (err instanceof TenantEmailFailed) {
        console.error('[leads] resend send failed:', err.message)
      } else {
        console.error('[leads] unexpected email error:', err)
      }
    }

    // ─── NEW (P-WORKING-DOC): buyer copy of the working document ─────────
    // Property-page estimate-CTA path had ZERO buyer email today. This
    // adds a separate send to params.contactEmail with a buyer-safe template
    // (no "New Lead" / "Reply to {name}" / agent PII). Guard: only fire when
    // the contactEmail is present + plausibly valid + workingDoc carries
    // section content (skip if all 3 sections are empty — nothing to send).
    const buyerEmail = (params.contactEmail || '').trim()
    const hasAnyDocSection = !!(workingDoc?.comparableSold?.tiles?.length
      || workingDoc?.taxMatch?.tiles?.length
      || workingDoc?.competing?.tiles?.length)
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)

    if (buyerEmail && looksLikeEmail && hasAnyDocSection && workingDoc) {
      const buyerHtml = buildBuyerWorkingDocEmail({
        contactName: params.contactName,
        workingDoc,
        baseUrl,
        idMap,
        brandName: tenantBrandName,
      })
      const buyerSubject = `Your estimate working document${tenantBrandName ? ' — ' + tenantBrandName : ''}`
      try {
        const buyerSend = await sendTenantEmail({
          tenantId: params.tenantId,
          to: buyerEmail,
          subject: buyerSubject,
          html: buyerHtml,
        })
        if (lead?.id) {
          await logEmailRecipients({
            supabase,
            tenantId: params.tenantId,
            leadId: lead.id,
            agentId: resolvedAgentId,
            recipients: { to: [buyerEmail], cc: [], bcc: [], resolved: { agent: null, manager: null, area_manager: null, tenant_admin: null, manager_platforms: [], admin_platforms: [], agent_delegates: [], manager_delegates: [], area_manager_delegates: [], tenant_admin_delegates: [] } } as any,
            subject: buyerSubject,
            templateKey: 'leads_helper_buyer_working_doc',
            resendMessageId: buyerSend.id,
          })
        }
      } catch (err) {
        if (err instanceof TenantEmailNotConfigured) {
          console.warn('[leads] buyer email not configured:', err.message)
        } else if (err instanceof TenantEmailFailed) {
          console.error('[leads] buyer resend send failed:', err.message)
        } else {
          console.error('[leads] buyer unexpected email error:', err)
        }
      }
    }
  }

  return { success: true, lead }
}

// ─── updateLeadEnrichment ────────────────────────────────────────────────────
// W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17): ADDITIVE write helper for the
// estimator/offer form-submit ENRICHMENT step. When fire-on-generate has
// already created the lead (with the rich workingDoc), the optional contact
// form that follows updates ONLY the contact_name / contact_phone / message
// fields onto the SAME lead row. NO email re-fire (this function does not
// touch sendTenantEmail or the helper fan-out). NO change to dedup
// semantics (createLead / getOrCreateLead bodies untouched).
//
// Tenant-scoped: the WHERE clause requires (id AND tenant_id) so a hostile
// or stale client cannot enrich a lead it doesn't own.
//
// Returns { success: true, lead } on success or { success: false, error }
// on failure. Caller decides what to surface; existing UX shows a soft
// warning on enrichment failure (the lead row + emails already fired
// at generate time, so this is a strictly additive write).
export async function updateLeadEnrichment(params: {
  leadId: string
  tenantId: string
  contactName?: string
  contactPhone?: string
  message?: string
}) {
  if (!params.leadId || !params.tenantId) {
    return { success: false, error: 'leadId and tenantId are required' }
  }
  const supabase = createServiceClient()
  // Only set fields the caller actually provided; never null an existing
  // value just because the caller skipped it.
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof params.contactName === 'string' && params.contactName.trim()) {
    patch.contact_name = params.contactName.trim()
  }
  if (typeof params.contactPhone === 'string' && params.contactPhone.trim()) {
    patch.contact_phone = params.contactPhone.trim()
  }
  if (typeof params.message === 'string' && params.message.trim()) {
    patch.message = params.message.trim()
  }
  // No fields to set besides updated_at — caller may just want a bump.
  const { data: lead, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', params.leadId)
    .eq('tenant_id', params.tenantId)
    .select()
    .single()
  if (error) {
    console.error('[leads] updateLeadEnrichment error:', error)
    return { success: false, error: error.message }
  }
  return { success: true, lead }
}

// ─── Email body ──────────────────────────────────────────────────────────────
// Mirrors the visual shape used by walliam/contact for consistency across all
// chain notifications. No agent-specific branding here — the helper resolves
// recipients per tenant; this template is content-only.
//
// P-WORKING-DOC (2026-06-12): enriched from stub to the full 3-section working
// document. Existing contact block is preserved; the working-document sections
// (Comparable Sold / Tax-Matched / Competing For Sale) are appended via the
// shared render helper when workingDoc is present. Property hrefs use
// buildBaseUrl(tenantDomain) for tenant-correctness.
function buildLeadEmail(params: {
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
  source: string
  sourceUrl?: string | null
  buildingName?: string
  buildingAddress?: string
  unitNumber?: string
  workingDoc?: WorkingDoc | null
  baseUrl?: string
  idMap?: Record<string, string>
  brandName?: string | null
}): string {
  const { contactName, contactEmail, contactPhone, message, source, sourceUrl, buildingName, buildingAddress, unitNumber } = params
  const propertyLine = buildingName || buildingAddress
    ? `${buildingName || ''}${buildingAddress ? ' — ' + buildingAddress : ''}${unitNumber ? ' #' + unitNumber : ''}`
    : null

  const workingDocBlock = params.workingDoc && params.baseUrl
    ? renderEstimateHeader(params.workingDoc, { audience: 'agent', brandName: params.brandName || undefined })
      + renderWorkingDocSections(params.workingDoc, params.baseUrl, params.idMap || {}, { audience: 'agent', brandName: params.brandName || undefined })
    : ''

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
          ${sourceUrl ? `<tr><td style="color: #64748b; vertical-align: top;">Source URL</td><td style="color: #0f172a; word-break: break-all;"><a href="${sourceUrl}" style="color: #1d4ed8;">${sourceUrl}</a></td></tr>` : ''}
          ${message ? `<tr><td style="color: #64748b; vertical-align: top;">Message</td><td style="color: #0f172a;">${message}</td></tr>` : ''}
        </table>
        ${workingDocBlock}
        <div style="margin-top: 20px; text-align: center;">
          <a href="mailto:${contactEmail}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            Reply to ${contactName}
          </a>
        </div>
      </div>
    </div>
  `
}

// ─── NEW (P-WORKING-DOC): buyer copy template ────────────────────────────────
// Property-page estimate path had no buyer email today. This template ships
// the full 3-section working document to params.contactEmail with buyer-safe
// phrasing: NO "New Lead", NO "Reply to {name}", NO other recipients, NO
// agent PII. Property hrefs use buildBaseUrl(tenantDomain) — tenant-correct.
function buildBuyerWorkingDocEmail(params: {
  contactName: string
  workingDoc: WorkingDoc
  baseUrl: string
  idMap?: Record<string, string>
  brandName?: string | null
}): string {
  const name = (params.contactName || '').trim() || 'there'
  const brand = params.brandName || ''
  const headerLabel = brand ? `${brand} — Estimate Working Document` : 'Estimate Working Document'
  const headerBlock = renderEstimateHeader(params.workingDoc, { audience: 'buyer', brandName: params.brandName || undefined })
  const sectionsBlock = renderWorkingDocSections(
    params.workingDoc,
    params.baseUrl,
    params.idMap || {},
    { audience: 'buyer', brandName: params.brandName || undefined },
  )
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 18px; font-weight: 700; color: #fff;">${headerLabel}</div>
        <div style="font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 4px;">Hi ${name} — here is your estimate, kept current.</div>
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <div style="font-size: 13px; color: #475569; line-height: 1.6;">
          This is the working document for your property estimate. Each comparable below links to the live listing — the document stays reachable so you can revisit it any time.
        </div>
        ${headerBlock}
        ${sectionsBlock}
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
          Comparable selection methodology and live data are continuously updated. Values shown are statistical estimates from recent comparable sales, not appraisals.
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
