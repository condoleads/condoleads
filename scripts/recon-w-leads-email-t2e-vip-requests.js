#!/usr/bin/env node
/**
 * recon-w-leads-email-t2e-vip-requests.js
 *
 * T2e pre-migration probe — characterize vip_requests data + value distribution.
 * Required before writing the T2e migration (backfill strategy + CHECK constraint values).
 *
 * Outputs to: recon/W-LEADS-EMAIL-T2E-PRE-vip-requests.txt
 *
 * Required env: DATABASE_URL
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const OUTPUT_PATH = path.resolve('recon', 'W-LEADS-EMAIL-T2E-PRE-vip-requests.txt')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL env var not set.')
    process.exit(1)
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const lines = []
  const log = (s) => { lines.push(s); console.log(s) }

  log('========================================================================')
  log('T2E PRE-MIGRATION PROBE — vip_requests')
  log('Generated: ' + new Date().toISOString())
  log('========================================================================')

  // ─── Row count + tenant_id NULL count ─────────────────────────────────────
  log('')
  log('-- ROW COUNTS --')
  const totalRes = await client.query('SELECT COUNT(*)::bigint AS n FROM vip_requests')
  log(`  total rows: ${totalRes.rows[0].n}`)

  const nullTenantRes = await client.query(
    'SELECT COUNT(*)::bigint AS n FROM vip_requests WHERE tenant_id IS NULL'
  )
  log(`  rows with NULL tenant_id: ${nullTenantRes.rows[0].n}`)

  const orphanedAgentRes = await client.query(`
    SELECT COUNT(*)::bigint AS n FROM vip_requests vr
    LEFT JOIN agents a ON a.id = vr.agent_id
    WHERE a.id IS NULL
  `)
  log(`  rows with orphaned agent_id (no matching agents row): ${orphanedAgentRes.rows[0].n}`)

  const backfillableRes = await client.query(`
    SELECT COUNT(*)::bigint AS n FROM vip_requests vr
    JOIN agents a ON a.id = vr.agent_id
    WHERE vr.tenant_id IS NULL AND a.tenant_id IS NOT NULL
  `)
  log(`  rows backfillable from agent.tenant_id: ${backfillableRes.rows[0].n}`)

  // ─── Distinct values for would-be CHECK columns ───────────────────────────
  log('')
  log('-- DISTINCT VALUES PER CHECK-CANDIDATE COLUMN --')

  const colsToProbe = ['status', 'request_type', 'request_source']
  for (const col of colsToProbe) {
    log('')
    log(`  ${col}:`)
    const distRes = await client.query(
      `SELECT ${col} AS val, COUNT(*)::bigint AS n FROM vip_requests
        GROUP BY ${col} ORDER BY n DESC, val ASC`
    )
    if (distRes.rows.length === 0) {
      log('    (no rows)')
    } else {
      for (const r of distRes.rows) {
        log(`    ${(r.val === null ? '(null)' : "'" + r.val + "'").padEnd(30)} ${r.n}`)
      }
    }
  }

  // ─── tenant_id consistency vs lead_id chain ───────────────────────────────
  log('')
  log('-- tenant_id vs lead.tenant_id consistency (where lead_id is set) --')
  const consistencyRes = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE vr.tenant_id IS NULL AND vr.lead_id IS NULL)::bigint AS null_vr_null_lead,
      COUNT(*) FILTER (WHERE vr.tenant_id IS NULL AND vr.lead_id IS NOT NULL)::bigint AS null_vr_set_lead,
      COUNT(*) FILTER (WHERE vr.tenant_id IS NOT NULL AND vr.lead_id IS NOT NULL AND vr.tenant_id = l.tenant_id)::bigint AS consistent,
      COUNT(*) FILTER (WHERE vr.tenant_id IS NOT NULL AND vr.lead_id IS NOT NULL AND vr.tenant_id <> l.tenant_id)::bigint AS mismatch
    FROM vip_requests vr
    LEFT JOIN leads l ON l.id = vr.lead_id
  `)
  const c = consistencyRes.rows[0]
  log(`  vr.tenant_id NULL,     vr.lead_id NULL:    ${c.null_vr_null_lead}  (must backfill from agent.tenant_id)`)
  log(`  vr.tenant_id NULL,     vr.lead_id SET:     ${c.null_vr_set_lead}  (can backfill from leads.tenant_id)`)
  log(`  vr.tenant_id consistent with leads:        ${c.consistent}`)
  log(`  vr.tenant_id MISMATCH with leads:          ${c.mismatch}  ⚠️ if non-zero, investigate before T2e`)

  // ─── Sample first 5 rows for visual sanity check ──────────────────────────
  if (parseInt(totalRes.rows[0].n, 10) > 0) {
    log('')
    log('-- SAMPLE (first 5 rows) --')
    const sampleRes = await client.query(`
      SELECT id, tenant_id, agent_id, lead_id, status, request_type, request_source, created_at
        FROM vip_requests ORDER BY created_at DESC LIMIT 5
    `)
    for (const r of sampleRes.rows) {
      log(`  id=${r.id}`)
      log(`    tenant_id=${r.tenant_id || '(null)'} agent_id=${r.agent_id} lead_id=${r.lead_id || '(null)'}`)
      log(`    status=${r.status} request_type=${r.request_type} request_source=${r.request_source}`)
      log(`    created_at=${r.created_at?.toISOString?.() || r.created_at}`)
    }
  }

  await client.end()

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8')
  console.log('')
  console.log(`Probe T2e-pre written to: ${OUTPUT_PATH}  (${fs.statSync(OUTPUT_PATH).size} bytes)`)
}

main().catch((err) => {
  console.error('Probe failed:', err)
  process.exit(1)
})