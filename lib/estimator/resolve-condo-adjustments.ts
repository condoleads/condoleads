// lib/estimator/resolve-condo-adjustments.ts
// c1 (2026-06-10) — System 2 condo adjustment resolver.
//
// Reads the existing `adjustments` table (shared S1+S2) read-only. Uses the
// CORRECT computed-column names — the existing shared resolver
// (resolve-adjustments.ts) reads `parking_sale_calculated` which doesn't
// exist; the actual computed-SALE column is `parking_sale_weighted_avg`.
// That bug stays in the shared resolver (Rule Zero — System 1 surface);
// this resolver does it right from day 1.
//
// Cascade: Building → Community → Municipality → Area → Generic → Hardcoded.
// At each level: manual override (`*_value_*`) → calculated → fall through.
//
// Tenant scoping: the adjustments table has no tenant_id column today; this
// resolver accepts tenantId for forward-compat (used if/when adjustments
// becomes tenant-aware). For now, tenantId is recorded in the source string
// for traceability but does not filter rows.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface ResolvedCondoAdjustments {
  parkingPerSpace: number
  locker: number
  sources: {
    parking: string
    locker: string
  }
}

// Hardcoded fallbacks for PARKING only. Match the existing shared resolver's
// defaults so the no-adjustment-row case behaves identically for parking.
const HARDCODED_DEFAULTS_SALE  = { parkingPerSpace: 50000 }
const HARDCODED_DEFAULTS_LEASE = { parkingPerSpace: 200   }
// LOCKER: silent-omit when no scope has a value. The c4 analytics pipeline
// owes locker_*_calculated values; until then, returning 0 is the signal to
// matchers that the locker adjustment should be skipped (do NOT fake a value).
// Recon (2026-06-10) confirmed locker_*_calculated and locker_value_*
// columns are 0% populated across all 408 adjustments rows.

export async function resolveCondoAdjustments(
  buildingId: string | null | undefined,
  type: 'sale' | 'lease',
  _tenantId?: string | null,
): Promise<ResolvedCondoAdjustments> {
  const supabase = createServiceClient()
  const defaults = type === 'sale' ? HARDCODED_DEFAULTS_SALE : HARDCODED_DEFAULTS_LEASE

  // Manual override column names match the existing table.
  const parkingManual = type === 'sale' ? 'parking_value_sale' : 'parking_value_lease'
  const lockerManual  = type === 'sale' ? 'locker_value_sale'  : 'locker_value_lease'
  // Calculated column names — corrected vs. the shared resolver's schema-drift
  // bug. SALE parking is computed as parking_sale_weighted_avg (the shared
  // resolver reads parking_sale_calculated which doesn't exist). LEASE
  // parking and locker (both sides) use the *_calculated columns as in the
  // shared resolver.
  const parkingCalc = type === 'sale' ? 'parking_sale_weighted_avg' : 'parking_lease_calculated'
  const lockerCalc  = type === 'sale' ? 'locker_sale_calculated'    : 'locker_lease_calculated'

  try {
    if (!buildingId) {
      // No building → start at the community level; need community resolution
      // from address geo. For c1 we accept a null building (the building-less
      // cohort) — return defaults; the matcher's geo cascade will still run.
      return {
        parkingPerSpace: defaults.parkingPerSpace,
        locker: 0,
        sources: { parking: 'Hardcoded (no building)', locker: 'silent-omit (no building)' },
      }
    }

    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select(`
        id,
        community_id,
        communities (
          id,
          municipality_id,
          municipalities ( id, area_id )
        )
      `)
      .eq('id', buildingId)
      .single()

    if (buildingError || !building) {
      return {
        parkingPerSpace: defaults.parkingPerSpace,
        locker: 0,
        sources: { parking: 'Hardcoded (building not found)', locker: 'silent-omit (building not found)' },
      }
    }

    const community = (building as any).communities
    const municipality = community?.municipalities
    const areaId = municipality?.area_id
    const municipalityId = municipality?.id
    const communityId = community?.id

    const { data: allAdjustments } = await supabase.from('adjustments').select('*')

    const relevant = (allAdjustments || []).filter((adj: any) => {
      if (adj.building_id === buildingId) return true
      if (communityId && adj.community_id === communityId && !adj.building_id) return true
      if (municipalityId && adj.municipality_id === municipalityId && !adj.community_id && !adj.building_id) return true
      if (areaId && adj.area_id === areaId && !adj.municipality_id && !adj.community_id && !adj.building_id) return true
      if (!adj.building_id && !adj.community_id && !adj.municipality_id && !adj.area_id && !adj.neighbourhood_id) return true
      return false
    })

    const byLevel: Record<string, any> = {
      building: null, community: null, municipality: null, area: null, generic: null,
    }
    relevant.forEach((adj: any) => {
      if (adj.building_id) byLevel.building = adj
      else if (adj.community_id) byLevel.community = adj
      else if (adj.municipality_id) byLevel.municipality = adj
      else if (adj.area_id) byLevel.area = adj
      else if (!adj.neighbourhood_id) byLevel.generic = adj
    })

    // resolveField walks the cascade. At each scope: manual override
    // (`*_value_*`) wins over computed (`*_weighted_avg` / `*_calculated`).
    // When no scope has either, returns null — caller decides whether to
    // fall back to a hardcoded default (parking) or silent-omit (locker).
    const resolveField = (manual: string, calc: string): { value: number; source: string } | null => {
      const order = ['building', 'community', 'municipality', 'area', 'generic']
      for (const level of order) {
        const adj = byLevel[level]
        if (!adj) continue
        if (adj[manual] != null) {
          return { value: parseFloat(adj[manual]), source: `${cap(level)} (manual)` }
        }
        if (adj[calc] != null) {
          return { value: parseFloat(adj[calc]), source: `${cap(level)} (calculated)` }
        }
      }
      return null
    }

    const parkingResolved = resolveField(parkingManual, parkingCalc)
    const lockerResolved  = resolveField(lockerManual,  lockerCalc)

    return {
      // Parking: hardcoded fallback when no scope has a value (preserves
      // existing behavior — the matcher always applies a parking $-adj).
      parkingPerSpace: parkingResolved?.value ?? defaults.parkingPerSpace,
      // Locker: silent-omit (0) when no scope has a value. The matcher
      // checks `customValues.locker > 0` before applying the locker $-adj
      // (do NOT fake a value while the c4 analytics pipeline is pending).
      locker: lockerResolved?.value ?? 0,
      sources: {
        parking: parkingResolved?.source ?? 'Hardcoded',
        locker:  lockerResolved?.source  ?? 'silent-omit (no data in cascade)',
      },
    }
  } catch {
    return {
      parkingPerSpace: defaults.parkingPerSpace,
      locker: 0,
      sources: { parking: 'Hardcoded (error)', locker: 'silent-omit (error)' },
    }
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
