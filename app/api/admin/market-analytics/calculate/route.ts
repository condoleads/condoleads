// app/api/admin/market-analytics/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROPTX_URL = process.env.PROPTX_RESO_API_URL || 'https://query.ampre.ca/odata/'
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN

const BATCH_SIZE = 20 // Process 20 items in parallel

// Fetch parking data for a specific location from PropTx
async function fetchParkingForLocation(
  field: 'CountyOrParish' | 'City' | 'CityRegion',
  value: string,
  maxRecords: number = 200
): Promise<{ values: number[]; isToronto: boolean }> {
  const valueEscaped = value.replace(/'/g, "''")
  const filter = `PropertyType eq 'Residential Condo %26 Other' and (TransactionType eq 'For Lease' or StandardStatus eq 'Leased') and ${field} eq '${valueEscaped}' and ParkingMonthlyCost gt 0`
  const url = `${PROPTX_URL}Property?$filter=${filter}&$select=${field},CountyOrParish,ParkingMonthlyCost&$top=${maxRecords}`

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${PROPTX_TOKEN}` }
    })

    if (!response.ok) return { values: [], isToronto: false }

    const data = await response.json()
    if (!data.value || data.value.length === 0) return { values: [], isToronto: false }

    const isToronto = data.value.some((r: any) => r.CountyOrParish === 'Toronto')

    // Filter: Toronto no limit, Non-Toronto max $250
    const filtered = data.value.filter((r: any) => {
      if (r.CountyOrParish === 'Toronto') return true
      return r.ParkingMonthlyCost <= 250
    })

    const values = filtered.map((r: any) => r.ParkingMonthlyCost)
    return { values, isToronto }
  } catch (err) {
    return { values: [], isToronto: false }
  }
}

// Calculate average from values
function calcAverage(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100
}

// Save adjustment to database
async function saveAdjustment(
  level: 'area' | 'municipality' | 'community' | 'building',
  geoId: string,
  average: number,
  count: number,
  now: string
): Promise<{ success: boolean; error?: string }> {
  // Build the query based on level
  let query = supabase.from('adjustments').select('id')

  if (level === 'area') {
    query = query.eq('area_id', geoId).is('municipality_id', null).is('community_id', null).is('building_id', null).is('neighbourhood_id', null)
  } else if (level === 'municipality') {
    query = query.eq('municipality_id', geoId).is('area_id', null).is('community_id', null).is('building_id', null).is('neighbourhood_id', null)
  } else if (level === 'community') {
    query = query.eq('community_id', geoId).is('area_id', null).is('municipality_id', null).is('building_id', null).is('neighbourhood_id', null)
  } else if (level === 'building') {
    query = query.eq('building_id', geoId).is('area_id', null).is('municipality_id', null).is('community_id', null).is('neighbourhood_id', null)
  }

  const { data: existing } = await query.maybeSingle()

  const updateData = {
    parking_lease_calculated: average,
    parking_lease_count: count,
    parking_lease_calculated_at: now,
    updated_at: now
  }

  if (existing) {
    const { error } = await supabase.from('adjustments').update(updateData).eq('id', existing.id)
    if (error) return { success: false, error: error.message }
  } else {
    const insertData: any = { ...updateData, created_at: now }
    if (level === 'area') insertData.area_id = geoId
    else if (level === 'municipality') insertData.municipality_id = geoId
    else if (level === 'community') insertData.community_id = geoId
    else if (level === 'building') insertData.building_id = geoId

    const { error } = await supabase.from('adjustments').insert(insertData)
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

// Process a single geo item and save
async function processGeoItem(
  level: 'area' | 'municipality' | 'community',
  geoField: 'CountyOrParish' | 'City' | 'CityRegion',
  item: { id: string; name: string },
  now: string
): Promise<{ searched: boolean; withData: boolean; saved: boolean; error?: string }> {
  const { values } = await fetchParkingForLocation(geoField, item.name)
  
  if (values.length === 0) {
    return { searched: true, withData: false, saved: false }
  }

  const average = calcAverage(values)
  if (average === null) {
    return { searched: true, withData: false, saved: false }
  }

  const saveResult = await saveAdjustment(level, item.id, average, values.length, now)
  
  return {
    searched: true,
    withData: true,
    saved: saveResult.success,
    error: saveResult.error
  }
}

// Calculate building-level parking from mls_listings
async function calculateBuildingParkingLease() {
  const now = new Date().toISOString()
  const results = { searched: 0, withData: 0, saved: 0, errors: [] as string[] }

  // Fallback: direct query
  const { data: rawData, error: rawError } = await supabase
    .from('mls_listings')
    .select('building_id, parking_monthly_cost, transaction_type, standard_status')
    .not('building_id', 'is', null)
    .gt('parking_monthly_cost', 0)

  if (rawError || !rawData) {
    results.errors.push(`Query error: ${rawError?.message}`)
    return results
  }

  // Filter and group manually
  const filtered = rawData.filter(r =>
    r.transaction_type === 'For Lease' ||
    ['Leased', 'Closed'].includes(r.standard_status)
  )

  const grouped: Record<string, number[]> = {}
  for (const r of filtered) {
    if (!grouped[r.building_id]) grouped[r.building_id] = []
    grouped[r.building_id].push(parseFloat(r.parking_monthly_cost))
  }

  // Process buildings in parallel batches
  const buildingEntries = Object.entries(grouped)
  const totalBatches = Math.ceil(buildingEntries.length / BATCH_SIZE)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE
    const batch = buildingEntries.slice(batchStart, batchStart + BATCH_SIZE)

    await Promise.all(
      batch.map(async ([buildingId, values]) => {
        results.searched++
        if (values.length === 0) return

        results.withData++
        const average = calcAverage(values)
        if (average === null) return

        const saveResult = await saveAdjustment('building', buildingId, average, values.length, now)
        if (saveResult.success) results.saved++
        else if (saveResult.error) results.errors.push(`Building ${buildingId}: ${saveResult.error}`)
      })
    )
  }

  return results
}

export async function POST(request: NextRequest) {
  const results = {
    areas: { searched: 0, withData: 0, saved: 0 },
    municipalities: { searched: 0, withData: 0, saved: 0 },
    communities: { searched: 0, withData: 0, saved: 0 },
    buildings: { searched: 0, withData: 0, saved: 0 },
    errors: [] as string[]
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { type = 'parking_lease' } = body
    const now = new Date().toISOString()

    // ==========================================
    // LEVEL 1: AREAS (Parallel Batch Processing)
    // ==========================================
    if (type === 'all' || type === 'parking_lease' || type === 'areas') {
      console.log('[Calculate] Starting Areas with parallel processing...')
      const { data: areas } = await supabase.from('treb_areas').select('id, name')
      
      if (areas && areas.length > 0) {
        const totalBatches = Math.ceil(areas.length / BATCH_SIZE)
        
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * BATCH_SIZE
          const batch = areas.slice(batchStart, batchStart + BATCH_SIZE)

          const batchResults = await Promise.all(
            batch.map(area => processGeoItem('area', 'CountyOrParish', area, now))
          )

          for (const result of batchResults) {
            if (result.searched) results.areas.searched++
            if (result.withData) results.areas.withData++
            if (result.saved) results.areas.saved++
            if (result.error) results.errors.push(result.error)
          }

          if ((batchIndex + 1) % 2 === 0) {
            console.log(`[Calculate] Areas progress: ${Math.min((batchIndex + 1) * BATCH_SIZE, areas.length)}/${areas.length}`)
          }
        }
      }
      console.log(`[Calculate] Areas done: ${results.areas.saved} saved`)
    }

    // ==========================================
    // LEVEL 2: MUNICIPALITIES (Parallel Batch Processing)
    // ==========================================
    if (type === 'all' || type === 'parking_lease' || type === 'municipalities') {
      console.log('[Calculate] Starting Municipalities with parallel processing...')
      const { data: municipalities } = await supabase.from('municipalities').select('id, name')

      if (municipalities && municipalities.length > 0) {
        const totalBatches = Math.ceil(municipalities.length / BATCH_SIZE)

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * BATCH_SIZE
          const batch = municipalities.slice(batchStart, batchStart + BATCH_SIZE)

          const batchResults = await Promise.all(
            batch.map(muni => processGeoItem('municipality', 'City', muni, now))
          )

          for (const result of batchResults) {
            if (result.searched) results.municipalities.searched++
            if (result.withData) results.municipalities.withData++
            if (result.saved) results.municipalities.saved++
            if (result.error) results.errors.push(result.error)
          }

          if ((batchIndex + 1) % 5 === 0) {
            console.log(`[Calculate] Municipalities progress: ${Math.min((batchIndex + 1) * BATCH_SIZE, municipalities.length)}/${municipalities.length}`)
          }
        }
      }
      console.log(`[Calculate] Municipalities done: ${results.municipalities.saved} saved`)
    }

    // ==========================================
    // LEVEL 3: COMMUNITIES (Parallel Batch Processing)
    // ==========================================
    if (type === 'all' || type === 'parking_lease' || type === 'communities') {
      console.log('[Calculate] Starting Communities with parallel processing...')
      const { data: communities } = await supabase.from('communities').select('id, name')

      if (communities && communities.length > 0) {
        const totalBatches = Math.ceil(communities.length / BATCH_SIZE)

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * BATCH_SIZE
          const batch = communities.slice(batchStart, batchStart + BATCH_SIZE)

          const batchResults = await Promise.all(
            batch.map(comm => processGeoItem('community', 'CityRegion', comm, now))
          )

          for (const result of batchResults) {
            if (result.searched) results.communities.searched++
            if (result.withData) results.communities.withData++
            if (result.saved) results.communities.saved++
            if (result.error) results.errors.push(result.error)
          }

          if ((batchIndex + 1) % 10 === 0) {
            console.log(`[Calculate] Communities progress: ${Math.min((batchIndex + 1) * BATCH_SIZE, communities.length)}/${communities.length}`)
          }
        }
      }
      console.log(`[Calculate] Communities done: ${results.communities.saved} saved`)
    }

    // ==========================================
    // LEVEL 4: BUILDINGS (from mls_listings, Parallel)
    // ==========================================
    if (type === 'all' || type === 'parking_lease' || type === 'buildings') {
      console.log('[Calculate] Starting Buildings with parallel processing...')
      const buildingResults = await calculateBuildingParkingLease()
      results.buildings = buildingResults
      results.errors.push(...buildingResults.errors)
      console.log(`[Calculate] Buildings done: ${results.buildings.saved} saved`)
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        areas: `${results.areas.saved}/${results.areas.searched} (${results.areas.withData} with data)`,
        municipalities: `${results.municipalities.saved}/${results.municipalities.searched} (${results.municipalities.withData} with data)`,
        communities: `${results.communities.saved}/${results.communities.searched} (${results.communities.withData} with data)`,
        buildings: `${results.buildings.saved}/${results.buildings.searched} (${results.buildings.withData} with data)`
      }
    })

  } catch (error) {
    console.error('[Calculate] Error:', error)
    return NextResponse.json({ success: false, error: String(error), results }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('adjustments')
      .select('*, treb_areas:area_id(name), municipalities:municipality_id(name, code), communities:community_id(name), buildings:building_id(building_name)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ success: true, adjustments: data })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

