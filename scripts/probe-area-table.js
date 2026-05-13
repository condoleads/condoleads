const {Pool} = require('pg');
require('dotenv').config({path:'.env.local'});
const p = new Pool({connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL});
(async () => {
  console.log('=== FK constraints on agent_property_access ===');
  const fks = await p.query("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.agent_property_access'::regclass AND contype='f' ORDER BY conname");
  fks.rows.forEach(x => console.log('  ' + x.conname + '\n      ' + x.def));
  
  console.log('\n=== tables containing "area" or "geo" or "region" or "district" ===');
  const t = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%area%' OR table_name ILIKE '%region%' OR table_name ILIKE '%district%' OR table_name ILIKE '%geo%') ORDER BY table_name");
  t.rows.forEach(x => console.log('  ' + x.table_name));
  
  console.log('\n=== APA row distribution by scope (all rows, active+inactive) ===');
  const dist = await p.query("SELECT scope, is_active, COUNT(*) AS cnt FROM agent_property_access GROUP BY scope, is_active ORDER BY scope, is_active");
  dist.rows.forEach(x => console.log('  scope=' + x.scope + '  active=' + x.is_active + '  cnt=' + x.cnt));
  
  console.log('\n=== columns of any "areas"-like table ===');
  const tablesToCheck = t.rows.map(r => r.table_name).filter(n => n.includes('area') || n.includes('region'));
  for (const tn of tablesToCheck) {
    const cols = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [tn]);
    console.log('  ' + tn + ': ' + cols.rows.map(c => c.column_name).join(', '));
  }
  
  await p.end();
})().catch(e => { console.error(e.message); process.exit(1); });
