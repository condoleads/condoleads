// scripts/_w-cockpit-p-b-2-c2c-A-shared-types.js
// W-COCKPIT P-B-2 Commit 2c -- Artifact A: extract shared types module.
//
// Resolves F-DUPLICATED-GEOCARD-TYPE.
//
// 1. NEW   components/admin-homes/cockpit/territory/cascade-types.ts
//          (canonical types: GeoCard, NodeState, SourceLevel, BadgeState)
// 2. EDIT  components/admin-homes/cockpit/territory/cascade-walker.ts
//          (delete GeoCardLite interface; import GeoCard from cascade-types)
//          (replace all 12 GeoCardLite references with GeoCard)
// 3. EDIT  components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx
//          (delete inline GeoCard interface; import from cascade-types)
//
// Anchors verified 2026-05-24 post-2b ship (HEAD 1838ba7).
//
// Pure refactor: no behaviour change. Walker logic identical, chart rendering
// identical. TSC must remain at 0 errors.
//
// Run: node scripts/_w-cockpit-p-b-2-c2c-A-shared-types.js
// Then: npx tsc --noEmit

const fs = require("fs");
const path = require("path");

const WALKER_PATH = "components/admin-homes/cockpit/territory/cascade-walker.ts";
const CHART_PATH  = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";
const TYPES_PATH  = "components/admin-homes/cockpit/territory/cascade-types.ts";

if (!fs.existsSync(WALKER_PATH)) { console.error("MISS: " + WALKER_PATH); process.exit(1); }
if (!fs.existsSync(CHART_PATH))  { console.error("MISS: " + CHART_PATH);  process.exit(1); }
if (fs.existsSync(TYPES_PATH))   { console.error("MISS: " + TYPES_PATH + " already exists"); process.exit(1); }

// ─── Step 1: Write cascade-types.ts ─────────────────────────────────────
const TYPES = `// components/admin-homes/cockpit/territory/cascade-types.ts
// W-COCKPIT P-B-2 Commit 2c: canonical types for the territory cascade.
//
// Imported by cascade-walker.ts AND TerritoryCascadeChart.tsx so there's a
// single source of truth for GeoCard shape and walker output types.
// Resolves F-DUPLICATED-GEOCARD-TYPE (walker had its own GeoCardLite).

export interface GeoCard {
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
  buildings_mode: string
}

export type NodeState = 'ASSIGNED' | 'PHANTOM' | 'INHERITED'
export type SourceLevel = 'community' | 'municipality' | 'area' | 'tenant'
export type BadgeState = 'active' | 'inherited' | 'phantom'
`;

fs.writeFileSync(TYPES_PATH, TYPES, "utf8");
console.log("  created: " + TYPES_PATH);

// ─── Step 2: Patch cascade-walker.ts ───────────────────────────────────
let walker = fs.readFileSync(WALKER_PATH, "utf8");

// Walker edit 1: replace the type exports section
const W_FIND_1 = `export type NodeState = 'ASSIGNED' | 'PHANTOM' | 'INHERITED'
export type SourceLevel = 'community' | 'municipality' | 'area' | 'tenant'
export type BadgeState = 'active' | 'inherited' | 'phantom'

export interface GeoCardLite {
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

const W_REPL_1 = `import type { GeoCard, NodeState, SourceLevel, BadgeState } from './cascade-types'
export type { NodeState, SourceLevel, BadgeState } from './cascade-types'
export type { GeoCard } from './cascade-types'`;

if (walker.split(W_FIND_1).length - 1 !== 1) {
  console.error("MISS walker edit 1: type block anchor not unique or absent");
  process.exit(1);
}
walker = walker.replace(W_FIND_1, W_REPL_1);
console.log("  walker edit 1: deleted GeoCardLite + type exports, replaced with re-export from cascade-types");

// Walker edit 2: rename all remaining GeoCardLite usages to GeoCard
const before2 = walker;
walker = walker.replace(/GeoCardLite/g, "GeoCard");
const renamed = (before2.match(/GeoCardLite/g) || []).length;
if (renamed === 0) {
  console.error("MISS walker edit 2: no GeoCardLite usages found (expected 12 after edit 1)");
  process.exit(1);
}
console.log("  walker edit 2: renamed " + renamed + " GeoCardLite references to GeoCard");

fs.writeFileSync(WALKER_PATH, walker, "utf8");

// ─── Step 3: Patch TerritoryCascadeChart.tsx ───────────────────────────
let chart = fs.readFileSync(CHART_PATH, "utf8");

// Chart edit 1: delete the inline GeoCard interface and the existing walker imports,
// rebuild the imports block to pull types from cascade-types
const C_FIND_1 = `interface GeoCard {
  id: string; agent_id: string; scope: string
  area_id: string | null; municipality_id: string | null
  community_id: string | null; neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean; homes_access: boolean; buildings_access: boolean
  buildings_mode: string
}`;

const C_REPL_1 = `// C2c: GeoCard moved to cascade-types.ts (shared with walker)
import type { GeoCard } from './cascade-types'`;

if (chart.split(C_FIND_1).length - 1 !== 1) {
  console.error("MISS chart edit 1: inline GeoCard interface anchor not unique or absent");
  process.exit(1);
}
chart = chart.replace(C_FIND_1, C_REPL_1);
console.log("  chart edit 1: deleted inline GeoCard, imported from cascade-types");

// Chart edit 2: clean up walker imports -- remove NodeState/SourceLevel/BadgeState
// from the walker import since they now flow through cascade-types via walker re-export.
// (Walker still re-exports them, so existing chart code keeps working; but the chart
// can simplify by importing types directly from cascade-types.)
// HOWEVER: the chart's existing import line is `import { ... type WalkResult, type NodeState, ... } from './cascade-walker'`
// We leave that alone -- walker re-exports the types, so the import still resolves.
// No edit needed here.

fs.writeFileSync(CHART_PATH, chart, "utf8");

// ─── Done ───────────────────────────────────────────────────────────────
console.log("");
console.log("Artifact A complete:");
console.log("  + cascade-types.ts (new canonical type module)");
console.log("  + cascade-walker.ts: GeoCardLite -> GeoCard (12 refs), types re-exported");
console.log("  + TerritoryCascadeChart.tsx: inline GeoCard removed, imported from cascade-types");
console.log("");
console.log("Next: npx tsc --noEmit");