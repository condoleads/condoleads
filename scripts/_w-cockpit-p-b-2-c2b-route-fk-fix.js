// scripts/_w-cockpit-p-b-2-c2b-route-fk-fix.js
// W-COCKPIT P-B-2 Commit 2b fix: disambiguate FK in agent_geo_buildings nested select.
//
// Supabase PostgREST rejected the embed because two FKs link agent_geo_buildings
// to agents (agent_id + assigned_by). Add the explicit FK hint
// "!agent_geo_buildings_agent_id_fkey" so it knows which relationship to use.
//
// Verified: this is the exact hint string PostgREST returned in its error message.
//
// Run: node scripts/_w-cockpit-p-b-2-c2b-route-fk-fix.js
// Then: npx tsc --noEmit

const fs = require("fs");

const FILE = "app/api/admin-homes/territory/cascade-tree/route.ts";

if (!fs.existsSync(FILE)) {
  console.error("MISS: file not found: " + FILE);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const before = src;

const FIND = `    s.from('agent_geo_buildings')
      .select('id, agent_id, building_id, assigned_by, created_at, agents!inner(tenant_id, full_name, is_selling), buildings(id, building_name, community_id, communities(id, name, municipality_id, municipalities(id, name)))')
      .eq('agents.tenant_id', effectiveTenantId),`;

const REPL = `    s.from('agent_geo_buildings')
      .select('id, agent_id, building_id, assigned_by, created_at, agents!agent_geo_buildings_agent_id_fkey!inner(tenant_id, full_name, is_selling), buildings(id, building_name, community_id, communities(id, name, municipality_id, municipalities(id, name)))')
      .eq('agents.tenant_id', effectiveTenantId),`;

if (src.split(FIND).length - 1 !== 1) {
  console.error("MISS: agent_geo_buildings select anchor not unique or absent");
  process.exit(1);
}

src = src.replace(FIND, REPL);

if (src === before) {
  console.error("MISS: no change applied");
  process.exit(1);
}

fs.writeFileSync(FILE, src, "utf8");
console.log("  applied: FK hint added to agent_geo_buildings -> agents embed");
console.log("");
console.log("Next: re-run scripts/_w-cockpit-p-b-2-c2b-diag-api.js to verify the join now works");