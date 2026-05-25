// scripts/_w-territory-ops-T0-1-deploy.js
// W-TERRITORY-OPS T0-1: apply resolver fixes migration, then run scenario smoke.
//
// 1. Reads the migration file from disk.
// 2. Applies it in a single transaction. ROLLBACK on any error.
// 3. After commit, runs 11 scenario probes against the patched resolver to
//    verify Fix 1 (hash-RR) + Fix 2 (non-selling fallthrough) + health RPC.
// 4. Prints PASS/FAIL summary.

require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
const fs = require("fs");

const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!cs) { console.error("No DB env"); process.exit(1); }

const MIGRATION = "supabase/migrations/20260524_w_territory_ops_T0_1_resolver_fixes.sql";
const TENANT = "b16e1039-38ed-43d7-bbc5-dd02bb651bc9"; // WALLiam

if (!fs.existsSync(MIGRATION)) {
  console.error("MISS: " + MIGRATION + " not found. Save the migration artifact first.");
  process.exit(1);
}

const sql = fs.readFileSync(MIGRATION, "utf8");

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();

  // ─── Apply migration ─────────────────────────────────────────────────
  console.log("\n=== Applying migration ===");
  try {
    await c.query(sql);
    console.log("  migration applied successfully");
  } catch (e) {
    console.error("MIGRATION FAILED: " + e.message);
    await c.end();
    process.exit(1);
  }

  // ─── Verify both functions exist + are the new versions ──────────────
  console.log("\n=== Verifying patched functions ===");

  const fnCheck = await c.query(`
    SELECT proname, octet_length(pg_get_functiondef(oid)) AS body_size
    FROM pg_proc
    WHERE proname IN ('resolve_agent_for_context', 'resolver_health_check')
    ORDER BY proname
  `);
  for (const r of fnCheck.rows) console.log("  " + r.proname + ": " + r.body_size + " bytes");

  if (fnCheck.rowCount < 2) {
    console.error("MISS: not all expected functions present after migration");
    await c.end();
    process.exit(1);
  }

  // Verify resolve_agent_for_context contains the new hash-RR pattern (P10).
  const body = await c.query("SELECT pg_get_functiondef(oid) AS body FROM pg_proc WHERE proname = 'resolve_agent_for_context' LIMIT 1");
  if (!body.rows[0].body.includes("v_selling_count") || !body.rows[0].body.includes("hashtext(p_listing_id::text)")) {
    console.error("MISS: resolve_agent_for_context body does not contain expected hash-RR pattern. Migration may not have applied correctly.");
    await c.end();
    process.exit(1);
  }
  console.log("  hash-RR pattern present in resolve_agent_for_context");

  // ─── Scenario smoke against WALLiam ──────────────────────────────────
  console.log("\n=== Scenario smoke against WALLiam (tenant " + TENANT.substring(0,8) + "...) ===");

  const errs = [];
  let passed = 0;

  async function probe(name, args, expect) {
    const r = await c.query(
      "SELECT resolve_agent_for_context($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid) AS agent_id",
      [args.listing_id || null, args.building_id || null, args.neighbourhood_id || null,
       args.community_id || null, args.municipality_id || null, args.area_id || null,
       args.user_id || null, args.tenant_id || null]
    );
    const got = r.rows[0].agent_id;
    const okFn = typeof expect === "function" ? expect : (v) => v === expect;
    if (okFn(got)) {
      console.log("  PASS " + name + " -> " + (got ? got.substring(0,8) + "..." : "NULL"));
      passed++;
    } else {
      console.log("  FAIL " + name + " -> got " + got + " expected " + (typeof expect === "function" ? "<custom>" : expect));
      errs.push(name);
    }
  }

  // Get WALLiam's agents
  const ag = await c.query(
    "SELECT id, full_name, is_selling, is_active FROM agents WHERE tenant_id = $1 ORDER BY id",
    [TENANT]
  );
  const sellingAgents = ag.rows.filter(a => a.is_selling && a.is_active);
  console.log("  WALLiam has " + sellingAgents.length + " selling agents");

  // S2: Day-1-like, no card present at Mississauga muni (WALLiam doesn't have one).
  // Should return tenant default (King Shah) since WALLiam has default_agent_id set.
  const KING_SHAH = "fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe";
  const NEO_SMITH = "f2ce3011-f8b0-4827-9d34-8fb7d7a9bb3f";
  const WHITBY_MUNI = "70103aef-1b32-4939-9ff8-264e859a5587";
  const BLUE_GRASS = "691943e2-b892-44b3-a437-e8d2e5b53119"; // phantom community
  const DURHAM_AREA = "03d4e133-d9f9-4a7e-ba9a-83e57269c1d4";

  // Probe 1: Listing in Whitby muni (functional muni card -> Neo Smith)
  await probe("P5 Whitby muni functional", { municipality_id: WHITBY_MUNI, tenant_id: TENANT }, NEO_SMITH);

  // Probe 2: Listing in Blue Grass Meadows phantom community.
  // pick_routing_agent returns King Shah (he holds the phantom card), but Fix 2
  // verifies he's selling+active (he is), so it returns King Shah.
  // This is the documented PHANTOM-still-routes-via-card behavior; the access
  // flags filter happens at distribution time, not resolver time.
  await probe("P4 Blue Grass Meadows phantom (card-holder is selling)", { community_id: BLUE_GRASS, tenant_id: TENANT }, KING_SHAH);

  // Probe 3: Durham area with no card -> falls through to tenant default King Shah.
  await probe("P9 Durham area (no card, tenant default)", { area_id: DURHAM_AREA, tenant_id: TENANT }, KING_SHAH);

  // Probe 4: No geo, just tenant_id, no listing_id (page-level).
  // P9 returns King Shah (tenant default, selling).
  await probe("P9 tenant-only page-level", { tenant_id: TENANT }, KING_SHAH);

  // Probe 5: No geo, with listing_id -> still hits P9 (tenant default King Shah).
  // P10 hash-RR only triggers when P9 fails.
  await probe("P9 with listing_id", { tenant_id: TENANT, listing_id: "00000000-0000-0000-0000-000000000001" }, KING_SHAH);

  // Probe 6: hash-RR test -- temporarily clear tenant default in a tx, verify
  // P10 returns different agents for different listing_ids, then rollback.
  await c.query("BEGIN");
  await c.query("UPDATE tenants SET default_agent_id = NULL WHERE id = $1", [TENANT]);
  const distinctAgents = new Set();
  for (let i = 0; i < 30; i++) {
    const r = await c.query(
      "SELECT resolve_agent_for_context($1::uuid, NULL, NULL, NULL, NULL, NULL, NULL, $2::uuid) AS agent_id",
      ["00000000-0000-0000-0000-" + i.toString().padStart(12, "0"), TENANT]
    );
    if (r.rows[0].agent_id) distinctAgents.add(r.rows[0].agent_id);
  }
  console.log("  hash-RR test: " + distinctAgents.size + " distinct agents picked across 30 listings (expect " + sellingAgents.length + ")");
  if (distinctAgents.size === sellingAgents.length) {
    console.log("  PASS P10 hash-RR distributes across all selling agents");
    passed++;
  } else {
    console.log("  FAIL P10 hash-RR: got " + distinctAgents.size + " distinct, expected " + sellingAgents.length);
    errs.push("P10 hash-RR distribution");
  }
  await c.query("ROLLBACK");

  // Probe 7: simulate non-selling tenant default -- temporarily set is_selling=false on King Shah,
  // verify the resolver falls through to P10 hash-RR among remaining selling agents.
  await c.query("BEGIN");
  await c.query("UPDATE agents SET is_selling = false WHERE id = $1", [KING_SHAH]);
  const r7 = await c.query(
    "SELECT resolve_agent_for_context(NULL, NULL, NULL, NULL, NULL, NULL, NULL, $1::uuid) AS agent_id",
    [TENANT]
  );
  // Should NOT be King Shah (he's now non-selling), should be one of the other selling agents.
  if (r7.rows[0].agent_id !== KING_SHAH && r7.rows[0].agent_id !== null) {
    console.log("  PASS Fix 2: non-selling tenant default falls through -> " + r7.rows[0].agent_id.substring(0,8) + "...");
    passed++;
  } else {
    console.log("  FAIL Fix 2: got " + r7.rows[0].agent_id + " (expected non-King-Shah selling agent)");
    errs.push("Fix 2 non-selling fallthrough");
  }
  await c.query("ROLLBACK");

  // Probe 8: simulate non-selling card holder -- Neo Smith goes non-selling.
  // Whitby muni card is Neo Smith. Resolver should fall through past P5 to P9 (King Shah).
  await c.query("BEGIN");
  await c.query("UPDATE agents SET is_selling = false WHERE id = $1", [NEO_SMITH]);
  const r8 = await c.query(
    "SELECT resolve_agent_for_context(NULL, NULL, NULL, NULL, $1::uuid, NULL, NULL, $2::uuid) AS agent_id",
    [WHITBY_MUNI, TENANT]
  );
  if (r8.rows[0].agent_id === KING_SHAH) {
    console.log("  PASS Fix 2: non-selling card holder falls through to tenant default");
    passed++;
  } else {
    console.log("  FAIL Fix 2: got " + r8.rows[0].agent_id + " (expected King Shah via fallthrough)");
    errs.push("Fix 2 card-holder fallthrough");
  }
  await c.query("ROLLBACK");

  // Probe 9: resolver_health_check returns sensible JSON for WALLiam.
  const h = await c.query("SELECT resolver_health_check($1::uuid) AS health", [TENANT]);
  const health = h.rows[0].health;
  console.log("  health: " + JSON.stringify(health));
  if (health.selling_agent_count === sellingAgents.length
      && health.tenant_default
      && health.tenant_default.is_healthy === true
      && health.phantom_cards === 11
      && health.total_active_cards === 12) {
    console.log("  PASS resolver_health_check returns expected shape for WALLiam");
    passed++;
  } else {
    console.log("  FAIL resolver_health_check: unexpected values");
    errs.push("resolver_health_check shape");
  }

  // Probe 10: health_check disaster state simulation.
  await c.query("BEGIN");
  await c.query("UPDATE agents SET is_selling = false WHERE tenant_id = $1", [TENANT]);
  const h2 = await c.query("SELECT resolver_health_check($1::uuid) AS health", [TENANT]);
  if (h2.rows[0].health.disaster_state === true && h2.rows[0].health.health_grade === 'critical') {
    console.log("  PASS health_check disaster_state detection");
    passed++;
  } else {
    console.log("  FAIL health_check disaster: " + JSON.stringify(h2.rows[0].health));
    errs.push("health_check disaster detection");
  }
  await c.query("ROLLBACK");

  // Probe 11: confirm no changes leaked outside transactions.
  const final = await c.query("SELECT default_agent_id FROM tenants WHERE id = $1", [TENANT]);
  if (final.rows[0].default_agent_id !== KING_SHAH) {
    errs.push("Test pollution: tenant default changed by tests");
    console.log("  FAIL test pollution check");
  } else {
    console.log("  PASS no test pollution");
    passed++;
  }
  const final2 = await c.query("SELECT COUNT(*) AS n FROM agents WHERE tenant_id = $1 AND is_selling = false", [TENANT]);
  if (parseInt(final2.rows[0].n) > 0) {
    errs.push("Test pollution: agents flipped to non-selling");
    console.log("  FAIL agent pollution check");
  } else {
    console.log("  PASS no agent pollution");
    passed++;
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log("\n=== SMOKE SUMMARY ===");
  console.log("  passed: " + passed);
  console.log("  failed: " + errs.length);
  if (errs.length > 0) {
    console.log("  FAILURES:");
    for (const e of errs) console.log("    - " + e);
    await c.end();
    process.exit(1);
  } else {
    console.log("  ALL CHECKS PASS -- T0-1 verified");
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });