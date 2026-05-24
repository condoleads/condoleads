require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!cs) { console.error("No DB env"); process.exit(1); }

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  let anyDupes = false;

  console.log("\n=== A. agent_property_access duplicates (same slot, active) ===");
  // Slot key = (tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id)
  // for is_active=true rows.
  const r1 = await c.query(`
    SELECT tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id,
           COUNT(*) AS n,
           array_agg(id::text) AS row_ids,
           array_agg(agent_id::text) AS agent_ids
    FROM agent_property_access
    WHERE is_active = true
    GROUP BY tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 50
  `);
  if (r1.rowCount > 0) {
    anyDupes = true;
    console.log("FOUND " + r1.rowCount + " duplicate slot(s):");
    for (const x of r1.rows) console.log("  " + JSON.stringify(x));
  } else {
    console.log("  CLEAN — zero active duplicates");
  }

  console.log("\n=== B. agent_geo_buildings duplicates (same building+agent) ===");
  const r2 = await c.query(`
    SELECT building_id, agent_id, COUNT(*) AS n, array_agg(id::text) AS row_ids
    FROM agent_geo_buildings
    GROUP BY building_id, agent_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 50
  `);
  if (r2.rowCount > 0) {
    anyDupes = true;
    console.log("FOUND " + r2.rowCount + " exact-duplicate (same agent same building):");
    for (const x of r2.rows) console.log("  " + JSON.stringify(x));
  } else {
    console.log("  CLEAN — zero exact duplicates");
  }

  console.log("\n=== B2. agent_geo_buildings — multiple agents on same building (conflict) ===");
  const r2b = await c.query(`
    SELECT building_id, COUNT(DISTINCT agent_id) AS n_agents, array_agg(DISTINCT agent_id::text) AS agents
    FROM agent_geo_buildings
    GROUP BY building_id
    HAVING COUNT(DISTINCT agent_id) > 1
    ORDER BY n_agents DESC
    LIMIT 50
  `);
  if (r2b.rowCount > 0) {
    console.log("FOUND " + r2b.rowCount + " building(s) claimed by 2+ agents:");
    for (const x of r2b.rows) console.log("  " + JSON.stringify(x));
    console.log("\n  NOTE: this is a CONFLICT to surface in Ops, NOT a constraint violation.");
    console.log("  Constraint will be UNIQUE(building_id, agent_id) -- allows multi-agent if needed later");
    console.log("  but blocks same-agent-twice-on-same-building data drift.");
  } else {
    console.log("  CLEAN — each building has at most 1 agent");
  }

  console.log("\n=== C. agent_listing_assignments duplicates ===");
  const r3 = await c.query(`
    SELECT listing_id, COUNT(*) AS n, array_agg(id::text) AS row_ids, array_agg(agent_id::text) AS agents
    FROM agent_listing_assignments
    GROUP BY listing_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 50
  `);
  if (r3.rowCount > 0) {
    anyDupes = true;
    console.log("FOUND " + r3.rowCount + " listing(s) with multiple cards:");
    for (const x of r3.rows) console.log("  " + JSON.stringify(x));
  } else {
    console.log("  CLEAN — each listing has at most 1 card");
  }

  console.log("\n=== VERDICT ===");
  if (anyDupes) {
    console.log("BLOCKED: duplicates exist. Migration cannot proceed without cleanup.");
    console.log("Decision required: keep first row by created_at? Keep is_primary=true? Other rule?");
    process.exit(1);
  } else {
    console.log("CLEAR: no blocking duplicates. Safe to apply UNIQUE constraints.");
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });