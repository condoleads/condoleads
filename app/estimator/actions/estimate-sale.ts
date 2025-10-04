// app/estimator/actions/estimate-sale.ts
'use server'

import { findComparables } from '@/lib/estimator/comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs } from '@/lib/estimator/types'

/**
 * Server action to estimate condo sale price
 * Used by both buyer (auto-fill) and seller (manual) forms
 */
export async function estimateSale(
  specs: UnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult; error?: string }> {
  
  try {
    // Step 1: Find comparable sales in the building
    const comparables = await findComparables(specs)
    
    if (comparables.length === 0) {
      return {
        success: false,
        error: \No sales data available for \-bedroom units in this building over the past 2 years. Unable to generate estimate.\
      }
    }
    
    // Step 2: Calculate statistical estimate
    const estimate = calculateEstimate(specs, comparables)
    
    // Step 3: Add AI insights if requested (and API key is configured)
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
        aiInsights
      }
    }
    
  } catch (error) {
    console.error('Error estimating sale price:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate estimate'
    }
  }
}
