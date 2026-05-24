// scripts/_w-cockpit-p-b-2-c2c-B-agent-filter.js
// W-COCKPIT P-B-2 Commit 2c -- Artifact B: agent filter dropdown.
//
// Adds a single Agent filter above the canvas. When an agent is selected,
// geo nodes whose EFFECTIVE agent (walker output) matches stay at full
// opacity; others dim. Building cards filter against b.agent_id literally
// (no walker for buildings -- the assignment IS the routing).
//
// Reuses existing highlightDim/highlightHit on NodeData so visual treatment
// matches the existing phantom/orphan highlight UX. Coexists with the
// phantom/orphan checkboxes (filters compose: shown = (agent match OR no
// agent filter) AND (phantom match OR no phantom filter) AND ...).
//
// 4 surgical edits to TerritoryCascadeChart.tsx:
//   B1. Add state hook: agentFilter
//   B2. Replace per-node hit/dim computation with composeFilter helper
//   B3. Render filter strip above the canvas
//   B4. Extend useEffect deps + building-strip dim/hit logic
//
// Anchors verified 2026-05-24 post-Artifact-A (HEAD 1838ba7 + types refactor).
//
// Run: node scripts/_w-cockpit-p-b-2-c2c-B-agent-filter.js
// Then: npx tsc --noEmit

const fs = require("fs");

const FILE = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";

if (!fs.existsSync(FILE)) { console.error("MISS: " + FILE); process.exit(1); }

let src = fs.readFileSync(FILE, "utf8");
const before = src;

// ─── B1: Add agentFilter state hook next to highlightPhantoms ────────────
const B1_FIND = `  const [highlightPhantoms, setHighlightPhantoms] = useState(false)
  const [highlightOrphans, setHighlightOrphans] = useState(false)`;
const B1_REPL = `  const [highlightPhantoms, setHighlightPhantoms] = useState(false)
  const [highlightOrphans, setHighlightOrphans] = useState(false)
  // C2c: agent filter (empty string = all agents).
  const [agentFilter, setAgentFilter] = useState<string>('')`;
if (src.split(B1_FIND).length - 1 !== 1) { console.error("MISS B1: state hook anchor"); process.exit(1); }
src = src.replace(B1_FIND, B1_REPL);
console.log("  B1: state hook added");

// ─── B2a: Area node hit/dim computation ──────────────────────────────────
const B2A_FIND = `      const aHit = highlightPhantoms && aWalk.state === 'PHANTOM'
      const aDim = (highlightPhantoms || highlightOrphans) && !aHit && false  // areas never orphan`;
const B2A_REPL = `      // C2c: composite filter (agent + state). hit = matches all active filters; dim = filtered out.
      const aMatchAgent = !agentFilter || aWalk.effectiveAgentId === agentFilter
      const aMatchPhantom = !highlightPhantoms || aWalk.state === 'PHANTOM'
      const aHit = (agentFilter && aMatchAgent && aWalk.state !== 'INHERITED') || (highlightPhantoms && aWalk.state === 'PHANTOM')
      const aDim = (agentFilter && !aMatchAgent) || (highlightPhantoms && !aMatchPhantom)`;
if (src.split(B2A_FIND).length - 1 !== 1) { console.error("MISS B2A: area hit/dim anchor"); process.exit(1); }
src = src.replace(B2A_FIND, B2A_REPL);
console.log("  B2A: area filter logic");

// ─── B2b: Muni node hit/dim ──────────────────────────────────────────────
const B2B_FIND = `        const mHit = highlightPhantoms && mWalk.state === 'PHANTOM'`;
const B2B_REPL = `        const mMatchAgent = !agentFilter || mWalk.effectiveAgentId === agentFilter
        const mMatchPhantom = !highlightPhantoms || mWalk.state === 'PHANTOM'
        const mHit = (agentFilter && mMatchAgent && mWalk.state !== 'INHERITED') || (highlightPhantoms && mWalk.state === 'PHANTOM')
        const mDim = (agentFilter && !mMatchAgent) || (highlightPhantoms && !mMatchPhantom)`;
if (src.split(B2B_FIND).length - 1 !== 1) { console.error("MISS B2B: muni hit anchor"); process.exit(1); }
src = src.replace(B2B_FIND, B2B_REPL);
console.log("  B2B: muni filter logic");

// ─── B2c: Muni highlightDim usage ────────────────────────────────────────
const B2C_FIND = `            highlightDim: (highlightPhantoms && !mHit) || (highlightOrphans && false),`;
const B2C_REPL = `            highlightDim: mDim,`;
if (src.split(B2C_FIND).length - 1 !== 1) { console.error("MISS B2C: muni dim usage"); process.exit(1); }
src = src.replace(B2C_FIND, B2C_REPL);
console.log("  B2C: muni dim wiring");

// ─── B2d: Community node hit/dim ─────────────────────────────────────────
const B2D_FIND = `          const cHit = highlightPhantoms && cWalk.state === 'PHANTOM'`;
const B2D_REPL = `          const cMatchAgent = !agentFilter || cWalk.effectiveAgentId === agentFilter
          const cMatchPhantom = !highlightPhantoms || cWalk.state === 'PHANTOM'
          const cHit = (agentFilter && cMatchAgent && cWalk.state !== 'INHERITED') || (highlightPhantoms && cWalk.state === 'PHANTOM')
          const cDim = (agentFilter && !cMatchAgent) || (highlightPhantoms && !cMatchPhantom)`;
if (src.split(B2D_FIND).length - 1 !== 1) { console.error("MISS B2D: community hit anchor"); process.exit(1); }
src = src.replace(B2D_FIND, B2D_REPL);
console.log("  B2D: community filter logic");

// ─── B2e: Community highlightDim usage ───────────────────────────────────
const B2E_FIND = `              highlightDim: highlightPhantoms && !cHit,`;
const B2E_REPL = `              highlightDim: cDim,`;
if (src.split(B2E_FIND).length - 1 !== 1) { console.error("MISS B2E: community dim usage"); process.exit(1); }
src = src.replace(B2E_FIND, B2E_REPL);
console.log("  B2E: community dim wiring");

// ─── B3: Render filter strip above canvas ────────────────────────────────
const B3_FIND = `      {summary && (
        <TerritoryCoverageSummary
          summary={summary}
          onHighlightPhantoms={setHighlightPhantoms}
          onHighlightOrphans={setHighlightOrphans}
          highlightPhantoms={highlightPhantoms}
          highlightOrphans={highlightOrphans}
        />
      )}
    <div className="relative" style={{ height: '55vh' }}>`;

const B3_REPL = `      {summary && (
        <TerritoryCoverageSummary
          summary={summary}
          onHighlightPhantoms={setHighlightPhantoms}
          onHighlightOrphans={setHighlightOrphans}
          highlightPhantoms={highlightPhantoms}
          highlightOrphans={highlightOrphans}
        />
      )}
      {/* C2c: agent filter strip */}
      {data && data.agents.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="text-gray-600">Filter by agent:</span>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs"
          >
            <option value="">All agents</option>
            {data.agents.filter(a => a.is_active).map(a => (
              <option key={a.id} value={a.id}>{a.full_name}{a.is_selling ? '' : ' (not selling)'}</option>
            ))}
          </select>
          {agentFilter && (
            <button
              type="button"
              onClick={() => setAgentFilter('')}
              className="text-xs text-gray-600 hover:text-gray-900 underline"
            >Clear</button>
          )}
          {agentFilter && (
            <span className="text-gray-500">
              Showing routing for {data.agents.find(a => a.id === agentFilter)?.full_name || 'selected agent'} (others dimmed)
            </span>
          )}
        </div>
      )}
    <div className="relative" style={{ height: '55vh' }}>`;
if (src.split(B3_FIND).length - 1 !== 1) { console.error("MISS B3: render-above-canvas anchor"); process.exit(1); }
src = src.replace(B3_FIND, B3_REPL);
console.log("  B3: filter strip JSX");

// ─── B4: Extend useEffect deps + building strip dim/hit ──────────────────
const B4A_FIND = `  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans])`;
const B4A_REPL = `  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans, agentFilter])`;
if (src.split(B4A_FIND).length - 1 !== 1) { console.error("MISS B4A: useEffect deps"); process.exit(1); }
src = src.replace(B4A_FIND, B4A_REPL);
console.log("  B4A: useEffect deps extended");

// Building strip: filter buildings by literal agent_id (buildings don't cascade).
const B4B_FIND = `            const dim = highlightOrphans && !isOrphan
            const hit = highlightOrphans && isOrphan`;
const B4B_REPL = `            const matchAgent = !agentFilter || b.agent_id === agentFilter
            const dim = (highlightOrphans && !isOrphan) || (agentFilter && !matchAgent)
            const hit = (highlightOrphans && isOrphan) || (agentFilter && matchAgent)`;
if (src.split(B4B_FIND).length - 1 !== 1) { console.error("MISS B4B: building strip dim/hit"); process.exit(1); }
src = src.replace(B4B_FIND, B4B_REPL);
console.log("  B4B: building strip filter wiring");

if (src === before) { console.error("MISS: no change applied"); process.exit(1); }

fs.writeFileSync(FILE, src, "utf8");
console.log("");
console.log("Artifact B complete: 8 edits applied (B1, B2A-E, B3, B4A-B).");
console.log("Next: npx tsc --noEmit");