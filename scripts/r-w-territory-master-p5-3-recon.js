#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * W-TERRITORY-MASTER P5.3 — Recon (READ-ONLY)
 *
 * Purpose: probe the four open questions for the Resolved-state ops view BEFORE writing any code.
 *   1. Does `tenant_property_access` exist? Schema? Row counts per tenant?
 *      If yes -> drives the coverage gap detector. If no -> default to all 73 TREB areas per tenant.
 *   2. Inventory resolver entry points: are `resolve_agent_for_context` and
 *      `resolve_display_agent_for_context` callable per-geo without a listing context?
 *      What's their signature on disk vs what the existing routes pass?
 *   3. Does `/api/admin-homes/territory/coverage` (and `cascade-tree`, `agents-summary`,
 *      `geo-rollup`) already render what P5.3 would render? Don't build parallel infra.
 *   4. Audit attribution: do `lead_ownership_changes` and `territory_assignment_changes`
 *      have an "originator" column that could record platform-admin meta-actor today
 *      (followup-2 open scenario #11)?
 *
 * Output: dumps facts to stdout. NO WRITES anywhere. Safe to run repeatedly.
 *
 * Invocation:
 *   node scripts/r-w-territory-master-p5-3-recon.js
 *
 * Environment: reads DATABASE_URL or POSTGRES_URL from process.env (loaded from .env.local
 * if dotenv is configured by the caller, otherwise must be set in shell).
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// ---- env load (mirrors the pattern used by other r-w-territory-master-*.js recon scripts) ----
const ENV_PATH = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(ENV_PATH)) {
  const raw = fs.readFileSync(ENV_PATH, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const CONN_STR = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!CONN_STR) {
  console.error('FATAL: DATABASE_URL or POSTGRES_URL not set')
  process.exit(1)
}

// Verified IDs from userMemories (do NOT invent; these are the ones already confirmed):
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

const SECTION = (label) => {
  console.log('')
  console.log('===== ' + label + ' =====')
}

function preview(s, max) {
  if (s === null || s === undefined) return '(null)'
  const str = String(s)
  if (str.length <= max) return str
  return str.slice(0, max) + '...(+' + (str.length - max) + ' chars)'
}

async function main() {
  const client = new Client({ connectionString: CONN_STR })
  await client.connect()

  try {
    // ============================================================
    // Q1 — tenant_property_access table existence + shape
    // ============================================================
    SECTION('Q1: tenant_property_access — existence + schema')

    const tpaExistsRes = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'tenant_property_access'
       ) AS exists`
    )
    const tpaExists = tpaExistsRes.rows[0].exists
    console.log('  tenant_property_access exists: ' + tpaExists)

    if (tpaExists) {
      const colsRes = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tenant_property_access'
         ORDER BY ordinal_position`
      )
      console.log('  columns (' + colsRes.rows.length + '):')
      for (const r of colsRes.rows) {
        console.log(
          '    - ' + r.column_name + ' ' + r.data_type +
          ' nullable=' + r.is_nullable +
          ' default=' + preview(r.column_default, 40)
        )
      }

      const idxRes = await client.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'tenant_property_access'`
      )
      console.log('  indexes (' + idxRes.rows.length + '):')
      for (const r of idxRes.rows) {
        console.log('    - ' + r.indexname + ': ' + preview(r.indexdef, 120))
      }

      const totalRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM tenant_property_access`
      )
      console.log('  total rows: ' + totalRes.rows[0].total)

      const perTenantRes = await client.query(
        `SELECT tenant_id, COUNT(*)::int AS row_count
         FROM tenant_property_access
         GROUP BY tenant_id
         ORDER BY row_count DESC`
      )
      console.log('  per tenant (' + perTenantRes.rows.length + ' tenants):')
      for (const r of perTenantRes.rows) {
        console.log('    - ' + r.tenant_id + ': ' + r.row_count)
      }

      const walliamRes = await client.query(
        `SELECT scope, COUNT(*)::int AS n
         FROM tenant_property_access
         WHERE tenant_id = $1
         GROUP BY scope
         ORDER BY scope`,
        [WALLIAM_TENANT_ID]
      )
      console.log('  WALLiam tpa rows by scope:')
      if (walliamRes.rows.length === 0) {
        console.log('    (none)')
      } else {
        for (const r of walliamRes.rows) {
          console.log('    - ' + r.scope + ': ' + r.n)
        }
      }
    } else {
      console.log('  -> P5.3 will default to all 73 TREB areas per tenant (no explicit coverage table)')
    }

    // ============================================================
    // Q2 — resolver RPC signatures + behavior
    // ============================================================
    SECTION('Q2: resolver RPCs — signature + body markers')

    const rpcNames = ['resolve_agent_for_context', 'resolve_display_agent_for_context']
    for (const name of rpcNames) {
      const sigRes = await client.query(
        `SELECT p.oid::int AS oid,
                pg_get_function_arguments(p.oid) AS args,
                pg_get_function_result(p.oid) AS result_type,
                length(pg_get_functiondef(p.oid))::int AS body_len
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = $1`,
        [name]
      )
      if (sigRes.rows.length === 0) {
        console.log('  ' + name + ': NOT FOUND')
        continue
      }
      const row = sigRes.rows[0]
      console.log('  ' + name + ':')
      console.log('    oid: ' + row.oid)
      console.log('    args: ' + preview(row.args, 200))
      console.log('    returns: ' + preview(row.result_type, 100))
      console.log('    body length: ' + row.body_len + ' chars')

      // Probe whether the RPC can be called with NULL listing/building (geo-only path).
      // Use a known-good area_id from treb_areas instead of inventing one.
      const areaIdRes = await client.query(
        `SELECT id FROM treb_areas WHERE is_active = true ORDER BY id LIMIT 1`
      )
      if (areaIdRes.rows.length === 0) {
        console.log('    (no active treb_areas to probe with)')
      } else {
        const areaId = areaIdRes.rows[0].id
        // Probe call shape — try the documented signature pattern from T3b-D:
        //   resolve_agent_for_context(p_tenant_id, p_listing_id, p_building_id,
        //                             p_neighbourhood_id, p_community_id,
        //                             p_municipality_id, p_area_id, p_user_id)
        // We pass area_id only and let everything else be NULL. Wrap in a try/catch
        // so a signature mismatch reports rather than crashing the recon.
        try {
          const callRes = await client.query(
            'SELECT public.' + name + '(' +
              '$1::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, $2::uuid, NULL::uuid' +
            ') AS resolved',
            [WALLIAM_TENANT_ID, areaId]
          )
          console.log('    geo-only probe (area_id=' + areaId + '): resolved=' + preview(callRes.rows[0].resolved, 50))
        } catch (e) {
          console.log('    geo-only probe FAILED: ' + e.message)
          console.log('      -> P5.3 recon must inspect full body to confirm correct invocation shape')
        }
      }
    }

    // ============================================================
    // Q3 — existing territory routes/components that may already cover P5.3
    // ============================================================
    SECTION('Q3: existing routes + components that overlap P5.3 scope')

    const apiDir = path.join(process.cwd(), 'app', 'api', 'admin-homes', 'territory')
    if (fs.existsSync(apiDir)) {
      const entries = fs.readdirSync(apiDir, { withFileTypes: true })
      console.log('  app/api/admin-homes/territory/ subdirs (' + entries.length + '):')
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const sub = path.join(apiDir, ent.name)
          const routeFile = path.join(sub, 'route.ts')
          const hasRoute = fs.existsSync(routeFile)
          let sizeBytes = 0
          if (hasRoute) sizeBytes = fs.statSync(routeFile).size
          console.log(
            '    - ' + ent.name +
            (hasRoute ? ' [route.ts: ' + sizeBytes + ' bytes]' : ' [no route.ts at top]')
          )
        } else if (ent.isFile()) {
          console.log('    - ' + ent.name + ' (file at top)')
        }
      }
    } else {
      console.log('  app/api/admin-homes/territory/ not found on disk')
    }

    const compDir = path.join(process.cwd(), 'components', 'admin-homes', 'cockpit', 'territory')
    if (fs.existsSync(compDir)) {
      const files = fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx'))
      console.log('  components/admin-homes/cockpit/territory/ tsx files (' + files.length + '):')
      for (const f of files) {
        const sizeBytes = fs.statSync(path.join(compDir, f)).size
        console.log('    - ' + f + ' (' + sizeBytes + ' bytes)')
      }
    } else {
      console.log('  components/admin-homes/cockpit/territory/ not found on disk')
    }

    // Specifically look for an existing "coverage" or "resolved" route that may already
    // expose what P5.3 wants.
    const candidates = ['coverage', 'resolved', 'cascade-tree', 'geo-rollup', 'agents-summary', 'matrix']
    console.log('  candidate-overlap probe:')
    for (const c of candidates) {
      const probe = path.join(apiDir, c, 'route.ts')
      if (fs.existsSync(probe)) {
        const size = fs.statSync(probe).size
        // Read first ~600 chars to capture leading JSDoc / comment block — gives the
        // route's stated purpose without dumping the whole file.
        const head = fs.readFileSync(probe, 'utf8').slice(0, 600)
        console.log('    - ' + c + ' [' + size + ' bytes] head:')
        for (const line of head.split(/\r?\n/).slice(0, 10)) {
          console.log('        ' + line)
        }
      } else {
        console.log('    - ' + c + ' (not present)')
      }
    }

    // ============================================================
    // Q4 — audit tables: do they have an originator column?
    // ============================================================
    SECTION('Q4: audit tables — originator / actor columns')

    const auditTables = ['lead_ownership_changes', 'territory_assignment_changes']
    for (const t of auditTables) {
      const existsRes = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS exists`,
        [t]
      )
      const exists = existsRes.rows[0].exists
      console.log('  ' + t + ' exists: ' + exists)
      if (!exists) continue

      const colsRes = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [t]
      )
      console.log('    columns (' + colsRes.rows.length + '):')
      for (const r of colsRes.rows) {
        console.log('      - ' + r.column_name + ' ' + r.data_type + ' nullable=' + r.is_nullable)
      }

      // Specifically check for actor-like columns
      const actorCandidates = ['originator_user_id', 'originator_id', 'actor_user_id', 'actor_id', 'changed_by', 'created_by']
      const hasActor = colsRes.rows.some((r) => actorCandidates.includes(r.column_name))
      console.log('    has actor-like column (' + actorCandidates.join('|') + '): ' + hasActor)
    }

    // ============================================================
    // Bonus: tenant default agent (resolver P8 fallback)
    // ============================================================
    SECTION('Bonus: tenants table — default_agent_id presence')

    const tenantColsRes = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tenants'
         AND column_name IN ('default_agent_id', 'id')
       ORDER BY column_name`
    )
    const hasDefaultAgent = tenantColsRes.rows.some((r) => r.column_name === 'default_agent_id')
    console.log('  tenants.default_agent_id present: ' + hasDefaultAgent)
    if (hasDefaultAgent) {
      const tdaRes = await client.query(
        `SELECT id, default_agent_id FROM tenants WHERE id = $1`,
        [WALLIAM_TENANT_ID]
      )
      if (tdaRes.rows.length > 0) {
        console.log('  WALLiam default_agent_id: ' + (tdaRes.rows[0].default_agent_id || '(null)'))
      }
    }

    console.log('')
    console.log('===== RECON COMPLETE =====')
    console.log('Next: lock P5.3 design decisions based on the four answers above, then patch the tracker.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('RECON FAILED:', err)
  process.exit(1)
})