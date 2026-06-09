// lib/estimator/resolve-home-adjustments.ts
//
// v10 step 3 Phase 1: tenant-scoped per-geo override resolver for home
// estimator adjustments. Mirrors lib/estimator/resolve-adjustments.ts (the
// condo resolver) but with three corrections vs the condo precedent:
//
//   1. tenant_id is REQUIRED on every read. Anonymous (tenantId=null) callers
//      get DEFAULT_ADJUSTMENTS — no cross-tenant leak.
//   2. No building tier (homes are orphan property). Cascade is
//      community → municipality → area → tenant-generic → DEFAULT_ADJUSTMENTS.
//   3. Resilient to "table doesn't exist" (the migration hasn't been applied
//      yet, OR the schema differs). Any error path falls through to defaults
//      — the no-op safety net that lets us ship the wiring before the apply.
//
// Default-empty NO-OP guarantee: if a tenant has zero rows, the cascade
// reaches the hardcoded DEFAULT_ADJUSTMENTS and returns all 14 price keys
// from there. Every consumer of the result must use the `??` fallback
// pattern (`customValues?.X ?? DEFAULT_ADJUSTMENTS.X`) so a `null` column
// value in a partially-set row also falls through correctly.

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { DEFAULT_ADJUSTMENTS } from './home-adjustment-math'

// Service-role client — the matcher read path runs in anonymous-buyer
// context (any visitor can hit the estimator). RLS would block anonymous
// reads. Service role bypasses RLS; the .eq('tenant_id', tenantId)
// predicate below is the application-side enforcement. The DB-side RLS
// policy still enforces correctness on every WRITE path (admin CRUD).
function createSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Resolved override shape. EVERY key is OPTIONAL — the resolver returns a
// value ONLY for keys the operator explicitly set (via an admin row). Unset
// keys stay undefined so the caller's `customValues?.X ?? <theirDefault>`
// fallback resolves to the CALLER'S preferred default, not the resolver's.
//
// Why optional: the sale path uses DEFAULT_ADJUSTMENTS as its fallback (e.g.
// BATHROOM_FULL = $20,000); the lease path uses HOME_RENTAL_ADJUSTMENTS as
// ITS fallback (e.g. BATHROOM = $100/mo). If the resolver filled
// BATHROOM_FULL with DEFAULT_ADJUSTMENTS.BATHROOM_FULL on empty table, the
// lease path would read `20000 ?? 100 = 20000` and silently apply
// $20,000/bath to lease estimates. Phase-1.1 fix: leave it undefined,
// `undefined ?? 100 = 100`, lease defaults preserved.
export interface ResolvedHomeAdjustments {
  // Proportional frontage (h6 — pair)
  LOT_FRONTAGE_PER_FOOT_PCT?: number
  LOT_FRONTAGE_MAX_PCT?: number
  // Additive sale-side
  LOT_DEPTH_PER_10FT?: number
  LOT_DEPTH_MAX?: number
  BASEMENT_FINISHED?: number
  BASEMENT_SEP_ENTRANCE?: number
  BASEMENT_WALKOUT_BONUS?: number
  GARAGE_DETACHED_SINGLE?: number
  GARAGE_ATTACHED_SINGLE?: number
  GARAGE_BUILTIN?: number
  GARAGE_ATTACHED_DOUBLE?: number
  POOL_INGROUND?: number
  BATHROOM_FULL?: number
  BATHROOM_HALF?: number
  // Lease-side
  PARKING_PER_SPACE?: number
  // Telemetry: per-key source label, mirroring the condo resolver shape.
  // 'community (manual)' / 'municipality (manual)' / etc. = matched at that
  // level. Absent entry = no override; caller's default applies.
  sources: Record<string, string>
}

// Map DB column name → DEFAULT_ADJUSTMENTS key (the public API key).
// Keys MUST match DEFAULT_ADJUSTMENTS exactly so consumer code can do
// `customValues?.LOT_FRONTAGE_PER_FOOT_PCT ?? DEFAULT_ADJUSTMENTS.LOT_FRONTAGE_PER_FOOT_PCT`.
const COL_TO_KEY: Record<string, keyof typeof DEFAULT_ADJUSTMENTS> = {
  lot_frontage_per_foot_pct: 'LOT_FRONTAGE_PER_FOOT_PCT',
  lot_frontage_max_pct: 'LOT_FRONTAGE_MAX_PCT',
  lot_depth_per_10ft: 'LOT_DEPTH_PER_10FT',
  lot_depth_max: 'LOT_DEPTH_MAX',
  basement_finished: 'BASEMENT_FINISHED',
  basement_sep_entrance: 'BASEMENT_SEP_ENTRANCE',
  basement_walkout_bonus: 'BASEMENT_WALKOUT_BONUS',
  garage_detached_single: 'GARAGE_DETACHED_SINGLE',
  garage_attached_single: 'GARAGE_ATTACHED_SINGLE',
  garage_builtin: 'GARAGE_BUILTIN',
  garage_attached_double: 'GARAGE_ATTACHED_DOUBLE',
  pool_inground: 'POOL_INGROUND',
  bathroom_full: 'BATHROOM_FULL',
  bathroom_half: 'BATHROOM_HALF',
  parking_per_space: 'PARKING_PER_SPACE',
}
const ALL_COLS = Object.keys(COL_TO_KEY)

// Empty resolved object — used when tenantId is null, table doesn't exist,
// or no rows match the geo cascade. Every key is undefined so the caller's
// `??` fallback resolves to their preferred default. The `sources` record
// stays empty (no override anywhere).
//
// Pre-Phase-1.1 this returned a fully-populated DEFAULT_ADJUSTMENTS-keyed
// object, which broke the lease path (sale-defaults silently overrode
// HOME_RENTAL_ADJUSTMENTS via the `0 ?? 150 = 0` and `20000 ?? 100 = 20000`
// nullish-coalescing trap). The sale path was masked because both sides
// resolved to the same DEFAULT value; lease path wasn't covered by the
// SF-only parity classifier so the bug landed silently. This now returns
// empty so the lease path correctly falls through to HOME_RENTAL_ADJUSTMENTS.
function emptyResolved(): ResolvedHomeAdjustments {
  return { sources: {} }
}

interface ResolveSpecs {
  communityId: string | null
  municipalityId: string | null
  // tenantId is REQUIRED for any non-default resolution. Null/undefined →
  // returns all defaults (no DB hit). Mirrors getCurrentTenantId() null = S1.
  tenantId: string | null
}

export async function resolveHomeAdjustments(
  specs: ResolveSpecs,
  type: 'sale' | 'lease',
): Promise<ResolvedHomeAdjustments> {
  // Fast path: no tenant => no override. Anonymous and System 1 callers
  // get vanilla defaults (= f7f3c6e behavior byte-for-byte).
  if (!specs.tenantId) {
    return emptyResolved()
  }

  const supabase = createSvc()

  try {
    // Single tenant-scoped fetch. Resolver does in-memory cascade against
    // up-to-4 returned rows (community + muni + area + generic at most for
    // this subject's geo path); the table is small enough that the
    // .or-filter approach used by the condo resolver would also work, but
    // an explicit OR keeps the row count tight and the query predictable.
    let q = supabase
      .from('home_adjustments')
      .select(ALL_COLS.concat(['area_id', 'municipality_id', 'community_id']).join(','))
      .eq('tenant_id', specs.tenantId)
      .eq('type', type)

    // OR-filter the four eligible scope shapes for this subject:
    //   - community match
    //   - municipality match WITH community_id NULL (cascade beyond community)
    //   - area match WITH muni + community NULL (handled below — derive area
    //     from the subject's municipality.area_id)
    //   - generic (all FKs NULL)
    // To keep the query simple, fetch ALL of the tenant's rows for this type;
    // it's small (operator-curated, expect <100 rows per tenant). Filter
    // in-memory. Mirrors resolve-adjustments.ts:L94-102 (condo) which does
    // the same.
    const { data, error } = await q
    if (error) {
      // Table-doesn't-exist OR permission denied — fall through to defaults.
      // This is the path that lets us ship the wiring before the migration applies.
      return emptyResolved()
    }
    if (!data || data.length === 0) {
      // Tenant has no overrides — defaults.
      return emptyResolved()
    }

    // Derive the subject's area_id from the muni (so we can match area-tier
    // rows). One query, cheap.
    let subjectAreaId: string | null = null
    if (specs.municipalityId) {
      const { data: muniRow } = await supabase
        .from('municipalities')
        .select('area_id')
        .eq('id', specs.municipalityId)
        .single()
      subjectAreaId = (muniRow?.area_id as string) ?? null
    }

    // Group rows by which scope-level they belong to. Exactly one of the
    // three scope FKs is non-null per row (or all are null = generic).
    const byLevel: Record<string, any> = {
      community: null,
      municipality: null,
      area: null,
      generic: null,
    }
    for (const row of data as any[]) {
      if (row.community_id && row.community_id === specs.communityId) {
        byLevel.community = row
      } else if (row.municipality_id && row.municipality_id === specs.municipalityId && !row.community_id) {
        byLevel.municipality = row
      } else if (row.area_id && row.area_id === subjectAreaId && !row.municipality_id && !row.community_id) {
        byLevel.area = row
      } else if (!row.area_id && !row.municipality_id && !row.community_id) {
        byLevel.generic = row
      }
    }

    // Cascade per key: community → municipality → area → generic. First
    // level whose column is non-null wins for that key. Keys with no override
    // at any level stay UNDEFINED — the caller's `??` fallback resolves to
    // their preferred default (DEFAULT_ADJUSTMENTS for sale,
    // HOME_RENTAL_ADJUSTMENTS for lease). Per-feature override model =
    // different keys can resolve at different levels.
    const result: any = { sources: {} }
    for (const col of ALL_COLS) {
      const key = COL_TO_KEY[col]
      for (const level of ['community', 'municipality', 'area', 'generic'] as const) {
        const row = byLevel[level]
        if (row && row[col] !== null && row[col] !== undefined) {
          const num = Number(row[col])
          if (Number.isFinite(num)) {
            result[key] = num
            result.sources[key] = `${level} (manual)`
            break
          }
        }
      }
      // No DEFAULT fallback. Unset keys stay undefined so caller's own
      // default takes effect via `customValues?.X ?? <theirDefault>`.
    }
    return result as ResolvedHomeAdjustments
  } catch (e) {
    // Belt-and-suspenders: any unexpected throw (network, schema drift,
    // table missing pre-apply) → defaults. The estimator must never break
    // because the override layer is misconfigured.
    return emptyResolved()
  }
}
