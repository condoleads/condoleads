// lib/estimator/home-comparable-matcher-sales.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  HomeUnitSpecs,
  PriceAdjustment,
  MatchTier,
  extractExactSqft,
  assignTemperature,
  getBasementScore,
  getBasementValue,
  getGarageValue,
  AGE_RANGES,
  FRONTAGE_VALUE_PER_FT,
} from './types'

interface HomeMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  municipalityName?: string
}

const SIMILAR_SUBTYPES: Record<string, string[]> = {
  'Detached': ['Detached', 'Semi-Detached', 'Link'],
  'Semi-Detached': ['Semi-Detached', 'Detached', 'Link'],
  'Link': ['Link', 'Semi-Detached', 'Detached'],
  'Att/Row/Townhouse': ['Att/Row/Townhouse'],
  'Duplex': ['Duplex', 'Triplex', 'Fourplex', 'Multiplex'],
  'Triplex': ['Triplex', 'Duplex', 'Fourplex', 'Multiplex'],
  'Fourplex': ['Fourplex', 'Triplex', 'Duplex', 'Multiplex'],
  'Multiplex': ['Multiplex', 'Fourplex', 'Triplex', 'Duplex'],
}

export async function findHomeComparablesSales(specs: HomeUnitSpecs): Promise<HomeMatchResult> {
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Get municipality name for frontage pricing
  let municipalityName = 'default'
  if (specs.municipalityId) {
    const { data: mun } = await supabase
      .from('municipalities')
      .select('name')
      .eq('id', specs.municipalityId)
      .single()
    if (mun) municipalityName = mun.name
  }

  // Level 1: Same community + same subtype
  let { data: allSales, error } = await supabase
    .from('mls_listings')
    .select(`id, unit_number, listing_key, unparsed_address, close_price, list_price,
      bedrooms_total, bathrooms_total_integer, living_area_range, square_foot_source,
      lot_width, lot_depth, lot_size_area, frontage_length,
      basement, garage_type, garage_yn, approximate_age, legal_stories,
      pool_features, fireplace_yn, cooling, tax_annual_amount,
      parking_total, locker, days_on_market, close_date, property_subtype`)
    .eq('community_id', specs.communityId)
    .eq('standard_status', 'Closed')
    .eq('transaction_type', 'For Sale')
    .not('close_price', 'is', null)
    .gte('close_date', twoYearsAgo.toISOString())
    .gt('close_price', 100000)
    .order('close_date', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[homeComps] Error:', error)
    return { tier: 'CONTACT', comparables: [], municipalityName }
  }

  // Filter by subtype (exact match first)
  let filtered = (allSales || []).filter(s => s.property_subtype?.trim() === specs.propertySubtype)

  // If < 5 comps, expand to similar subtypes
  if (filtered.length < 5) {
    const similar = SIMILAR_SUBTYPES[specs.propertySubtype] || [specs.propertySubtype]
    filtered = (allSales || []).filter(s => similar.includes(s.property_subtype?.trim() || ''))
  }

  // Level 2: Expand to municipality if still < 5
  if (filtered.length < 5 && specs.municipalityId) {
    const { data: munSales } = await supabase
      .from('mls_listings')
      .select(`id, unit_number, listing_key, unparsed_address, close_price, list_price,
        bedrooms_total, bathrooms_total_integer, living_area_range, square_foot_source,
        lot_width, lot_depth, lot_size_area, frontage_length,
        basement, garage_type, garage_yn, approximate_age, legal_stories,
        pool_features, fireplace_yn, cooling, tax_annual_amount,
        parking_total, locker, days_on_market, close_date, property_subtype`)
      .eq('municipality_id', specs.municipalityId)
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale')
      .not('close_price', 'is', null)
      .gte('close_date', twoYearsAgo.toISOString())
      .gt('close_price', 100000)
      .order('close_date', { ascending: false })
      .limit(200)

    if (munSales) {
      const existingIds = new Set(filtered.map(f => f.id))
      const similar = SIMILAR_SUBTYPES[specs.propertySubtype] || [specs.propertySubtype]
      const extra = munSales.filter(s =>
        !existingIds.has(s.id) && similar.includes(s.property_subtype?.trim() || '')
      )
      filtered = [...filtered, ...extra]
    }
  }

  // Strict filter: same bedrooms
  const bedroomMatches = filtered.filter(s => s.bedrooms_total === specs.bedrooms)

  if (bedroomMatches.length === 0) {
    return { tier: 'CONTACT', comparables: [], municipalityName }
  }

  // Score and adjust each comparable
  const scored = bedroomMatches.map(comp => {
    let score = 100
    const adjustments: PriceAdjustment[] = []
    let adjustedPrice = comp.close_price

    // --- SCORING ---

    // Bathroom similarity
    const bathDiff = Math.abs(
      (specs.bathrooms || 0) - (Math.floor(parseFloat(String(comp.bathrooms_total_integer)) || 0))
    )
    if (bathDiff === 0) score += 20
    else if (bathDiff === 1) score += 10
    else score -= 20

    // Frontage similarity (#1 factor)
    const userFrontage = specs.frontage || specs.lotWidth || null
    const compFrontage = comp.lot_width ? parseFloat(String(comp.lot_width)) :
      (comp.frontage_length ? parseFloat(String(comp.frontage_length)) : null)

    if (userFrontage && compFrontage) {
      const fDiff = Math.abs(userFrontage - compFrontage)
      const fDiffPct = fDiff / userFrontage
      if (fDiff <= 2) score += 40
      else if (fDiff <= 5) score += 30
      else if (fDiffPct <= 0.15) score += 20
      else if (fDiffPct <= 0.30) score += 10
      else score -= 20
    }

    // Lot depth
    const userDepth = specs.lotDepth || null
    const compDepth = comp.lot_depth ? parseFloat(String(comp.lot_depth)) : null
    if (userDepth && compDepth) {
      const dPct = Math.abs(userDepth - compDepth) / userDepth
      if (dPct <= 0.10) score += 10
      else if (dPct <= 0.25) score += 5
      else score -= 5
    }

    // Square footage (tiered)
    const userSqft = specs.exactSqft || null
    const compSqft = extractExactSqft(comp.square_foot_source)
    const userRange = specs.livingAreaRange || null
    const compRange = comp.living_area_range || null

    if (userSqft && compSqft) {
      const sDiff = Math.abs(userSqft - compSqft)
      if (sDiff <= 100) score += 30
      else if (sDiff <= 200) score += 20
      else if (sDiff <= 400) score += 10
      else score -= 10
    } else if (userSqft && compRange) {
      const parts = compRange.split('-').map(Number)
      if (parts.length === 2 && userSqft >= parts[0] && userSqft <= parts[1]) score += 25
      else if (parts.length === 2 && userSqft >= parts[0] - 200 && userSqft <= parts[1] + 200) score += 12
      else score -= 10
    } else if (compSqft && userRange) {
      const parts = userRange.split('-').map(Number)
      if (parts.length === 2 && compSqft >= parts[0] && compSqft <= parts[1]) score += 25
      else if (parts.length === 2 && compSqft >= parts[0] - 200 && compSqft <= parts[1] + 200) score += 12
      else score -= 10
    } else if (userRange && compRange) {
      if (userRange === compRange) score += 20
      else {
        const uMid = userRange.split('-').map(Number).reduce((a: number, b: number) => a + b, 0) / 2
        const cMid = compRange.split('-').map(Number).reduce((a: number, b: number) => a + b, 0) / 2
        if (Math.abs(uMid - cMid) <= 300) score += 10
        else score -= 10
      }
    }

    // Age similarity
    if (specs.approximateAge && comp.approximate_age) {
      const uIdx = AGE_RANGES.indexOf(specs.approximateAge)
      const cIdx = AGE_RANGES.indexOf(comp.approximate_age)
      if (uIdx >= 0 && cIdx >= 0) {
        const ageDiff = Math.abs(uIdx - cIdx)
        if (ageDiff === 0) score += 15
        else if (ageDiff === 1) score += 8
        else if (ageDiff >= 3) score -= 10
      }
    }

    // Stories match
    const userStories = specs.legalStories || 0
    const compStories = comp.legal_stories ? parseFloat(comp.legal_stories) : 0
    if (userStories && compStories) {
      if (userStories === compStories) score += 10
      else if (Math.abs(userStories - compStories) <= 0.5) score += 5
      else score -= 5
    }

    // Tax proximity
    if (specs.taxAnnualAmount && comp.tax_annual_amount) {
      const taxDiff = Math.abs(specs.taxAnnualAmount - Number(comp.tax_annual_amount)) / specs.taxAnnualAmount
      if (taxDiff <= 0.10) score += 10
      else if (taxDiff <= 0.25) score += 5
    }

    // Recency bonus
    const monthsAgo = (Date.now() - new Date(comp.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo < 6) score += 10
    else if (monthsAgo < 12) score += 5

    // --- ADJUSTMENTS ---

    // Bathroom adjustment
    const compBath = Math.floor(parseFloat(String(comp.bathrooms_total_integer)) || 0)
    const bathAdj = (specs.bathrooms - compBath) * 25000
    if (bathAdj !== 0) {
      adjustedPrice += bathAdj
      adjustments.push({
        type: 'bathroom',
        difference: specs.bathrooms - compBath,
        adjustmentAmount: bathAdj,
        reason: `Your home has ${Math.abs(specs.bathrooms - compBath)} ${specs.bathrooms > compBath ? 'more' : 'fewer'} bathroom(s)`
      })
    }

    // Frontage adjustment (>3ft diff)
    if (userFrontage && compFrontage && Math.abs(userFrontage - compFrontage) > 3) {
      const pricePerFt = FRONTAGE_VALUE_PER_FT[municipalityName] || FRONTAGE_VALUE_PER_FT['default']
      const fAdj = (userFrontage - compFrontage) * pricePerFt
      adjustedPrice += fAdj
      adjustments.push({
        type: 'parking' as const, // reusing type for display
        difference: Math.round(userFrontage - compFrontage),
        adjustmentAmount: fAdj,
        reason: `Your lot is ${Math.abs(userFrontage - compFrontage).toFixed(0)}ft ${userFrontage > compFrontage ? 'wider' : 'narrower'} (${pricePerFt.toLocaleString()}/ft in ${municipalityName})`
      })
    }

    // Lot depth adjustment (>15ft diff)
    if (userDepth && compDepth && Math.abs(userDepth - compDepth) > 15) {
      const dAdj = (userDepth - compDepth) * 1000
      adjustedPrice += dAdj
      adjustments.push({
        type: 'parking' as const,
        difference: Math.round(userDepth - compDepth),
        adjustmentAmount: dAdj,
        reason: `Your lot is ${Math.abs(userDepth - compDepth).toFixed(0)}ft ${userDepth > compDepth ? 'deeper' : 'shallower'}`
      })
    }

    // Basement adjustment
    const userBasement = getBasementScore(specs.basementType || null)
    const compBasement = getBasementScore(comp.basement)
    const userBVal = getBasementValue(userBasement, true)
    const compBVal = getBasementValue(compBasement, true)
    const bAdj = userBVal - compBVal
    if (bAdj !== 0) {
      adjustedPrice += bAdj
      adjustments.push({
        type: 'locker' as const,
        difference: bAdj > 0 ? 1 : -1,
        adjustmentAmount: bAdj,
        reason: `Basement: yours (${userBasement}) vs comp (${compBasement})`
      })
    }

    // Garage adjustment
    const userGVal = getGarageValue(specs.garageType || null, true)
    const compGVal = getGarageValue(comp.garage_type, true)
    const gAdj = userGVal - compGVal
    if (gAdj !== 0) {
      adjustedPrice += gAdj
      adjustments.push({
        type: 'parking' as const,
        difference: gAdj > 0 ? 1 : -1,
        adjustmentAmount: gAdj,
        reason: `Garage: yours (${specs.garageType || 'None'}) vs comp (${comp.garage_type || 'None'})`
      })
    }

    // Pool adjustment
    const userPool = specs.hasPool || false
    const compPool = comp.pool_features && comp.pool_features.length > 0 &&
      !comp.pool_features.every((p: string) => p.toLowerCase() === 'none')
    if (userPool !== compPool) {
      const pAdj = userPool ? 30000 : -30000
      adjustedPrice += pAdj
      adjustments.push({
        type: 'locker' as const,
        difference: userPool ? 1 : -1,
        adjustmentAmount: pAdj,
        reason: userPool ? 'Your home has a pool' : 'Comp has a pool, yours does not'
      })
    }

    // Fireplace adjustment
    if ((specs.hasFireplace || false) !== (comp.fireplace_yn || false)) {
      const fpAdj = specs.hasFireplace ? 5000 : -5000
      adjustedPrice += fpAdj
      adjustments.push({
        type: 'locker' as const,
        difference: specs.hasFireplace ? 1 : -1,
        adjustmentAmount: fpAdj,
        reason: specs.hasFireplace ? 'Your home has a fireplace' : 'Comp has fireplace, yours does not'
      })
    }

    // Central air adjustment
    const userAC = specs.hasCentralAir || false
    const compAC = comp.cooling && Array.isArray(comp.cooling) &&
      comp.cooling.some((c: string) => c.toLowerCase().includes('central'))
    if (userAC !== compAC) {
      const acAdj = userAC ? 10000 : -10000
      adjustedPrice += acAdj
      adjustments.push({
        type: 'locker' as const,
        difference: userAC ? 1 : -1,
        adjustmentAmount: acAdj,
        reason: userAC ? 'Your home has central air' : 'Comp has central air, yours does not'
      })
    }

    // Determine match quality
    let quality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Fair'
    if (adjustments.length === 0 && score >= 180) quality = 'Perfect'
    else if (adjustments.length <= 1 && score >= 150) quality = 'Excellent'
    else if (adjustments.length <= 2 && score >= 120) quality = 'Good'

    const temperature = assignTemperature(comp.close_date)

    return {
      closePrice: comp.close_price,
      listPrice: comp.list_price,
      bedrooms: comp.bedrooms_total,
      bathrooms: Math.floor(parseFloat(String(comp.bathrooms_total_integer)) || 0),
      livingAreaRange: comp.living_area_range || '',
      parking: comp.parking_total || 0,
      locker: comp.locker,
      daysOnMarket: comp.days_on_market || 0,
      closeDate: comp.close_date,
      taxAnnualAmount: comp.tax_annual_amount ? Number(comp.tax_annual_amount) : undefined,
      exactSqft: compSqft || undefined,
      userExactSqft: userSqft || undefined,
      unitNumber: comp.unparsed_address || comp.unit_number || undefined,
      listingKey: comp.listing_key || undefined,
      temperature,
      matchQuality: quality,
      matchScore: score,
      adjustments,
      adjustedPrice,
    } as ComparableSale
  })

  // Sort by score descending, take top 10
  scored.sort((a: ComparableSale, b: ComparableSale) => (b.matchScore || 0) - (a.matchScore || 0))
  const top = scored.slice(0, 10)

  // Determine tier
  const perfect = top.filter(c => c.matchQuality === 'Perfect').length
  const excellent = top.filter(c => c.matchQuality === 'Excellent').length
  let tier: MatchTier = 'CONTACT'
  if (perfect >= 3) tier = 'BINGO'
  else if (perfect >= 1 || excellent >= 3) tier = 'BINGO-ADJ'
  else if (excellent >= 1) tier = 'RANGE'
  else if (top.length >= 3) tier = 'RANGE-ADJ'
  else if (top.length >= 1) tier = 'MAINT-ADJ'

  return { tier, comparables: top, municipalityName }
}