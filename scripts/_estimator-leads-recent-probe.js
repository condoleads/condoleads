// scripts/_estimator-leads-recent-probe.js
//
// Probe 2 — are leads being CREATED at all for WALLiam? Distinguishes
// "ONE break (email only)" from "TWO breaks (email + lead creation)".
// Read-only.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

;(async () => {
  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    console.log('── 2a. last 20 WALLiam leads (any source, any intent) ──\n')
    const recent = await c.query(`
      SELECT id, contact_email, contact_name, source, intent,
             agent_id, lead_origin_route, status,
             created_at, updated_at
        FROM leads
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 20
    `, [WALLIAM_TENANT_ID])

    if (recent.rowCount === 0) {
      console.log('  ZERO leads under WALLiam. Both legs broken or never connected.')
    } else {
      console.log(`  ${recent.rowCount} rows:\n`)
      console.log('  created_at                    source                    intent    email                              agent_id (short)')
      console.log('  ' + '─'.repeat(120))
      for (const r of recent.rows) {
        const ts = r.created_at.toISOString().slice(0, 19).replace('T', ' ')
        const src = (r.source || '').padEnd(25)
        const intent = (r.intent || '').padEnd(9)
        const email = (r.contact_email || '').padEnd(35)
        const ashort = r.agent_id ? r.agent_id.slice(0, 8) : 'NULL'
        console.log(`  ${ts}  ${src} ${intent} ${email} ${ashort}`)
      }
    }

    // 2b. Estimator-sourced leads specifically (source LIKE 'estimator%').
    console.log('\n── 2b. WALLiam ESTIMATOR-sourced leads (source LIKE %estimator%) ──\n')
    const estLeads = await c.query(`
      SELECT id, contact_email, source, agent_id, lead_origin_route,
             property_details IS NOT NULL AS has_property_details,
             property_details->'workingDoc'->>'type' AS workingdoc_type,
             property_details->>'estimatedPrice' AS estimated_price,
             created_at
        FROM leads
       WHERE tenant_id = $1
         AND (source ILIKE '%estimator%' OR lead_origin_route ILIKE '%estimator%' OR source ILIKE '%sale_offer%' OR source ILIKE '%lease_offer%')
       ORDER BY created_at DESC
       LIMIT 30
    `, [WALLIAM_TENANT_ID])
    if (estLeads.rowCount === 0) {
      console.log('  ZERO estimator-sourced leads. Estimator never created a lead under WALLiam.')
    } else {
      console.log(`  ${estLeads.rowCount} rows:\n`)
      console.log('  created_at                    source                            wd_type   est_price       email')
      console.log('  ' + '─'.repeat(135))
      for (const r of estLeads.rows) {
        const ts = r.created_at.toISOString().slice(0, 19).replace('T', ' ')
        const src = (r.source || '').padEnd(33)
        const wd = (r.workingdoc_type || '—').padEnd(8)
        const price = (r.estimated_price || '—').padEnd(14)
        const email = (r.contact_email || '').slice(0, 40)
        console.log(`  ${ts}  ${src} ${wd}  ${price} ${email}`)
      }
    }

    // 2c. Charlie-sourced leads (for cross-reference) — were Charlie's
    //     own plan-email leads being created in the same window?
    console.log('\n── 2c. WALLiam CHARLIE-sourced leads (source LIKE %charlie%) ──\n')
    const charlieLeads = await c.query(`
      SELECT id, contact_email, source, intent, agent_id, created_at
        FROM leads
       WHERE tenant_id = $1
         AND source ILIKE '%charlie%'
       ORDER BY created_at DESC
       LIMIT 10
    `, [WALLIAM_TENANT_ID])
    if (charlieLeads.rowCount === 0) {
      console.log('  ZERO Charlie-sourced leads.')
    } else {
      console.log(`  ${charlieLeads.rowCount} rows:\n`)
      for (const r of charlieLeads.rows) {
        const ts = r.created_at.toISOString().slice(0, 19).replace('T', ' ')
        console.log(`  ${ts}  ${(r.source || '').padEnd(30)} ${(r.intent || '').padEnd(8)} ${r.contact_email}`)
      }
    }

    // 2d. Age delta: how recent is the freshest estimator lead vs NOW?
    console.log('\n── 2d. Age of newest WALLiam estimator lead vs. NOW ──\n')
    const newestEst = await c.query(`
      SELECT created_at, NOW() - created_at AS age, source
        FROM leads
       WHERE tenant_id = $1
         AND (source ILIKE '%estimator%' OR lead_origin_route ILIKE '%estimator%')
       ORDER BY created_at DESC
       LIMIT 1
    `, [WALLIAM_TENANT_ID])
    if (newestEst.rowCount === 0) {
      console.log('  No estimator lead ever exists under WALLiam.')
    } else {
      const r = newestEst.rows[0]
      console.log(`  Newest estimator lead created_at: ${r.created_at.toISOString()}`)
      console.log(`  Age vs now:                       ${r.age}`)
      console.log(`  Source:                           ${r.source}`)
    }

    // 2e. Macro counts by day, last 30 days, estimator only.
    console.log('\n── 2e. Daily estimator-lead counts under WALLiam, last 30 days ──\n')
    const daily = await c.query(`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
             COUNT(*) AS n
        FROM leads
       WHERE tenant_id = $1
         AND (source ILIKE '%estimator%' OR lead_origin_route ILIKE '%estimator%')
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY 1
       ORDER BY 1 DESC
    `, [WALLIAM_TENANT_ID])
    if (daily.rowCount === 0) {
      console.log('  No estimator leads in the last 30 days.')
    } else {
      for (const r of daily.rows) {
        console.log(`  ${r.day}  ${r.n}`)
      }
    }

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
