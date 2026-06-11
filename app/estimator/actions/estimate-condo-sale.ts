// app/estimator/actions/estimate-condo-sale.ts
// c2 (2026-06-10) — System 2 condo sale estimate entry.
// Calls the new condo-comparable-matcher-sales.ts (S2-only). Tenant-gated
// at the call site (PropertyEstimateCTA branches on tenant present + SALE).
'use server'

import {
  findCondoComparablesSales,
  type CondoSaleSpecs,
} from '@/lib/estimator/condo-comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { EstimateResult } from '@/lib/estimator/types'
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'
import { createClient } from '@/lib/supabase/server'

export async function estimateCondoSale(
  specs: CondoSaleSpecs,
  _includeAI: boolean = false,
): Promise<{ success: boolean; data?: EstimateResult; error?: string; geoLevel?: string }> {
  try {
    const tenantId = specs.tenantId ?? (await getCurrentTenantId())

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

    const fullSpecs: CondoSaleSpecs = {
      ...specs,
      tenantId,
      communityId,
      municipalityId,
      areaId,
    }

    const matchResult = await findCondoComparablesSales(fullSpecs)
    const estimate = calculateEstimate({ tier: matchResult.tier, comparables: matchResult.comparables })

    // W-TAX-MATCH (2026-06-11): when the matcher returned a tax-matched comp
    // set, run the SAME calculateEstimate on it to get its own estimatedPrice
    // + priceRange. The tax section in EstimatorResults shows this as its own
    // co-equal estimate. NO combined/blended number (backtest measured worse).
    // Default condo marketNoun (no override) is correct here — same as the
    // geo estimate above.
    // W-TAX-MATCH b1 (2026-06-11): price math runs over WINNER comparables
    // only (winning-tier slice) — preserves the N=200 backtest's 8.4%
    // median APE measurement. The client-facing `comparables` field carries
    // the multi-tier DISPLAY list (sourceTier-stamped, deduped, capped)
    // built by runTaxMatchCascade. Price unchanged from ffd9429; display
    // gets richer.
    let taxMatch: EstimateResult['taxMatch'] = undefined
    if (matchResult.taxMatch && matchResult.taxMatch.winnerComparables.length > 0) {
      const taxEst = calculateEstimate({
        tier: matchResult.taxMatch.matchTier,
        comparables: matchResult.taxMatch.winnerComparables,
      })
      taxMatch = {
        matchTier:      matchResult.taxMatch.matchTier,
        comparables:    matchResult.taxMatch.comparables,
        estimatedPrice: taxEst.estimatedPrice,
        priceRange:     taxEst.priceRange,
        count:          matchResult.taxMatch.count,
        tiers:          matchResult.taxMatch.tiers,
        bestGeoTier:    matchResult.taxMatch.bestGeoTier,
      }
    }

    // W-CONDO-MODAL-PARITY Phase 1 (2026-06-11): propagate tiers,
    // bestGeoTier, and geoLevel onto the action's return. Display-only —
    // estimatedPrice, priceRange, matchTier are unchanged (selection
    // logic preserved in the matcher).
    return {
      success: true,
      data: {
        ...estimate,
        tiers: matchResult.tiers,
        bestGeoTier: matchResult.bestGeoTier,
        taxMatch,
      },
      geoLevel: matchResult.geoLevel,
    }
  } catch (error) {
    console.error('Error estimating condo sale:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate condo sale estimate',
    }
  }
}
