// scripts/_w-cockpit-p-b-2-c2b-runtime-patch.js
// W-COCKPIT P-B-2 Commit 2b: runtime patch.
//
// 2 surgical edits to TerritoryCascadeChart.tsx:
//   R1. Node-builder useEffect: walker-driven NodeData population
//   R2. JSX render: mount TerritoryCoverageSummary + building strip + state hooks
//
// Anchors verified via recon 2026-05-24, post-chart-type-patch.
// Fails loud on any miss.
//
// Run: node scripts/_w-cockpit-p-b-2-c2b-runtime-patch.js
// Then: npx tsc --noEmit
//
// Rollback: Copy-Item .\components\admin-homes\cockpit\territory\TerritoryCascadeChart.tsx.backup_20260524_111037 .\components\admin-homes\cockpit\territory\TerritoryCascadeChart.tsx -Force

const fs = require("fs");

const FILE = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";

if (!fs.existsSync(FILE)) {
  console.error("MISS: file not found: " + FILE);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const before = src;

// ─── Edit R0: add state hooks for highlight toggles + building strip ──
// Insert new state declarations next to the existing queueDepth state.
const R0_FIND = `  const [queueDepth, setQueueDepth] = useState<number | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)`;
const R0_REPL = `  const [queueDepth, setQueueDepth] = useState<number | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // C2b additions: highlight toggles + summary + buildings (normalized).
  const [highlightPhantoms, setHighlightPhantoms] = useState(false)
  const [highlightOrphans, setHighlightOrphans] = useState(false)
  const [summary, setSummary] = useState<SummaryCounts | null>(null)
  const [normalizedBuildings, setNormalizedBuildings] = useState<Array<{
    id: string; agent_id: string; agent_name: string; agent_selling: boolean;
    building_id: string; building_name: string;
    community_id: string | null; community_name: string | null;
    municipality_id: string | null; municipality_name: string | null;
  }>>([])`;

if (src.split(R0_FIND).length - 1 !== 1) {
  console.error("MISS edit R0: queueDepth anchor not unique or absent");
  process.exit(1);
}
src = src.replace(R0_FIND, R0_REPL);
console.log("  applied edit R0: state hooks");

// ─── Edit R1: node-builder useEffect (full rewrite) ───────────────────
const R1_FIND = `  // Build nodes + edges from data.
  useEffect(() => {
    if (!data) return
    const agentById = new Map(data.agents.map(a => [a.id, a]))

    // Build card lookups.
    const areaCardByGeo = new Map<string, GeoCard>()
    const muniCardByGeo = new Map<string, GeoCard>()
    const commCardByGeo = new Map<string, GeoCard>()
    const nbhdCardByGeo = new Map<string, GeoCard>()
    for (const c of data.cards.geo) {
      if (c.scope === 'area' && c.area_id) areaCardByGeo.set(c.area_id, c)
      if (c.scope === 'municipality' && c.municipality_id) muniCardByGeo.set(c.municipality_id, c)
      if (c.scope === 'community' && c.community_id) commCardByGeo.set(c.community_id, c)
      if (c.scope === 'neighbourhood' && c.neighbourhood_id) nbhdCardByGeo.set(c.neighbourhood_id, c)
    }`;

const R1_REPL = `  // Build nodes + edges from data (C2b: walker-driven).
  useEffect(() => {
    if (!data) return
    const agentById = new Map(data.agents.map(a => [a.id, a]))

    // Build cascade walker context (single source of truth for state computation).
    const ctx = buildContext(
      data.cards.geo,
      data.tenant,
      data.agents,
      { municipalities: data.geo.municipalities, communities: data.geo.communities }
    )

    // Build legacy card lookups too (still used by the interestingAreaIds scan).
    const areaCardByGeo = new Map<string, GeoCard>()
    const muniCardByGeo = new Map<string, GeoCard>()
    const commCardByGeo = new Map<string, GeoCard>()
    const nbhdCardByGeo = new Map<string, GeoCard>()
    for (const c of data.cards.geo) {
      if (c.scope === 'area' && c.area_id) areaCardByGeo.set(c.area_id, c)
      if (c.scope === 'municipality' && c.municipality_id) muniCardByGeo.set(c.municipality_id, c)
      if (c.scope === 'community' && c.community_id) commCardByGeo.set(c.community_id, c)
      if (c.scope === 'neighbourhood' && c.neighbourhood_id) nbhdCardByGeo.set(c.neighbourhood_id, c)
    }`;

if (src.split(R1_FIND).length - 1 !== 1) {
  console.error("MISS edit R1: node-builder useEffect anchor not unique or absent");
  process.exit(1);
}
src = src.replace(R1_FIND, R1_REPL);
console.log("  applied edit R1: walker context init");

// ─── Edit R2: area+descendants loop (walker-driven NodeData) ──────────
const R2_FIND = `    // Areas + descendants.
    for (const area of data.geo.areas) {
      if (!interestingAreaIds.has(area.id)) continue
      const aCard = areaCardByGeo.get(area.id)
      const aAgent = aCard ? agentById.get(aCard.agent_id) : null
      ns.push({
        id: 'area:' + area.id, type: 'geo', position: { x: 0, y: 0 },
        data: {
          kind: 'area', label: area.name, hasCard: !!aCard,
          card: aCard, agentName: aAgent?.full_name, agentSelling: aAgent?.is_selling,
          warn: aCard && !aCard.condo_access && !aCard.homes_access && !aCard.buildings_access ? 'no access flags' : undefined,
          geoId: area.id, scope: 'area',
        },
      })
      es.push({ id: 'e:tenant-area:' + area.id, source: 'tenant', target: 'area:' + area.id, type: 'smoothstep' })

      // Munis in this area.
      for (const muni of data.geo.municipalities.filter(m => m.area_id === area.id)) {
        const mCard = muniCardByGeo.get(muni.id)
        // Only show munis that have a card OR have descendants with cards.
        const commsInMuni = data.geo.communities.filter(c => c.municipality_id === muni.id)
        const hasDescendant = commsInMuni.some(c => commCardByGeo.has(c.id))
        if (!mCard && !hasDescendant) continue

        const mAgent = mCard ? agentById.get(mCard.agent_id) : null
        ns.push({
          id: 'muni:' + muni.id, type: 'geo', position: { x: 0, y: 0 },
          data: {
            kind: 'muni', label: muni.name, hasCard: !!mCard,
            card: mCard, agentName: mAgent?.full_name, agentSelling: mAgent?.is_selling,
            warn: mCard && !mCard.condo_access && !mCard.homes_access && !mCard.buildings_access ? 'no access flags' : undefined,
            geoId: muni.id, scope: 'municipality',
          },
        })
        es.push({ id: 'e:area:' + area.id + '-muni:' + muni.id, source: 'area:' + area.id, target: 'muni:' + muni.id, type: 'smoothstep' })

        // Communities with cards.
        for (const comm of commsInMuni) {
          const cCard = commCardByGeo.get(comm.id)
          if (!cCard) continue
          const cAgent = agentById.get(cCard.agent_id)
          ns.push({
            id: 'comm:' + comm.id, type: 'geo', position: { x: 0, y: 0 },
            data: {
              kind: 'comm', label: comm.name, hasCard: true, card: cCard,
              agentName: cAgent?.full_name, agentSelling: cAgent?.is_selling,
              warn: !cCard.condo_access && !cCard.homes_access && !cCard.buildings_access ? 'no access flags' : undefined,
              geoId: comm.id, scope: 'community',
            },
          })
          es.push({ id: 'e:muni:' + muni.id + '-comm:' + comm.id, source: 'muni:' + muni.id, target: 'comm:' + comm.id, type: 'smoothstep' })
        }
      }
    }`;

const R2_REPL = `    // Areas + descendants (C2b: walker-driven node states + badges + highlights).
    const shownAreaIds = new Set<string>()
    const shownMuniIds = new Set<string>()
    const shownCommIds = new Set<string>()

    for (const area of data.geo.areas) {
      if (!interestingAreaIds.has(area.id)) continue
      shownAreaIds.add(area.id)
      const aWalk = walkArea(area.id, ctx)
      const aAgent = aWalk.effectiveAgentId ? agentById.get(aWalk.effectiveAgentId) : null
      const aHit = highlightPhantoms && aWalk.state === 'PHANTOM'
      const aDim = (highlightPhantoms || highlightOrphans) && !aHit && false  // areas never orphan
      ns.push({
        id: 'area:' + area.id, type: 'geo', position: { x: 0, y: 0 },
        data: {
          kind: 'area', label: area.name,
          hasCard: !!aWalk.cardAtThisLevel,
          card: aWalk.cardAtThisLevel || undefined,
          agentName: aAgent?.full_name,
          agentSelling: aAgent?.is_selling,
          nodeState: aWalk.state,
          effectiveAgentName: aWalk.effectiveAgentName,
          sourceLevel: aWalk.sourceLevel,
          accessBadges: aWalk.accessBadges,
          highlightHit: aHit,
          highlightDim: aDim,
          geoId: area.id, scope: 'area',
        },
      })
      es.push({ id: 'e:tenant-area:' + area.id, source: 'tenant', target: 'area:' + area.id, type: 'smoothstep' })

      // Munis in this area.
      for (const muni of data.geo.municipalities.filter(m => m.area_id === area.id)) {
        const mCard = muniCardByGeo.get(muni.id)
        const commsInMuni = data.geo.communities.filter(c => c.municipality_id === muni.id)
        const hasDescendant = commsInMuni.some(c => commCardByGeo.has(c.id))
        if (!mCard && !hasDescendant) continue
        shownMuniIds.add(muni.id)

        const mWalk = walkMuni(muni.id, ctx)
        const mAgent = mWalk.effectiveAgentId ? agentById.get(mWalk.effectiveAgentId) : null
        const mHit = highlightPhantoms && mWalk.state === 'PHANTOM'
        ns.push({
          id: 'muni:' + muni.id, type: 'geo', position: { x: 0, y: 0 },
          data: {
            kind: 'muni', label: muni.name,
            hasCard: !!mWalk.cardAtThisLevel,
            card: mWalk.cardAtThisLevel || undefined,
            agentName: mAgent?.full_name,
            agentSelling: mAgent?.is_selling,
            nodeState: mWalk.state,
            effectiveAgentName: mWalk.effectiveAgentName,
            sourceLevel: mWalk.sourceLevel,
            accessBadges: mWalk.accessBadges,
            highlightHit: mHit,
            highlightDim: (highlightPhantoms && !mHit) || (highlightOrphans && false),
            geoId: muni.id, scope: 'municipality',
          },
        })
        es.push({ id: 'e:area:' + area.id + '-muni:' + muni.id, source: 'area:' + area.id, target: 'muni:' + muni.id, type: 'smoothstep' })

        // Communities with cards.
        for (const comm of commsInMuni) {
          const cCard = commCardByGeo.get(comm.id)
          if (!cCard) continue
          shownCommIds.add(comm.id)
          const cWalk = walkComm(comm.id, ctx)
          const cAgent = cWalk.effectiveAgentId ? agentById.get(cWalk.effectiveAgentId) : null
          const cHit = highlightPhantoms && cWalk.state === 'PHANTOM'
          ns.push({
            id: 'comm:' + comm.id, type: 'geo', position: { x: 0, y: 0 },
            data: {
              kind: 'comm', label: comm.name,
              hasCard: true,
              card: cWalk.cardAtThisLevel || undefined,
              agentName: cAgent?.full_name,
              agentSelling: cAgent?.is_selling,
              nodeState: cWalk.state,
              effectiveAgentName: cWalk.effectiveAgentName,
              sourceLevel: cWalk.sourceLevel,
              accessBadges: cWalk.accessBadges,
              highlightHit: cHit,
              highlightDim: highlightPhantoms && !cHit,
              geoId: comm.id, scope: 'community',
            },
          })
          es.push({ id: 'e:muni:' + muni.id + '-comm:' + comm.id, source: 'muni:' + muni.id, target: 'comm:' + comm.id, type: 'smoothstep' })
        }
      }
    }

    // C2b: normalize building data from Supabase nested-select shape.
    // The cascade-tree route returns: { ..., buildings: { id, building_name, community_id, communities: { id, name, municipality_id, municipalities: { id, name } } } }
    // (Supabase returns the joined row as a nested object on each agb row.)
    const nbList = (data.cards.buildings || []).map((b: any) => {
      const bld = b.buildings || null
      const co  = bld?.communities || null
      const mu  = co?.municipalities || null
      const agentObj = Array.isArray(b.agents) ? b.agents[0] : b.agents
      return {
        id: b.id,
        agent_id: b.agent_id,
        agent_name: agentObj?.full_name || '(unknown)',
        agent_selling: !!agentObj?.is_selling,
        building_id: b.building_id,
        building_name: bld?.building_name || b.building_id,
        community_id: bld?.community_id || null,
        community_name: co?.name || null,
        municipality_id: co?.municipality_id || null,
        municipality_name: mu?.name || null,
      }
    })
    setNormalizedBuildings(nbList)

    // C2b: compute summary from walker.
    const sum = computeSummary(
      data.cards.geo,
      nbList,
      data.cards.listings || [],
      ctx,
      shownAreaIds,
      shownMuniIds,
      shownCommIds
    )
    setSummary(sum)`;

if (src.split(R2_FIND).length - 1 !== 1) {
  console.error("MISS edit R2: area+descendants block anchor not unique or absent");
  process.exit(1);
}
src = src.replace(R2_FIND, R2_REPL);
console.log("  applied edit R2: walker-driven node builder + summary computation");

// ─── Edit R3: useEffect deps array — add highlight toggles ─────────────
// The deps array currently is [data, tenantName, setNodes, setEdges, fitView].
// Add highlightPhantoms and highlightOrphans so highlights re-render when toggled.
const R3_FIND = `  }, [data, tenantName, setNodes, setEdges, fitView])`;
const R3_REPL = `  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans])`;

if (src.split(R3_FIND).length - 1 !== 1) {
  console.error("MISS edit R3: useEffect deps array anchor not unique or absent");
  process.exit(1);
}
src = src.replace(R3_FIND, R3_REPL);
console.log("  applied edit R3: useEffect deps include highlight toggles");

// ─── Edit R4: render JSX — mount summary above, building strip below ──
const R4_FIND = `  if (loading) return <div className="p-6 text-sm text-gray-500">Loading cascade...</div>
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>
  if (!data) return null

  return (
    <div className="relative" style={{ height: '70vh' }}>
      <div className="absolute top-2 left-2 z-10 bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-600 shadow-sm">
        Drag a geo card onto an agent on the right to reassign.
      </div>`;

const R4_REPL = `  if (loading) return <div className="p-6 text-sm text-gray-500">Loading cascade...</div>
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>
  if (!data) return null

  return (
    <div>
      {summary && (
        <TerritoryCoverageSummary
          summary={summary}
          onHighlightPhantoms={setHighlightPhantoms}
          onHighlightOrphans={setHighlightOrphans}
          highlightPhantoms={highlightPhantoms}
          highlightOrphans={highlightOrphans}
        />
      )}
    <div className="relative" style={{ height: '70vh' }}>
      <div className="absolute top-2 left-2 z-10 bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-600 shadow-sm">
        Drag a geo card onto an agent on the right to reassign.
      </div>`;

if (src.split(R4_FIND).length - 1 !== 1) {
  console.error("MISS edit R4: render JSX opening anchor not unique or absent");
  process.exit(1);
}
src = src.replace(R4_FIND, R4_REPL);
console.log("  applied edit R4: mount TerritoryCoverageSummary above canvas");

// ─── Edit R5: render JSX — close outer wrapper + add building strip ───
// Find the end of the component's return: the </div> that closes the relative canvas
// (right before the reassign modal). The current chart ends with the modal + closing div.
const R5_FIND = `      {reassign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reassign card?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Assign <strong>{reassign.geoName}</strong> ({reassign.scope}) to <strong>{reassign.agentName}</strong>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setReassign(null); fetchData() }}
                disabled={saving}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >Cancel</button>
              <button
                onClick={confirmReassign}
                disabled={saving}
                className="px-3 py-2 bg-green-600 text-white rounded-md text-sm disabled:opacity-50"
              >{saving ? 'Saving...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}`;

const R5_REPL = `      {reassign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reassign card?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Assign <strong>{reassign.geoName}</strong> ({reassign.scope}) to <strong>{reassign.agentName}</strong>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setReassign(null); fetchData() }}
                disabled={saving}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >Cancel</button>
              <button
                onClick={confirmReassign}
                disabled={saving}
                className="px-3 py-2 bg-green-600 text-white rounded-md text-sm disabled:opacity-50"
              >{saving ? 'Saving...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    {/* C2b: building strip below the geo tree. */}
    {normalizedBuildings.length > 0 && (
      <div className="mt-3 bg-white border border-gray-200 rounded-md p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
          Buildings ({normalizedBuildings.length})
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {normalizedBuildings.map(b => {
            const isOrphan = !!b.municipality_id && !data.cards.geo.some(c =>
              (c.scope === 'municipality' && c.municipality_id === b.municipality_id) ||
              (c.scope === 'area' && data.geo.municipalities.find(m => m.id === b.municipality_id)?.area_id === c.area_id)
            )
            const dim = highlightOrphans && !isOrphan
            const hit = highlightOrphans && isOrphan
            return (
              <div
                key={b.id}
                className={'flex-shrink-0 w-56 border-2 rounded-md px-2.5 py-1.5 shadow-sm bg-white border-green-500 '
                  + (dim ? 'opacity-30 ' : '')
                  + (hit ? 'ring-2 ring-amber-500 ring-offset-1 ' : '')}
                title={b.building_name}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Building2 className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-gray-800 truncate">{b.building_name}</span>
                  {!b.agent_selling && (
                    <span className="text-red-600 flex items-center ml-auto" title="agent not selling">
                      <AlertCircle className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-600 truncate">
                  ASSIGNED \u2014 {b.agent_name}
                </div>
                <div className="text-[9px] text-gray-500 truncate" title={(b.community_name || '') + ' / ' + (b.municipality_name || '')}>
                  {b.community_name || '(no community)'} / {b.municipality_name || '(no muni)'}
                  {isOrphan && <span className="text-amber-700 ml-1">\u2022 orphan</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )}
    </div>
  )
}`;

if (src.split(R5_FIND).length - 1 !== 1) {
  console.error("MISS edit R5: render JSX closing anchor not unique or absent");
  process.exit(1);
}
src = src.replace(R5_FIND, R5_REPL);
console.log("  applied edit R5: building strip rendered below canvas");

if (src === before) {
  console.error("MISS: no edits applied (sanity check)");
  process.exit(1);
}

fs.writeFileSync(FILE, src, "utf8");
console.log("");
console.log("All 6 edits applied (R0+R1+R2+R3+R4+R5). Next: npx tsc --noEmit");