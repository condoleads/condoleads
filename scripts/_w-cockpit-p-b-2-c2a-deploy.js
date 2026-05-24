// scripts/_w-cockpit-p-b-2-c2a-deploy.js
// Apply both C2a migrations atomically. Verifies post-state.
require("dotenv").config({ path: ".env.local" });
const fs = require("fs"), path = require("path");
const { Client } = require("pg");
const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!cs) { console.error("No DB env"); process.exit(1); }

const M1 = fs.readFileSync(path.resolve("supabase/migrations/20260524_w_cockpit_p_b_2_c2a_reroll_queue.sql"), "utf8");
const M2 = fs.readFileSync(path.resolve("supabase/migrations/20260524_w_cockpit_p_b_2_c2a_trigger_async.sql"), "utf8");

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(M1);
    await c.query(M2);
    await c.query("COMMIT");
    console.log("Migrations applied.");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("FAILED -- rolled back. " + e.message);
    process.exit(1);
  }

  // Verify queue table
  const r1 = await c.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='territory_reroll_queue'");
  console.log("queue table: " + (r1.rowCount === 1 ? "OK" : "MISSING"));

  // Verify GUC pattern is in all 3 triggers
  const r2 = await c.query(`
    SELECT proname, pg_get_functiondef(oid) LIKE '%skip_apa_reroll%' AS has_guc
    FROM pg_proc WHERE proname IN ('handle_apa_insert','handle_apa_update','handle_apa_delete')
    ORDER BY proname
  `);
  for (const r of r2.rows) console.log("  " + r.proname + ": " + (r.has_guc ? "OK" : "MISSING"));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });