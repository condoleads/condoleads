'use server'

/**
 * submitLeadFromForm
 *
 * Client-callable server action for all public form submissions.
 *
 * Architectural role:
 *   - Single entry point for client components that submit leads (8 components: contact forms,
 *     estimator results, modals, etc).
 *   - Reads `x-tenant-id` from request headers (set by middleware) and resolves tenant_id
 *     server-side. Client components NEVER pass tenantId — they cannot be trusted to.
 *   - Delegates to `getOrCreateLead` from `lib/actions/leads`, which has a strict contract
 *     requiring tenantId. This wrapper is the bridge.
 *
 * Why this exists (W-TENANT-AUTH Phase 3):
 *   - Multi-tenant requires every lead to be scoped to a tenant.
 *   - Server-to-server callers (Charlie plan-email, walliam/contact, vip-request) already
 *     read x-tenant-id directly and pass tenantId explicitly to getOrCreateLead.
 *   - Client components can't access headers(). This wrapper is their tenant-resolution
 *     boundary — same pattern, just with a server-action hop.
 *   - When tenant-2 onboards, every form on tenant-2's domain works automatically because
 *     middleware sets the right x-tenant-id; no per-component changes needed.
 */

import { headers } from 'next/headers'
import { getOrCreateLead } from '@/lib/actions/leads'

interface SubmitLeadFromFormParams {
  agentId?: string
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
  forceNew?: boolean
}

export async function submitLeadFromForm(params: SubmitLeadFromFormParams) {
  const headersList = headers()
  const tenantId = headersList.get('x-tenant-id')

  if (!tenantId) {
    console.error('[submitLeadFromForm] x-tenant-id header missing — middleware should set this on every request')
    return {
      success: false,
      error: 'Tenant context unavailable. Please refresh and try again.'
    }
  }

  return await getOrCreateLead({
    tenantId,
    agentId: params.agentId,
    buildingId: params.buildingId,
    contactName: params.contactName,
    contactEmail: params.contactEmail,
    contactPhone: params.contactPhone,
    message: params.message,
    source: params.source,
    sourceUrl: params.sourceUrl,
    listingId: params.listingId,
    communityId: params.communityId,
    municipalityId: params.municipalityId,
    areaId: params.areaId,
    userId: params.userId,
    estimatedValueMin: params.estimatedValueMin,
    estimatedValueMax: params.estimatedValueMax,
    propertyDetails: params.propertyDetails,
    forceNew: params.forceNew,
  })
}