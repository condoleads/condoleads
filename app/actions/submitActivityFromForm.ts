'use server'

/**
 * submitActivityFromForm
 *
 * Client-callable server action for activity tracking from public-facing components.
 *
 * Architectural role (W-TENANT-AUTH File 7c):
 *   - Single entry point for client components that track user activity (form
 *     submissions, page-view events, engagement signals, etc.).
 *   - Reads x-tenant-id from request headers (set by middleware) and resolves
 *     tenantId server-side. Client components NEVER pass tenantId.
 *   - Delegates to `trackActivity` which has a strict contract requiring tenantId.
 *
 * Same pattern as `submitLeadFromForm` — request-scoped tenant resolution at the
 * server boundary, never trusted from the client.
 */

import { headers } from 'next/headers'
import { trackActivity, type ActivityType } from '@/lib/actions/user-activity'

interface SubmitActivityFromFormParams {
  contactEmail: string
  agentId?: string
  activityType: ActivityType
  activityData?: any
  pageUrl?: string
}

export async function submitActivityFromForm(params: SubmitActivityFromFormParams) {
  const headersList = headers()
  let tenantId = headersList.get('x-tenant-id')

  if (!tenantId) {
    // W-AILY-ESTIMATOR-LEAD-GAP (2026-06-22): host-based fallback.
    const { getCurrentTenantId } = await import('@/lib/utils/tenant-resolver')
    tenantId = await getCurrentTenantId()
  }

  if (!tenantId) {
    console.error('[submitActivityFromForm] tenant unresolved from header AND host')
    return {
      success: false,
      error: 'Tenant context unavailable.'
    }
  }

  return await trackActivity({
    tenantId,
    contactEmail: params.contactEmail,
    agentId: params.agentId,
    activityType: params.activityType,
    activityData: params.activityData,
    pageUrl: params.pageUrl,
  })
}