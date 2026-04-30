'use server'

/**
 * createLeadFromRegistration
 *
 * Server action invoked from registration flows.
 *
 * Architectural role (W-TENANT-AUTH Phase 3):
 *   - Reads `x-tenant-id` from request headers (set by middleware).
 *   - Resolves a building/development from the URL slug if no buildingId was passed
 *     (preserves `extractBuildingFromUrl` logic — independent of agent resolution).
 *   - Delegates lead creation to `getOrCreateLead`, which:
 *       - Performs duplicate detection on (contact_email, tenant_id).
 *       - Resolves agent via `resolve_agent_for_context(tenant_id, ...)` RPC.
 *       - Writes tenant_id to the leads row.
 *
 * Removed in Phase 3: `resolveAgentFromHost(supabase, host)` — System 1 host-based agent
 * resolution. System 1 isolation preserved (System 1 routes still have their own host
 * resolver, untouched). Single caller is RegisterModal (System 2). After File 9 lands
 * (RegisterModal rewrite to call joinTenant), this function becomes dead code; deletion
 * deferred to post-W-TENANT-AUTH cleanup ticket.
 */

import { createClient } from '@/lib/supabase/server'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'
import { headers } from 'next/headers'

interface CreateLeadFromRegistrationParams {
  userId: string
  fullName: string
  email: string
  phone?: string
  registrationSource: string
  registrationUrl?: string
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
  listingId?: string
  listingAddress?: string
  unitNumber?: string
  message?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  propertyDetails?: any
}

export async function createLeadFromRegistration(params: CreateLeadFromRegistrationParams) {
  try {
    const headersList = headers()
    const tenantId = headersList.get('x-tenant-id')

    if (!tenantId) {
      console.error('[createLeadFromRegistration] x-tenant-id missing')
      return { success: false, error: 'Tenant context unavailable' }
    }

    const supabase = createClient()

    // Source mapping (preserved verbatim from prior version)
    const sourceMap: Record<string, string> = {
      'home_page': 'registration',
      'listing_card': 'property_inquiry',
      'estimator': 'estimator',
      'building_page': 'contact_form',
      'contact_form': 'contact_form',
      'message_agent': 'contact_form',
      'sale_offer': 'sale_evaluation_request',
      'building_visit': 'building_visit_request',
      'property_inquiry': 'property_inquiry'
    }

    const leadSource = sourceMap[params.registrationSource] || 'registration'

    // Building resolution: if no buildingId was passed, try to derive from URL.
    let finalBuildingId = params.buildingId
    let finalBuildingName = params.buildingName
    let finalBuildingAddress = params.buildingAddress

    if (!finalBuildingId && params.registrationUrl) {
      const buildingInfo = await extractBuildingFromUrl(supabase, params.registrationUrl)
      if (buildingInfo) {
        finalBuildingId = buildingInfo.id || undefined
        if (!finalBuildingName) finalBuildingName = buildingInfo.building_name
        if (!finalBuildingAddress) finalBuildingAddress = buildingInfo.canonical_address
      }
    }

    // Enrich missing building info if we have buildingId but missing name/address
    if (finalBuildingId && (!finalBuildingName || !finalBuildingAddress)) {
      const { data: buildingData } = await supabase
        .from('buildings')
        .select('building_name, canonical_address')
        .eq('id', finalBuildingId)
        .single()
      if (buildingData) {
        if (!finalBuildingName) finalBuildingName = buildingData.building_name
        if (!finalBuildingAddress) finalBuildingAddress = buildingData.canonical_address
      }
    }

    // Enrich unit number from listing if missing
    if (params.listingId && !params.unitNumber) {
      const { data: listingData } = await supabase
        .from('mls_listings')
        .select('unit_number')
        .eq('id', params.listingId)
        .single()
      if (listingData?.unit_number) {
        params.unitNumber = listingData.unit_number
      }
    }

    const sourceUrl = params.registrationUrl || undefined

    // Form-submission sources always force a new lead row (preserved behavior)
    const formSubmissionSources = [
      'contact_form',
      'listing_card',
      'building_page',
      'message_agent',
      'sale_offer',
      'building_visit',
      'property_inquiry',
      'home_page'
    ]
    const shouldForceNewLead = formSubmissionSources.includes(params.registrationSource)

    // Track the activity for analytics (best-effort; non-fatal). Tenant-scoped.
    try {
      await trackActivity({
        tenantId,
        contactEmail: params.email,
        activityType: leadSource as any,
        activityData: {
          buildingId: finalBuildingId,
          buildingName: finalBuildingName,
          listingId: params.listingId,
          source: params.registrationSource,
        },
      })
    } catch (err) {
      console.error('[createLeadFromRegistration] trackActivity error (non-fatal):', err)
    }

    // Delegate to tenant-aware lead creation.
    // No agentId passed — getOrCreateLead resolves it via resolve_agent_for_context(tenant_id, ...).
    const result = await getOrCreateLead({
      tenantId,
      userId: params.userId,
      contactName: params.fullName,
      contactEmail: params.email,
      contactPhone: params.phone,
      source: leadSource,
      sourceUrl: sourceUrl,
      buildingId: finalBuildingId,
      listingId: params.listingId,
      message: params.message,
      estimatedValueMin: params.estimatedValueMin,
      estimatedValueMax: params.estimatedValueMax,
      propertyDetails: {
        ...(params.propertyDetails || {}),
        buildingName: finalBuildingName,
        buildingAddress: finalBuildingAddress,
        unitNumber: params.unitNumber,
        listingAddress: params.listingAddress,
      },
      forceNew: shouldForceNewLead,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, leadId: result.lead?.id }

  } catch (error: any) {
    console.error('[createLeadFromRegistration] error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * extractBuildingFromUrl
 *
 * Resolve a building or development from a URL slug.
 * Preserved verbatim from the pre-W-TENANT-AUTH version — agent-resolution-independent.
 */
async function extractBuildingFromUrl(
  supabase: any,
  registrationUrl: string
): Promise<{ id: string; building_name: string; canonical_address: string } | null> {
  try {
    const url = new URL(registrationUrl, 'https://condoleads.ca')
    const pathSegments = url.pathname.split('/').filter(s => s)
    const slug = pathSegments[0]

    if (!slug || ['estimator', 'dashboard', 'login', 'admin', 'property', 'team'].includes(slug)) {
      return null
    }

    const { data: exactBuildingMatch } = await supabase
      .from('buildings')
      .select('id, building_name, canonical_address')
      .eq('slug', slug)
      .single()

    if (exactBuildingMatch) {
      return exactBuildingMatch
    }

    const { data: exactDevMatch } = await supabase
      .from('developments')
      .select('id, name, slug')
      .eq('slug', slug)
      .single()

    if (exactDevMatch) {
      const { data: devBuildings } = await supabase
        .from('buildings')
        .select('id, building_name, canonical_address')
        .eq('development_id', exactDevMatch.id)
        .order('building_name')

      if (devBuildings && devBuildings.length > 0) {
        const allAddresses = devBuildings.map((b: any) => b.canonical_address).join(' & ')
        return {
          id: devBuildings[0].id,
          building_name: exactDevMatch.name,
          canonical_address: allAddresses,
        }
      }
      return {
        id: '',
        building_name: exactDevMatch.name,
        canonical_address: '',
      }
    }

    const slugParts = slug.split('-')
    for (let i = Math.min(slugParts.length, 6); i >= 2; i--) {
      const partialSlug = slugParts.slice(0, i).join('-')

      const { data: partialBuildingMatches } = await supabase
        .from('buildings')
        .select('id, building_name, canonical_address, slug')
        .ilike('slug', `${partialSlug}%`)
        .limit(5)

      if (partialBuildingMatches && partialBuildingMatches.length > 0) {
        if (partialBuildingMatches.length === 1) {
          return partialBuildingMatches[0]
        }
        for (const building of partialBuildingMatches) {
          if (slug.includes(building.slug.split('-').slice(0, 4).join('-'))) {
            return building
          }
        }
        return partialBuildingMatches[0]
      }

      const { data: partialDevMatches } = await supabase
        .from('developments')
        .select('id, name, slug')
        .ilike('slug', `${partialSlug}%`)
        .limit(3)

      if (partialDevMatches && partialDevMatches.length > 0) {
        const dev = partialDevMatches[0]
        const { data: devBuilding } = await supabase
          .from('buildings')
          .select('id, building_name, canonical_address')
          .eq('development_id', dev.id)
          .limit(1)
          .single()

        if (devBuilding) {
          return {
            id: devBuilding.id,
            building_name: dev.name,
            canonical_address: devBuilding.canonical_address,
          }
        }
        return {
          id: '',
          building_name: dev.name,
          canonical_address: '',
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error extracting building from URL:', error)
    return null
  }
}