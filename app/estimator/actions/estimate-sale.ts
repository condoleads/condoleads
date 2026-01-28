// app/estimator/actions/estimate-sale.ts
'use server'
import { findComparables } from '@/lib/estimator/comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs } from '@/lib/estimator/types'
import { resolveAdjustments } from '@/lib/estimator/resolve-adjustments'
import { createClient } from '@/lib/supabase/server'

/**
 * Server action to estimate condo sale price
 * Uses tiered matching: BINGO -> BINGO-ADJ -> RANGE -> RANGE-ADJ -> MAINT -> MAINT-ADJ -> CONTACT
 *
 * Value Priority: Building (direct) -> Building (adj) -> Community -> Neighbourhood -> Municipality -> Area -> Generic -> Hardcoded
 */
export async function estimateSale(
  specs: UnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult; error?: string }> {
  console.log('[estimateSale] specs.buildingSlug:', specs.buildingSlug)
  try {
    // Resolve adjustment values using hierarchy cascade
    const adjustmentValues = await resolveAdjustments(specs.buildingId, 'sale')
    console.log('[estimateSale] Resolved adjustments:', adjustmentValues)

    // Step 1: Find comparable sales using tiered matching (pass resolved values)
    const matchResult = await findComparables(specs, adjustmentValues)
    console.log(`[Estimator] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}`)

    // Step 2: Calculate estimate based on tier
    const estimate = calculateEstimate(matchResult)

    // Step 3: Add AI insights if requested and we have a price to analyze
    let aiInsights = undefined
    if (includeAI && estimate.showPrice && estimate.estimatedPrice > 0 && specs.agentId) {
      try {
        // Check agent's AI estimator settings
        const supabase = createClient()
        const { data: agent } = await supabase
          .from('agents')
          .select('ai_estimator_enabled, anthropic_api_key')
          .eq('id', specs.agentId)
          .single()

        if (agent?.ai_estimator_enabled && agent?.anthropic_api_key) {
          aiInsights = await getAIInsights(specs, estimate.estimatedPrice, matchResult.comparables, agent.anthropic_api_key)
        } else {
          console.log('[estimateSale] AI insights skipped - not enabled or no API key')
        }
      } catch (aiError) {
        console.log('AI insights unavailable:', aiError)
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
