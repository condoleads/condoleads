require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();

  console.log("\n=== Whitby muni card ===");
  const apa = await c.query(`
    SELECT a.full_name, apa.is_primary, apa.condo_access, apa.homes_access,
           apa.buildings_access, apa.updated_at
    FROM agent_property_access apa
    JOIN agents a ON a.id = apa.agent_id
    WHERE apa.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
      AND apa.scope = 'municipality'
      AND apa.municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'
      AND apa.is_active = true
  `);
  for (const r of apa.rows) console.log("  " + JSON.stringify(r));

  console.log("\n=== Whitby listings by assigned agent ===");
  const counts = await c.query(`
    SELECT
      COALESCE(a.full_name, '(NULL)') AS agent,
      COUNT(*) AS n
    FROM mls_listings ml
    LEFT JOIN agents a ON a.id = ml.assigned_agent_id
    WHERE ml.municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'
    GROUP BY a.full_name
    ORDER BY n DESC
  `);
  for (const r of counts.rows) console.log("  " + r.agent + ": " + r.n);

  console.log("\n=== Queue state ===");
  const q = await c.query(`
    SELECT status, COUNT(*) AS n,
           MAX(processed_at) AS last_processed,
           MAX(rows_updated) AS max_rows
    FROM territory_reroll_queue
    WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    GROUP BY status
    ORDER BY status
  `);
  for (const r of q.rows) console.log("  " + JSON.stringify(r));

  console.log("\n=== All WALLiam apa cards (every level) ===");
  const all = await c.query(`
    SELECT apa.scope,
           COALESCE(ta.name, m.name, co.name, nb.name) AS geo_name,
           a.full_name AS agent,
           apa.is_primary, apa.condo_access, apa.homes_access, apa.buildings_access
    FROM agent_property_access apa
    JOIN agents a ON a.id = apa.agent_id
    LEFT JOIN treb_areas ta ON ta.id = apa.area_id
    LEFT JOIN municipalities m ON m.id = apa.municipality_id
    LEFT JOIN communities co ON co.id = apa.community_id
    LEFT JOIN neighbourhoods nb ON nb.id = apa.neighbourhood_id
    WHERE apa.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
      AND apa.is_active = true
    ORDER BY apa.scope, geo_name
  `);
  for (const r of all.rows) console.log("  " + JSON.stringify(r));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });