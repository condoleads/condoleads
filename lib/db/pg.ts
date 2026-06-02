// lib/db/pg.ts
// W-GEO-COUNT-FIX: pg-direct singleton Pool + countDirect helper for
// high-volume Closed-status MLS counts. Bypasses PostgREST's 8s authenticator
// statement_timeout that was silently degrading >100k-row exact counts to null
// (then to 0 via `?? 0`/`|| 0`), which was getting cached for 5 minutes by
// unstable_cache as a successful 0.
//
// LAZY VALIDATION: module IMPORT must have zero throwing side effects --
// next build collects page data without DATABASE_URL present and would crash
// on a top-level throw. Validation + Pool construction happen inside
// getPool(), so the import is safe and the throw only fires when a count is
// actually requested at runtime.
//
// Critical invariant: countDirect DOES NOT catch its own errors. A query
// timeout (Postgres code 57014 "query_canceled") propagates out and rejects
// the caller's Promise.all, which rejects the wrapped unstable_cache
// function, which makes Next.js NOT cache the failed resolution. The next
// request retries fresh. Do not "helpfully" add a try/catch that returns 0
// here -- that re-creates the silent-0 cache-poisoning we just fixed.

import { Pool } from 'pg'

// HMR-safe singleton storage on globalThis. In Next.js dev the module can be
// re-evaluated; preserve the pool to avoid leaking connections.
type GlobalWithPool = typeof globalThis & { __wGeoCountFixPool?: Pool }
const g = globalThis as GlobalWithPool

function resolveConnectionString (): string {
  const cs =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  if (!cs) {
    throw new Error(
      'lib/db/pg.ts: no DATABASE_URL/SUPABASE_DB_URL/POSTGRES_URL/POSTGRES_URL_NON_POOLING in env'
    )
  }
  // Reject port 6543 (Supabase transaction pooler). Per
  // scripts/apply-phase-lifecycle-landing-2.js: the transaction pooler does
  // not support session-scoped features (SET LOCAL, statement_timeout via
  // connection options) that we rely on.
  const portMatch = cs.match(/:(\d+)\//)
  if (portMatch) {
    const port = parseInt(portMatch[1], 10)
    if (port === 6543) {
      throw new Error(
        'lib/db/pg.ts: DATABASE_URL points at port 6543 (transaction pooler). ' +
          'Switch to session pooler (5432) or direct host.'
      )
    }
  }
  return cs
}

function getPool (): Pool {
  if (g.__wGeoCountFixPool) return g.__wGeoCountFixPool
  const connectionString = resolveConnectionString()
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Per-query 30s statement_timeout via the pg client options. 30s is well
    // above the 8.4s observed worst-case (Toronto-area leased) but bounded
    // so a worker never blocks indefinitely. Postgres throws error code
    // 57014 ("query_canceled") on hit.
    statement_timeout: 30_000,
  } as any)
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[lib/db/pg] idle client error:', err.message)
  })
  g.__wGeoCountFixPool = pool
  return pool
}

// ---------------------------------------------------------------------------
// countDirect: high-volume mls_listings count, parameterized, never caches.
// ---------------------------------------------------------------------------

export type GeoSelector =
  | { kind: 'area_id'; value: string }
  | { kind: 'municipality_id'; value: string }
  | { kind: 'community_id'; value: string }
  | { kind: 'municipality_ids'; values: string[] }

export interface CountDirectFilter {
  geo: GeoSelector
  // Exactly ONE of standard_status (single) or standard_status_in (array) must
  // be provided. TS can't enforce "exactly one of two optionals" -- checked at
  // runtime by countDirect. The array form is for the Active class which uses
  // .in(['Active','Active Under Contract','Pending']); the single form is for
  // the Closed class which uses .eq('Closed').
  standard_status?: 'Closed' | 'Active' | 'Active Under Contract' | 'Pending'
  standard_status_in?: string[]
  transaction_type: 'For Sale' | 'For Lease'
  // VOW distribution-channel gate (RESO standard, not a tenant filter).
  available_in_vow: true
  // Optional property-subtype filter for split-by-type counts (homes/condos).
  property_subtype_in?: string[]
}

/**
 * Count rows in mls_listings matching the filter, via pg-direct.
 *
 * MULTI-TENANT NOTE: mls_listings has no tenant_id (verified -- global PropTx
 * VOW feed shared across all tenants). Counts are tenant-agnostic by design.
 *
 * ERROR CONTRACT: throws on timeout or DB error. DO NOT catch and return 0
 * here -- that re-introduces the silent-0 cache-poisoning bug this helper
 * exists to fix. Callers wrap in unstable_cache; Next.js correctly does not
 * cache rejected promises, so a thrown timeout is retried on the next
 * request rather than serving a cached 0 for 5 minutes.
 */
export async function countDirect (filter: CountDirectFilter): Promise<number> {
  // Runtime mutex: exactly one of standard_status / standard_status_in.
  const hasEq = filter.standard_status !== undefined
  const hasIn = filter.standard_status_in !== undefined && filter.standard_status_in.length > 0
  if (!hasEq && !hasIn) {
    throw new Error('countDirect: must specify standard_status or standard_status_in')
  }
  if (hasEq && hasIn) {
    throw new Error('countDirect: cannot specify both standard_status and standard_status_in')
  }

  const where: string[] = ['available_in_vow = $1', 'transaction_type = $2']
  const params: unknown[] = [filter.available_in_vow, filter.transaction_type]
  let idx = 3

  if (hasEq) {
    where.push(`standard_status = $${idx++}`)
    params.push(filter.standard_status)
  } else {
    where.push(`standard_status = ANY($${idx++}::text[])`)
    params.push(filter.standard_status_in)
  }

  switch (filter.geo.kind) {
    case 'area_id':
      where.push(`area_id = $${idx++}`)
      params.push(filter.geo.value)
      break
    case 'municipality_id':
      where.push(`municipality_id = $${idx++}`)
      params.push(filter.geo.value)
      break
    case 'community_id':
      where.push(`community_id = $${idx++}`)
      params.push(filter.geo.value)
      break
    case 'municipality_ids':
      where.push(`municipality_id = ANY($${idx++}::uuid[])`)
      params.push(filter.geo.values)
      break
  }

  if (filter.property_subtype_in && filter.property_subtype_in.length > 0) {
    where.push(`property_subtype = ANY($${idx++}::text[])`)
    params.push(filter.property_subtype_in)
  }

  const sql = `SELECT count(*)::int AS n FROM mls_listings WHERE ${where.join(' AND ')}`
  const res = await getPool().query(sql, params)
  return res.rows[0].n as number
}
