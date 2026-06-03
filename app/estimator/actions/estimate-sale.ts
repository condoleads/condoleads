// app/estimator/actions/estimate-sale.ts
'use server'
import { findComparables } from '@/lib/estimator/comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { getAIInsights } from '@/lib/estimator/ai-insights'
import { EstimateResult, UnitSpecs } from '@/lib/estimator/types'
import { resolveAdjustments } from '@/lib/estimator/resolve-adjustments'
import { createClient } from '@/lib/supabase/server'
// W-FUNNEL §9.2 Step 1: resolve current request's tenant. Non-null = System 2
// (walliam.ca / aily.ca / future tenants); null = System 1 (condoleads.ca
// legacy subdomains). Branch determined here gates which row owns the AI key.
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'

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

    // Step 3: Add AI insights if requested and we have a price to analyze.
    // W-FUNNEL §9.2 Step 1: AI key + opt-in toggle now resolve per system.
    let aiInsights = undefined
    if (includeAI && estimate.showPrice && estimate.estimatedPrice > 0) {
      try {
        const tenantId = await getCurrentTenantId()
        const supabase = createClient()
        let key: string | null = null

        if (tenantId) {
          // SYSTEM 2 (walliam.ca / aily.ca / future tenants): tenant-resolved
          // billing key + per-tenant opt-in toggle. `estimator_ai_enabled ??
          // false` enforces opt-in-by-operator; null/unset = off.
          const { data: tenant } = await supabase
            .from('tenants')
            .select('anthropic_api_key, estimator_ai_enabled')
            .eq('id', tenantId)
            .single()
          if ((tenant?.estimator_ai_enabled ?? false) && tenant?.anthropic_api_key) {
            key = tenant.anthropic_api_key
          }
        } else if (specs.agentId) {
          // SYSTEM 1 (legacy condoleads.ca subdomains): per-agent key + toggle.
          // Untouched by §9.2 ruling -- maintenance-only legacy system per
          // CLAUDE.md. Unreachable from any System 2 host (R1 proved
          // getCurrentTenantId() returns non-null for every registered tenant).
          const { data: agent } = await supabase
            .from('agents')
            .select('ai_estimator_enabled, anthropic_api_key')
            .eq('id', specs.agentId)
            .single()
          if (agent?.ai_estimator_enabled && agent?.anthropic_api_key) {
            key = agent.anthropic_api_key
          }
        }
        // tenantId null AND no specs.agentId -> no key -> base valuation, no AI

        if (key) {
          aiInsights = await getAIInsights(specs, estimate.estimatedPrice, matchResult.comparables, key)
        } else {
          console.log('[estimateSale] AI insights skipped - no key resolved (toggle off, key missing, or no context)')
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
