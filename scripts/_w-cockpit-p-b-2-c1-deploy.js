// scripts/_w-cockpit-p-b-2-c1-deploy.js
// W-COCKPIT P-B-2 Commit 1 deploy: apply UNIQUE constraints with rollback snapshot.
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!cs) { console.error("No DB env"); process.exit(1); }

const MIGRATION = path.resolve("supabase/migrations/20260524_w_cockpit_p_b_2_card_uniqueness.sql");
const sql = fs.readFileSync(MIGRATION, "utf8");

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();

  // 1. Rollback snapshot: confirm indexes don't exist yet.
  console.log("=== Pre-state ===");
  const before = await c.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public'
      AND indexname IN ('uq_apa_active_slot','uq_agb_building_agent','uq_ala_listing')
    ORDER BY indexname
  `);
  if (before.rowCount > 0) {
    console.log("Existing indexes that would conflict:");
    for (const r of before.rows) console.log("  " + r.indexname);
    console.log("Aborting — drop existing first if you want to re-create.");
    await c.end();
    process.exit(1);
  }
  console.log("  No existing target indexes -- safe to apply.");

  // 2. Apply migration in a single transaction.
  console.log("\n=== Applying migration ===");
  try {
    await c.query("BEGIN");
    await c.query(sql);
    await c.query("COMMIT");
    console.log("  Migration committed.");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("Migration failed -- rolled back. Error:");
    console.error(e.message);
    await c.end();
    process.exit(1);
  }

  // 3. Verify all 3 indexes exist + are unique.
  console.log("\n=== Post-state verification ===");
  const after = await c.query(`
    SELECT i.indexname, ix.indisunique, ix.indpred IS NOT NULL AS is_partial
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_index ix ON ix.indexrelid = c.oid
    WHERE i.schemaname='public'
      AND i.indexname IN ('uq_apa_active_slot','uq_agb_building_agent','uq_ala_listing')
    ORDER BY i.indexname
  `);
  console.log("Indexes created (" + after.rowCount + " of 3 expected):");
  for (const r of after.rows) {
    console.log("  " + r.indexname + "  unique=" + r.indisunique + "  partial=" + r.is_partial);
  }
  if (after.rowCount !== 3) {
    console.error("FAIL: expected 3 indexes, found " + after.rowCount);
    process.exit(1);
  }

  console.log("\nDone.");
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });