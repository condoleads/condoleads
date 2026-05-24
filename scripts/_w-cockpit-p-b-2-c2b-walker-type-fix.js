// scripts/_w-cockpit-p-b-2-c2b-walker-type-fix.js
// W-COCKPIT P-B-2 Commit 2b: add buildings_mode to GeoCardLite so the walker's
// returned cards are structurally compatible with the chart's GeoCard type.
//
// The walker doesn't read buildings_mode anywhere; it's a passthrough field.
// Adding it as required matches the chart's GeoCard exactly, which is what
// the cascade-tree route's SELECT returns and what NodeData.card expects.
//
// Run: node scripts/_w-cockpit-p-b-2-c2b-walker-type-fix.js
// Then: npx tsc --noEmit
//
// Rollback (this file only):
//   Restore the find block at line ~26-30 of cascade-walker.ts manually.

const fs = require("fs");

const FILE = "components/admin-homes/cockpit/territory/cascade-walker.ts";

if (!fs.existsSync(FILE)) {
  console.error("MISS: file not found: " + FILE);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const before = src;

const FIND = `export interface GeoCardLite {
  id: string
  agent_id: string
  scope: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
}`;

const REPL = `export interface GeoCardLite {
  id: string
  agent_id: string
  scope: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string  // C2b: structural match with chart's GeoCard (passthrough; walker does not read this)
}`;

if (src.split(FIND).length - 1 !== 1) {
  console.error("MISS: GeoCardLite anchor not unique or absent");
  process.exit(1);
}

src = src.replace(FIND, REPL);

if (src === before) {
  console.error("MISS: no change applied (sanity check)");
  process.exit(1);
}

fs.writeFileSync(FILE, src, "utf8");
console.log("  applied: added buildings_mode to GeoCardLite");
console.log("");
console.log("Next: npx tsc --noEmit");