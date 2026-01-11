// app/api/admin/market-analytics/parking-sale/route.ts
// IMPROVED ALGORITHM: Same-size comparison with per-spot calculation
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROPTX_URL = process.env.PROPTX_RESO_API_URL || 'https://query.ampre.ca/odata/'
const PROPTX_VOW_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN

// ============================================
// TYPES
// ============================================
interface SoldRecord {
  ListingKey: string
  StreetNumber: string
  StreetName: string
  ClosePrice: number
  LivingAreaRange: string
  ParkingTotal: number
  TransactionType: string
  City?: string
}

interface SizeRangeResult {
  sizeRange: string
  withoutParkingCount: number
  withParkingCount: number
  avgPriceWithout: number
  avgPriceWith: number
  avgSpotsWith: number
  valuePerSpot: number
  weight: number
  isValid: boolean
}

interface CalculationResult {
  success: boolean
  level: string
  name: string
  geoId?: string
  parkingValuePerSpot: number | null
  dataPoints: {
    totalRecords: number
    withParking: number
    withoutParking: number
    withoutParkingPct: number
    validSizeRanges: number
    totalWeight: number
  }
  qualityGates: {
    minWithoutParking: boolean
    minWithoutParkingPct: boolean
    minValidRanges: boolean
    valueInRange: boolean
  }
  details: SizeRangeResult[]
  calculatedAt: string
}

// ============================================
// QUALITY GATE THRESHOLDS
// ============================================
const QUALITY_GATES = {
  MIN_WITHOUT_PARKING: 20,        // Need at least 20 units without parking
  MIN_WITHOUT_PARKING_PCT: 5,     // Need at least 5% without parking
  MIN_VALID_RANGES: 3,            // Need at least 3 valid size ranges
  MIN_SAMPLES_PER_GROUP: 2,       // Need at least 2 units in each group (with/without)
  VALUE_MIN: 10000,               // Minimum reasonable parking value
  VALUE_MAX: 150000,              // Maximum reasonable parking value
}

// ============================================
// FETCH SOLD DATA FROM PROPTX
// ============================================
async function fetchSoldData(
  geoField: 'CountyOrParish' | 'City' | 'CityRegion',
  geoValue: string,
  maxRecords: number = 50000
): Promise<SoldRecord[]> {
  const valueEscaped = geoValue.replace(/'/g, "''")
  const filter = `${geoField} eq '${valueEscaped}' and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld') and TransactionType eq 'For Sale' and ClosePrice gt 0`
  const select = 'ListingKey,StreetNumber,StreetName,ClosePrice,LivingAreaRange,ParkingTotal,TransactionType,City'
  
  const allRecords: SoldRecord[] = []
  const pageSize = 5000
  let skip = 0
  
  try {
    const countUrl = `${PROPTX_URL}Property?$filter=${encodeURIComponent(filter)}&$count=true&$top=1`
    const countResponse = await fetch(countUrl, {
      headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
    })
    
    if (!countResponse.ok) {
      console.error(`[ParkingSale] Count API error: ${countResponse.status}`)
      return []
    }
    
    const countData = await countResponse.json()
    const totalRecords = Math.min(countData['@odata.count'] || 0, maxRecords)
    
    if (totalRecords === 0) return []
    
    console.log(`[ParkingSale] Fetching ${totalRecords} records for ${geoField}=${geoValue}`)
    
    while (skip < totalRecords) {
      const url = `${PROPTX_URL}Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=${pageSize}&$skip=${skip}`
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
      })
      
      if (!response.ok) {
        console.error(`[ParkingSale] API error at skip=${skip}: ${response.status}`)
        break
      }
      
      const data = await response.json()
      if (data.value && data.value.length > 0) {
        allRecords.push(...data.value)
      } else {
        break
      }
      
      skip += pageSize
    }
    
    console.log(`[ParkingSale] Fetched ${allRecords.length} records for ${geoField}=${geoValue}`)
    return allRecords
    
  } catch (error) {
    console.error(`[ParkingSale] Fetch error:`, error)
    return []
  }
}

// ============================================
// IMPROVED CALCULATION: Same-size, per-spot
// ============================================
function calculateParkingValueImproved(soldData: SoldRecord[]): {
  parkingValuePerSpot: number | null
  results: SizeRangeResult[]
  dataPoints: CalculationResult['dataPoints']
  qualityGates: CalculationResult['qualityGates']
} {
  const totalRecords = soldData.length
  const withParking = soldData.filter(r => r.ParkingTotal > 0)
  const withoutParking = soldData.filter(r => r.ParkingTotal === 0 || r.ParkingTotal === null)
  const withoutParkingPct = totalRecords > 0 ? (withoutParking.length / totalRecords) * 100 : 0

  // Quality Gate 1: Minimum without parking count
  const passMinWithout = withoutParking.length >= QUALITY_GATES.MIN_WITHOUT_PARKING

  // Quality Gate 2: Minimum without parking percentage
  const passMinPct = withoutParkingPct >= QUALITY_GATES.MIN_WITHOUT_PARKING_PCT

  if (!passMinWithout || !passMinPct) {
    return {
      parkingValuePerSpot: null,
      results: [],
      dataPoints: {
        totalRecords,
        withParking: withParking.length,
        withoutParking: withoutParking.length,
        withoutParkingPct: Math.round(withoutParkingPct * 10) / 10,
        validSizeRanges: 0,
        totalWeight: 0
      },
      qualityGates: {
        minWithoutParking: passMinWithout,
        minWithoutParkingPct: passMinPct,
        minValidRanges: false,
        valueInRange: false
      }
    }
  }

  // Step 1: Group by BUILDING first
  const buildingGroups = new Map<string, SoldRecord[]>()
  for (const record of soldData) {
    if (!record.StreetNumber || !record.StreetName) continue
    const buildingKey = `${record.StreetNumber}|${record.StreetName}`
    if (!buildingGroups.has(buildingKey)) {
      buildingGroups.set(buildingKey, [])
    }
    buildingGroups.get(buildingKey)!.push(record)
  }

  // Step 2: For each building, calculate per-size-range values
  const allBuildingResults: SizeRangeResult[] = []

  for (const [buildingKey, buildingRecords] of buildingGroups) {
    // Check if this building has both parking types
    const buildingWithP = buildingRecords.filter(r => r.ParkingTotal > 0)
    const buildingWithoutP = buildingRecords.filter(r => r.ParkingTotal === 0 || r.ParkingTotal === null)

    // Skip buildings that don't have both types
    if (buildingWithP.length < 1 || buildingWithoutP.length < 1) continue

    // Group by size range within this building
    const sizeGroups = new Map<string, SoldRecord[]>()
    for (const record of buildingRecords) {
      const range = record.LivingAreaRange || 'Unknown'
      if (range === 'Unknown') continue
      if (!sizeGroups.has(range)) {
        sizeGroups.set(range, [])
      }
      sizeGroups.get(range)!.push(record)
    }

    // Calculate for each size range in this building
    for (const [sizeRange, sizeRecords] of sizeGroups) {
      const without = sizeRecords.filter(r => r.ParkingTotal === 0 || r.ParkingTotal === null)
      const withP = sizeRecords.filter(r => r.ParkingTotal > 0)

      // Need minimum samples in each group
      if (without.length < QUALITY_GATES.MIN_SAMPLES_PER_GROUP ||
          withP.length < QUALITY_GATES.MIN_SAMPLES_PER_GROUP) {
        continue
      }

      const avgPriceWithout = without.reduce((sum, r) => sum + r.ClosePrice, 0) / without.length
      const avgPriceWith = withP.reduce((sum, r) => sum + r.ClosePrice, 0) / withP.length
      const avgSpotsWith = withP.reduce((sum, r) => sum + (r.ParkingTotal || 0), 0) / withP.length

      // Calculate value PER SPOT
      const priceDiff = avgPriceWith - avgPriceWithout
      const valuePerSpot = avgSpotsWith > 0 ? Math.round(priceDiff / avgSpotsWith) : 0

      // Weight by minimum of the two sample sizes
      const weight = Math.min(without.length, withP.length)

      // Is this a valid/reasonable result?
      const isValid = valuePerSpot >= QUALITY_GATES.VALUE_MIN &&
                      valuePerSpot <= QUALITY_GATES.VALUE_MAX

      allBuildingResults.push({
        sizeRange: `${buildingKey} | ${sizeRange}`,
        withoutParkingCount: without.length,
        withParkingCount: withP.length,
        avgPriceWithout: Math.round(avgPriceWithout),
        avgPriceWith: Math.round(avgPriceWith),
        avgSpotsWith: Math.round(avgSpotsWith * 10) / 10,
        valuePerSpot,
        weight,
        isValid
      })
    }
  }

  // Filter to valid results only
  const validResults = allBuildingResults.filter(r => r.isValid)

  // Quality Gate 3: Minimum valid building/size combinations
  const passMinRanges = validResults.length >= QUALITY_GATES.MIN_VALID_RANGES

  if (!passMinRanges) {
    return {
      parkingValuePerSpot: null,
      results: allBuildingResults,
      dataPoints: {
        totalRecords,
        withParking: withParking.length,
        withoutParking: withoutParking.length,
        withoutParkingPct: Math.round(withoutParkingPct * 10) / 10,
        validSizeRanges: validResults.length,
        totalWeight: 0
      },
      qualityGates: {
        minWithoutParking: passMinWithout,
        minWithoutParkingPct: passMinPct,
        minValidRanges: passMinRanges,
        valueInRange: false
      }
    }
  }

  // Calculate weighted median
  const totalWeight = validResults.reduce((sum, r) => sum + r.weight, 0)

  // Sort by value and find weighted median
  const sortedResults = [...validResults].sort((a, b) => a.valuePerSpot - b.valuePerSpot)
  let weightSum = 0
  let medianValue = sortedResults[0].valuePerSpot

  for (const result of sortedResults) {
    weightSum += result.weight
    if (weightSum >= totalWeight / 2) {
      medianValue = result.valuePerSpot
      break
    }
  }

  // Quality Gate 4: Value in reasonable range
  const passValueRange = medianValue >= QUALITY_GATES.VALUE_MIN &&
                         medianValue <= QUALITY_GATES.VALUE_MAX

  return {
    parkingValuePerSpot: passValueRange ? medianValue : null,
    results: allBuildingResults,
    dataPoints: {
      totalRecords,
      withParking: withParking.length,
      withoutParking: withoutParking.length,
      withoutParkingPct: Math.round(withoutParkingPct * 10) / 10,
      validSizeRanges: validResults.length,
      totalWeight
    },
    qualityGates: {
      minWithoutParking: passMinWithout,
      minWithoutParkingPct: passMinPct,
      minValidRanges: passMinRanges,
      valueInRange: passValueRange
    }
  }
}

// ============================================
// SAVE TO ADJUSTMENTS TABLE
// ============================================
async function saveToAdjustments(
  level: 'area' | 'municipality' | 'community' | 'building',
  geoId: string,
  parkingValue: number | null,
  validRanges: number,
  totalWeight: number,
  totalRecords: number
): Promise<boolean> {
  const now = new Date().toISOString()

  let query = supabase.from('adjustments').select('id')

  if (level === 'area') {
    query = query.eq('area_id', geoId).is('municipality_id', null).is('community_id', null).is('building_id', null)
  } else if (level === 'municipality') {
    query = query.eq('municipality_id', geoId).is('area_id', null).is('community_id', null).is('building_id', null)
  } else if (level === 'community') {
    query = query.eq('community_id', geoId).is('area_id', null).is('municipality_id', null).is('building_id', null)
  } else if (level === 'building') {
    query = query.eq('building_id', geoId).is('area_id', null).is('municipality_id', null).is('community_id', null)
  }

  const { data: existing } = await query.maybeSingle()

  const updateData = {
    parking_sale_weighted_avg: parkingValue,
    parking_sale_count: validRanges,
    parking_sale_sample_size: totalWeight,
    parking_sale_records: totalRecords,
    parking_sale_calculated_at: now,
    updated_at: now
  }

  if (existing) {
    const { error } = await supabase
      .from('adjustments')
      .update(updateData)
      .eq('id', existing.id)

    if (error) {
      console.error(`[ParkingSale] Update error:`, error)
      return false
    }
  } else {
    const insertData: any = {
      ...updateData,
      created_at: now
    }

    if (level === 'area') insertData.area_id = geoId
    else if (level === 'municipality') insertData.municipality_id = geoId
    else if (level === 'community') insertData.community_id = geoId
    else if (level === 'building') insertData.building_id = geoId

    const { error } = await supabase
      .from('adjustments')
      .insert(insertData)

    if (error) {
      console.error(`[ParkingSale] Insert error:`, error)
      return false
    }
  }

  return true
}

// ============================================
// CALCULATE FOR GEOGRAPHIC LEVEL
// ============================================
async function calculateForGeo(
  level: 'area' | 'municipality' | 'community',
  geoField: 'CountyOrParish' | 'City' | 'CityRegion',
  geoValue: string,
  geoId: string,
  maxRecords: number
): Promise<CalculationResult> {
  const startTime = Date.now()
  console.log(`[ParkingSale] Starting ${level} calculation for ${geoValue}`)

  const soldData = await fetchSoldData(geoField, geoValue, maxRecords)

  if (soldData.length === 0) {
    return {
      success: false,
      level,
      name: geoValue,
      geoId,
      parkingValuePerSpot: null,
      dataPoints: {
        totalRecords: 0,
        withParking: 0,
        withoutParking: 0,
        withoutParkingPct: 0,
        validSizeRanges: 0,
        totalWeight: 0
      },
      qualityGates: {
        minWithoutParking: false,
        minWithoutParkingPct: false,
        minValidRanges: false,
        valueInRange: false
      },
      details: [],
      calculatedAt: new Date().toISOString()
    }
  }

  const { parkingValuePerSpot, results, dataPoints, qualityGates } = calculateParkingValueImproved(soldData)

  // Save ONLY if we got a valid value
  if (parkingValuePerSpot !== null) {
    await saveToAdjustments(level, geoId, parkingValuePerSpot, dataPoints.validSizeRanges, dataPoints.totalWeight, dataPoints.totalRecords)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[ParkingSale] Completed ${level} ${geoValue} in ${duration}s. Value: ${parkingValuePerSpot ? '$' + parkingValuePerSpot : 'NULL'}`)

  return {
    success: parkingValuePerSpot !== null,
    level,
    name: geoValue,
    geoId,
    parkingValuePerSpot,
    dataPoints,
    qualityGates,
    details: results,
    calculatedAt: new Date().toISOString()
  }
}

// ============================================
// CALCULATE FOR BUILDING
// ============================================
async function calculateForBuilding(
  buildingId: string,
  streetNumber: string,
  streetName: string,
  cityDistrict: string
): Promise<CalculationResult> {
  const startTime = Date.now()
  console.log(`[ParkingSale] Starting building calculation for ${streetNumber} ${streetName}`)

  // Fetch data using street number and city filter
  const filter = `StreetNumber eq '${streetNumber}' and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld') and TransactionType eq 'For Sale' and ClosePrice gt 0`
  const select = 'ListingKey,StreetNumber,StreetName,ClosePrice,LivingAreaRange,ParkingTotal,TransactionType,City'
  const url = `${PROPTX_URL}Property?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=1000`

  let soldData: SoldRecord[] = []

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.value) {
        const streetFirstWord = streetName.toLowerCase().split(' ')[0]

        soldData = data.value.filter((r: any) =>
          r.StreetName &&
          r.StreetName.toLowerCase().includes(streetFirstWord) &&
          r.TransactionType === 'For Sale' &&
          r.ClosePrice > 0
        )
      }
    }
  } catch (error) {
    console.error(`[ParkingSale] Error fetching building data:`, error)
  }

  if (soldData.length === 0) {
    return {
      success: false,
      level: 'building',
      name: `${streetNumber} ${streetName}`,
      geoId: buildingId,
      parkingValuePerSpot: null,
      dataPoints: {
        totalRecords: 0,
        withParking: 0,
        withoutParking: 0,
        withoutParkingPct: 0,
        validSizeRanges: 0,
        totalWeight: 0
      },
      qualityGates: {
        minWithoutParking: false,
        minWithoutParkingPct: false,
        minValidRanges: false,
        valueInRange: false
      },
      details: [],
      calculatedAt: new Date().toISOString()
    }
  }

  // For buildings, use relaxed thresholds
  const buildingGates = { ...QUALITY_GATES }
  buildingGates.MIN_WITHOUT_PARKING = 3
  buildingGates.MIN_WITHOUT_PARKING_PCT = 3
  buildingGates.MIN_VALID_RANGES = 1
  buildingGates.MIN_SAMPLES_PER_GROUP = 2

  const { parkingValuePerSpot, results, dataPoints, qualityGates } = calculateParkingValueImproved(soldData)

  if (parkingValuePerSpot !== null) {
    await saveToAdjustments('building', buildingId, parkingValuePerSpot, dataPoints.validSizeRanges, dataPoints.totalWeight, dataPoints.totalRecords)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[ParkingSale] Completed building in ${duration}s. Value: ${parkingValuePerSpot ? '$' + parkingValuePerSpot : 'NULL'}`)

  return {
    success: parkingValuePerSpot !== null,
    level: 'building',
    name: `${streetNumber} ${streetName}`,
    geoId: buildingId,
    parkingValuePerSpot,
    dataPoints,
    qualityGates,
    details: results,
    calculatedAt: new Date().toISOString()
  }
}

// ============================================
// POST HANDLER
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { level, name, id, maxRecords } = body

    if (!level) {
      return NextResponse.json({ success: false, error: 'Level is required' }, { status: 400 })
    }

    const results: CalculationResult[] = []
    const GEO_BATCH_SIZE = 5

    // ==========================================
    // SYNC ALL LEVELS
    // ==========================================
    if (level === 'all' || level === 'parking_sale') {
      console.log('[ParkingSale] Starting full sync with improved algorithm...')

      // Areas
      const { data: areas } = await supabase.from('treb_areas').select('id, name')
      if (areas && areas.length > 0) {
        const totalBatches = Math.ceil(areas.length / GEO_BATCH_SIZE)
        for (let i = 0; i < totalBatches; i++) {
          const batch = areas.slice(i * GEO_BATCH_SIZE, (i + 1) * GEO_BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(area => calculateForGeo('area', 'CountyOrParish', area.name, area.id, maxRecords || 50000))
          )
          results.push(...batchResults)
          console.log(`[ParkingSale] Areas: ${Math.min((i + 1) * GEO_BATCH_SIZE, areas.length)}/${areas.length}`)
        }
      }

      // Municipalities
      const { data: municipalities } = await supabase.from('municipalities').select('id, name')
      if (municipalities && municipalities.length > 0) {
        const totalBatches = Math.ceil(municipalities.length / GEO_BATCH_SIZE)
        for (let i = 0; i < totalBatches; i++) {
          const batch = municipalities.slice(i * GEO_BATCH_SIZE, (i + 1) * GEO_BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(muni => calculateForGeo('municipality', 'City', muni.name, muni.id, maxRecords || 50000))
          )
          results.push(...batchResults)
          if ((i + 1) % 10 === 0 || i === totalBatches - 1) {
            console.log(`[ParkingSale] Municipalities: ${Math.min((i + 1) * GEO_BATCH_SIZE, municipalities.length)}/${municipalities.length}`)
          }
        }
      }

      // Communities
      const { data: communities } = await supabase.from('communities').select('id, name')
      if (communities && communities.length > 0) {
        const totalBatches = Math.ceil(communities.length / GEO_BATCH_SIZE)
        for (let i = 0; i < totalBatches; i++) {
          const batch = communities.slice(i * GEO_BATCH_SIZE, (i + 1) * GEO_BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(comm => calculateForGeo('community', 'CityRegion', comm.name, comm.id, maxRecords || 50000))
          )
          results.push(...batchResults)
          if ((i + 1) % 20 === 0 || i === totalBatches - 1) {
            console.log(`[ParkingSale] Communities: ${Math.min((i + 1) * GEO_BATCH_SIZE, communities.length)}/${communities.length}`)
          }
        }
      }

      const withValue = results.filter(r => r.parkingValuePerSpot !== null)
      return NextResponse.json({
        success: true,
        message: 'Full parking sale sync completed',
        summary: {
          areas: results.filter(r => r.level === 'area').length,
          municipalities: results.filter(r => r.level === 'municipality').length,
          communities: results.filter(r => r.level === 'community').length,
          withValue: withValue.length
        },
        results
      })
    }

    // ==========================================
    // SINGLE AREA
    // ==========================================
    if (level === 'area') {
      if (!name && !id) {
        return NextResponse.json({ success: false, error: 'Area name or id required' }, { status: 400 })
      }

      let areaId = id
      let areaName = name

      if (!areaId) {
        const { data: area } = await supabase.from('treb_areas').select('id, name').eq('name', name).single()
        if (!area) {
          return NextResponse.json({ success: false, error: `Area not found: ${name}` }, { status: 404 })
        }
        areaId = area.id
        areaName = area.name
      }

      const result = await calculateForGeo('area', 'CountyOrParish', areaName, areaId, maxRecords || 50000)
      return NextResponse.json(result)
    }

    // ==========================================
    // SINGLE MUNICIPALITY
    // ==========================================
    if (level === 'municipality') {
      if (!name && !id) {
        return NextResponse.json({ success: false, error: 'Municipality name or id required' }, { status: 400 })
      }

      let muniId = id
      let muniName = name

      if (!muniId) {
        const { data: muni } = await supabase.from('municipalities').select('id, name').eq('name', name).single()
        if (!muni) {
          return NextResponse.json({ success: false, error: `Municipality not found: ${name}` }, { status: 404 })
        }
        muniId = muni.id
        muniName = muni.name
      }

      const result = await calculateForGeo('municipality', 'City', muniName, muniId, maxRecords || 50000)
      return NextResponse.json(result)
    }

    // ==========================================
    // SINGLE COMMUNITY
    // ==========================================
    if (level === 'community') {
      if (!name && !id) {
        return NextResponse.json({ success: false, error: 'Community name or id required' }, { status: 400 })
      }

      let commId = id
      let commName = name

      if (!commId) {
        const { data: comm } = await supabase.from('communities').select('id, name').eq('name', name).single()
        if (!comm) {
          return NextResponse.json({ success: false, error: `Community not found: ${name}` }, { status: 404 })
        }
        commId = comm.id
        commName = comm.name
      }

      const result = await calculateForGeo('community', 'CityRegion', commName, commId, maxRecords || 50000)
      return NextResponse.json(result)
    }

    // ==========================================
    // SYNC ALL AREAS
    // ==========================================
    if (level === 'areas') {
      const { data: areas } = await supabase.from('treb_areas').select('id, name')
      if (areas && areas.length > 0) {
        const totalBatches = Math.ceil(areas.length / GEO_BATCH_SIZE)
        for (let i = 0; i < totalBatches; i++) {
          const batch = areas.slice(i * GEO_BATCH_SIZE, (i + 1) * GEO_BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(area => calculateForGeo('area', 'CountyOrParish', area.name, area.id, maxRecords || 50000))
          )
          results.push(...batchResults)
          console.log(`[ParkingSale] Areas: ${Math.min((i + 1) * GEO_BATCH_SIZE, areas.length)}/${areas.length}`)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} areas`,
        withValue: results.filter(r => r.parkingValuePerSpot !== null).length,
        results
      })
    }

    // ==========================================
    // SYNC ALL MUNICIPALITIES
    // ==========================================
    if (level === 'municipalities') {
      const { data: municipalities } = await supabase.from('municipalities').select('id, name')
      if (municipalities && municipalities.length > 0) {
        const totalBatches = Math.ceil(municipalities.length / GEO_BATCH_SIZE)
        for (let i = 0; i < totalBatches; i++) {
          const batch = municipalities.slice(i * GEO_BATCH_SIZE, (i + 1) * GEO_BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(muni => calculateForGeo('municipality', 'City', muni.name, muni.id, maxRecords || 50000))
          )
          results.push(...batchResults)
          if ((i + 1) % 10 === 0 || i === totalBatches - 1) {
            console.log(`[ParkingSale] Municipalities: ${Math.min((i + 1) * GEO_BATCH_SIZE, municipalities.length)}/${municipalities.length}`)
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} municipalities`,
        withValue: results.filter(r => r.parkingValuePerSpot !== null).length,
        results
      })
    }

    // ==========================================
    // SYNC ALL COMMUNITIES
    // ==========================================
    if (level === 'communities') {
      const { data: communities } = await supabase.from('communities').select('id, name')
      if (communities && communities.length > 0) {
        const totalBatches = Math.ceil(communities.length / GEO_BATCH_SIZE)
        for (let i = 0; i < totalBatches; i++) {
          const batch = communities.slice(i * GEO_BATCH_SIZE, (i + 1) * GEO_BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(comm => calculateForGeo('community', 'CityRegion', comm.name, comm.id, maxRecords || 50000))
          )
          results.push(...batchResults)
          if ((i + 1) % 20 === 0 || i === totalBatches - 1) {
            console.log(`[ParkingSale] Communities: ${Math.min((i + 1) * GEO_BATCH_SIZE, communities.length)}/${communities.length}`)
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} communities`,
        withValue: results.filter(r => r.parkingValuePerSpot !== null).length,
        results
      })
    }

    // ==========================================
    // SINGLE BUILDING
    // ==========================================
    if (level === 'building') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'Building id required' }, { status: 400 })
      }

      const { data: building } = await supabase
        .from('buildings')
        .select('id, building_name, street_number, street_name, city_district')
        .eq('id', id)
        .single()

      if (!building) {
        return NextResponse.json({ success: false, error: `Building not found: ${id}` }, { status: 404 })
      }

      const result = await calculateForBuilding(building.id, building.street_number, building.street_name, building.city_district || 'Toronto')
      return NextResponse.json(result)
    }

    // ==========================================
    // SYNC ALL MUNICIPALITIES - APPROACH 2 (Per Building)
    // ==========================================
    if (level === 'municipalities_v2') {
      console.log('[ParkingSale] Starting municipalities v2 (per-building approach)...')
      
      const { data: municipalities } = await supabase.from('municipalities').select('id, name')
      if (!municipalities || municipalities.length === 0) {
        return NextResponse.json({ success: true, message: 'No municipalities found', results: [] })
      }

      for (const muni of municipalities) {
        console.log(`[ParkingSale] Processing municipality: ${muni.name}`)
        
        // Fetch ALL sold records for this municipality
        const allRecords: SoldRecord[] = []
        let skip = 0
        const top = 5000
        let totalFetched = 0
        
        // First get count
        const countFilter = `City eq '${muni.name.replace(/'/g, "''")}' and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld') and TransactionType eq 'For Sale' and ClosePrice gt 0`
        const countUrl = `${PROPTX_URL}Property?$filter=${encodeURIComponent(countFilter)}&$count=true&$top=1`
        
        try {
          const countResponse = await fetch(countUrl, {
            headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
          })
          
          if (!countResponse.ok) continue
          
          const countData = await countResponse.json()
          const totalRecords = countData['@odata.count'] || 0
          
          if (totalRecords === 0) continue
          
          // Fetch all records with pagination
          while (skip < totalRecords) {
            const url = `${PROPTX_URL}Property?$filter=${encodeURIComponent(countFilter)}&$select=ListingKey,StreetNumber,StreetName,ClosePrice,LivingAreaRange,ParkingTotal,TransactionType,City&$top=${top}&$skip=${skip}`
            
            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
            })
            
            if (!response.ok) break
            
            const data = await response.json()
            if (data.value) {
              allRecords.push(...data.value)
            }
            skip += top
            totalFetched = allRecords.length
          }
          
          if (allRecords.length === 0) continue
          
          // Now process using the improved algorithm
          const { parkingValuePerSpot, results: details, dataPoints, qualityGates } = calculateParkingValueImproved(allRecords)
          
          if (parkingValuePerSpot !== null) {
            await saveToAdjustments('municipality', muni.id, parkingValuePerSpot, dataPoints.validSizeRanges, dataPoints.totalWeight, dataPoints.totalRecords)
          }
          
          results.push({
            success: parkingValuePerSpot !== null,
            level: 'municipality',
            name: muni.name,
            geoId: muni.id,
            parkingValuePerSpot,
            dataPoints,
            qualityGates,
            details,
            calculatedAt: new Date().toISOString()
          })
          
          console.log(`[ParkingSale] ${muni.name}: ${parkingValuePerSpot ? '$' + parkingValuePerSpot : 'NULL'} (${allRecords.length} records)`)
          
        } catch (error) {
          console.error(`[ParkingSale] Error processing ${muni.name}:`, error)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} municipalities (v2)`,
        withValue: results.filter(r => r.parkingValuePerSpot !== null).length,
        results
      })
    }

    // ==========================================
    // SYNC ALL COMMUNITIES - APPROACH 2 (Per Building)
    // ==========================================
    if (level === 'communities_v2') {
      console.log('[ParkingSale] Starting communities v2 (per-building approach)...')
      
      const { data: communities } = await supabase.from('communities').select('id, name')
      if (!communities || communities.length === 0) {
        return NextResponse.json({ success: true, message: 'No communities found', results: [] })
      }

      for (const comm of communities) {
        console.log(`[ParkingSale] Processing community: ${comm.name}`)
        
        // Fetch ALL sold records for this community
        const allRecords: SoldRecord[] = []
        let skip = 0
        const top = 5000
        
        const countFilter = `CityRegion eq '${comm.name.replace(/'/g, "''")}' and (StandardStatus eq 'Closed' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld') and TransactionType eq 'For Sale' and ClosePrice gt 0`
        const countUrl = `${PROPTX_URL}Property?$filter=${encodeURIComponent(countFilter)}&$count=true&$top=1`
        
        try {
          const countResponse = await fetch(countUrl, {
            headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
          })
          
          if (!countResponse.ok) continue
          
          const countData = await countResponse.json()
          const totalRecords = countData['@odata.count'] || 0
          
          if (totalRecords === 0) continue
          
          // Fetch all records with pagination
          while (skip < totalRecords) {
            const url = `${PROPTX_URL}Property?$filter=${encodeURIComponent(countFilter)}&$select=ListingKey,StreetNumber,StreetName,ClosePrice,LivingAreaRange,ParkingTotal,TransactionType,City&$top=${top}&$skip=${skip}`
            
            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${PROPTX_VOW_TOKEN}`, 'Accept': 'application/json' }
            })
            
            if (!response.ok) break
            
            const data = await response.json()
            if (data.value) {
              allRecords.push(...data.value)
            }
            skip += top
          }
          
          if (allRecords.length === 0) continue
          
          // Process using improved algorithm
          const { parkingValuePerSpot, results: details, dataPoints, qualityGates } = calculateParkingValueImproved(allRecords)
          
          if (parkingValuePerSpot !== null) {
            await saveToAdjustments('community', comm.id, parkingValuePerSpot, dataPoints.validSizeRanges, dataPoints.totalWeight, dataPoints.totalRecords)
          }
          
          results.push({
            success: parkingValuePerSpot !== null,
            level: 'community',
            name: comm.name,
            geoId: comm.id,
            parkingValuePerSpot,
            dataPoints,
            qualityGates,
            details,
            calculatedAt: new Date().toISOString()
          })
          
          console.log(`[ParkingSale] ${comm.name}: ${parkingValuePerSpot ? '$' + parkingValuePerSpot : 'NULL'} (${allRecords.length} records)`)
          
        } catch (error) {
          console.error(`[ParkingSale] Error processing ${comm.name}:`, error)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} communities (v2)`,
        withValue: results.filter(r => r.parkingValuePerSpot !== null).length,
        results
      })
    }

    // ==========================================
    // SYNC ALL BUILDINGS
    // ==========================================
    if (level === 'buildings') {
      console.log('[ParkingSale] Starting all buildings sync...')
      const { data: buildings } = await supabase
        .from('buildings')
        .select('id, building_name, street_number, street_name, city_district')

      if (!buildings || buildings.length === 0) {
        return NextResponse.json({ success: true, message: 'No buildings found', results: [] })
      }

      const BATCH_SIZE = 10
      const totalBatches = Math.ceil(buildings.length / BATCH_SIZE)
      console.log(`[ParkingSale] Processing ${buildings.length} buildings in ${totalBatches} batches`)

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE
        const batch = buildings.slice(batchStart, batchStart + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(b => calculateForBuilding(b.id, b.street_number, b.street_name, b.city_district || 'Toronto'))
        )

        results.push(...batchResults)

        if ((batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
          console.log(`[ParkingSale] Buildings progress: ${Math.min((batchIndex + 1) * BATCH_SIZE, buildings.length)}/${buildings.length}`)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${buildings.length} buildings`,
        withValue: results.filter(r => r.parkingValuePerSpot !== null).length,
        results
      })
    }

    return NextResponse.json({ success: false, error: `Invalid level: ${level}` }, { status: 400 })

  } catch (error) {
    console.error('[ParkingSale] Error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

// ============================================
// GET HANDLER
// ============================================
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('adjustments')
      .select(`
        id,
        area_id,
        municipality_id,
        community_id,
        building_id,
        parking_sale_weighted_avg,
        parking_sale_count,
        parking_sale_sample_size,
        parking_sale_records,
        parking_sale_calculated_at,
        treb_areas:area_id(name),
        municipalities:municipality_id(name, code),
        communities:community_id(name),
        buildings:building_id(building_name)
      `)
      .not('parking_sale_weighted_avg', 'is', null)
      .order('parking_sale_calculated_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      adjustments: data
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
