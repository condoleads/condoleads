// scripts/probe-t4a-2-recon.js
//
// Read-only schema + state probe for T4a-2 (admin-homes territory page).
// One-shot diagnostic. Does not write.
//
// Captures:
//   - agent_property_access columns
//   - territory_assignment_changes columns
//   - distinct change_types in TAC
//   - apa stats by tenant (top 5)
//   - unique indexes on apa (T2a partial uniques + others)
//   - TAC sample rows (5, all cols)
//   - TAC total row count

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!cs) {
  console.error('FAIL: DATABASE_URL / POSTGRES_URL not in .env.local');
  process.exit(1);
}

const pool = new Pool({ connectionString: cs });
const pad = (s, n) => String(s == null ? '' : s).padEnd(n);

(async () => {
  try {
    console.log('=== agent_property_access columns ===');
    const apa = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='agent_property_access'
      ORDER BY ordinal_position`);
    apa.rows.forEach(r => console.log(`  ${pad(r.column_name, 28)} ${pad(r.data_type, 30)} null=${r.is_nullable}${r.column_default ? '  default=' + r.column_default : ''}`));

    console.log('\n=== territory_assignment_changes columns ===');
    const tac = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='territory_assignment_changes'
      ORDER BY ordinal_position`);
    tac.rows.forEach(r => console.log(`  ${pad(r.column_name, 28)} ${pad(r.data_type, 30)} null=${r.is_nullable}${r.column_default ? '  default=' + r.column_default : ''}`));

    console.log('\n=== distinct change_type values in TAC ===');
    const ct = await pool.query(`SELECT change_type, COUNT(*) AS cnt FROM territory_assignment_changes GROUP BY change_type ORDER BY cnt DESC`);
    ct.rows.forEach(r => console.log(`  ${pad(r.change_type, 28)} ${r.cnt}`));

    console.log('\n=== apa stats by tenant (top 5) ===');
    const tc = await pool.query(`
      SELECT tenant_id, COUNT(*) AS cnt,
             COUNT(*) FILTER (WHERE is_active) AS active,
             COUNT(*) FILTER (WHERE is_primary AND is_active) AS active_primary
      FROM agent_property_access GROUP BY tenant_id ORDER BY cnt DESC LIMIT 5`);
    tc.rows.forEach(r => console.log(`  tenant=${r.tenant_id}  total=${r.cnt}  active=${r.active}  active_primary=${r.active_primary}`));

    console.log('\n=== unique indexes on agent_property_access ===');
    const idx = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname='public' AND tablename='agent_property_access'
      ORDER BY indexname`);
    idx.rows.forEach(r => console.log(`  ${r.indexname}\n      ${r.indexdef}`));

    console.log('\n=== TAC sample (5 rows, all columns, no ordering) ===');
    const sample = await pool.query(`SELECT * FROM territory_assignment_changes LIMIT 5`);
    sample.rows.forEach((r, i) => {
      const json = JSON.stringify(r);
      console.log(`  row ${i + 1}: ${json.length > 320 ? json.substring(0, 320) + '...' : json}`);
    });

    console.log('\n=== TAC total row count ===');
    const total = await pool.query(`SELECT COUNT(*) FROM territory_assignment_changes`);
    console.log(`  ${total.rows[0].count}`);

    console.log('\n=== referenced geo tables (just count rows) ===');
    for (const t of ['areas', 'municipalities', 'communities', 'neighbourhoods']) {
      try {
        const c = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        console.log(`  ${pad(t, 20)} ${c.rows[0].count}`);
      } catch (e) {
        console.log(`  ${pad(t, 20)} <table missing or error: ${e.message.substring(0, 60)}>`);
      }
    }

    await pool.end();
  } catch (e) {
    console.error('PROBE FAIL:', e.message);
    process.exit(1);
  }
})();