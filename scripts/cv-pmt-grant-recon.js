// F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT — live-DB recon (read-only).
// P1 FIX 3 of 3 — determines whether a bare GRANT is sufficient or a SECURITY
// DEFINER helper is needed (the (a)-vs-(b) determination). Also cross-checks
// the three sibling grant-wall tables (tenant_floor_pool, tenant_floor_alerts,
// territory_reroll_queue).
//
// All probes inside BEGIN READ ONLY (no state change). Role-switches are
// confined to single-statement test windows + RESET ROLE immediately after.
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('no DATABASE_URL'); process.exit(1) }
  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('CLIENT ERROR:', e.message))
  await c.connect()
  // Auto-commit mode (no outer BEGIN) so a failed role-switch test in one
  // section doesn't poison the tx for subsequent sections. Each role-switch
  // test below wraps itself in its own BEGIN/ROLLBACK.

  console.log('=== 1. service_role BYPASSRLS attribute (pg_authid) ===')
  console.log('  If rolbypassrls=true, service_role bypasses RLS regardless of table setting.')
  console.log('  This is THE key question for (a)-vs-(b) decision.')
  {
    const r = await c.query(`
      SELECT rolname, rolbypassrls, rolsuper, rolinherit
        FROM pg_authid
       WHERE rolname IN ('service_role','authenticator','authenticated','anon','postgres')
       ORDER BY rolname`)
    for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 2. platform_manager_tenants: existence + columns ===')
  {
    const r = await c.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='platform_manager_tenants'
       ORDER BY ordinal_position`)
    if (r.rowCount === 0) console.log('  (table not found in public schema)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 3. platform_manager_tenants: relrowsecurity + relforcerowsecurity ===')
  {
    const r = await c.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity, relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname='platform_manager_tenants'`)
    if (r.rowCount === 0) console.log('  (NOT FOUND)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 4. platform_manager_tenants: pg_policy entries ===')
  {
    const r = await c.query(`
      SELECT pol.polname,
             pol.polcmd,
             pol.polpermissive,
             pol.polroles::regrole[] AS roles,
             pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
             pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck_expr
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname='platform_manager_tenants'`)
    if (r.rowCount === 0) console.log('  (no policies)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 5. platform_manager_tenants: information_schema.role_table_grants ===')
  {
    const r = await c.query(`
      SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='platform_manager_tenants'
       ORDER BY grantee, privilege_type`)
    if (r.rowCount === 0) console.log('  (no grants visible — postgres-owner-only)')
    else for (const row of r.rows) console.log('  ', row.grantee, '->', row.privilege_type)
  }

  console.log('\n=== 6. platform_manager_tenants: row count + sample ===')
  {
    const r = await c.query(`SELECT COUNT(*)::int AS n FROM public.platform_manager_tenants`)
    console.log('  count:', r.rows[0].n)
    if (r.rows[0].n > 0) {
      const s = await c.query(`SELECT * FROM public.platform_manager_tenants LIMIT 3`)
      for (const row of s.rows) console.log('  sample:', row)
    }
  }

  console.log('\n=== 7. LIVE BEHAVIOR TEST: SELECT under SET LOCAL ROLE service_role ===')
  console.log('  Confirms TODAY the read fails (or returns 0) under service_role.')
  console.log('  Tx-isolated: own BEGIN/ROLLBACK so an error here is contained.')
  {
    await c.query('BEGIN')
    try {
      await c.query(`SET LOCAL ROLE service_role`)
      const r = await c.query(`SELECT COUNT(*)::int AS n FROM public.platform_manager_tenants`)
      console.log('  service_role SELECT succeeded; n =', r.rows[0].n)
      console.log('  (interpretation: if 0 here but >0 as postgres above, RLS gates the read; if equal, BYPASSRLS works)')
    } catch (e) {
      console.log('  service_role SELECT FAILED with:', e.code, '-', e.message)
      console.log('  (this is the current production behavior; supabase-js maps it to silent {error})')
    } finally {
      await c.query('ROLLBACK')
    }
  }

  console.log('\n=== 8. Sibling grant-wall tables: same probe shape ===')
  for (const tbl of ['tenant_floor_pool', 'tenant_floor_alerts', 'territory_reroll_queue']) {
    console.log(`\n  --- ${tbl} ---`)

    const cls = await c.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=$1`, [tbl])
    if (cls.rowCount === 0) { console.log('    (not found)'); continue }
    console.log('    pg_class:', cls.rows[0])

    const pol = await c.query(`
      SELECT polname, polcmd, polroles::regrole[] AS roles,
             pg_get_expr(polqual, polrelid) AS using_expr
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname=$1`, [tbl])
    if (pol.rowCount === 0) console.log('    policies: (none)')
    else for (const row of pol.rows) console.log('    policy:', row)

    const g = await c.query(`
      SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name=$1
       ORDER BY grantee, privilege_type`, [tbl])
    if (g.rowCount === 0) console.log('    grants: (none visible)')
    else {
      const byRole = {}
      for (const row of g.rows) {
        if (!byRole[row.grantee]) byRole[row.grantee] = []
        byRole[row.grantee].push(row.privilege_type)
      }
      for (const role of Object.keys(byRole).sort()) {
        console.log(`    grants[${role}]:`, byRole[role].sort().join(', '))
      }
    }

    // Live service_role read test -- own BEGIN/ROLLBACK per table for isolation.
    await c.query('BEGIN')
    try {
      await c.query(`SET LOCAL ROLE service_role`)
      const r = await c.query(`SELECT COUNT(*)::int AS n FROM public.${tbl}`)
      console.log(`    service_role SELECT ok; n=${r.rows[0].n}`)
    } catch (e) {
      console.log(`    service_role SELECT FAILED: ${e.code} - ${e.message}`)
    } finally {
      await c.query('ROLLBACK')
    }
  }

  console.log('\n=== 9. callers of platform_manager_tenants in code (cross-check) ===')
  console.log('  (grep elsewhere; this probe only reports the DB-side state.)')

  console.log('\n=== 10. createLead -> getLeadEmailRecipients call shape (read-only sanity) ===')
  console.log('  The createServiceClient (supabase-js with SERVICE_ROLE_KEY) drives Layer-5.')
  console.log('  The Layer-5 destructure {data} (no error capture) is what makes the failure silent.')

  await c.end()
})().catch(e => { console.error('PROBE ERROR:', e); process.exit(1) })
