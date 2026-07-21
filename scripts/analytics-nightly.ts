import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// scripts/analytics-nightly.ts
// Analytics engine orchestrator for GitHub Actions
// Runs after nightly MLS sync completes
// Stages: PSF → Buildings → Community → Municipality → Area/Neighbourhood → Rankings
// Usage: npx tsx scripts/analytics-nightly.ts

import { supabase } from './lib/supabase-client'
import { Client as PgClient } from 'pg'
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

  // Incremental: find geo entities with changes in last 48h.
  //
  // ANALYTICS-CHANGE-DETECTION-FIX 2026-07-21: switched from Supabase's
  // PostgREST .select() to pg-direct AND from modification_timestamp to
  // updated_at, for TWO reasons:
  //   1. PostgREST times out silently at ~8s on the 1.4M-row mls_listings
  //      table — returns { data: null } which the old code interpreted as
  //      "no changes." That's exactly why every recent analytics run silently
  //      no-op'd for building + community (verified: local run 2026-07-21T19:00Z
  //      exited with success=0/failed=0 after 8s change-detection timeout,
  //      and the CI job reported success while writing 0 building/community
  //      rows to geo_analytics for weeks).
  //   2. There is NO index on modification_timestamp — even pg-direct with
  //      SET statement_timeout=60000 cancels. The Event 7 migration
  //      (5bcbea9) created idx_mls_listings_updated_at, so updated_at is
  //      index-backed and completes the same query in ~13s. Semantically,
  //      updated_at ("when our sync last touched this row") is what change
  //      detection actually wants — we recompute analytics for rows we just
  //      wrote, regardless of PropTx's own modification pointer.
  // pg-direct THROWS on error (vs Supabase-JS returning {data:null,error}),
  // so a real query failure now propagates up and fails the run loudly
  // instead of degrading to silent "no changes."
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  log(TAG, `Incremental mode — finding changes since ${since48h} (via pg-direct, updated_at index)`)

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    error(TAG, 'DATABASE_URL not set — cannot query mls_listings changes (PostgREST times out at 8s on this table)')
    throw new Error('analytics change detection requires DATABASE_URL')
  }
  const pg = new PgClient({ connectionString: dbUrl })
  await pg.connect()
  let changed: Array<{ building_id: string | null; community_id: string | null; municipality_id: string | null; area_id: string | null }> = []
  try {
    await pg.query('SET statement_timeout = 120000')  // 2 min; observed ~13s
    const r = await pg.query(
      `SELECT building_id, community_id, municipality_id, area_id
         FROM mls_listings
        WHERE updated_at >= $1
          AND community_id IS NOT NULL`,
      [since48h]
    )
    changed = r.rows as any[]
  } finally {
    try { await pg.end() } catch (_) {}
  }

  if (changed.length === 0) {
    log(TAG, 'No listing changes in last 48h')
    return { buildings: [], communities: [], municipalities: [], areas: [], neighbourhoods: [] }
  }
  log(TAG, `Change-detection query returned ${changed.length} rows`)

  // Collect unique IDs
  const bldIds  = [...new Set(changed.map((r: any) => r.building_id).filter(Boolean))]
  const commIds = [...new Set(changed.map((r: any) => r.community_id).filter(Boolean))]
  const muniIds = [...new Set(changed.map((r: any) => r.municipality_id).filter(Boolean))]
  const areaIds = [...new Set(changed.map((r: any) => r.area_id).filter(Boolean))]

  // Fetch entity names via pg-direct — the Supabase `.in('id', <uuid[]>)`
  // pattern silently fails on large arrays because PostgREST encodes IN()
  // via the URL query string, which caps at ~2000 characters. Verified
  // 2026-07-21: bldIds=2329 → 2329*37chars = 86KB URL → `data=null` returned
  // → entity list became empty → STAGE 3/4 reported "(0 buildings)" and
  // "(0 communities)" for weeks while STAGE 5+ (municipalities, small arrays
  // ≤370 that fit under URL cap) kept working. pg-direct with a bind
  // parameter (WHERE id = ANY($1::uuid[])) has no URL constraint.
  const pgUrl = process.env.DATABASE_URL
  if (!pgUrl) throw new Error('analytics entity-name fetch requires DATABASE_URL')
  const pg2 = new PgClient({ connectionString: pgUrl })
  await pg2.connect()
  let bldNames: { id: string; name: string }[] = []
  let commNames: { id: string; name: string }[] = []
  let muniNames: { id: string; name: string }[] = []
  let areaNames: { id: string; name: string }[] = []
  let neighbourhoods: { id: string; name: string }[] = []
  try {
    await pg2.query('SET statement_timeout = 60000')
    if (bldIds.length > 0) {
      const r = await pg2.query('SELECT id, building_name AS name FROM buildings WHERE id = ANY($1::uuid[])', [bldIds])
      bldNames = r.rows as any[]
    }
    if (commIds.length > 0) {
      const r = await pg2.query('SELECT id, name FROM communities WHERE id = ANY($1::uuid[])', [commIds])
      commNames = r.rows as any[]
    }
    if (muniIds.length > 0) {
      const r = await pg2.query('SELECT id, name FROM municipalities WHERE id = ANY($1::uuid[])', [muniIds])
      muniNames = r.rows as any[]
    }
    if (areaIds.length > 0) {
      const r = await pg2.query('SELECT id, name FROM treb_areas WHERE id = ANY($1::uuid[])', [areaIds])
      areaNames = r.rows as any[]
    }
    if (muniIds.length > 0) {
      const r = await pg2.query(
        `SELECT DISTINCT n.id, n.name
           FROM neighbourhoods n
           JOIN municipality_neighbourhoods mn ON mn.neighbourhood_id = n.id
          WHERE mn.municipality_id = ANY($1::uuid[])`,
        [muniIds]
      )
      neighbourhoods = r.rows as any[]
    }
  } finally {
    try { await pg2.end() } catch (_) {}
  }

  log(TAG, `Changed: ${bldIds.length} buildings, ${commIds.length} communities, ${muniIds.length} municipalities, ${areaIds.length} areas, ${neighbourhoods.length} neighbourhoods`)
  log(TAG, `Entity-name lookup returned: ${bldNames.length} buildings, ${commNames.length} communities, ${muniNames.length} municipalities, ${areaNames.length} areas`)

  return {
    buildings: bldNames,
    communities: commNames,
    municipalities: muniNames,
    areas: areaNames,
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
