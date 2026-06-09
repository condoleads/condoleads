// app/estimator/actions/estimate-home-sale.ts
'use server'
import { findHomeComparables, HomeSpecs, PLEX_PRICE_BAND_FRACTION } from '@/lib/estimator/home-comparable-matcher-sales'
import { calculateEstimate } from '@/lib/estimator/statistical-calculator'
import { EstimateResult } from '@/lib/estimator/types'
import { createClient } from '@/lib/supabase/server'
// W-FUNNEL §9.2 Step 1: resolve current request's tenant. Non-null = System 2
// (walliam.ca / aily.ca / future tenants); null = System 1 (condoleads.ca
// legacy subdomains). Branch determined here gates which row owns the AI key.
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'

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
          },
          // h7: surface geo-tier context even on CONTACT — caller may want to
          // show "we have N comps in your area, just not similar enough" via
          // the bronze/silver tiles. Plex CONTACT returns leave tiers undefined.
          tiers: matchResult.tiers,
          bestGeoTier: matchResult.bestGeoTier,
        },
        geoLevel: matchResult.geoLevel,
        error: 'Not enough comparable sales in this area to generate an estimate. Try contacting the agent directly.'
      }
    }

    // Step 2: Calculate estimate using existing statistical calculator
    const estimate = calculateEstimate(matchResult)

    // h1: plex-axis pricing override. runPlexPricingPath sets matchResult.
    // estimatedPrice as the MEDIAN of matched same-subtype LAR-adjacent
    // comps (per backtest 2026-06-08). The calculator's score-weighted mean
    // would differ from the measured median on plex pools; override to keep
    // production aligned with the 17.4% Duplex / 22.1% Triplex measurements.
    // Band is subtype-aware, derived from the measured median APE — NOT a
    // fixed 8%. An ±8% band would claim confidence we measured ourselves
    // NOT to have. PLEX_PRICE_BAND_FRACTION is the single source of truth
    // for the band (matcher constant, exported).
    if (matchResult.estimatedPrice !== undefined && matchResult.estimatedPrice > 0) {
      const bandFraction = PLEX_PRICE_BAND_FRACTION[specs.propertySubtype]
      if (bandFraction !== undefined) {
        estimate.estimatedPrice = matchResult.estimatedPrice
        estimate.priceRange = {
          low:  Math.round(matchResult.estimatedPrice * (1 - bandFraction)),
          high: Math.round(matchResult.estimatedPrice * (1 + bandFraction)),
        }
      }
    }

    // Step 3: AI insights (if enabled).
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
          aiInsights = await getAIInsights(unitSpecs, estimate.estimatedPrice, matchResult.comparables, key)
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
        // h7: thread the four-tier spread through to the display layer.
        // Plex returns leave these undefined; SF returns populate both.
        tiers: matchResult.tiers,
        bestGeoTier: matchResult.bestGeoTier,
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