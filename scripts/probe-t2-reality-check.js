const { Client } = require('pg')
;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()

  const lor = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='lead_origin_route'")
  console.log('T2c lead_origin_route:', lor.rows.length ? lor.rows[0].data_type + ' nullable=' + lor.rows[0].is_nullable : 'ABSENT')

  const fks = await c.query("SELECT kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_col, tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name='leads' AND kcu.column_name IN ('area_id','municipality_id','community_id','neighbourhood_id','lead_origin_route') ORDER BY kcu.column_name")
  console.log('--- T2a/T2c FKs on leads ---')
  if (!fks.rows.length) console.log('  (none — columns exist but no FKs!)')
  fks.rows.forEach(r => console.log('  ' + r.column_name + ' -> ' + r.ref_table + '.' + r.ref_col + ' (' + r.constraint_name + ')'))

  const checks = await c.query("SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace WHERE nsp.nspname='public' AND rel.relname='leads' AND con.contype='c' ORDER BY con.conname")
  console.log('--- T2d CHECK constraints on leads ---')
  if (!checks.rows.length) console.log('  (none)')
  checks.rows.forEach(r => console.log('  ' + r.conname + ': ' + r.def))

  const vipExists = await c.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vip_requests') AS e")
  console.log('T2e vip_requests table:', vipExists.rows[0].e ? 'PRESENT' : 'ABSENT')
  if (vipExists.rows[0].e) {
    const vipTid = await c.query("SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='vip_requests' AND column_name='tenant_id'")
    console.log('  tenant_id:', vipTid.rows.length ? vipTid.rows[0].data_type + ' nullable=' + vipTid.rows[0].is_nullable : 'ABSENT')
    const vipChk = await c.query("SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace WHERE nsp.nspname='public' AND rel.relname='vip_requests' AND con.contype='c'")
    console.log('  CHECK constraints:', vipChk.rows.length || 'none')
    vipChk.rows.forEach(r => console.log('    ' + r.conname + ': ' + r.def))
  }

  const t2f = await c.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lead_email_recipients_log') AS e")
  console.log('T2f lead_email_recipients_log table:', t2f.rows[0].e ? 'PRESENT' : 'ABSENT')

  await c.end()
})().catch(e => { console.error(e); process.exit(1) })