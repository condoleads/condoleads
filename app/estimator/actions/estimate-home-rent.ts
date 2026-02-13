// app/estimator/actions/estimate-home-rent.ts
'use server'
import { findHomeComparablesRentals } from '@/lib/estimator/home-comparable-matcher-rentals'
import { HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { EstimateResult } from '@/lib/estimator/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Server action to estimate home rental price
 * Uses cascading geographic matching: Community → Municipality
 */
export async function estimateHomeRent(
  specs: HomeSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult; error?: string; geoLevel?: string }> {
  console.log('[estimateHomeRent] specs:', {
    bedrooms: specs.bedrooms,
    bathrooms: specs.bathrooms,
    propertySubtype: specs.propertySubtype,
    communityId: specs.communityId,
    municipalityId: specs.municipalityId,
  })

  try {
    // Step 1: Find comparable home leases using geographic cascading
    const matchResult = await findHomeComparablesRentals(specs)
    console.log(`[HomeRentalEstimator] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}, geo: ${matchResult.geoLevel}`)

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
        error: 'Not enough comparable leases in this area. Contact the agent for a rental assessment.'
      }
    }

    // Step 2: Calculate estimate
    const estimate = calculateEstimate(matchResult)

    // Step 3: AI insights
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
        console.log('[estimateHomeRent] AI insights unavailable:', aiError)
      }
    }

    return {
      success: true,
      data: { ...estimate, aiInsights },
      geoLevel: matchResult.geoLevel,
    }
  } catch (error) {
    console.error('Error estimating home rent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate home rental estimate'
    }
  }
}