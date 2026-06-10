// app/estimator/actions/estimate-condo-rent.ts
// c1 (2026-06-10) — System 2 condo rent estimate entry.
// Calls the new condo-comparable-matcher-rentals.ts (S2-only). Tenant-gated
// at the call site (PropertyEstimateCTA branches on tenant present).
'use server'

import {
  findCondoComparablesRentals,
  type CondoLeaseSpecs,
} from '@/lib/estimator/condo-comparable-matcher-rentals'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { EstimateResult } from '@/lib/estimator/types'
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'
import { createClient } from '@/lib/supabase/server'

export async function estimateCondoRent(
  specs: CondoLeaseSpecs,
  _includeAI: boolean = false,
): Promise<{ success: boolean; data?: EstimateResult; error?: string }> {
  try {
    const tenantId = specs.tenantId ?? (await getCurrentTenantId())

    // Resolve community/muni/area for the geo cascade. The caller (CTA) is
    // responsible for threading buildingId; this server-side step fills in
    // the rest via the building → community → muni → area chain.
    let communityId: string | null = specs.communityId ?? null
    let municipalityId: string | null = specs.municipalityId ?? null
    let areaId: string | null = specs.areaId ?? null

    if (!communityId || !municipalityId || !areaId) {
      const supabase = createClient()
      if (specs.buildingId) {
        const { data: building } = await supabase
          .from('buildings')
          .select(`
            community_id,
            communities (
              municipality_id,
              municipalities ( area_id )
            )
          `)
          .eq('id', specs.buildingId)
          .single()
        const community = (building as any)?.communities
        const municipality = community?.municipalities
        communityId = communityId || (building as any)?.community_id || null
        municipalityId = municipalityId || community?.municipality_id || null
        areaId = areaId || municipality?.area_id || null
      }
    }

    const fullSpecs: CondoLeaseSpecs = {
      ...specs,
      tenantId,
      communityId,
      municipalityId,
      areaId,
    }

    const matchResult = await findCondoComparablesRentals(fullSpecs)
    const estimate = calculateEstimate({ tier: matchResult.tier, comparables: matchResult.comparables })

    return {
      success: true,
      data: { ...estimate },
    }
  } catch (error) {
    console.error('Error estimating condo rent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate condo rent estimate',
    }
  }
}
