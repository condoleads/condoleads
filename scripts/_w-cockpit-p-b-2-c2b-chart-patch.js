// scripts/_w-cockpit-p-b-2-c2b-chart-patch.js
// W-COCKPIT P-B-2 Commit 2b: chart-only patch (route + new files already shipped).
//
// 4 surgical edits to TerritoryCascadeChart.tsx:
//   A. Header comment: Commit 2 -> Commit 2b
//   B. Imports: add walker + CoverageSummary
//   C. NodeData interface: add walker output fields
//   D. GeoNode component: 3-state render with badges
//
// Anchors verified via recon 2026-05-24. Fails loud on any miss.
//
// Run: node scripts/_w-cockpit-p-b-2-c2b-chart-patch.js
// Then: npx tsc --noEmit
//
// Rollback: Copy-Item .\components\admin-homes\cockpit\territory\TerritoryCascadeChart.tsx.backup_20260524_111037 .\components\admin-homes\cockpit\territory\TerritoryCascadeChart.tsx -Force

const fs = require("fs");

const FILE = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";

if (!fs.existsSync(FILE)) {
  console.error(`MISS: file not found: ${FILE}`);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const before = src;

// ─── Edit A: header comment ────────────────────────────────────────────
const A_FIND = `'use client'
// components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx
// W-COCKPIT P-B-2 Commit 2 -- 2D cascade chart with drag-to-reassign.`;
const A_REPL = `'use client'
// components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx
// W-COCKPIT P-B-2 Commit 2b -- 2D cascade chart with accountability:
//   ASSIGNED / PHANTOM / INHERITED node states + cascade walker + coverage summary.
// Commit 2a baseline (drag-to-reassign + async queue polling) preserved unchanged.`;

if (src.split(A_FIND).length - 1 !== 1) {
  console.error("MISS edit A: header anchor not unique or absent");
  process.exit(1);
}
src = src.replace(A_FIND, A_REPL);
console.log("  applied edit A: header comment");

// ─── Edit B: imports ────────────────────────────────────────────────────
const B_FIND = `import { MapPin, Building2, Home, User, AlertCircle } from 'lucide-react'`;
const B_REPL = `import { MapPin, Building2, Home, User, AlertCircle } from 'lucide-react'
import {
  buildContext, walkArea, walkMuni, walkComm, computeSummary,
  type WalkResult, type NodeState, type SourceLevel, type BadgeState,
  type SummaryCounts,
} from './cascade-walker'
import TerritoryCoverageSummary from './TerritoryCoverageSummary'`;

if (src.split(B_FIND).length - 1 !== 1) {
  console.error("MISS edit B: imports anchor not unique or absent");
  process.exit(1);
}
src = src.replace(B_FIND, B_REPL);
console.log("  applied edit B: imports");

// ─── Edit C: NodeData interface ────────────────────────────────────────
const C_FIND = `  sublabel?: string
  card?: GeoCard
  agentName?: string
  agentSelling?: boolean
  hasCard: boolean
  warn?: string
  geoId?: string
  scope?: string
}`;
const C_REPL = `  sublabel?: string
  card?: GeoCard
  agentName?: string
  agentSelling?: boolean
  hasCard: boolean
  warn?: string
  geoId?: string
  scope?: string
  // C2b additions:
  nodeState?: NodeState
  effectiveAgentName?: string
  sourceLevel?: SourceLevel
  accessBadges?: { condo: BadgeState; homes: BadgeState; bldg: BadgeState }
  highlightDim?: boolean
  highlightHit?: boolean
}`;

if (src.split(C_FIND).length - 1 !== 1) {
  console.error("MISS edit C: NodeData anchor not unique or absent");
  process.exit(1);
}
src = src.replace(C_FIND, C_REPL);
console.log("  applied edit C: NodeData interface");

// ─── Edit D: GeoNode component ─────────────────────────────────────────
const D_FIND = `function GeoNode({ data }: { data: NodeData }) {
  const color = data.hasCard
    ? 'bg-white border-green-500'
    : 'bg-gray-50 border-gray-300 border-dashed'
  const Icon = data.kind === 'tenant' ? Home
    : data.kind === 'area' ? MapPin
    : data.kind === 'muni' ? Building2
    : MapPin
  return (
    <div className={\`border-2 rounded-md px-3 py-2 shadow-sm \${color}\`} style={{ width: NODE_W }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-xs font-semibold text-gray-800 truncate">{data.label}</span>
      </div>
      <div className="text-[10px] text-gray-600 flex items-center justify-between gap-1">
        <span className="truncate">
          {data.hasCard ? (data.agentName || '\u2014') : (data.sublabel || 'inherits')}
        </span>
        {data.warn && (
          <span className="text-amber-600 flex items-center" title={data.warn}>
            <AlertCircle className="w-3 h-3" />
          </span>
        )}
        {data.agentSelling === false && data.hasCard && (
          <span className="text-red-600 flex items-center" title="agent not selling">
            <AlertCircle className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  )
}`;
const D_REPL = `function badgePillCls(state?: BadgeState): string {
  if (state === 'active')    return 'bg-green-100 text-green-800 border-green-300'
  if (state === 'phantom')   return 'bg-amber-100 text-amber-800 border-amber-300'
  if (state === 'inherited') return 'bg-gray-100 text-gray-600 border-gray-200'
  return 'bg-gray-100 text-gray-400 border-gray-200'
}

function GeoNode({ data }: { data: NodeData }) {
  // C2b: 3-state styling driven by walker output.
  const s = data.nodeState
  const baseCls = s === 'ASSIGNED' ? 'bg-white border-green-500 border-2'
    : s === 'PHANTOM' ? 'bg-amber-50 border-amber-500 border-2'
    : s === 'INHERITED' ? 'bg-gray-50 border-gray-300 border border-dashed'
    : 'bg-white border-gray-300 border-2'
  const dimCls = data.highlightDim ? 'opacity-30' : ''
  const hitCls = data.highlightHit ? 'ring-2 ring-amber-500 ring-offset-1' : ''
  const Icon = data.kind === 'tenant' ? Home
    : data.kind === 'area' ? MapPin
    : data.kind === 'muni' ? Building2
    : MapPin

  let headerText: string
  if (data.kind === 'tenant') {
    headerText = data.sublabel || ''
  } else if (s === 'ASSIGNED') {
    headerText = 'ASSIGNED \u2014 ' + (data.effectiveAgentName || '')
  } else if (s === 'PHANTOM') {
    headerText = 'PHANTOM \u2014 card has no access flags'
  } else if (s === 'INHERITED') {
    headerText = 'inherits ' + (data.effectiveAgentName || '') + ' (from ' + (data.sourceLevel || 'tenant') + ')'
  } else {
    headerText = data.agentName || ''
  }

  return (
    <div className={\`rounded-md px-2.5 py-1.5 shadow-sm \${baseCls} \${dimCls} \${hitCls}\`} style={{ width: NODE_W }}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-800 truncate">{data.label}</span>
        {data.agentSelling === false && s === 'ASSIGNED' && (
          <span className="text-red-600 flex items-center ml-auto" title="agent not selling">
            <AlertCircle className="w-3 h-3" />
          </span>
        )}
      </div>
      <div className="text-[10px] text-gray-600 truncate" title={headerText}>
        {headerText}
      </div>
      {data.accessBadges && data.kind !== 'tenant' && (
        <div className="flex gap-1 mt-1">
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.condo)}\`}>condo</span>
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.homes)}\`}>homes</span>
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.bldg)}\`}>bldg</span>
        </div>
      )}
    </div>
  )
}`;

if (src.split(D_FIND).length - 1 !== 1) {
  console.error("MISS edit D: GeoNode anchor not unique or absent");
  process.exit(1);
}
src = src.replace(D_FIND, D_REPL);
console.log("  applied edit D: GeoNode 3-state render");

if (src === before) {
  console.error("MISS: no edits applied (sanity check)");
  process.exit(1);
}

fs.writeFileSync(FILE, src, "utf8");
console.log("");
console.log("All 4 edits applied. Next: npx tsc --noEmit");