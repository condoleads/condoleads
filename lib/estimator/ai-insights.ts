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
${comparables.slice(0, 5).map(c => {
  const pct = c.listPrice && c.closePrice ? ((c.listPrice - c.closePrice) / c.listPrice * 100).toFixed(1) : null
  const conc = pct !== null ? (parseFloat(pct) > 0 ? ` (-${pct}% below ask)` : parseFloat(pct) < 0 ? ` (+${Math.abs(parseFloat(pct))}% over ask)` : ' (at ask)') : ''
  return `- Unit ${c.unitNumber || 'N/A'}: ${c.bedrooms}BR ${c.livingAreaRange}sqft sold $${c.closePrice.toLocaleString()}${conc}, ${c.daysOnMarket} DOM, closed ${c.closeDate ? c.closeDate.slice(0,7) : 'N/A'}`
}).join('\n')}
Avg concession: ${(() => { const v = comparables.slice(0,5).map(c => c.listPrice && c.closePrice ? (c.listPrice-c.closePrice)/c.listPrice*100 : null).filter(x=>x!==null); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)+'% below asking' : 'N/A' })()}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "summary": "2-3 sentences citing specific comparable units and sold prices e.g. Unit 402 sold $X, Unit 815 sold $Y",
  "keyFactors": ["factor1", "factor2", "factor3", "factor4"],
  "marketTrend": "1 sentence on negotiation position based on concession data above"
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