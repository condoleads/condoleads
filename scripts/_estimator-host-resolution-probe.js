// scripts/_estimator-host-resolution-probe.js
//
// Pre-fix verify: confirm resolveTenantIdFromHost returns the CORRECT
// tenant per host. Read-only.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const WALLIAM_EXPECTED = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AILY_EXPECTED    = 'e2619717-6401-4159-8d4c-d5f87651c8d6'

;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    // 1. Resolution path mirrors middleware.ts:206-244 — known-domain fast
    //    path first, DB query for unknown domains.
    console.log('── Path 1: KNOWN_TENANT_DOMAINS (middleware.ts:25-28) ──')
    const KNOWN = {
      'walliam.ca':     'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
      'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
    }
    for (const host of ['walliam.ca', 'www.walliam.ca', 'aily.ca', 'www.aily.ca']) {
      const cleanDomain = host.replace(/^www\./, '')
      const fastPath = KNOWN[cleanDomain] || null
      console.log(`  ${host}  cleanDomain=${cleanDomain}  fast-path=${fastPath ?? 'MISS (falls through to DB)'}`)
    }

    // 2. DB query the same way middleware does for unknown domains.
    console.log('\n── Path 2: tenants WHERE domain = ? AND is_active = true (DB lookup) ──')
    for (const host of ['walliam.ca', 'aily.ca']) {
      const cleanDomain = host.replace(/^www\./, '')
      const r = await c.query(
        `SELECT id, name, domain, is_active FROM tenants WHERE domain = $1 AND is_active = true LIMIT 1`,
        [cleanDomain]
      )
      if (r.rowCount === 0) {
        console.log(`  ${host} (cleanDomain=${cleanDomain})  →  NULL  (no active tenant row matches)`)
      } else {
        const t = r.rows[0]
        console.log(`  ${host} (cleanDomain=${cleanDomain})  →  ${t.id}  (name=${t.name}, domain=${t.domain})`)
      }
    }

    // 3. Resolved value per host = (fast-path OR DB result)
    console.log('\n── Effective resolveTenantIdFromHost result per host ──')
    for (const host of ['walliam.ca', 'www.walliam.ca', 'aily.ca', 'www.aily.ca']) {
      const cleanDomain = host.replace(/^www\./, '')
      let id = KNOWN[cleanDomain] || null
      let source = 'fast-path'
      if (!id) {
        const r = await c.query(
          `SELECT id FROM tenants WHERE domain = $1 AND is_active = true LIMIT 1`,
          [cleanDomain]
        )
        id = r.rows[0]?.id || null
        source = id ? 'db' : 'null'
      }
      console.log(`  ${host}  →  ${id ?? 'NULL'}  (via ${source})`)
    }

    // 4. Verify against expected values
    console.log('\n── Verdict per tenant ──')
    const walliamHost = 'walliam.ca'
    const ailyHost = 'aily.ca'
    let walliamId = KNOWN[walliamHost] || null
    if (!walliamId) {
      const r = await c.query(`SELECT id FROM tenants WHERE domain = $1 AND is_active = true LIMIT 1`, [walliamHost])
      walliamId = r.rows[0]?.id || null
    }
    let ailyId = KNOWN[ailyHost] || null
    if (!ailyId) {
      const r = await c.query(`SELECT id FROM tenants WHERE domain = $1 AND is_active = true LIMIT 1`, [ailyHost])
      ailyId = r.rows[0]?.id || null
    }

    console.log(`  walliam.ca → ${walliamId}  ${walliamId === WALLIAM_EXPECTED ? '✓ matches expected WALLiam id' : '✗ MISMATCH'}`)
    console.log(`  aily.ca    → ${ailyId}     ${ailyId === AILY_EXPECTED ? '✓ matches expected Aily id' : (ailyId ? '~ resolves to ANOTHER tenant id' : '✗ NULL — Aily host not registered')}`)

    // 5. Also confirm the Aily tenant row EXISTS in the DB at all (regardless of domain)
    console.log('\n── Sanity: does the Aily tenant row exist at all? ──')
    const ailyTenantRow = await c.query(
      `SELECT id, name, domain, is_active, lifecycle_status FROM tenants WHERE id = $1`,
      [AILY_EXPECTED]
    )
    if (ailyTenantRow.rowCount === 0) {
      console.log('  Aily tenant ROW NOT FOUND for that id in tenants table.')
    } else {
      const t = ailyTenantRow.rows[0]
      console.log(`  id=${t.id} name=${t.name} domain=${t.domain ?? 'NULL'} is_active=${t.is_active} lifecycle_status=${t.lifecycle_status ?? '—'}`)
    }

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
