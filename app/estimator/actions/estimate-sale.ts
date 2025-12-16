// app/estimator/actions/estimate-sale.ts
'use server'

import { findComparables } from '@/lib/estimator/comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs, ADJUSTMENT_VALUES } from '@/lib/estimator/types'
import { createClient as createServerClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Server action to estimate condo sale price
 * Uses tiered matching: BINGO -> BINGO-ADJ -> RANGE -> RANGE-ADJ -> MAINT -> MAINT-ADJ -> CONTACT
 * 
 * Value Priority: Building-specific > Universal Default > System Hardcoded
 */
export async function estimateSale(
  specs: UnitSpecs,
  includeAI: boolean = false
): Promise<{ success: boolean; data?: EstimateResult; error?: string }> {
  try {
    const supabase = createServiceClient()

    // Fetch building-specific values
    const { data: building } = await supabase
      .from('buildings')
      .select('parking_value_sale, locker_value_sale')
      .eq('id', specs.buildingId)
      .single()

    // Fetch universal defaults from system_settings
    const { data: systemSettings } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'estimator_defaults')
      .single()

    const universalDefaults = systemSettings?.setting_value || {}

    // Priority: Building-specific > Universal Default > System Hardcoded
    const adjustmentValues = {
      parkingPerSpace: 
        building?.parking_value_sale ?? 
        universalDefaults.parking_value_sale ?? 
        ADJUSTMENT_VALUES.PARKING_PER_SPACE,
      locker: 
        building?.locker_value_sale ?? 
        universalDefaults.locker_value_sale ?? 
        ADJUSTMENT_VALUES.LOCKER
    }

    // Step 1: Find comparable sales using tiered matching (pass custom values)
    const matchResult = await findComparables(specs, adjustmentValues)
    console.log(`[Estimator] Found ${matchResult.comparables.length} comparables at tier: ${matchResult.tier}`)

    // Step 2: Calculate estimate based on tier
    const estimate = calculateEstimate(matchResult)

    // Step 3: Add AI insights if requested and we have a price to analyze
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