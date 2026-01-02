// app/estimator/actions/estimate-rent.ts
'use server'
import { findComparablesRentals } from '@/lib/estimator/comparable-matcher-rentals'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs } from '@/lib/estimator/types'
import { resolveAdjustments } from '@/lib/estimator/resolve-adjustments'

/**
 * Server action to estimate monthly rent
 * Uses 5-tier matching: BINGO -> BINGO-ADJ -> RANGE -> RANGE-ADJ -> CONTACT
 *
 * Value Priority: Building (direct) -> Building (adj) -> Community -> Neighbourhood -> Municipality -> Area -> Generic -> Hardcoded
 */
export async function estimateRent(
  specs: UnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult & { parkingCost?: number; lockerCost?: number }; error?: string }> {
  try {
    // Resolve adjustment values using hierarchy cascade
    const adjustmentValues = await resolveAdjustments(specs.buildingId, 'lease')
    console.log('[estimateRent] Resolved adjustments:', adjustmentValues)

    // Step 1: Find comparable leases using tiered matching
    const matchResult = await findComparablesRentals(specs, adjustmentValues)
    console.log(`[Rental Estimator] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}`)

    // Step 2: Calculate estimate based on tier
    const estimate = calculateEstimate(matchResult)

    // Step 3: Calculate parking cost using resolved values
    const parkingCost = specs.parking > 0 ? specs.parking * adjustmentValues.parkingPerSpace : 0

    // Step 4: Calculate locker cost using resolved values
    const lockerCost = specs.hasLocker ? adjustmentValues.locker : 0

    // Step 5: Add AI insights if requested and we have a price
    let aiInsights = undefined
    if (includeAI && estimate.showPrice && estimate.estimatedPrice > 0) {
      try {
        aiInsights = await getAIInsights(specs, estimate.estimatedPrice, matchResult.comparables)
      } catch (aiError) {
        console.log('AI insights unavailable:', aiError)
      }
    }

    return {
      success: true,
      data: {
        ...estimate,
        parkingCost,
        lockerCost,
        aiInsights
      }
    }
  } catch (error) {
    console.error('Error estimating rent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate estimate'
    }
  }
}
