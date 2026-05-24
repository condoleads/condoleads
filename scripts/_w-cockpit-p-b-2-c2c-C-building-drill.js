// scripts/_w-cockpit-p-b-2-c2c-C-building-drill.js
// W-COCKPIT P-B-2 Commit 2c -- Artifact C: building drill-down.
//
// Click a building card -> if its community has an apa card in the tree
// (i.e., a community-scope apa row), scroll canvas to that community node
// and pulse a blue ring on it for 1.5s. If no apa card for that community,
// no-op (orphan markers on the building already explain why).
//
// 5 surgical edits to TerritoryCascadeChart.tsx:
//   C1. Add useReactFlow setCenter to existing destructure
//   C2. Add pulseNodeId state hook
//   C3. Add pulse field to NodeData interface
//   C4. Wire pulse into community-node creation in the node builder
//   C5. Add onClick handler on building cards in the strip
//   C6. Add pulseCls to GeoNode render
//
// (6 edits, not 5 -- C1 + C2 are paired but logically distinct.)
//
// Run: node scripts/_w-cockpit-p-b-2-c2c-C-building-drill.js
// Then: npx tsc --noEmit

const fs = require("fs");

const FILE = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";

if (!fs.existsSync(FILE)) { console.error("MISS: " + FILE); process.exit(1); }

let src = fs.readFileSync(FILE, "utf8");
const before = src;

// ─── C1: extend useReactFlow destructure ─────────────────────────────────
const C1_FIND = `  const { fitView } = useReactFlow()`;
const C1_REPL = `  const { fitView, setCenter } = useReactFlow()`;
if (src.split(C1_FIND).length - 1 !== 1) { console.error("MISS C1: useReactFlow destructure anchor"); process.exit(1); }
src = src.replace(C1_FIND, C1_REPL);
console.log("  C1: setCenter added to useReactFlow destructure");

// ─── C2: add pulseNodeId state next to other UI state ────────────────────
const C2_FIND = `  const [agentFilter, setAgentFilter] = useState<string>('')`;
const C2_REPL = `  const [agentFilter, setAgentFilter] = useState<string>('')
  // C2c: pulse a community node when its building is clicked. Cleared after 1.5s.
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null)`;
if (src.split(C2_FIND).length - 1 !== 1) { console.error("MISS C2: agentFilter anchor"); process.exit(1); }
src = src.replace(C2_FIND, C2_REPL);
console.log("  C2: pulseNodeId state added");

// ─── C3: add pulse field to NodeData ─────────────────────────────────────
const C3_FIND = `  highlightDim?: boolean
  highlightHit?: boolean
}`;
const C3_REPL = `  highlightDim?: boolean
  highlightHit?: boolean
  // C2c:
  pulse?: boolean
}`;
if (src.split(C3_FIND).length - 1 !== 1) { console.error("MISS C3: NodeData closing anchor"); process.exit(1); }
src = src.replace(C3_FIND, C3_REPL);
console.log("  C3: NodeData.pulse field added");

// ─── C4: wire pulse into community node creation ─────────────────────────
// Find the community ns.push block. Add pulse: comm.id === pulseNodeId.
const C4_FIND = `              highlightHit: cHit,
              highlightDim: cDim,
              geoId: comm.id, scope: 'community',
            },
          })`;
const C4_REPL = `              highlightHit: cHit,
              highlightDim: cDim,
              pulse: pulseNodeId === ('comm:' + comm.id),
              geoId: comm.id, scope: 'community',
            },
          })`;
if (src.split(C4_FIND).length - 1 !== 1) { console.error("MISS C4: community ns.push anchor"); process.exit(1); }
src = src.replace(C4_FIND, C4_REPL);
console.log("  C4: pulse wired into community node");

// ─── C5: extend useEffect deps to include pulseNodeId ────────────────────
const C5_FIND = `  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans, agentFilter])`;
const C5_REPL = `  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans, agentFilter, pulseNodeId])`;
if (src.split(C5_FIND).length - 1 !== 1) { console.error("MISS C5: useEffect deps anchor"); process.exit(1); }
src = src.replace(C5_FIND, C5_REPL);
console.log("  C5: useEffect deps include pulseNodeId");

// ─── C6: add pulseCls in GeoNode + onClick on building cards ─────────────
const C6A_FIND = `  const hitCls = data.highlightHit ? 'ring-2 ring-amber-500 ring-offset-1' : ''`;
const C6A_REPL = `  const hitCls = data.highlightHit ? 'ring-2 ring-amber-500 ring-offset-1' : ''
  const pulseCls = data.pulse ? 'ring-4 ring-blue-500 ring-offset-2 animate-pulse' : ''`;
if (src.split(C6A_FIND).length - 1 !== 1) { console.error("MISS C6A: hitCls anchor"); process.exit(1); }
src = src.replace(C6A_FIND, C6A_REPL);
console.log("  C6A: pulseCls added to GeoNode");

// Add pulseCls to the className composition
const C6B_FIND = `    <div className={\`rounded-md px-2.5 py-1.5 shadow-sm \${baseCls} \${dimCls} \${hitCls}\`} style={{ width: NODE_W }}>`;
const C6B_REPL = `    <div className={\`rounded-md px-2.5 py-1.5 shadow-sm \${baseCls} \${dimCls} \${hitCls} \${pulseCls}\`} style={{ width: NODE_W }}>`;
if (src.split(C6B_FIND).length - 1 !== 1) { console.error("MISS C6B: GeoNode className anchor"); process.exit(1); }
src = src.replace(C6B_FIND, C6B_REPL);
console.log("  C6B: pulseCls in className composition");

// ─── C7: onClick handler on building card divs ───────────────────────────
// The card div currently has key, className, title. Add onClick + cursor-pointer.
const C7_FIND = `              <div
                key={b.id}
                className={'flex-shrink-0 w-56 border-2 rounded-md px-2.5 py-1.5 shadow-sm bg-white border-green-500 '
                  + (dim ? 'opacity-30 ' : '')
                  + (hit ? 'ring-2 ring-amber-500 ring-offset-1 ' : '')}
                title={b.building_name}
              >`;
const C7_REPL = `              <div
                key={b.id}
                onClick={() => {
                  // C2c: drill-down. Find the apa community node for this building.
                  // If found, center the canvas on it and pulse for 1.5s.
                  if (!b.community_id) return
                  const hasCommCard = data.cards.geo.some(c =>
                    c.scope === 'community' && c.community_id === b.community_id
                  )
                  if (!hasCommCard) return  // orphan -- no node to scroll to
                  const targetId = 'comm:' + b.community_id
                  const targetNode = nodes.find(n => n.id === targetId)
                  if (targetNode) {
                    setCenter(targetNode.position.x + NODE_W / 2, targetNode.position.y + NODE_H / 2, { zoom: 1, duration: 600 })
                  }
                  setPulseNodeId(targetId)
                  setTimeout(() => setPulseNodeId(null), 1500)
                }}
                className={'flex-shrink-0 w-56 border-2 rounded-md px-2.5 py-1.5 shadow-sm bg-white border-green-500 cursor-pointer hover:shadow-md transition-shadow '
                  + (dim ? 'opacity-30 ' : '')
                  + (hit ? 'ring-2 ring-amber-500 ring-offset-1 ' : '')}
                title={b.community_id ? (b.building_name + ' (click to scroll to community)') : b.building_name}
              >`;
if (src.split(C7_FIND).length - 1 !== 1) { console.error("MISS C7: building card div anchor"); process.exit(1); }
src = src.replace(C7_FIND, C7_REPL);
console.log("  C7: building card onClick + cursor-pointer + hover");

if (src === before) { console.error("MISS: no change applied"); process.exit(1); }

fs.writeFileSync(FILE, src, "utf8");
console.log("");
console.log("Artifact C complete: 7 edits applied (C1, C2, C3, C4, C5, C6A-B, C7).");
console.log("Next: npx tsc --noEmit");