require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) { console.error('FAIL: no DB URL'); process.exit(1); }
  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log('=== FK constraints on public.leads referencing public.agents ===');
  const fks = await pg.query(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS def " +
    "FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid " +
    "JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
    "WHERE cls.relname = 'leads' AND ns.nspname = 'public' AND con.contype = 'f' " +
    "AND con.conname LIKE '%manager%' OR con.conname LIKE '%admin%' OR con.conname LIKE '%agent%' " +
    "ORDER BY con.conname"
  );
  if (fks.rows.length === 0) {
    console.log('  (no matching FK constraints)');
  } else {
    fks.rows.forEach(r => console.log('  ' + r.conname + '\n    ' + r.def));
  }

  console.log('\n=== Hierarchy column existence on public.leads ===');
  const cols = await pg.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'leads' " +
    "AND column_name IN ('agent_id', 'manager_id', 'area_manager_id', 'tenant_admin_id') " +
    "ORDER BY column_name"
  );
  cols.rows.forEach(r => console.log('  ' + JSON.stringify(r)));

  console.log('\n=== Populated counts per hierarchy column (across all 163 rows) ===');
  const counts = await pg.query(
    "SELECT " +
    "  COUNT(*) FILTER (WHERE agent_id IS NOT NULL)::bigint AS agent, " +
    "  COUNT(*) FILTER (WHERE manager_id IS NOT NULL)::bigint AS manager, " +
    "  COUNT(*) FILTER (WHERE area_manager_id IS NOT NULL)::bigint AS area_manager, " +
    "  COUNT(*) FILTER (WHERE tenant_admin_id IS NOT NULL)::bigint AS tenant_admin, " +
    "  COUNT(*)::bigint AS total " +
    "FROM public.leads"
  );
  console.log('  ' + JSON.stringify(counts.rows[0]));

  console.log('\n=== Sample: hierarchy permutations (which combinations occur) ===');
  const perms = await pg.query(
    "SELECT " +
    "  (agent_id IS NOT NULL) AS has_agent, " +
    "  (manager_id IS NOT NULL) AS has_manager, " +
    "  (area_manager_id IS NOT NULL) AS has_area_mgr, " +
    "  (tenant_admin_id IS NOT NULL) AS has_tenant_admin, " +
    "  COUNT(*)::bigint AS n " +
    "FROM public.leads " +
    "GROUP BY 1, 2, 3, 4 " +
    "ORDER BY n DESC"
  );
  perms.rows.forEach(r => {
    console.log('  agent=' + r.has_agent + ' mgr=' + r.has_manager + ' area=' + r.has_area_mgr + ' admin=' + r.has_tenant_admin + ' n=' + r.n);
  });

  await pg.end();
})().catch(err => { console.error('FAIL: ' + err.message); process.exit(1); });