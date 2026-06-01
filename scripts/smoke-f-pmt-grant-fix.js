// scripts/smoke-f-pmt-grant-fix.js
// Smoke harness for F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT (P1 FIX 3 of 3).
//
// Runs AFTER the up-migration is COMMITted. All 5 T-asserts execute as
// postgres (DATABASE_URL); role-switches are confined to single-statement
// test windows within per-T BEGIN/ROLLBACK envelopes -- production state
// never modified.
//
// T1 -- PRE-GRANT 42501 BASELINE: own BEGIN/ROLLBACK; REVOKE the grant
//       inside the tx; SET LOCAL ROLE service_role; SELECT; expect 42501;
//       ROLLBACK restores the grant. (Recreates the pre-fix state safely.)
// T2 -- POST-GRANT CLEAN SELECT: own BEGIN/ROLLBACK; SET LOCAL ROLE
//       service_role; SELECT COUNT(*); expect non-error (>=0).
// T3 -- POST-GRANT + FIXTURE VISIBILITY: own BEGIN/ROLLBACK; INSERT a
//       fixture row as postgres; SET LOCAL ROLE service_role; SELECT
//       WHERE tenant_id; expect 1 row returned (proves BYPASSRLS + GRANT
//       work together). ROLLBACK clears the fixture.
// T4 -- LAYER-5 CALLER QUERY SHAPE: own BEGIN/ROLLBACK; INSERT fixture
//       as postgres; SET LOCAL ROLE service_role; run the EXACT query
//       shape from lead-email-recipients.ts:208-212 (.select(
//       'platform_admin_id') with .eq('tenant_id', tenantId)); expect
//       non-empty result; assert assignedAdminIds-equivalent non-empty.
// T5 -- SIBLING REGRESSION: own BEGIN/ROLLBACK per sibling; SET LOCAL ROLE
//       service_role; SELECT 1 FROM each; expect 42501 on EACH (proves
//       scope was NOT widened).
//
// Per v25: pg Client gets .on('error') handler. No supabase-js needed --
// the grant gate is at the PostgreSQL layer; pg-direct SET LOCAL ROLE
// service_role exercises the same gate that supabase-js -> PostgREST ->
// SET LOCAL ROLE service_role hits.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

function assertEq (got, exp, msg) {
  if (got !== exp) throw new Error(`${msg}: got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`)
}

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('smoke: no DATABASE_URL'); process.exit(1) }
  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('[smoke] CLIENT ERROR:', e.message))
  await c.connect()
  console.log('[smoke] connected as postgres')

  const results = []
  const record = (name, status, detail) => {
    results.push({ name, status, detail })
    console.log(`[smoke] ${status === 'PASS' ? 'PASS' : 'FAIL'} ${name} -- ${detail}`)
  }

  try {
    // ------------------------------------------------------------
    // T1 -- PRE-GRANT 42501 BASELINE.
    // REVOKE the grant inside the tx; expect 42501 under service_role;
    // ROLLBACK restores the grant. This proves the pre-fix state was
    // exactly what the recon reported.
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      await c.query(`REVOKE SELECT ON public.platform_manager_tenants FROM service_role`)
      let errCode = null
      try {
        await c.query(`SET LOCAL ROLE service_role`)
        await c.query(`SELECT COUNT(*)::int AS n FROM public.platform_manager_tenants`)
      } catch (e) {
        errCode = e.code
      }
      // ROLLBACK below restores the grant + clears any aborted tx state.
      assertEq(errCode, '42501', 'T1: expected SQLSTATE 42501 after REVOKE')
      record('T1 pre-grant baseline', 'PASS', `REVOKE + service_role SELECT -> 42501 (pre-fix state reproduced)`)
    } finally {
      await c.query('ROLLBACK')
    }

    // ------------------------------------------------------------
    // T2 -- POST-GRANT CLEAN SELECT under service_role.
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      await c.query(`SET LOCAL ROLE service_role`)
      const r = await c.query(`SELECT COUNT(*)::int AS n FROM public.platform_manager_tenants`)
      record('T2 post-grant SELECT', 'PASS', `service_role SELECT returned count=${r.rows[0].n} (no 42501)`)
    } finally {
      await c.query('ROLLBACK')
    }

    // ------------------------------------------------------------
    // T3 -- POST-GRANT + FIXTURE ROW VISIBILITY (proves BYPASSRLS works
    // alongside the grant).
    // Picks an existing platform_admin + the WALLiam tenant at runtime
    // (no hardcoded UUIDs). INSERTs a fixture row, then under service_role
    // confirms the row is returned (would be filtered out if BYPASSRLS
    // failed and the auth.uid()-keyed policies gated the read).
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      const adm = await c.query(`SELECT id FROM public.platform_admins WHERE is_active=true LIMIT 1`)
      const ten = await c.query(`SELECT id FROM public.tenants WHERE source_key='walliam' LIMIT 1`)
      if (adm.rowCount === 0 || ten.rowCount === 0) {
        record('T3 fixture visibility', 'SKIP', 'no platform_admin or walliam tenant found')
      } else {
        const platformAdminId = adm.rows[0].id
        const tenantId = ten.rows[0].id
        await c.query(
          `INSERT INTO public.platform_manager_tenants (platform_admin_id, tenant_id, granted_at, granted_by)
           VALUES ($1, $2, now(), NULL)
           ON CONFLICT DO NOTHING`,
          [platformAdminId, tenantId]
        )
        await c.query(`SET LOCAL ROLE service_role`)
        const r = await c.query(
          `SELECT platform_admin_id FROM public.platform_manager_tenants WHERE tenant_id = $1`,
          [tenantId]
        )
        assertEq(r.rowCount >= 1, true, 'T3: fixture row returned under service_role')
        const hasFixture = r.rows.some(row => row.platform_admin_id === platformAdminId)
        assertEq(hasFixture, true, 'T3: returned rows include the fixture platform_admin_id')
        record('T3 fixture visibility', 'PASS',
               `service_role read fixture row for WALLiam (BYPASSRLS works with new grant)`)
      }
    } finally {
      await c.query('ROLLBACK')
    }

    // ------------------------------------------------------------
    // T4 -- LAYER-5 CALLER QUERY SHAPE end-to-end (mirrors
    // lead-email-recipients.ts:208-212 exactly:
    //   .from('platform_manager_tenants').select('platform_admin_id').eq('tenant_id', tenantId)
    // Verifies assignedAdminIds equivalent is non-empty when a fixture
    // exists, AND error capture would surface anything if the SELECT
    // failed (it shouldn't, post-grant).
    // ------------------------------------------------------------
    await c.query('BEGIN')
    try {
      const adm = await c.query(`SELECT id FROM public.platform_admins WHERE is_active=true LIMIT 1`)
      const ten = await c.query(`SELECT id FROM public.tenants WHERE source_key='walliam' LIMIT 1`)
      if (adm.rowCount === 0 || ten.rowCount === 0) {
        record('T4 Layer-5 caller', 'SKIP', 'no platform_admin or walliam tenant found')
      } else {
        const platformAdminId = adm.rows[0].id
        const tenantId = ten.rows[0].id
        await c.query(
          `INSERT INTO public.platform_manager_tenants (platform_admin_id, tenant_id, granted_at, granted_by)
           VALUES ($1, $2, now(), NULL)
           ON CONFLICT DO NOTHING`,
          [platformAdminId, tenantId]
        )

        // Mirror Layer-5: SELECT platform_admin_id WHERE tenant_id = $1.
        await c.query(`SET LOCAL ROLE service_role`)
        const r = await c.query(
          `SELECT platform_admin_id FROM public.platform_manager_tenants WHERE tenant_id = $1`,
          [tenantId]
        )
        const assignedAdminIds = r.rows.map(row => row.platform_admin_id)
        assertEq(assignedAdminIds.length >= 1, true, 'T4: assignedAdminIds non-empty post-fixture')
        record('T4 Layer-5 caller shape', 'PASS',
               `Layer-5 query returned ${assignedAdminIds.length} platform_admin_id(s) under service_role`)
      }
    } finally {
      await c.query('ROLLBACK')
    }

    // ------------------------------------------------------------
    // T5 -- SIBLING REGRESSION: tenant_floor_pool, tenant_floor_alerts,
    // territory_reroll_queue STILL error 42501 under service_role.
    // Each gets its own BEGIN/ROLLBACK so an abort on one doesn't poison
    // the test for the next.
    // ------------------------------------------------------------
    {
      const siblings = ['tenant_floor_pool', 'tenant_floor_alerts', 'territory_reroll_queue']
      const stillBlocked = []
      const accidentallyOpen = []
      for (const tbl of siblings) {
        await c.query('BEGIN')
        try {
          let errCode = null
          try {
            await c.query(`SET LOCAL ROLE service_role`)
            await c.query(`SELECT 1 FROM public.${tbl} LIMIT 1`)
          } catch (e) {
            errCode = e.code
          }
          if (errCode === '42501') stillBlocked.push(tbl)
          else accidentallyOpen.push(`${tbl}(${errCode || 'OK'})`)
        } finally {
          await c.query('ROLLBACK')
        }
      }
      if (accidentallyOpen.length > 0) {
        record('T5 sibling regression', 'FAIL',
               `siblings unexpectedly readable: ${accidentallyOpen.join(', ')}`)
        throw new Error(`T5: scope widened -- ${accidentallyOpen.join(', ')}`)
      }
      record('T5 sibling regression', 'PASS',
             `all 3 siblings still 42501 under service_role: ${stillBlocked.join(', ')}`)
    }
  } catch (e) {
    record('SMOKE', 'FAIL', e.message)
    try { await c.query('ROLLBACK') } catch (_) {}
    await c.end()
    console.log('\n[smoke] SUMMARY:')
    for (const r of results) console.log('   ', r.status, r.name, '--', r.detail)
    process.exit(1)
  }

  await c.end()
  console.log('\n[smoke] SUMMARY:')
  for (const r of results) console.log('   ', r.status, r.name, '--', r.detail)
  const allPass = results.every(r => r.status === 'PASS' || r.status === 'SKIP')
  process.exit(allPass ? 0 : 1)
})().catch(e => { console.error('smoke uncaught:', e); process.exit(1) })
