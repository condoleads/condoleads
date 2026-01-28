// lib/estimator/ai-insights.ts
import { ComparableSale, UnitSpecs } from './types'

/**
 * Generates AI insights about the price estimate using Anthropic API
 */
export async function getAIInsights(
  specs: UnitSpecs,
  estimatedPrice: number,
  comparables: ComparableSale[],
  apiKey: string
): Promise<{
  summary: string
  keyFactors: string[]
  marketTrend: string
}> {
  
  const prompt = `You are a Toronto real estate market analyst. Analyze this condo price estimate and provide insights.

Unit Details:
- Bedrooms: ${specs.bedrooms}
- Bathrooms: ${specs.bathrooms}
- Size: ${specs.livingAreaRange} sqft
- Parking spaces: ${specs.parking}
- Locker: ${specs.hasLocker ? 'Yes' : 'No'}
- Estimated Price: $${estimatedPrice.toLocaleString()}

Recent Comparable Sales (${comparables.length} found):
${comparables.slice(0, 5).map(c => 
  `- ${c.bedrooms}bed, ${c.bathrooms}bath, ${c.livingAreaRange}sqft sold for $${c.closePrice.toLocaleString()} (${c.daysOnMarket} days on market)`
).join('\n')}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "summary": "2-3 sentence market overview for this unit",
  "keyFactors": ["factor1", "factor2", "factor3", "factor4"],
  "marketTrend": "1 sentence about current market conditions"
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[getAIInsights] API error:', response.status, errorText)
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text

    if (!content) {
      throw new Error('No content in API response')
    }

    // Parse JSON response
    const parsed = JSON.parse(content)
    
    return {
      summary: parsed.summary || 'Analysis unavailable',
      keyFactors: parsed.keyFactors || [],
      marketTrend: parsed.marketTrend || 'Market trend unavailable'
    }

  } catch (error) {
    console.error('[getAIInsights] Error:', error)
    
    // Return fallback insights on error
    return {
      summary: `Based on ${comparables.length} recent comparable sales, this ${specs.bedrooms}-bedroom unit is positioned competitively in the current market.`,
      keyFactors: [
        `${specs.bedrooms}-bedroom units in demand`,
        specs.parking > 0 ? 'Parking adds value' : 'No parking may affect price',
        specs.hasLocker ? 'Locker included' : 'No locker',
        `${comparables.length} recent comparables found`
      ],
      marketTrend: 'Market conditions based on recent sales data.'
    }
  }
}