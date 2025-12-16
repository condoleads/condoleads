// app/estimator/actions/estimate-rent.ts
'use server'

import { findComparablesRentals } from '@/lib/estimator/comparable-matcher-rentals'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs } from '@/lib/estimator/types'

/**
 * Server action to estimate monthly rent
 * Uses 5-tier matching: BINGO → BINGO-ADJ → RANGE → RANGE-ADJ → CONTACT
 */
export async function estimateRent(
  specs: UnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult & { parkingCost?: number; lockerCost?: number }; error?: string }> {
  try {
    // Step 1: Find comparable leases using tiered matching
    const matchResult = await findComparablesRentals(specs)
    
    console.log(`[Rental Estimator] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}`)

    // Step 2: Calculate estimate based on tier
    const estimate = calculateEstimate(matchResult)

    // Step 3: Calculate parking cost (market average for Toronto)
    const parkingCost = specs.parking > 0 ? specs.parking * 200 : 0

    // Step 4: Calculate locker cost (market average for Toronto)
    const lockerCost = specs.hasLocker ? 50 : 0

    // Step 5: Add AI insights if requested and we have a price
    let aiInsights = undefined
    if (includeAI && estimate.showPrice && estimate.estimatedPrice > 0) {
      try {
        aiInsights = await getAIInsights(specs, estimate.estimatedPrice, matchResult.comparables)
      } catch (aiError) {
        console.log('AI insights unavailable:', aiError)
        // Continue without AI - not a critical failure
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