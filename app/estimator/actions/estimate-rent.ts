// app/estimator/actions/estimate-rent.ts
'use server'

import { findComparablesRentals } from '@/lib/estimator/comparable-matcher-rentals'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs } from '@/lib/estimator/types'

/**
 * Server action to estimate monthly rent
 * Returns base rent + separate parking/locker costs
 */
export async function estimateRent(
  specs: UnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult & { parkingCost?: number; lockerCost?: number }; error?: string }> {
  
  try {
    // Step 1: Find comparable leases in the building
    const comparables = await findComparablesRentals(specs)
    
    if (comparables.length === 0) {
      return {
        success: false,
        error: `No lease data available for ${specs.bedrooms}-bedroom units in this building over the past 2 years. Unable to generate estimate.`
      }
    }
    
    // Step 2: Calculate statistical estimate for base rent
    const estimate = calculateEstimate(specs, comparables)
    
    // Step 3: Calculate parking cost (market average: $100-500/month per space)
    // Using $250/month as average for Toronto condos
    const parkingCost = specs.parking > 0 ? specs.parking * 250 : 0
    
    // Step 4: Calculate locker cost (market average: ~$100/month)
    const lockerCost = specs.hasLocker ? 100 : 0
    
    // Step 5: Add AI insights if requested (and API key is configured)
    let aiInsights = undefined
    if (includeAI) {
      try {
        aiInsights = await getAIInsights(specs, estimate.estimatedPrice, comparables)
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