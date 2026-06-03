// scripts/smoke-w-funnel-phase-2-delivery-status.js
// W-FUNNEL F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL Phase 2 Commit B smoke.
//
// Verifies that the lead_email_delivery_status column accepts the three
// enum values + that the route-level UPDATE pattern (chainOutcome.sent ?
// 'sent' : 'failed') writes the expected value end-to-end against live DB
// rows. SAVEPOINT-isolated: all INSERTs/UPDATEs happen inside a single
// transaction that ROLLBACKs at the end -- zero production state change.
//
// Cases:
//   1. Insert lead row -> DEFAULT 'pending' applies (Commit A behavior)
//   2. UPDATE lead.lead_email_delivery_status = 'sent' (chainOutcome.sent=true)
//   3. UPDATE lead.lead_email_delivery_status = 'failed' (chainOutcome.sent=false)
//   4. Constraint blocks invalid value (e.g. 'bogus') -> 23514 violation
//   5. Both tenants (WALLiam + Aily) -- same UPDATE pattern works
//      identically since the column is tenant-agnostic.
//
// Dashboard badge rendering: static-verified via grep below; full visual
// confirmation needs operator click-through.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const WALLIAM_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AILY_ID = 'e2619717-6401-4159-8d4c-d5f87651c8d6'

let fail = 0
function record (label, ok, detail) {
  if (!ok) fail++
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + label.padEnd(55) + ' ' + (detail || ''))
}

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  await c.query('BEGIN')
  try {
    console.log('=== Case 1: INSERT lead -> DEFAULT applies ("pending") ===')
    for (const t of [['WALLiam', WALLIAM_ID], ['Aily', AILY_ID]]) {
      const r = await c.query(
        `INSERT INTO leads (tenant_id, contact_name, contact_email, source, lead_origin_route, intent, status, assignment_source)
         VALUES ($1, $2, $3, $4, $5, $6, 'new', 'admin')
         RETURNING id, lead_email_delivery_status`,
        [t[1], 'Phase2 SmokeTest ' + t[0], 'phase2-smoke-' + t[0].toLowerCase() + '@test.invalid', 'phase2_smoke', 'smoke', 'buyer']
      )
      const row = r.rows[0]
      record(t[0] + ' insert -> default', row.lead_email_delivery_status === 'pending',
        `id=${row.id.slice(0,8)} status=${row.lead_email_delivery_status}`)
    }

    console.log('\n=== Case 2: UPDATE -> "sent" (chainOutcome.sent=true path) ===')
    const sent = await c.query(
      `UPDATE leads SET lead_email_delivery_status = 'sent' WHERE source = 'phase2_smoke' RETURNING id, lead_email_delivery_status`
    )
    record('UPDATE to sent affects 2 rows', sent.rowCount === 2, 'rowCount=' + sent.rowCount)
    record('all updated rows show "sent"', sent.rows.every(r => r.lead_email_delivery_status === 'sent'),
      JSON.stringify(sent.rows.map(r => r.lead_email_delivery_status)))

    console.log('\n=== Case 3: UPDATE -> "failed" (chainOutcome.sent=false path) ===')
    const failed = await c.query(
      `UPDATE leads SET lead_email_delivery_status = 'failed' WHERE source = 'phase2_smoke' RETURNING id, lead_email_delivery_status`
    )
    record('UPDATE to failed affects 2 rows', failed.rowCount === 2, 'rowCount=' + failed.rowCount)
    record('all updated rows show "failed"', failed.rows.every(r => r.lead_email_delivery_status === 'failed'),
      JSON.stringify(failed.rows.map(r => r.lead_email_delivery_status)))

    console.log('\n=== Case 4: CHECK constraint blocks invalid enum value ===')
    await c.query('SAVEPOINT sp_constraint_test')
    try {
      await c.query(
        `UPDATE leads SET lead_email_delivery_status = 'bogus' WHERE source = 'phase2_smoke'`
      )
      record('invalid value should have been rejected', false, 'no error thrown -- constraint missing?')
      await c.query('ROLLBACK TO SAVEPOINT sp_constraint_test')
    } catch (e) {
      const ok = e.code === '23514' && /lead_email_delivery_status_check/.test(e.message)
      record('constraint rejects "bogus"', ok, `code=${e.code} msg=${e.message.split('\n')[0]}`)
      await c.query('ROLLBACK TO SAVEPOINT sp_constraint_test')
    }

    console.log('\n=== Case 5: dashboard query reads the column ===')
    const dash = await c.query(
      `SELECT id, contact_name, lead_email_delivery_status FROM leads WHERE source = 'phase2_smoke' ORDER BY contact_name`
    )
    record('dashboard SELECT returns column for both tenants', dash.rows.length === 2,
      'rows=' + dash.rows.length)
    for (const row of dash.rows) {
      console.log('    ' + row.contact_name + ' -> ' + row.lead_email_delivery_status)
    }

    console.log('\n=== Static check: dashboard badge JSX present ===')
    const listView = fs.readFileSync(path.resolve(__dirname, '..', 'components/dashboard/LeadsTable.tsx'), 'utf8')
    const detailView = fs.readFileSync(path.resolve(__dirname, '..', 'components/dashboard/LeadDetailClient.tsx'), 'utf8')
    record('LeadsTable badge condition present',
      /lead_email_delivery_status === 'failed'/.test(listView) && /not yet alerted/.test(listView))
    record('LeadDetailClient badge condition present',
      /lead_email_delivery_status === 'failed'/.test(detailView) && /not yet alerted/.test(detailView))

    console.log('\n=== Static check: 5 route UPDATEs present ===')
    const routes = [
      'app/api/charlie/plan-email/route.ts',
      'app/api/charlie/lead/route.ts',
      'app/api/charlie/appointment/route.ts',
      'app/api/walliam/charlie/vip-request/route.ts',
      'app/api/walliam/estimator/vip-request/route.ts',
    ]
    for (const r of routes) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', r), 'utf8')
      // The UPDATE must reference chainOutcome.sent (not a value-only literal)
      // AND must appear AFTER the chainOutcome assignment, NOT before.
      const updateRx = /lead_email_delivery_status:\s*chainOutcome\.sent\s*\?\s*'sent'\s*:\s*'failed'/
      const hasUpdate = updateRx.test(src)
      // Ordering check: the chainOutcome ASSIGNMENT index < the UPDATE index
      const assignIdx = src.search(/chainOutcome\s*=\s*\{\s*sent:\s*outcome\.sent/)
      const updateIdx = src.search(updateRx)
      const correctOrder = assignIdx > 0 && updateIdx > 0 && updateIdx > assignIdx
      record(r, hasUpdate && correctOrder, `present=${hasUpdate} order_correct=${correctOrder} (assign@${assignIdx} update@${updateIdx})`)
    }
  } finally {
    await c.query('ROLLBACK')
    console.log('\n(transaction rolled back -- zero production state change)')
    await c.end()
  }

  console.log('\n=== Phase 2 Commit B smoke: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAIL') + ' ===')
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
