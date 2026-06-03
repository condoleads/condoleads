// scripts/recon-w-funnel-batch2-fk-precheck.js
// W-FUNNEL Batch 2a -- read-only violation precheck.
//
// For each of the 6 agent-referencing columns on leads, count rows where:
//   leads.<col> IS NOT NULL
//   AND that referenced agent's tenant_id != leads.tenant_id
//
// Any non-zero count = pre-existing cross-tenant assignment data; STOP and
// report rather than draft the migration over it.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const COLS = [
  'agent_id',
  'manager_id',
  'area_manager_id',
  'tenant_admin_id',
  'claimed_by_agent_id',
  'override_agent_id',
]

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    console.log('=== Batch 2a violation precheck (leads.<col>.tenant_id mismatch) ===')
    let totalViolations = 0
    const results = []
    for (const col of COLS) {
      // Bounded: agent rows whose tenant_id differs from the lead's tenant_id.
      // MATCH SIMPLE behavior: when leads.<col> IS NULL, no FK check fires, so
      // those rows are filtered out and not violations.
      const sql = `
        SELECT COUNT(*) AS violation_count
        FROM leads l
        JOIN agents a ON l.${col} = a.id
        WHERE l.${col} IS NOT NULL
          AND a.tenant_id IS DISTINCT FROM l.tenant_id`
      const r = await c.query(sql)
      const cnt = parseInt(r.rows[0].violation_count, 10)
      results.push({ col, cnt })
      totalViolations += cnt
      console.log(`  ${col.padEnd(22)} : ${cnt} ${cnt > 0 ? '** VIOLATION **' : ''}`)
    }

    console.log('')
    console.log(`=== TOTAL violations across 6 columns: ${totalViolations} ===`)
    if (totalViolations > 0) {
      console.log('')
      console.log('=== Violating rows (per column, max 25 per col) ===')
      for (const { col, cnt } of results) {
        if (cnt === 0) continue
        console.log(`\n  -- ${col} (${cnt} rows) --`)
        const sample = await c.query(`
          SELECT
            l.id AS lead_id,
            l.tenant_id AS lead_tenant,
            l.${col} AS referenced_agent,
            a.tenant_id AS agent_tenant,
            l.created_at,
            l.source
          FROM leads l
          JOIN agents a ON l.${col} = a.id
          WHERE l.${col} IS NOT NULL
            AND a.tenant_id IS DISTINCT FROM l.tenant_id
          ORDER BY l.created_at DESC
          LIMIT 25`)
        for (const row of sample.rows) {
          const lt = row.lead_tenant ? row.lead_tenant.slice(0, 8) : 'NULL'
          const at = row.agent_tenant ? row.agent_tenant.slice(0, 8) : 'NULL'
          const ra = row.referenced_agent ? row.referenced_agent.slice(0, 8) : 'NULL'
          console.log(`    lead=${row.lead_id.slice(0,8)} lead_tenant=${lt} ${col}=${ra} agent_tenant=${at} src=${row.source} created=${row.created_at}`)
        }
      }
    }

    console.log('')
    console.log(totalViolations === 0
      ? 'VERDICT: clean -- safe to draft composite FK migration'
      : 'VERDICT: STOP -- cross-tenant assignment data exists; investigate before any FK')
  } finally {
    await c.end()
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
