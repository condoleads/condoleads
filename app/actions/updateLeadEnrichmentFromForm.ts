'use server'

/**
 * updateLeadEnrichmentFromForm
 *
 * W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17) — client-callable server-action
 * wrapper for the additive lib/actions/leads.ts:updateLeadEnrichment helper.
 *
 * Architectural role:
 *   - Mirrors submitLeadFromForm.ts's tenant-resolution pattern: reads
 *     `x-tenant-id` from request headers (set by middleware per
 *     W-ESTIMATOR-TENANT-HEADER fix e79c670), refuses if absent.
 *   - Wraps the additive enrichment helper so client components can
 *     enrich a lead from the optional follow-up contact form WITHOUT
 *     re-firing the lead-create + email-fan-out path.
 *
 * Used by:
 *   - EstimatorResults.tsx contact-form submit (after fire-on-generate
 *     has already created the lead via submitLeadFromForm + the rich
 *     workingDoc payload).
 *   - HomeEstimatorResults.tsx ditto for the home estimator path.
 *   - OfferInquiryModal.tsx ditto for the Sale/Lease Offer form.
 *
 * Never creates a lead. Never sends an email. Strictly an UPDATE on the
 * existing lead row's contact_name / contact_phone / message fields,
 * tenant-scoped.
 */

import { headers } from 'next/headers'
import { updateLeadEnrichment } from '@/lib/actions/leads'

interface SubmitParams {
  leadId: string
  contactName?: string
  contactPhone?: string
  message?: string
}

export async function updateLeadEnrichmentFromForm(params: SubmitParams) {
  const headersList = headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) {
    console.error('[updateLeadEnrichmentFromForm] x-tenant-id header missing')
    return { success: false, error: 'Tenant context unavailable.' }
  }
  if (!params.leadId) {
    return { success: false, error: 'leadId is required' }
  }
  return await updateLeadEnrichment({
    leadId:      params.leadId,
    tenantId,
    contactName: params.contactName,
    contactPhone: params.contactPhone,
    message:     params.message,
  })
}
