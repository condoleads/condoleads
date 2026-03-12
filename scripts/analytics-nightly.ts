import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// scripts/analytics-nightly.ts
// Analytics engine orchestrator for GitHub Actions
// Runs after nightly MLS sync completes
// Stages: PSF → Buildings → Community → Municipality → Area/Neighbourhood → Rankings
// Usage: npx tsx scripts/analytics-nightly.ts

import { supabase } from './lib/supabase-client'
import { log, warn, error } from './lib/sync-logger'
import {
  populatePSF,
  computeAndSaveGeoAnalytics,
  generateRankingsForGeo,
  updateValueMigrationForAll,
  CONDO_SUBTYPES,
  HOMES_SUBTYPES,
  type GeoType,
  type Track
} from './lib/analytics-engine'

const TAG = 'ANALYTICS'

// =====================================================
// CHANGE DETECTION
// Find which geo entities had listing changes in last 48h
// Only recalculate those — skip unchanged entities
// On first run (cold start mode) processes everything
// =====================================================

async function getChangedEntities(coldStart: boolean): Promise<{
  buildings: { id: string; name: string }[]
  communities: { id: string; name: string }[]
  municipalities: { id: string; name: string }[]
  areas: { id: string; name: string }[]
  neighbourhoods: { id: string; name: string }[]
}> {
  if (coldStart) {
    log(TAG, 'Cold start mode — loading ALL geo entities')

    const [bldResult, commResult, muniResult, areaResult, neighResult] = await Promise.all([
      supabase.from('buildings').select('id, building_name').not('building_name', 'is', null).order('building_name'),
      supabase.from('communities').select('id, name').order('name'),
      supabase.from('municipalities').select('id, name').order('name'),
      supabase.from('treb_areas').select('id, name').order('name'),
      supabase.from('neighbourhoods').select('id, name').order('name')
    ])

    return {
      buildings: (bldResult.data || []).map((b: any) => ({ id: b.id, name: b.building_name })),
      communities: commResult.data || [],
      municipalities: muniResult.data || [],
      areas: areaResult.data || [],
      neighbourhoods: neighResult.data || []
    }
  }

  // Incremental: find geo entities with changes in last 48h
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  log(TAG, `Incremental mode — finding changes since ${since48h}`)

  const { data: changed } = await supabase
    .from('mls_listings')
    .select('building_id, community_id, municipality_id, area_id')
    .gte('modification_timestamp', since48h)
    .not('community_id', 'is', null)

  if (!changed || changed.length === 0) {
    log(TAG, 'No listing changes in last 48h')
    return { buildings: [], communities: [], municipalities: [], areas: [], neighbourhoods: [] }
  }

  // Collect unique IDs
  const bldIds  = [...new Set(changed.map((r: any) => r.building_id).filter(Boolean))]
  const commIds = [...new Set(changed.map((r: any) => r.community_id).filter(Boolean))]
  const muniIds = [...new Set(changed.map((r: any) => r.municipality_id).filter(Boolean))]
  const areaIds = [...new Set(changed.map((r: any) => r.area_id).filter(Boolean))]

  // Fetch entity names
  const [bldResult, commResult, muniResult, areaResult] = await Promise.all([
    bldIds.length > 0
      ? supabase.from('buildings').select('id, building_name').in('id', bldIds)
      : Promise.resolve({ data: [] }),
    commIds.length > 0
      ? supabase.from('communities').select('id, name').in('id', commIds)
      : Promise.resolve({ data: [] }),
    muniIds.length > 0
      ? supabase.from('municipalities').select('id, name').in('id', muniIds)
      : Promise.resolve({ data: [] }),
    areaIds.length > 0
      ? supabase.from('treb_areas').select('id, name').in('id', areaIds)
      : Promise.resolve({ data: [] })
  ])

  // Find affected neighbourhoods via municipality mapping
  let neighbourhoods: { id: string; name: string }[] = []
  if (muniIds.length > 0) {
    const { data: neighMapping } = await supabase
      .from('municipality_neighbourhoods')
      .select('neighbourhood_id, neighbourhoods(id, name)')
      .in('municipality_id', muniIds)
    const neighIds = new Set((neighMapping || []).map((r: any) => r.neighbourhood_id).filter(Boolean))
    const { data: neighData } = await supabase
      .from('neighbourhoods')
      .select('id, name')
      .in('id', [...neighIds])
    neighbourhoods = neighData || []
  }

  log(TAG, `Changed: ${bldIds.length} buildings, ${commIds.length} communities, ${muniIds.length} municipalities, ${areaIds.length} areas, ${neighbourhoods.length} neighbourhoods`)

  return {
    buildings: (bldResult.data || []).map((b: any) => ({ id: b.id, name: b.building_name })),
    communities: commResult.data || [],
    municipalities: muniResult.data || [],
    areas: areaResult.data || [],
    neighbourhoods
  }
}

// =====================================================
// PROCESS ONE GEO ENTITY — BOTH TRACKS
// =====================================================

async function processEntity(
  geoType: GeoType,
  id: string,
  name: string,
  stats: { success: number; failed: number }
) {
  const tracks: Track[] = ['condo', 'homes']
  for (const track of tracks) {
    const ok = await computeAndSaveGeoAnalytics(geoType, id, track)
    if (ok) stats.success++
    else stats.failed++
  }
}

// =====================================================
// MAIN ENTRY POINT
// =====================================================

export async function runAnalyticsNightly(
  triggeredBy = 'github-nightly',
  coldStart = false
): Promise<{ success: number; failed: number }> {
  const stats = { success: 0, failed: 0 }
  const startedAt = Date.now()

  log(TAG, '========================================')
  log(TAG, 'Starting analytics nightly job')
  log(TAG, `Triggered by: ${triggeredBy}`)
  log(TAG, `Mode: ${coldStart ? 'COLD START (full rebuild)' : 'INCREMENTAL'}`)
  log(TAG, '========================================')

  // ── STAGE 1: PSF POPULATION ──
  log(TAG, '')
  log(TAG, '=== STAGE 1: PSF POPULATION ===')
  try {
    const { updated } = await populatePSF()
    log(TAG, `PSF: ${updated} listings updated`)
  } catch (err: any) {
    warn(TAG, `PSF population error: ${err.message} — continuing`)
  }

  // ── STAGE 2: CHANGE DETECTION ──
  log(TAG, '')
  log(TAG, '=== STAGE 2: CHANGE DETECTION ===')
  const { buildings, communities, municipalities, areas, neighbourhoods } = await getChangedEntities(coldStart)

  if (
    buildings.length === 0 &&
    communities.length === 0 &&
    municipalities.length === 0
  ) {
    log(TAG, 'Nothing to process — exiting')
    return stats
  }

  // ── STAGE 3: BUILDING ANALYTICS ──
  // Must run BEFORE community so community rankings have building data to read
  log(TAG, '')
  log(TAG, `=== STAGE 3: BUILDING ANALYTICS (${buildings.length} buildings) ===`)
  const bldStats = { success: 0, failed: 0 }
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]
    if (i % 100 === 0) log(TAG, `  Progress: ${i}/${buildings.length}`)
    await processEntity('building', b.id, b.name, bldStats)
  }
  stats.success += bldStats.success
  stats.failed += bldStats.failed
  log(TAG, `Building analytics complete: ${bldStats.success} ok / ${bldStats.failed} failed`)

  // ── STAGE 4: COMMUNITY ANALYTICS ──
  log(TAG, '')
  log(TAG, `=== STAGE 4: COMMUNITY ANALYTICS (${communities.length} communities) ===`)
  const commStats = { success: 0, failed: 0 }
  for (let i = 0; i < communities.length; i++) {
    const c = communities[i]
    if (i % 50 === 0) log(TAG, `  Progress: ${i}/${communities.length}`)
    await processEntity('community', c.id, c.name, commStats)
  }
  stats.success += commStats.success
  stats.failed += commStats.failed
  log(TAG, `Community analytics complete: ${commStats.success} ok / ${commStats.failed} failed`)

  // ── STAGE 5: MUNICIPALITY ANALYTICS ──
  log(TAG, '')
  log(TAG, `=== STAGE 5: MUNICIPALITY ANALYTICS (${municipalities.length} municipalities) ===`)
  const muniStats = { success: 0, failed: 0 }
  for (let i = 0; i < municipalities.length; i++) {
    const m = municipalities[i]
    if (i % 20 === 0) log(TAG, `  Progress: ${i}/${municipalities.length}`)
    await processEntity('municipality', m.id, m.name, muniStats)
  }
  stats.success += muniStats.success
  stats.failed += muniStats.failed
  log(TAG, `Municipality analytics complete: ${muniStats.success} ok / ${muniStats.failed} failed`)

  // ── STAGE 6: AREA + NEIGHBOURHOOD ANALYTICS ──
  log(TAG, '')
  log(TAG, `=== STAGE 6: AREA ANALYTICS (${areas.length} areas) ===`)
  const areaStats = { success: 0, failed: 0 }
  for (const a of areas) {
    await processEntity('area', a.id, a.name, areaStats)
  }
  stats.success += areaStats.success
  stats.failed += areaStats.failed
  log(TAG, `Area analytics complete: ${areaStats.success} ok / ${areaStats.failed} failed`)

  log(TAG, `=== STAGE 6b: NEIGHBOURHOOD ANALYTICS (${neighbourhoods.length} neighbourhoods) ===`)
  const neighStats = { success: 0, failed: 0 }
  for (const n of neighbourhoods) {
    await processEntity('neighbourhood', n.id, n.name, neighStats)
  }
  stats.success += neighStats.success
  stats.failed += neighStats.failed
  log(TAG, `Neighbourhood analytics complete: ${neighStats.success} ok / ${neighStats.failed} failed`)

  // ── STAGE 7: RANKINGS ──
  // Reads from geo_analytics — must run AFTER all aggregation above
  log(TAG, '')
  log(TAG, '=== STAGE 7: RANKINGS GENERATION ===')
  const rankingStats = { success: 0, failed: 0 }

  // Rankings are generated at the PARENT level — each call ranks its children
  // community  → ranks its buildings
  // municipality → ranks its communities
  // area        → ranks its municipalities
  // neighbourhood → ranks its municipalities
  const rankingTargets: { geoType: string; entities: { id: string; name: string }[] }[] = [
    { geoType: 'community',     entities: communities },
    { geoType: 'municipality',  entities: municipalities },
    { geoType: 'area',          entities: areas },
    { geoType: 'neighbourhood', entities: neighbourhoods }
  ]

  for (const target of rankingTargets) {
    for (const entity of target.entities) {
      for (const track of ['condo', 'homes'] as Track[]) {
        const ok = await generateRankingsForGeo(target.geoType, entity.id, track)
        if (ok) rankingStats.success++
        else rankingStats.failed++
      }
    }
  }

  stats.success += rankingStats.success
  stats.failed += rankingStats.failed
  log(TAG, `Rankings complete: ${rankingStats.success} ok / ${rankingStats.failed} failed`)

  // ── STAGE 8: VALUE MIGRATION SECOND PASS ──
  // Must run AFTER all geo levels computed — parent rows now exist
  log(TAG, '')
  log(TAG, '=== STAGE 8: VALUE MIGRATION PASS ===')

  // Build flat list of all entities that were processed
  const migrationTargets: { id: string; geoType: GeoType; track: Track }[] = []
  const tracks: Track[] = ['condo', 'homes']

  for (const track of tracks) {
    for (const b of buildings)      migrationTargets.push({ id: b.id, geoType: 'building',      track })
    for (const c of communities)    migrationTargets.push({ id: c.id, geoType: 'community',     track })
    for (const m of municipalities) migrationTargets.push({ id: m.id, geoType: 'municipality',  track })
    for (const a of areas)          migrationTargets.push({ id: a.id, geoType: 'area',          track })
  }
  // neighbourhoods have no parent — skip

  log(TAG, `Value migration: ${migrationTargets.length} entities to update`)
  const migStats = await updateValueMigrationForAll(migrationTargets)
  stats.success += migStats.success
  stats.failed += migStats.failed
  log(TAG, `Value migration complete: ${migStats.success} ok / ${migStats.failed} failed`)
  // -- FINAL REPORT --
  const duration = Math.round((Date.now() - startedAt) / 1000)
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  log(TAG, '')
  log(TAG, '========================================')
  log(TAG, `ANALYTICS COMPLETE in ${minutes}m ${seconds}s`)
  log(TAG, `Total: ${stats.success} ok / ${stats.failed} failed`)
  log(TAG, '========================================')

  return stats
}

// =====================================================
// STANDALONE EXECUTION
// Usage:       npx tsx scripts/analytics-nightly.ts
// Cold start:  COLD_START=true npx tsx scripts/analytics-nightly.ts
// =====================================================

if (require.main === module) {
  const coldStart = process.env.COLD_START === 'true'
  runAnalyticsNightly('manual', coldStart)
    .then(results => {
      console.log('\n=== ANALYTICS RESULTS ===')
      console.log(JSON.stringify(results, null, 2))
      process.exit(results.failed > 50 ? 1 : 0)
    })
    .catch(err => {
      console.error('FATAL:', err.message)
      process.exit(1)
    })
}
