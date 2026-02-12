// lib/estimator/home-comparable-matcher-rentals.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  HomeUnitSpecs,
  PriceAdjustment,
  MatchTier,
  extractExactSqft,
  assignTemperature,
  getBasementScore,
  getGarageValue,
  AGE_RANGES,
} from './types'

interface HomeMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
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

export async function findHomeComparablesRentals(specs: HomeUnitSpecs): Promise<HomeMatchResult> {
  const supabase = createClient()
  const eighteenMonthsAgo = new Date()
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18)

  // Level 1: Same community + same subtype
  let { data: allLeases, error } = await supabase
    .from('mls_listings')
    .select(`id, unit_number, listing_key, unparsed_address, close_price, list_price,
      bedrooms_total, bathrooms_total_integer, living_area_range, square_foot_source,
      lot_width, lot_depth, lot_size_area, frontage_length,
      basement, garage_type, garage_yn, approximate_age, legal_stories,
      pool_features, fireplace_yn, cooling, tax_annual_amount,
      parking_total, locker, days_on_market, close_date, property_subtype`)
    .eq('community_id', specs.communityId)
    .eq('standard_status', 'Closed')
    .eq('transaction_type', 'For Lease')
    .not('close_price', 'is', null)
    .gte('close_date', eighteenMonthsAgo.toISOString())
    .lt('close_price', 15000)
    .order('close_date', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[homeCompsRental] Error:', error)
    return { tier: 'CONTACT', comparables: [] }
  }

  // Filter by subtype
  let filtered = (allLeases || []).filter(s => s.property_subtype?.trim() === specs.propertySubtype)

  if (filtered.length < 5) {
    const similar = SIMILAR_SUBTYPES[specs.propertySubtype] || [specs.propertySubtype]
    filtered = (allLeases || []).filter(s => similar.includes(s.property_subtype?.trim() || ''))
  }

  // Level 2: Expand to municipality if still < 5
  if (filtered.length < 5 && specs.municipalityId) {
    const { data: munLeases } = await supabase
      .from('mls_listings')
      .select(`id, unit_number, listing_key, unparsed_address, close_price, list_price,
        bedrooms_total, bathrooms_total_integer, living_area_range, square_foot_source,
        lot_width, lot_depth, lot_size_area, frontage_length,
        basement, garage_type, garage_yn, approximate_age, legal_stories,
        pool_features, fireplace_yn, cooling, tax_annual_amount,
        parking_total, locker, days_on_market, close_date, property_subtype`)
      .eq('municipality_id', specs.municipalityId)
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Lease')
      .not('close_price', 'is', null)
      .gte('close_date', eighteenMonthsAgo.toISOString())
      .lt('close_price', 15000)
      .order('close_date', { ascending: false })
      .limit(200)

    if (munLeases) {
      const existingIds = new Set(filtered.map(f => f.id))
      const similar = SIMILAR_SUBTYPES[specs.propertySubtype] || [specs.propertySubtype]
      const extra = munLeases.filter(s =>
        !existingIds.has(s.id) && similar.includes(s.property_subtype?.trim() || '')
      )
      filtered = [...filtered, ...extra]
    }
  }

  // Strict filter: same bedrooms
  const bedroomMatches = filtered.filter(s => s.bedrooms_total === specs.bedrooms)

  if (bedroomMatches.length === 0) {
    return { tier: 'CONTACT', comparables: [] }
  }

  const scored = bedroomMatches.map(comp => {
    let score = 100
    const adjustments: PriceAdjustment[] = []
    let adjustedPrice = comp.close_price

    // --- SCORING ---

    // Bathroom similarity
    const compBath = Math.floor(parseFloat(String(comp.bathrooms_total_integer)) || 0)
    const bathDiff = Math.abs((specs.bathrooms || 0) - compBath)
    if (bathDiff === 0) score += 20
    else if (bathDiff === 1) score += 10
    else score -= 20

    // Frontage (reduced weight for rentals — 40% less)
    const userFrontage = specs.frontage || specs.lotWidth || null
    const compFrontage = comp.lot_width ? parseFloat(String(comp.lot_width)) :
      (comp.frontage_length ? parseFloat(String(comp.frontage_length)) : null)

    if (userFrontage && compFrontage) {
      const fDiff = Math.abs(userFrontage - compFrontage)
      const fDiffPct = fDiff / userFrontage
      if (fDiff <= 2) score += 24       // 40% of 40
      else if (fDiff <= 5) score += 18  // 40% of 30
      else if (fDiffPct <= 0.15) score += 12
      else if (fDiffPct <= 0.30) score += 6
      else score -= 12
    }

    // Lot depth (60% reduction for rentals)
    const userDepth = specs.lotDepth || null
    const compDepth = comp.lot_depth ? parseFloat(String(comp.lot_depth)) : null
    if (userDepth && compDepth) {
      const dPct = Math.abs(userDepth - compDepth) / userDepth
      if (dPct <= 0.10) score += 4
      else if (dPct <= 0.25) score += 2
      else score -= 2
    }

    // Square footage (same tiered logic as sales)
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

    // Recency bonus
    const monthsAgo = (Date.now() - new Date(comp.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo < 6) score += 10
    else if (monthsAgo < 12) score += 5

    // --- ADJUSTMENTS (monthly values) ---

    // Bathroom
    const bathAdj = (specs.bathrooms - compBath) * 75
    if (bathAdj !== 0) {
      adjustedPrice += bathAdj
      adjustments.push({
        type: 'bathroom',
        difference: specs.bathrooms - compBath,
        adjustmentAmount: bathAdj,
        reason: `Your home has ${Math.abs(specs.bathrooms - compBath)} ${specs.bathrooms > compBath ? 'more' : 'fewer'} bathroom(s)`
      })
    }

    // Basement
    const userBasement = getBasementScore(specs.basementType || null)
    const compBasement = getBasementScore(comp.basement)
    const userHasFinished = userBasement.includes('Finished')
    const compHasFinished = compBasement.includes('Finished')
    if (userHasFinished !== compHasFinished) {
      const bAdj = userHasFinished ? 200 : -200
      adjustedPrice += bAdj
      adjustments.push({
        type: 'locker' as const,
        difference: userHasFinished ? 1 : -1,
        adjustmentAmount: bAdj,
        reason: `Basement: yours (${userBasement}) vs comp (${compBasement})`
      })
    }

    // Garage
    const userGVal = getGarageValue(specs.garageType || null, false)
    const compGVal = getGarageValue(comp.garage_type, false)
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

    // Pool
    const userPool = specs.hasPool || false
    const compPool = comp.pool_features && comp.pool_features.length > 0 &&
      !comp.pool_features.every((p: string) => p.toLowerCase() === 'none')
    if (userPool !== compPool) {
      const pAdj = userPool ? 100 : -100
      adjustedPrice += pAdj
      adjustments.push({
        type: 'locker' as const,
        difference: userPool ? 1 : -1,
        adjustmentAmount: pAdj,
        reason: userPool ? 'Your home has a pool' : 'Comp has a pool, yours does not'
      })
    }

    // Central air
    const userAC = specs.hasCentralAir || false
    const compAC = comp.cooling && Array.isArray(comp.cooling) &&
      comp.cooling.some((c: string) => c.toLowerCase().includes('central'))
    if (userAC !== compAC) {
      const acAdj = userAC ? 50 : -50
      adjustedPrice += acAdj
      adjustments.push({
        type: 'locker' as const,
        difference: userAC ? 1 : -1,
        adjustmentAmount: acAdj,
        reason: userAC ? 'Your home has central air' : 'Comp has central air, yours does not'
      })
    }

    // Fireplace
    if ((specs.hasFireplace || false) !== (comp.fireplace_yn || false)) {
      const fpAdj = specs.hasFireplace ? 25 : -25
      adjustedPrice += fpAdj
      adjustments.push({
        type: 'locker' as const,
        difference: specs.hasFireplace ? 1 : -1,
        adjustmentAmount: fpAdj,
        reason: specs.hasFireplace ? 'Your home has a fireplace' : 'Comp has fireplace, yours does not'
      })
    }

    // Match quality
    let quality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Fair'
    if (adjustments.length === 0 && score >= 160) quality = 'Perfect'
    else if (adjustments.length <= 1 && score >= 130) quality = 'Excellent'
    else if (adjustments.length <= 2 && score >= 110) quality = 'Good'

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
      temperature: assignTemperature(comp.close_date),
      matchQuality: quality,
      matchScore: score,
      adjustments,
      adjustedPrice,
    } as ComparableSale
  })

  scored.sort((a: ComparableSale, b: ComparableSale) => (b.matchScore || 0) - (a.matchScore || 0))
  const top = scored.slice(0, 10)

  const perfect = top.filter(c => c.matchQuality === 'Perfect').length
  const excellent = top.filter(c => c.matchQuality === 'Excellent').length
  let tier: MatchTier = 'CONTACT'
  if (perfect >= 3) tier = 'BINGO'
  else if (perfect >= 1 || excellent >= 3) tier = 'BINGO-ADJ'
  else if (excellent >= 1) tier = 'RANGE'
  else if (top.length >= 3) tier = 'RANGE-ADJ'
  else if (top.length >= 1) tier = 'MAINT-ADJ'

  return { tier, comparables: top }
}