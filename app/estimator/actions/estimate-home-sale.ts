// app/estimator/actions/estimate-home-sale.ts
'use server'
import { findHomeComparables, HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { EstimateResult } from '@/lib/estimator/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Server action to estimate home sale price
 * Uses cascading geographic matching: Community → Municipality
 */
export async function estimateHomeSale(
  specs: HomeSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult; error?: string; geoLevel?: string }> {
  console.log('[estimateHomeSale] specs:', {
    bedrooms: specs.bedrooms,
    bathrooms: specs.bathrooms,
    propertySubtype: specs.propertySubtype,
    communityId: specs.communityId,
    municipalityId: specs.municipalityId,
  })

  try {
    // Step 1: Find comparable home sales using geographic cascading
    const matchResult = await findHomeComparables(specs)
    console.log(`[HomeEstimator] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}, geo: ${matchResult.geoLevel}`)

    if (matchResult.comparables.length === 0) {
      return {
        success: true,
        data: {
          estimatedPrice: 0,
          priceRange: { low: 0, high: 0 },
          confidence: 'Low',
          confidenceMessage: 'Not enough data for automated estimate',
          comparables: [],
          showPrice: false,
          matchTier: 'CONTACT',
          marketSpeed: {
            avgDaysOnMarket: 0,
            status: 'Moderate' as const,
            message: 'Not enough data to determine market speed'
          }
        },
        geoLevel: matchResult.geoLevel,
        error: 'Not enough comparable sales in this area to generate an estimate. Try contacting the agent directly.'
      }
    }

    // Step 2: Calculate estimate using existing statistical calculator
    const estimate = calculateEstimate(matchResult)

    // Step 3: AI insights (if enabled and agent has API key)
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
          const { getAIInsights } = await import('@/lib/estimator/ai-insights')
          // Convert HomeSpecs to UnitSpecs-like for AI insights
          const unitSpecs = {
            bedrooms: specs.bedrooms,
            bathrooms: specs.bathrooms,
            livingAreaRange: specs.livingAreaRange || '',
            parking: specs.parking || 0,
            hasLocker: false,
            buildingId: '',
            agentId: specs.agentId,
            exactSqft: specs.exactSqft || undefined,
          }
          aiInsights = await getAIInsights(unitSpecs, estimate.estimatedPrice, matchResult.comparables, agent.anthropic_api_key)
        }
      } catch (aiError) {
        console.log('[estimateHomeSale] AI insights unavailable:', aiError)
      }
    }

    return {
      success: true,
      data: {
        ...estimate,
        aiInsights,
      },
      geoLevel: matchResult.geoLevel,
    }
  } catch (error) {
    console.error('Error estimating home sale price:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate home estimate'
    }
  }
}