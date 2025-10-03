// lib/estimator/ai-insights.ts
import { ComparableSale, UnitSpecs } from './types'

/**
 * Generates AI insights about the price estimate
 * Currently returns mock data - replace with real Anthropic API call when ready
 */
export async function getAIInsights(
  specs: UnitSpecs,
  estimatedPrice: number,
  comparables: ComparableSale[]
): Promise<{
  summary: string
  keyFactors: string[]
  marketTrend: string
}> {
  
  // TODO: Replace with actual Anthropic API call
  // When ready, add ANTHROPIC_API_KEY to .env.local and uncomment below:
  
  /*
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Analyze this Toronto condo price estimate:
        
Unit: ${specs.bedrooms} bed, ${specs.bathrooms} bath, ${specs.livingAreaRange} sqft
Parking: ${specs.parking}, Locker: ${specs.hasLocker ? 'Yes' : 'No'}
Estimated Price: $${estimatedPrice.toLocaleString()}

Recent Sales:
${comparables.slice(0, 5).map(c => 
  `- ${c.bedrooms}bed ${c.livingAreaRange}sqft sold for $${c.closePrice.toLocaleString()} (${c.daysOnMarket} days)`
).join('\n')}

Provide brief insights in JSON format:
{
  "summary": "2-3 sentence overview",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "marketTrend": "1 sentence trend analysis"
}`
      }]
    })
  })
  
  const data = await response.json()
  return JSON.parse(data.content[0].text)
  */
  
  // MOCK DATA - Remove when API is active
  await new Promise(resolve => setTimeout(resolve, 500)) // Simulate API delay
  
  return {
    summary: `Based on ${comparables.length} recent sales, this ${specs.bedrooms}-bedroom unit is well-positioned in the current market. Units with similar specifications have shown consistent pricing, with ${specs.parking > 0 ? 'parking adding significant value' : 'no parking reflecting lower price points'}.`,
    keyFactors: [
      `${specs.bedrooms}-bedroom units in high demand`,
      specs.parking > 0 ? 'Parking space adds $50k-$100k premium' : 'No parking reduces price by $75k+',
      specs.hasLocker ? 'Locker storage increases appeal' : 'Limited storage may affect pricing',
      `Market moving at ${comparables[0]?.daysOnMarket < 30 ? 'fast' : 'moderate'} pace`
    ],
    marketTrend: comparables[0]?.daysOnMarket < 40 
      ? 'Strong seller\'s market with units selling quickly above asking price.'
      : 'Balanced market conditions providing negotiation opportunities for buyers.'
  }
}