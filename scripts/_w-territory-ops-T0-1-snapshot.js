require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
const fs = require("fs");
const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
const OUTFILE = process.argv[2];
(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  const funcs = ["resolve_agent_for_context", "resolve_display_agent_for_context", "pick_routing_agent", "resolve_geo_primary"];
  let out = "-- Snapshot of resolver functions at " + new Date().toISOString() + "\n";
  out += "-- Use this to roll back T0-1 if needed.\n\n";
  for (const fn of funcs) {
    const r = await c.query("SELECT pg_get_functiondef(oid) AS body FROM pg_proc WHERE proname = $1 LIMIT 1", [fn]);
    if (r.rowCount > 0) {
      out += "-- --- " + fn + " ---\n";
      out += r.rows[0].body + ";\n\n";
    }
  }
  fs.writeFileSync(OUTFILE, out, "utf8");
  console.log("Snapshot written: " + OUTFILE + " (" + out.length + " bytes)");
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });