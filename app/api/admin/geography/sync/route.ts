// app/api/admin/geography/sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROPTX_URL = process.env.PROPTX_RESO_API_URL || 'https://query.ampre.ca/odata/'
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN

interface GeoRecord {
  CountyOrParish: string
  City: string
  CityRegion: string
}

export async function POST(request: NextRequest) {
  const results = {
    proptx: { areas: 0, municipalities: 0, communities: 0 },
    dbBefore: { areas: 0, municipalities: 0, communities: 0 },
    dbAfter: { areas: 0, municipalities: 0, communities: 0 },
    inserted: { areas: 0, municipalities: 0, communities: 0 },
    errors: [] as string[]
  }

  try {
    // Get current DB counts
    const { count: areasBefore } = await supabase.from('treb_areas').select('*', { count: 'exact', head: true })
    const { count: munisBefore } = await supabase.from('municipalities').select('*', { count: 'exact', head: true })
    const { count: commsBefore } = await supabase.from('communities').select('*', { count: 'exact', head: true })
    
    results.dbBefore = { 
      areas: areasBefore || 0, 
      municipalities: munisBefore || 0, 
      communities: commsBefore || 0 
    }

    // ==========================================
    // STEP 1: FETCH ALL UNIQUE GEO FROM PROPTX
    // ==========================================
    const areas = new Set<string>()
    const municipalities = new Map<string, string>() // muni -> area
    const communities = new Map<string, { area: string; municipality: string }>() // "muni|||comm" -> {area, muni}
    
    let skip = 0
    const maxRecords = 500000

    console.log('[Geography Sync] Fetching all geographic data from PropTx...')

    while (skip < maxRecords) {
      const url = `${PROPTX_URL}Property?$select=CountyOrParish,City,CityRegion&$top=500&$skip=${skip}`
      
      try {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${PROPTX_TOKEN}` }
        })

        if (!response.ok) {
          results.errors.push(`PropTx API error at skip=${skip}: ${response.status}`)
          break
        }

        const data = await response.json()
        if (!data.value || data.value.length === 0) break

        for (const rec of data.value as GeoRecord[]) {
          const area = rec.CountyOrParish?.trim()
          const muni = rec.City?.trim()
          const comm = rec.CityRegion?.trim()

          if (area) {
            areas.add(area)
          }
          if (area && muni) {
            municipalities.set(muni, area)
          }
          if (area && muni && comm) {
            const key = `${muni}|||${comm}`
            if (!communities.has(key)) {
              communities.set(key, { area, municipality: muni })
            }
          }
        }

        skip += 500
        if (data.value.length < 500) break
      } catch (err) {
        results.errors.push(`Fetch error at skip=${skip}: ${err}`)
        break
      }
    }

    results.proptx = {
      areas: areas.size,
      municipalities: municipalities.size,
      communities: communities.size
    }

    console.log(`[Geography Sync] PropTx: ${areas.size} areas, ${municipalities.size} municipalities, ${communities.size} communities`)

    // ==========================================
    // STEP 2: INSERT MISSING AREAS
    // ==========================================
    const { data: existingAreas } = await supabase.from('treb_areas').select('name')
    const existingAreaNames = new Set((existingAreas || []).map(a => a.name))

    for (const areaName of areas) {
      if (!existingAreaNames.has(areaName)) {
        const { error } = await supabase.from('treb_areas').insert({
          name: areaName,
          is_active: true
        })
        if (error) {
          results.errors.push(`Area insert ${areaName}: ${error.message}`)
        } else {
          results.inserted.areas++
        }
      }
    }

    // Refresh area lookup
    const { data: allAreas } = await supabase.from('treb_areas').select('id, name')
    const areaLookup = new Map((allAreas || []).map(a => [a.name, a.id]))

    // ==========================================
    // STEP 3: INSERT MISSING MUNICIPALITIES
    // ==========================================
    const { data: existingMunis } = await supabase.from('municipalities').select('name')
    const existingMuniNames = new Set((existingMunis || []).map(m => m.name))

    for (const [muniName, areaName] of municipalities) {
      if (!existingMuniNames.has(muniName)) {
        const areaId = areaLookup.get(areaName)
        if (!areaId) {
          results.errors.push(`Municipality ${muniName}: Area not found: ${areaName}`)
          continue
        }

        // Extract code from name like "Toronto C01" -> "C01"
        const codeMatch = muniName.match(/([A-Z]\d{2})$/)
        const code = codeMatch ? codeMatch[1] : null

        const { error } = await supabase.from('municipalities').insert({
          name: muniName,
          code: code,
          area_id: areaId,
          is_active: true
        })
        if (error) {
          results.errors.push(`Municipality insert ${muniName}: ${error.message}`)
        } else {
          results.inserted.municipalities++
        }
      }
    }

    // Refresh municipality lookup
    const { data: allMunis } = await supabase.from('municipalities').select('id, name')
    const muniLookup = new Map((allMunis || []).map(m => [m.name, m.id]))

    // ==========================================
    // STEP 4: INSERT MISSING COMMUNITIES
    // ==========================================
    const { data: existingComms } = await supabase.from('communities').select('name, municipality_id')
    const existingCommKeys = new Set((existingComms || []).map(c => `${c.municipality_id}|||${c.name}`))

    for (const [key, { municipality }] of communities) {
      const [muniName, commName] = key.split('|||')
      const muniId = muniLookup.get(muniName)
      
      if (!muniId) {
        results.errors.push(`Community ${commName}: Municipality not found: ${muniName}`)
        continue
      }

      const commKey = `${muniId}|||${commName}`
      if (!existingCommKeys.has(commKey)) {
        const { error } = await supabase.from('communities').insert({
          name: commName,
          municipality_id: muniId,
          is_active: true
        })
        if (error) {
          results.errors.push(`Community insert ${commName}: ${error.message}`)
        } else {
          results.inserted.communities++
        }
      }
    }

    // Get final counts
    const { count: areasAfter } = await supabase.from('treb_areas').select('*', { count: 'exact', head: true })
    const { count: munisAfter } = await supabase.from('municipalities').select('*', { count: 'exact', head: true })
    const { count: commsAfter } = await supabase.from('communities').select('*', { count: 'exact', head: true })

    results.dbAfter = {
      areas: areasAfter || 0,
      municipalities: munisAfter || 0,
      communities: commsAfter || 0
    }

    return NextResponse.json({ success: true, results })

  } catch (error) {
    return NextResponse.json({ success: false, error: String(error), results }, { status: 500 })
  }
}

export async function GET() {
  // Return current counts
  const { count: areas } = await supabase.from('treb_areas').select('*', { count: 'exact', head: true })
  const { count: municipalities } = await supabase.from('municipalities').select('*', { count: 'exact', head: true })
  const { count: communities } = await supabase.from('communities').select('*', { count: 'exact', head: true })

  return NextResponse.json({
    success: true,
    counts: {
      areas: areas || 0,
      municipalities: municipalities || 0,
      communities: communities || 0
    }
  })
}
