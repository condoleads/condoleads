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
// re-evaluated; preserve pools to avoid leaking connections.
//
// TWO POOLS:
//   __wGeoCountFixPool    = session pool   (port 5432, Supavisor session mode)
//                           Used by anything needing session state: SET LOCAL,
//                           multi-statement transactions, migration scripts.
//                           Supabase project ceiling: 15 sessions (Micro tier).
//   __wGeoCountFixTxnPool = transaction pool (port 6543, Supavisor txn mode)
//                           Used by countDirect (read-only single-statement
//                           SELECTs -- ideal for txn-mode multiplexing).
//                           Supabase project ceiling: 200 concurrent clients
//                           on Micro -- ~13x more headroom than the session
//                           pool, which is what closes the EMAXCONNSESSION /
//                           pool-wait timeout class of failures we saw under
//                           concurrent geo-page renders.
type GlobalWithPool = typeof globalThis & {
  __wGeoCountFixPool?: Pool
  __wGeoCountFixTxnPool?: Pool
}
const g = globalThis as GlobalWithPool

// Session-pool connection string. Rejects port 6543 (txn pooler) because
// the session pool is used by callers that need session state -- SET LOCAL,
// multi-statement transactions, etc. -- which transaction-mode Supavisor
// doesn't preserve across statements.
function resolveConnectionString (): string {
  const cs = resolveConnectionStringRaw()
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
    console.error('[lib/db/pg] session-pool idle client error:', err.message)
  })
  g.__wGeoCountFixPool = pool
  return pool
}

// ---------------------------------------------------------------------------
// Transaction pool (port 6543) -- W-GEO-COUNT-FIX-3 final.
// ---------------------------------------------------------------------------
// countDirect routes through this pool. Supavisor in transaction mode
// multiplexes upstream Postgres connections per-transaction, so the same
// upstream conn can serve many short-lived client checkouts. This raises
// Supabase's concurrent-client ceiling from 15 (session-mode pool) to 200
// (txn-mode default on Micro), enough that even AreaPage's 12 concurrent
// pg-direct queries plus multiple simultaneous geo-page renders fit well
// under the ceiling.
//
// SAFETY (verified): countDirect runs a SINGLE parameterized SELECT via
// node-pg's pool.query(sql, params), which uses anonymous prepared statements
// (Parse+Bind+Execute in one round-trip) -- safe in txn-mode Supavisor. No
// SET / cursors / multi-statement transactions / temp tables.
//
// STATEMENT_TIMEOUT CAVEAT: node-pg's pool.statement_timeout option runs
// `SET statement_timeout = ...` AFTER connect. In txn-mode the upstream
// connection is per-transaction, so the SET does not persist across
// checkouts; falls back to Supabase's role-default 2min server-side. This
// is acceptable -- slowest observed count is ~10s (Toronto-area leased),
// 2min is ample safety headroom; a 2min query indicates a real problem
// worth letting Postgres kill. (Optional future: pass
// `?options=-c%20statement_timeout%3D30000` in the URL -- not verified that
// Supavisor honors it, deferred.)

function resolveTxnConnectionString (): string {
  // Derive from the same DATABASE_URL by swapping port 5432 -> 6543. No
  // separate env var; the session and txn poolers share credentials and
  // host on Supabase (same Supavisor endpoint, different port = different
  // mode).
  const base = resolveConnectionStringRaw()
  // resolveConnectionStringRaw is the same fallback chain but skips the
  // port-6543 reject (that reject guards the session pool only).
  const portMatch = base.match(/:(\d+)\//)
  if (!portMatch || portMatch[1] !== '5432') {
    throw new Error(
      'lib/db/pg.ts: cannot derive txn-pool URL -- expected base ' +
        'DATABASE_URL with port 5432 (session pooler), got port ' +
        (portMatch ? portMatch[1] : '(unparseable)')
    )
  }
  return base.replace(':5432/', ':6543/')
}

// Internal helper used by both session and txn resolvers.
function resolveConnectionStringRaw (): string {
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
  return cs
}

function getTxnPool (): Pool {
  if (g.__wGeoCountFixTxnPool) return g.__wGeoCountFixTxnPool
  const connectionString = resolveTxnConnectionString()
  const pool = new Pool({
    connectionString,
    // max:30 = comfortably above AreaPage's 12 concurrent pg-direct queries +
    // headroom for parallel renders. Well below Supabase's txn-mode ceiling
    // of 200 on Micro, so multiple warm Vercel instances can each have a
    // full max:30 without collectively exhausting the upstream pool.
    max: 30,
    idleTimeoutMillis: 30_000,
    // 15s queue wait: each count is ~10s in the worst case (Toronto-area
    // leased). When local pool is full, queued queries need >10s headroom
    // to wait for an in-flight one to finish rather than throwing.
    connectionTimeoutMillis: 15_000,
    // statement_timeout caveat above: not persisted in txn mode; relies on
    // Supabase's 2min role default. Still pass the option for the session-
    // initial SET, harmless if reset.
    statement_timeout: 30_000,
  } as any)
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[lib/db/pg] txn-pool idle client error:', err.message)
  })
  g.__wGeoCountFixTxnPool = pool
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
  // W-GEO-COUNT-FIX-3 (final): route through TXN pool (port 6543) to escape
  // the session-mode pool_size:15 project ceiling that caused EMAXCONNSESSION
  // and pool-wait timeouts under concurrent geo-page renders.
  const res = await getTxnPool().query(sql, params)
  return res.rows[0].n as number
}
