// app/estimator/actions/estimate-home-sale.ts
'use server'
import { findHomeComparablesSales } from '@/lib/estimator/home-comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, HomeUnitSpecs } from '@/lib/estimator/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Server action to estimate home sale price
 * Uses community-based matching with fallback to municipality
 * Scoring: Frontage (#1) → Sqft → Bathroom → Age → Stories → Tax → Recency
 */
export async function estimateHomeSale(
  specs: HomeUnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult; error?: string }> {
  console.log('[estimateHomeSale] community:', specs.communityId, 'subtype:', specs.propertySubtype)
  try {
    // Step 1: Find comparable sales using geographic + subtype matching
    const matchResult = await findHomeComparablesSales(specs)
    console.log(`[estimateHomeSale] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}`)

    // Step 2: Calculate estimate
    const estimate = calculateEstimate(matchResult)

    // Step 3: Add AI insights if requested
    let aiInsights = undefined
    if (includeAI && estimate.showPrice && estimate.estimatedPrice > 0 && specs.agentId) {
      try {
        const supabase = createClient()
        const { data: agent } = await supabase
          .from('agents')
          .select('ai_estimator_enabled, anthropic_api_key')
          .eq('id', specs.agentId)
          .single()

        if (agent?.ai_estimator_enabled && agent?.anthropic_api_key) {
          // Build a pseudo UnitSpecs for AI insights (reuses existing function)
          const pseudoSpecs = {
            bedrooms: specs.bedrooms,
            bathrooms: specs.bathrooms,
            livingAreaRange: specs.livingAreaRange || '',
            parking: 0,
            hasLocker: false,
            buildingId: specs.communityId, // Use community as context
            exactSqft: specs.exactSqft,
            taxAnnualAmount: specs.taxAnnualAmount,
          }
          aiInsights = await getAIInsights(pseudoSpecs, estimate.estimatedPrice, matchResult.comparables, agent.anthropic_api_key)
        } else {
          console.log('[estimateHomeSale] AI insights skipped - not enabled or no API key')
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
    console.error('Error estimating home sale price:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate estimate'
    }
  }
}