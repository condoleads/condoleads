require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) { console.error('FAIL: no DB URL'); process.exit(1); }
  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log('=== leads.lead_origin_route column existence ===');
  const col = await pg.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_origin_route'"
  );
  if (col.rows.length === 0) {
    console.log('  COLUMN MISSING');
  } else {
    console.log('  ' + JSON.stringify(col.rows[0]));
  }

  console.log('\n=== Distribution of lead_origin_route (current values) ===');
  const dist = await pg.query(
    "SELECT lead_origin_route, COUNT(*)::bigint AS n FROM public.leads GROUP BY lead_origin_route ORDER BY n DESC NULLS LAST"
  );
  dist.rows.forEach(r => {
    const v = r.lead_origin_route === null ? '(NULL)' : JSON.stringify(r.lead_origin_route);
    console.log('  ' + v + ': ' + r.n);
  });

  console.log('\n=== Distribution of source (for cross-reference) ===');
  const srcDist = await pg.query(
    "SELECT source, COUNT(*)::bigint AS n FROM public.leads GROUP BY source ORDER BY n DESC NULLS LAST LIMIT 30"
  );
  srcDist.rows.forEach(r => {
    const v = r.source === null ? '(NULL)' : JSON.stringify(r.source);
    console.log('  ' + v + ': ' + r.n);
  });

  console.log('\n=== Cross-tab: source -> lead_origin_route ===');
  const xtab = await pg.query(
    "SELECT source, lead_origin_route, COUNT(*)::bigint AS n FROM public.leads " +
    "GROUP BY source, lead_origin_route ORDER BY source NULLS LAST, lead_origin_route NULLS LAST"
  );
  xtab.rows.forEach(r => {
    const s = r.source === null ? '(NULL)' : r.source;
    const v = r.lead_origin_route === null ? '(NULL)' : r.lead_origin_route;
    console.log('  source=' + s + '  origin_route=' + v + '  n=' + r.n);
  });

  await pg.end();
})().catch(err => { console.error('FAIL: ' + err.message); process.exit(1); });