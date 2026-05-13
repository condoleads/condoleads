const {Pool} = require('pg');
require('dotenv').config({path:'.env.local'});
const p = new Pool({connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL});
(async () => {
  const r = await p.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION' AND (routine_name ILIKE '%apa%' OR routine_name ILIKE '%territory%' OR routine_name ILIKE '%bulk%' OR routine_name ILIKE '%resolve_agent%') ORDER BY routine_name");
  r.rows.forEach(x => console.log('  ' + x.routine_name));
  await p.end();
})().catch(e => { console.error(e.message); process.exit(1); });
