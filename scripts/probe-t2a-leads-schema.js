const { Client } = require('pg')
;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const r = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' ORDER BY ordinal_position")
  const cols = r.rows.map(x => x.column_name)
  const T = ['area_id','municipality_id','community_id','neighbourhood_id']
  console.log('leads cols total:', cols.length)
  console.log('T2a present:', T.filter(t => cols.includes(t)).join(', ') || '(none)')
  console.log('T2a absent (to add):', T.filter(t => !cols.includes(t)).join(', ') || '(none)')
  console.log('--- geo/origin cols in leads ---')
  r.rows.filter(x => /geo|area|muni|community|neighbour|building|listing/.test(x.column_name)).forEach(x => console.log('  ' + x.column_name + ': ' + x.data_type + ' (nullable=' + x.is_nullable + ')'))
  console.log('--- FK targets ---')
  for (const t of ['treb_areas','municipalities','communities','neighbourhoods']) {
    const q = await c.query('SELECT COUNT(*)::int AS n FROM ' + t)
    console.log('  ' + t + ': ' + q.rows[0].n + ' rows')
  }
  const lc = await c.query('SELECT COUNT(*)::int AS n FROM leads')
  console.log('leads rows:', lc.rows[0].n)
  const idx = await c.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='leads' ORDER BY indexname")
  console.log('--- leads indexes ---')
  idx.rows.forEach(x => console.log('  ' + x.indexname))
  await c.end()
})().catch(e => { console.error(e); process.exit(1) })