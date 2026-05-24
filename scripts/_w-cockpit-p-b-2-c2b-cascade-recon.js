// scripts/_w-cockpit-p-b-2-c2b-cascade-recon.js
// W-COCKPIT P-B-2 Commit 2b: recon of cascade-walk inputs.
// Read-only. Answers 8 questions for the chart rewrite.

require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!cs) { console.error("No DB env"); process.exit(1); }

const WALLIAM_TENANT = "b16e1039-38ed-43d7-bbc5-dd02bb651bc9";

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();

  // Q1: tenant default agent
  console.log("\n=== Q1: WALLiam tenant default agent ===");
  const t = await c.query(
    "SELECT id, name, brand_name, default_agent_id FROM tenants WHERE id=$1",
    [WALLIAM_TENANT]
  );
  console.log(JSON.stringify(t.rows[0], null, 2));
  if (t.rows[0].default_agent_id) {
    const da = await c.query(
      "SELECT id, full_name, is_selling, is_active FROM agents WHERE id=$1",
      [t.rows[0].default_agent_id]
    );
    console.log("default_agent details:", JSON.stringify(da.rows[0]));
  } else {
    console.log("default_agent_id is NULL");
  }

  // Q2: selling agent count
  console.log("\n=== Q2: WALLiam selling agents ===");
  const sa = await c.query(
    "SELECT id, full_name, email, is_selling, is_active, role FROM agents WHERE tenant_id=$1 AND is_active=true ORDER BY full_name",
    [WALLIAM_TENANT]
  );
  console.log("Total active agents:", sa.rowCount);
  console.log("Selling agents:", sa.rows.filter(r => r.is_selling).length);
  for (const a of sa.rows) {
    console.log(`  ${a.full_name} (${a.role}) is_selling=${a.is_selling} ${a.email}`);
  }

  // Q3: area-scope apa rows
  console.log("\n=== Q3: AREA-scope apa rows (WALLiam) ===");
  const apaArea = await c.query(
    `SELECT apa.id, apa.area_id, ta.name AS area_name, apa.agent_id, ag.full_name AS agent_name,
            apa.is_primary, apa.condo_access, apa.homes_access, apa.buildings_access
     FROM agent_property_access apa
     LEFT JOIN treb_areas ta ON ta.id = apa.area_id
     LEFT JOIN agents ag ON ag.id = apa.agent_id
     WHERE apa.tenant_id=$1 AND apa.scope='area' AND apa.is_active=true`,
    [WALLIAM_TENANT]
  );
  console.log("Count:", apaArea.rowCount);
  for (const r of apaArea.rows) console.log(" ", JSON.stringify(r));

  // Q4: neighbourhood-scope apa rows
  console.log("\n=== Q4: NEIGHBOURHOOD-scope apa rows (WALLiam) ===");
  const apaNbhd = await c.query(
    `SELECT apa.id, apa.neighbourhood_id, n.name AS nbhd_name,
            apa.agent_id, ag.full_name AS agent_name,
            apa.is_primary, apa.condo_access, apa.homes_access, apa.buildings_access
     FROM agent_property_access apa
     LEFT JOIN neighbourhoods n ON n.id = apa.neighbourhood_id
     LEFT JOIN agents ag ON ag.id = apa.agent_id
     WHERE apa.tenant_id=$1 AND apa.scope='neighbourhood' AND apa.is_active=true`,
    [WALLIAM_TENANT]
  );
  console.log("Count:", apaNbhd.rowCount);
  for (const r of apaNbhd.rows) console.log(" ", JSON.stringify(r));

  // Q5: community-scope apa rows + their parent munis + their parent areas
  console.log("\n=== Q5: COMMUNITY-scope apa rows (WALLiam) with parent chain ===");
  const apaComm = await c.query(
    `SELECT apa.id, apa.community_id, co.name AS comm_name,
            co.municipality_id, m.name AS muni_name,
            m.area_id, ta.name AS area_name,
            apa.agent_id, ag.full_name AS agent_name,
            apa.is_primary, apa.condo_access, apa.homes_access, apa.buildings_access
     FROM agent_property_access apa
     LEFT JOIN communities co ON co.id = apa.community_id
     LEFT JOIN municipalities m ON m.id = co.municipality_id
     LEFT JOIN treb_areas ta ON ta.id = m.area_id
     LEFT JOIN agents ag ON ag.id = apa.agent_id
     WHERE apa.tenant_id=$1 AND apa.scope='community' AND apa.is_active=true
     ORDER BY ta.name, m.name, co.name`,
    [WALLIAM_TENANT]
  );
  console.log("Count:", apaComm.rowCount);
  for (const r of apaComm.rows) console.log(" ", JSON.stringify(r));

  // Q6: municipality-scope apa rows
  console.log("\n=== Q6: MUNICIPALITY-scope apa rows (WALLiam) ===");
  const apaMuni = await c.query(
    `SELECT apa.id, apa.municipality_id, m.name AS muni_name,
            m.area_id, ta.name AS area_name,
            apa.agent_id, ag.full_name AS agent_name,
            apa.is_primary, apa.condo_access, apa.homes_access, apa.buildings_access,
            apa.buildings_mode
     FROM agent_property_access apa
     LEFT JOIN municipalities m ON m.id = apa.municipality_id
     LEFT JOIN treb_areas ta ON ta.id = m.area_id
     LEFT JOIN agents ag ON ag.id = apa.agent_id
     WHERE apa.tenant_id=$1 AND apa.scope='municipality' AND apa.is_active=true
     ORDER BY ta.name, m.name`,
    [WALLIAM_TENANT]
  );
  console.log("Count:", apaMuni.rowCount);
  for (const r of apaMuni.rows) console.log(" ", JSON.stringify(r));

  // Q7: distinct areas implicated (for cascade walk root)
  console.log("\n=== Q7: Distinct areas implicated by any WALLiam card ===");
  const areas = await c.query(
    `WITH implicated AS (
       SELECT apa.area_id AS aid FROM agent_property_access apa
         WHERE apa.tenant_id=$1 AND apa.scope='area' AND apa.is_active=true
       UNION
       SELECT m.area_id FROM agent_property_access apa
         JOIN municipalities m ON m.id = apa.municipality_id
         WHERE apa.tenant_id=$1 AND apa.scope='municipality' AND apa.is_active=true
       UNION
       SELECT m.area_id FROM agent_property_access apa
         JOIN communities co ON co.id = apa.community_id
         JOIN municipalities m ON m.id = co.municipality_id
         WHERE apa.tenant_id=$1 AND apa.scope='community' AND apa.is_active=true
       UNION
       SELECT n.area_id FROM agent_property_access apa
         JOIN neighbourhoods n ON n.id = apa.neighbourhood_id
         WHERE apa.tenant_id=$1 AND apa.scope='neighbourhood' AND apa.is_active=true
     )
     SELECT DISTINCT ta.id, ta.name FROM implicated i
       JOIN treb_areas ta ON ta.id = i.aid
       WHERE i.aid IS NOT NULL
       ORDER BY ta.name`,
    [WALLIAM_TENANT]
  );
  console.log("Implicated areas:", areas.rowCount);
  for (const r of areas.rows) console.log(" ", JSON.stringify(r));

  // Q8: building cards
  console.log("\n=== Q8: WALLiam building cards (agent_geo_buildings) ===");
  const bld = await c.query(
    `SELECT agb.id, agb.agent_id, ag.full_name AS agent_name,
            agb.building_id, b.building_name, b.community_id, co.name AS comm_name,
            co.municipality_id, m.name AS muni_name
     FROM agent_geo_buildings agb
     JOIN agents ag ON ag.id = agb.agent_id AND ag.tenant_id=$1
     LEFT JOIN buildings b ON b.id = agb.building_id
     LEFT JOIN communities co ON co.id = b.community_id
     LEFT JOIN municipalities m ON m.id = co.municipality_id
     ORDER BY ag.full_name, b.building_name`,
    [WALLIAM_TENANT]
  );
  console.log("Count:", bld.rowCount);
  for (const r of bld.rows) console.log(" ", JSON.stringify(r));

  // Bonus: listing pins
  console.log("\n=== Q9: WALLiam listing pins (agent_listing_assignments) ===");
  const pins = await c.query(
    `SELECT ala.id, ala.agent_id, ag.full_name AS agent_name, ala.listing_id, ala.created_at
     FROM agent_listing_assignments ala
     JOIN agents ag ON ag.id = ala.agent_id AND ag.tenant_id=$1
     ORDER BY ala.created_at DESC LIMIT 20`,
    [WALLIAM_TENANT]
  );
  console.log("Count:", pins.rowCount);
  for (const r of pins.rows) console.log(" ", JSON.stringify(r));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });