// scripts/_w-cockpit-p-b-2-c2c-E-modals.js
// W-COCKPIT P-B-2 Commit 2c -- Artifact E: cleanup modal + inline Add card modal.
//
// Two modals integrated into the chart:
//
//   1. Phantom cleanup modal -- opened by clicking the "X PHANTOM cards
//      detected" text in TerritoryCoverageSummary. Lists each phantom row
//      with per-row Deactivate / Fix flags buttons + bulk "Deactivate all".
//      Posts to /api/admin-homes/territory/cards/cleanup (Artifact D).
//
//   2. Add card modal -- opened by clicking a "+" button that appears on
//      hover over INHERITED geo nodes. Lets operator pick agent + access
//      flags, then posts to existing /api/admin-homes/territory/cards.
//
// Both modals coexist with the existing reassign modal; only one open at a
// time (their state hooks are independent but render conditionals are
// mutually exclusive in practice).
//
// Edits:
//   E1.  TerritoryCoverageSummary.tsx: add onOpenCleanup prop, wire onto
//        the PHANTOM cards alert text (clickable, underline on hover)
//   E2.  Chart: state hooks (cleanupOpen, addCardOpen, action progress)
//   E3.  Chart: pass onOpenCleanup to <TerritoryCoverageSummary>
//   E4.  Chart: wire onAddCard callback into each INHERITED node's data
//   E5.  GeoNode: render "+" button on hover when data.onAddCard is set
//   E6.  Chart: cleanup modal JSX
//   E7.  Chart: add-card modal JSX
//   E8.  Chart: action handlers (deactivatePhantom, fixPhantomFlags,
//        bulkDeactivate, submitAddCard) + polling integration

const fs = require("fs");

const CHART = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";
const SUMMARY = "components/admin-homes/cockpit/territory/TerritoryCoverageSummary.tsx";

if (!fs.existsSync(CHART)) { console.error("MISS: " + CHART); process.exit(1); }
if (!fs.existsSync(SUMMARY)) { console.error("MISS: " + SUMMARY); process.exit(1); }

// ─── E1: TerritoryCoverageSummary edits ────────────────────────────────
let summary = fs.readFileSync(SUMMARY, "utf8");
const sBefore = summary;

const E1A_FIND = `interface Props {
  summary: SummaryCounts
  onHighlightPhantoms: (on: boolean) => void
  onHighlightOrphans: (on: boolean) => void
  highlightPhantoms: boolean
  highlightOrphans: boolean
}`;
const E1A_REPL = `interface Props {
  summary: SummaryCounts
  onHighlightPhantoms: (on: boolean) => void
  onHighlightOrphans: (on: boolean) => void
  highlightPhantoms: boolean
  highlightOrphans: boolean
  // C2c: clicking the phantom alert text opens the cleanup modal.
  onOpenCleanup?: () => void
}`;
if (summary.split(E1A_FIND).length - 1 !== 1) { console.error("MISS E1A: Props interface"); process.exit(1); }
summary = summary.replace(E1A_FIND, E1A_REPL);
console.log("  E1A: onOpenCleanup added to Props");

const E1B_FIND = `  summary, onHighlightPhantoms, onHighlightOrphans, highlightPhantoms, highlightOrphans,`;
const E1B_REPL = `  summary, onHighlightPhantoms, onHighlightOrphans, highlightPhantoms, highlightOrphans, onOpenCleanup,`;
if (summary.split(E1B_FIND).length - 1 !== 1) { console.error("MISS E1B: destructure"); process.exit(1); }
summary = summary.replace(E1B_FIND, E1B_REPL);
console.log("  E1B: onOpenCleanup destructured");

const E1C_FIND = `              <div className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span><strong>{summary.health.phantomCount}</strong> PHANTOM card{summary.health.phantomCount === 1 ? '' : 's'} -- exists in DB but no access flags; routes nothing.</span>
              </div>`;
const E1C_REPL = `              <div className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {onOpenCleanup ? (
                  <button
                    type="button"
                    onClick={onOpenCleanup}
                    className="text-left hover:underline focus:underline cursor-pointer"
                  >
                    <strong>{summary.health.phantomCount}</strong> PHANTOM card{summary.health.phantomCount === 1 ? '' : 's'} -- exists in DB but no access flags; routes nothing. <span className="text-blue-700 underline">Clean up</span>
                  </button>
                ) : (
                  <span><strong>{summary.health.phantomCount}</strong> PHANTOM card{summary.health.phantomCount === 1 ? '' : 's'} -- exists in DB but no access flags; routes nothing.</span>
                )}
              </div>`;
if (summary.split(E1C_FIND).length - 1 !== 1) { console.error("MISS E1C: alert text"); process.exit(1); }
summary = summary.replace(E1C_FIND, E1C_REPL);
console.log("  E1C: alert text is now clickable when onOpenCleanup is provided");

if (summary === sBefore) { console.error("MISS: summary unchanged"); process.exit(1); }
fs.writeFileSync(SUMMARY, summary, "utf8");

// ─── Chart edits ────────────────────────────────────────────────────────
let chart = fs.readFileSync(CHART, "utf8");
const cBefore = chart;

// E2: state hooks next to pulseNodeId
const E2_FIND = `  // C2c: pulse a community node when its building is clicked. Cleared after 1.5s.
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null)`;
const E2_REPL = `  // C2c: pulse a community node when its building is clicked. Cleared after 1.5s.
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null)
  // C2c: phantom cleanup modal + add-card modal
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [actionInFlight, setActionInFlight] = useState<Record<string, boolean>>({})
  const [bulkInFlight, setBulkInFlight] = useState(false)
  const [bulkDone, setBulkDone] = useState(0)
  const [addCardFor, setAddCardFor] = useState<{ scope: string; geoId: string; geoLabel: string } | null>(null)
  const [addCardAgentId, setAddCardAgentId] = useState<string>('')
  const [addCardCondo, setAddCardCondo] = useState(true)
  const [addCardHomes, setAddCardHomes] = useState(true)
  const [addCardBldg, setAddCardBldg] = useState(true)
  const [addCardSaving, setAddCardSaving] = useState(false)`;
if (chart.split(E2_FIND).length - 1 !== 1) { console.error("MISS E2: pulseNodeId anchor"); process.exit(1); }
chart = chart.replace(E2_FIND, E2_REPL);
console.log("  E2: modal state hooks added");

// E3: NodeData onAddCard field
const E3_FIND = `  // C2c:
  pulse?: boolean
}`;
const E3_REPL = `  // C2c:
  pulse?: boolean
  onAddCard?: () => void
}`;
if (chart.split(E3_FIND).length - 1 !== 1) { console.error("MISS E3: NodeData pulse field anchor"); process.exit(1); }
chart = chart.replace(E3_FIND, E3_REPL);
console.log("  E3: NodeData.onAddCard added");

// E4: GeoNode -- render "+" button on hover for INHERITED nodes
const E4_FIND = `      {data.accessBadges && data.kind !== 'tenant' && (
        <div className="flex gap-1 mt-1">
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.condo)}\`}>condo</span>
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.homes)}\`}>homes</span>
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.bldg)}\`}>bldg</span>
        </div>
      )}
    </div>
  )
}`;
const E4_REPL = `      {data.accessBadges && data.kind !== 'tenant' && (
        <div className="flex gap-1 mt-1">
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.condo)}\`}>condo</span>
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.homes)}\`}>homes</span>
          <span className={\`text-[9px] px-1 rounded border \${badgePillCls(data.accessBadges.bldg)}\`}>bldg</span>
        </div>
      )}
      {data.onAddCard && data.kind !== 'tenant' && s === 'INHERITED' && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); data.onAddCard?.() }}
          className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-600 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-green-700 transition-opacity"
          title="Add card at this level"
        >+</button>
      )}
    </div>
  )
}`;
if (chart.split(E4_FIND).length - 1 !== 1) { console.error("MISS E4: GeoNode close anchor"); process.exit(1); }
chart = chart.replace(E4_FIND, E4_REPL);
console.log("  E4: GeoNode + button on INHERITED nodes");

// E5: GeoNode outer div -- add `group` class for group-hover, add `relative`
const E5_FIND = `    <div className={\`rounded-md px-2.5 py-1.5 shadow-sm \${baseCls} \${dimCls} \${hitCls} \${pulseCls}\`} style={{ width: NODE_W }}>`;
const E5_REPL = `    <div className={\`relative group rounded-md px-2.5 py-1.5 shadow-sm \${baseCls} \${dimCls} \${hitCls} \${pulseCls}\`} style={{ width: NODE_W }}>`;
if (chart.split(E5_FIND).length - 1 !== 1) { console.error("MISS E5: GeoNode outer div anchor"); process.exit(1); }
chart = chart.replace(E5_FIND, E5_REPL);
console.log("  E5: GeoNode outer div has `relative group` for hover+positioning");

// E6: wire onAddCard into each node creation -- need it for area, muni, comm
// For each ns.push that's a geo node, add onAddCard if state is INHERITED.
// Area:
const E6A_FIND = `      ns.push({
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
      })`;
const E6A_REPL = `      ns.push({
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
          onAddCard: aWalk.state === 'INHERITED' ? () => setAddCardFor({ scope: 'area', geoId: area.id, geoLabel: area.name }) : undefined,
          geoId: area.id, scope: 'area',
        },
      })`;
if (chart.split(E6A_FIND).length - 1 !== 1) { console.error("MISS E6A: area ns.push anchor"); process.exit(1); }
chart = chart.replace(E6A_FIND, E6A_REPL);
console.log("  E6A: area onAddCard wired");

// Muni:
const E6B_FIND = `        ns.push({
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
            highlightDim: mDim,
            geoId: muni.id, scope: 'municipality',
          },
        })`;
const E6B_REPL = `        ns.push({
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
            highlightDim: mDim,
            onAddCard: mWalk.state === 'INHERITED' ? () => setAddCardFor({ scope: 'municipality', geoId: muni.id, geoLabel: muni.name }) : undefined,
            geoId: muni.id, scope: 'municipality',
          },
        })`;
if (chart.split(E6B_FIND).length - 1 !== 1) { console.error("MISS E6B: muni ns.push anchor"); process.exit(1); }
chart = chart.replace(E6B_FIND, E6B_REPL);
console.log("  E6B: muni onAddCard wired");

// Community: note current state already has pulse: ... line
const E6C_FIND = `              highlightHit: cHit,
              highlightDim: cDim,
              pulse: pulseNodeId === ('comm:' + comm.id),
              geoId: comm.id, scope: 'community',
            },
          })`;
const E6C_REPL = `              highlightHit: cHit,
              highlightDim: cDim,
              pulse: pulseNodeId === ('comm:' + comm.id),
              onAddCard: cWalk.state === 'INHERITED' ? () => setAddCardFor({ scope: 'community', geoId: comm.id, geoLabel: comm.name }) : undefined,
              geoId: comm.id, scope: 'community',
            },
          })`;
if (chart.split(E6C_FIND).length - 1 !== 1) { console.error("MISS E6C: community ns.push anchor"); process.exit(1); }
chart = chart.replace(E6C_FIND, E6C_REPL);
console.log("  E6C: community onAddCard wired");

// E7: pass onOpenCleanup to TerritoryCoverageSummary
const E7_FIND = `      {summary && (
        <TerritoryCoverageSummary
          summary={summary}
          onHighlightPhantoms={setHighlightPhantoms}
          onHighlightOrphans={setHighlightOrphans}
          highlightPhantoms={highlightPhantoms}
          highlightOrphans={highlightOrphans}
        />
      )}`;
const E7_REPL = `      {summary && (
        <TerritoryCoverageSummary
          summary={summary}
          onHighlightPhantoms={setHighlightPhantoms}
          onHighlightOrphans={setHighlightOrphans}
          highlightPhantoms={highlightPhantoms}
          highlightOrphans={highlightOrphans}
          onOpenCleanup={summary.health.phantomCount > 0 ? () => setCleanupOpen(true) : undefined}
        />
      )}`;
if (chart.split(E7_FIND).length - 1 !== 1) { console.error("MISS E7: Summary mount anchor"); process.exit(1); }
chart = chart.replace(E7_FIND, E7_REPL);
console.log("  E7: onOpenCleanup wired");

// E8: action handlers + modals injected after confirmReassign function
// Find the closing of confirmReassign and add new functions + modal JSX before the return.
const E8_FIND = `  async function confirmReassign() {
    if (!reassign) return
    setSaving(true)
    try {
      const body: any = { scope: reassign.scope, agent_id: reassign.agentId }
      body[reassign.scope + '_id'] = reassign.geoId
      const res = await fetch('/api/admin-homes/territory/cards?tenant_id=' + encodeURIComponent(tenantId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || ('save failed ' + res.status))
      setReassign(null)
      await fetchData()
      // C2a: kick off worker poll if save was queued.
      if (j.queued) {
        setQueueDepth(1)
        if (pollTimer.current) clearTimeout(pollTimer.current)
        pollTimer.current = setTimeout(drainQueue, 200)
      }
    } catch (e: any) {
      setError(e.message || 'save failed')
    } finally {
      setSaving(false)
    }
  }`;

const E8_REPL = `  async function confirmReassign() {
    if (!reassign) return
    setSaving(true)
    try {
      const body: any = { scope: reassign.scope, agent_id: reassign.agentId }
      body[reassign.scope + '_id'] = reassign.geoId
      const res = await fetch('/api/admin-homes/territory/cards?tenant_id=' + encodeURIComponent(tenantId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || ('save failed ' + res.status))
      setReassign(null)
      await fetchData()
      // C2a: kick off worker poll if save was queued.
      if (j.queued) {
        setQueueDepth(1)
        if (pollTimer.current) clearTimeout(pollTimer.current)
        pollTimer.current = setTimeout(drainQueue, 200)
      }
    } catch (e: any) {
      setError(e.message || 'save failed')
    } finally {
      setSaving(false)
    }
  }

  // C2c: phantom cleanup action handlers.
  async function cleanupPhantom(apaId: string, action: 'deactivate' | 'fix_flags'): Promise<boolean> {
    setActionInFlight(p => ({ ...p, [apaId]: true }))
    try {
      const res = await fetch('/api/admin-homes/territory/cards/cleanup?tenant_id=' + encodeURIComponent(tenantId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apa_id: apaId, action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || ('cleanup failed ' + res.status))
        return false
      }
      if (j.queued) {
        setQueueDepth(1)
        if (pollTimer.current) clearTimeout(pollTimer.current)
        pollTimer.current = setTimeout(drainQueue, 200)
      }
      return true
    } catch (e: any) {
      setError(e.message || 'cleanup failed')
      return false
    } finally {
      setActionInFlight(p => { const n = { ...p }; delete n[apaId]; return n })
    }
  }

  async function bulkDeactivatePhantoms(apaIds: string[]) {
    setBulkInFlight(true)
    setBulkDone(0)
    let success = 0
    for (const id of apaIds) {
      const ok = await cleanupPhantom(id, 'deactivate')
      if (ok) success++
      setBulkDone(d => d + 1)
    }
    setBulkInFlight(false)
    await fetchData()
    if (success === apaIds.length) {
      setCleanupOpen(false)
    }
  }

  // C2c: inline add-card submit.
  async function submitAddCard() {
    if (!addCardFor || !addCardAgentId) return
    setAddCardSaving(true)
    try {
      const body: any = {
        scope: addCardFor.scope,
        agent_id: addCardAgentId,
        condo_access: addCardCondo,
        homes_access: addCardHomes,
        buildings_access: addCardBldg,
      }
      body[addCardFor.scope + '_id'] = addCardFor.geoId
      const res = await fetch('/api/admin-homes/territory/cards?tenant_id=' + encodeURIComponent(tenantId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || ('save failed ' + res.status))
      setAddCardFor(null)
      setAddCardAgentId('')
      await fetchData()
      if (j.queued) {
        setQueueDepth(1)
        if (pollTimer.current) clearTimeout(pollTimer.current)
        pollTimer.current = setTimeout(drainQueue, 200)
      }
    } catch (e: any) {
      setError(e.message || 'add card failed')
    } finally {
      setAddCardSaving(false)
    }
  }

  // C2c: compute phantom row list (for cleanup modal) from data.
  const phantomRows = (() => {
    if (!data) return [] as Array<{ apa_id: string; agent_id: string; agent_name: string; community_id: string | null; community_name: string; conflict_label: string | null }>
    const agentById = new Map(data.agents.map(a => [a.id, a]))
    const muniCardByGeo = new Map<string, GeoCard>()
    const areaCardByGeo = new Map<string, GeoCard>()
    for (const c of data.cards.geo) {
      if (c.scope === 'municipality' && c.municipality_id) muniCardByGeo.set(c.municipality_id, c)
      if (c.scope === 'area' && c.area_id) areaCardByGeo.set(c.area_id, c)
    }
    const result = []
    for (const c of data.cards.geo) {
      const isPhantom = !c.condo_access && !c.homes_access && !c.buildings_access
      if (!isPhantom) continue
      let commName = '(unknown)'
      let conflictLabel: string | null = null
      if (c.scope === 'community' && c.community_id) {
        const co = data.geo.communities.find(x => x.id === c.community_id)
        commName = co?.name || '(unknown)'
        if (co) {
          const muniCard = muniCardByGeo.get(co.municipality_id)
          if (muniCard && (muniCard.condo_access || muniCard.homes_access || muniCard.buildings_access) && muniCard.agent_id !== c.agent_id) {
            const m = data.geo.municipalities.find(x => x.id === co.municipality_id)
            const otherAgent = agentById.get(muniCard.agent_id)?.full_name || '(unknown)'
            conflictLabel = 'Fix flags would override ' + (m?.name || 'muni') + ' (' + otherAgent + ')'
          }
        }
      } else if (c.scope === 'area' && c.area_id) {
        const a = data.geo.areas.find(x => x.id === c.area_id)
        commName = (a?.name || '(unknown)') + ' (area)'
      } else if (c.scope === 'municipality' && c.municipality_id) {
        const m = data.geo.municipalities.find(x => x.id === c.municipality_id)
        commName = (m?.name || '(unknown)') + ' (muni)'
      }
      result.push({
        apa_id: c.id,
        agent_id: c.agent_id,
        agent_name: agentById.get(c.agent_id)?.full_name || '(unknown)',
        community_id: c.community_id,
        community_name: commName,
        conflict_label: conflictLabel,
      })
    }
    return result
  })()`;
if (chart.split(E8_FIND).length - 1 !== 1) { console.error("MISS E8: confirmReassign anchor"); process.exit(1); }
chart = chart.replace(E8_FIND, E8_REPL);
console.log("  E8: action handlers + phantom row computation added");

// E9: inject cleanup modal JSX + add-card modal JSX after the reassign modal
const E9_FIND = `      {reassign && (
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
      )}`;

const E9_REPL = `      {reassign && (
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

      {/* C2c: phantom cleanup modal */}
      {cleanupOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Phantom card cleanup</h3>
              <p className="text-xs text-gray-600 mt-1">
                {phantomRows.length} phantom card{phantomRows.length === 1 ? '' : 's'}. Each exists in DB but has no access flags so routes nothing.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {phantomRows.length === 0 ? (
                <div className="text-sm text-gray-500">No phantom cards remaining.</div>
              ) : phantomRows.map(p => {
                const inflight = !!actionInFlight[p.apa_id]
                return (
                  <div key={p.apa_id} className="border border-gray-200 rounded p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{p.community_name} <span className="text-gray-500 font-normal">&middot; {p.agent_name}</span></div>
                        {p.conflict_label && (
                          <div className="text-xs text-amber-700 mt-0.5">&#9888; {p.conflict_label}</div>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          disabled={inflight || bulkInFlight}
                          onClick={async () => { const ok = await cleanupPhantom(p.apa_id, 'deactivate'); if (ok) await fetchData() }}
                          className="px-2.5 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        >{inflight ? 'Working...' : 'Deactivate'}</button>
                        <button
                          type="button"
                          disabled={inflight || bulkInFlight}
                          onClick={async () => { const ok = await cleanupPhantom(p.apa_id, 'fix_flags'); if (ok) await fetchData() }}
                          className={'px-2.5 py-1 text-xs rounded border disabled:opacity-50 ' + (p.conflict_label ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : 'border-gray-300 hover:bg-gray-50')}
                        >Fix flags{p.conflict_label ? ' (conflict)' : ''}</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-5 border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                disabled={phantomRows.length === 0 || bulkInFlight}
                onClick={() => bulkDeactivatePhantoms(phantomRows.map(p => p.apa_id))}
                className="px-3 py-2 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >{bulkInFlight ? \`Deactivating \${bulkDone} / \${phantomRows.length}...\` : \`Deactivate all (\${phantomRows.length})\`}</button>
              <button
                type="button"
                onClick={() => setCleanupOpen(false)}
                disabled={bulkInFlight}
                className="px-3 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* C2c: add-card modal */}
      {addCardFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Add card</h3>
            <p className="text-xs text-gray-600 mb-4">
              <strong>{addCardFor.geoLabel}</strong> ({addCardFor.scope})
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">Agent</label>
                <select
                  value={addCardAgentId}
                  onChange={e => setAddCardAgentId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">Select agent...</option>
                  {data && data.agents.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}{a.is_selling ? '' : ' (not selling)'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Access</label>
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={addCardCondo} onChange={e => setAddCardCondo(e.target.checked)} />
                    Condo
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={addCardHomes} onChange={e => setAddCardHomes(e.target.checked)} />
                    Homes
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={addCardBldg} onChange={e => setAddCardBldg(e.target.checked)} />
                    Buildings
                  </label>
                </div>
                {!addCardCondo && !addCardHomes && !addCardBldg && (
                  <div className="text-[11px] text-amber-700 mt-1">&#9888; No access flags means this card will be a phantom (routes nothing).</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setAddCardFor(null); setAddCardAgentId('') }}
                disabled={addCardSaving}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >Cancel</button>
              <button
                onClick={submitAddCard}
                disabled={addCardSaving || !addCardAgentId}
                className="px-3 py-2 bg-green-600 text-white rounded-md text-sm disabled:opacity-50"
              >{addCardSaving ? 'Creating...' : 'Create card'}</button>
            </div>
          </div>
        </div>
      )}`;

if (chart.split(E9_FIND).length - 1 !== 1) { console.error("MISS E9: reassign modal close anchor"); process.exit(1); }
chart = chart.replace(E9_FIND, E9_REPL);
console.log("  E9: cleanup + add-card modals injected");

if (chart === cBefore) { console.error("MISS: chart unchanged"); process.exit(1); }
fs.writeFileSync(CHART, chart, "utf8");

console.log("");
console.log("Artifact E complete: 12 edits across 2 files (TerritoryCoverageSummary + TerritoryCascadeChart).");
console.log("Next: npx tsc --noEmit");