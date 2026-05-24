'use client'
// components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx
// W-COCKPIT P-B-2 Commit 2b -- 2D cascade chart with accountability:
//   ASSIGNED / PHANTOM / INHERITED node states + cascade walker + coverage summary.
// Commit 2a baseline (drag-to-reassign + async queue polling) preserved unchanged.
//
// Mirrors P-B-1 AgentOrgChart pattern: React Flow + dagre auto-layout,
// onNodeDragStop with proximity-based drop detection, confirm modal,
// tenant_id query-string scoping.
//
// Layout: tenant default at top, geo cards below (dagre TB), agent
// drop-targets on right sidebar. Drop a geo node onto an agent node
// to upsert that geo's card with the new agent.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  useReactFlow, ReactFlowProvider, Node, Edge, NodeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import { MapPin, Building2, Home, User, AlertCircle } from 'lucide-react'
import {
  buildContext, walkArea, walkMuni, walkComm, computeSummary,
  type WalkResult, type NodeState, type SourceLevel, type BadgeState,
  type SummaryCounts,
} from './cascade-walker'
import TerritoryCoverageSummary from './TerritoryCoverageSummary'

interface Agent {
  id: string; full_name: string; email: string; is_selling: boolean; is_active: boolean
}
interface GeoCard {
  id: string; agent_id: string; scope: string
  area_id: string | null; municipality_id: string | null
  community_id: string | null; neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean; homes_access: boolean; buildings_access: boolean
  buildings_mode: string
}
interface CascadeData {
  tenant: { id: string; name: string; default_agent_id: string | null }
  agents: Agent[]
  sellingAgentsCount: number
  geo: {
    areas: Array<{ id: string; name: string; slug: string | null }>
    municipalities: Array<{ id: string; name: string; slug: string | null; area_id: string }>
    communities: Array<{ id: string; name: string; slug: string | null; municipality_id: string }>
    neighbourhoods: Array<{ id: string; name: string; slug: string | null; area_id: string }>
  }
  cards: { geo: GeoCard[]; buildings: any[]; listings: any[] }
  counts: any
}

interface NodeData {
  kind: 'tenant' | 'area' | 'muni' | 'comm' | 'nbhd' | 'agent'
  label: string
  sublabel?: string
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
}

const NODE_W = 220
const NODE_H = 64

function layout(nodes: Node<NodeData>[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return nodes.map(n => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } }
  })
}

function badgePillCls(state?: BadgeState): string {
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
    headerText = 'ASSIGNED — ' + (data.effectiveAgentName || '')
  } else if (s === 'PHANTOM') {
    headerText = 'PHANTOM — card has no access flags'
  } else if (s === 'INHERITED') {
    headerText = 'inherits ' + (data.effectiveAgentName || '') + ' (from ' + (data.sourceLevel || 'tenant') + ')'
  } else {
    headerText = data.agentName || ''
  }

  return (
    <div className={`rounded-md px-2.5 py-1.5 shadow-sm ${baseCls} ${dimCls} ${hitCls}`} style={{ width: NODE_W }}>
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
          <span className={`text-[9px] px-1 rounded border ${badgePillCls(data.accessBadges.condo)}`}>condo</span>
          <span className={`text-[9px] px-1 rounded border ${badgePillCls(data.accessBadges.homes)}`}>homes</span>
          <span className={`text-[9px] px-1 rounded border ${badgePillCls(data.accessBadges.bldg)}`}>bldg</span>
        </div>
      )}
    </div>
  )
}

function AgentNode({ data }: { data: NodeData }) {
  return (
    <div className="border-2 border-blue-400 bg-blue-50 rounded-md px-3 py-2 shadow-sm" style={{ width: NODE_W }}>
      <div className="flex items-center gap-1.5">
        <User className="w-3.5 h-3.5 text-blue-700" />
        <span className="text-xs font-semibold text-blue-900 truncate">{data.label}</span>
      </div>
      <div className="text-[10px] text-blue-700">
        {data.agentSelling ? 'selling' : 'not selling'}
      </div>
    </div>
  )
}

const nodeTypes = { geo: GeoNode, agent: AgentNode }

interface Props { tenantId: string; tenantName: string }

function ChartInner({ tenantId, tenantName }: Props) {
  const [data, setData] = useState<CascadeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [reassign, setReassign] = useState<{ geoId: string; geoName: string; scope: string; agentId: string; agentName: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [queueDepth, setQueueDepth] = useState<number | null>(null)
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
  }>>([])

  async function drainQueue() {
    try {
      const res = await fetch('/api/admin-homes/territory/reroll-worker?tenant_id=' + encodeURIComponent(tenantId), { method: 'POST' })
      const j = await res.json()
      const pending = (j.pending || 0) + (j.processing || 0)
      setQueueDepth(pending)
      if (pending > 0) {
        pollTimer.current = setTimeout(drainQueue, 1500)
      } else {
        pollTimer.current = null
        await fetchData()
      }
    } catch (e) {
      // Stop polling on error; surface but don't crash.
      setQueueDepth(null)
    }
  }

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])
  const { fitView } = useReactFlow()

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const url = '/api/admin-homes/territory/cascade-tree?tenant_id=' + encodeURIComponent(tenantId)
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch ' + res.status)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message || 'fetch failed')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { fetchData() }, [fetchData])

  // Build nodes + edges from data (C2b: walker-driven).
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
    }

    // Only show areas that have at least one descendant card OR a direct card.
    // Prevents the 5,000-node soup; operators care about claimed/active geos.
    const interestingAreaIds = new Set<string>()
    for (const c of data.cards.geo) {
      if (c.area_id) interestingAreaIds.add(c.area_id)
      if (c.municipality_id) {
        const m = data.geo.municipalities.find(x => x.id === c.municipality_id)
        if (m) interestingAreaIds.add(m.area_id)
      }
      if (c.community_id) {
        const co = data.geo.communities.find(x => x.id === c.community_id)
        if (co) {
          const m = data.geo.municipalities.find(x => x.id === co.municipality_id)
          if (m) interestingAreaIds.add(m.area_id)
        }
      }
      if (c.neighbourhood_id) {
        const nb = data.geo.neighbourhoods.find(x => x.id === c.neighbourhood_id)
        if (nb) interestingAreaIds.add(nb.area_id)
      }
    }
    // Always show at least one area if tenant has zero cards (for drag-target visibility).
    if (interestingAreaIds.size === 0 && data.geo.areas.length > 0) {
      interestingAreaIds.add(data.geo.areas[0].id)
    }

    const ns: Node<NodeData>[] = []
    const es: Edge[] = []

    // Tenant root node.
    const defaultAgent = data.tenant.default_agent_id ? agentById.get(data.tenant.default_agent_id) : null
    const sellingAgents = data.agents.filter(a => a.is_selling)
    const tenantSublabel = defaultAgent
      ? `default: ${defaultAgent.full_name}`
      : data.sellingAgentsCount === 0
        ? 'NO SELLING AGENTS'
        : data.sellingAgentsCount === 1
          ? `default: ${sellingAgents[0].full_name}`
          : `equal-distribute over ${data.sellingAgentsCount}`
    ns.push({
      id: 'tenant',
      type: 'geo',
      position: { x: 0, y: 0 },
      data: { kind: 'tenant', label: tenantName, sublabel: tenantSublabel, hasCard: true, agentName: tenantSublabel },
      draggable: false,
    })

    // Areas + descendants (C2b: walker-driven node states + badges + highlights).
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
    setSummary(sum)

    // Agent drop-target sidebar (positioned to the right).
    const agentX = 800
    let agentY = 0
    for (const a of data.agents.filter(a => a.is_active)) {
      ns.push({
        id: 'agent:' + a.id,
        type: 'agent',
        position: { x: agentX, y: agentY },
        data: { kind: 'agent', label: a.full_name, hasCard: true, agentSelling: a.is_selling, sublabel: a.email },
        draggable: false,
      })
      agentY += 90
    }

    // Layout geo subtree only; agents stay parked.
    const geoNodes = ns.filter(n => n.data.kind !== 'agent')
    const agentNodes = ns.filter(n => n.data.kind === 'agent')
    const laidGeo = layout(geoNodes, es)
    setNodes([...laidGeo, ...agentNodes])
    setEdges(es)
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans])

  // Drop detection: when a geo node is dropped near an agent node, propose reassign.
  const onNodeDragStop: NodeMouseHandler = useCallback((_evt, node) => {
    if (node.data.kind === 'agent' || node.data.kind === 'tenant') return
    if (!node.data.geoId || !node.data.scope) return
    // Find nearest agent node within radius.
    const dropped = node
    let nearest: Node<NodeData> | null = null
    let minDist = Infinity
    for (const n of nodes) {
      if (n.data.kind !== 'agent') continue
      const dx = (n.position.x + NODE_W / 2) - (dropped.position.x + NODE_W / 2)
      const dy = (n.position.y + NODE_H / 2) - (dropped.position.y + NODE_H / 2)
      const d = Math.hypot(dx, dy)
      if (d < minDist) { minDist = d; nearest = n }
    }
    if (!nearest || minDist > 150) {
      // Not close enough -- snap back via re-render.
      fetchData()
      return
    }
    const agentId = nearest.id.replace(/^agent:/, '')
    setReassign({
      geoId: node.data.geoId,
      geoName: node.data.label,
      scope: node.data.scope,
      agentId,
      agentName: nearest.data.label,
    })
  }, [nodes, fetchData])

  async function confirmReassign() {
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

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading cascade...</div>
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
    <div className="relative" style={{ height: '55vh' }}>
      <div className="absolute top-2 left-2 z-10 bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-600 shadow-sm">
        Drag a geo card onto an agent on the right to reassign.
      </div>
      {queueDepth !== null && queueDepth > 0 && (
        <div className="absolute top-2 right-2 z-10 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 text-xs text-blue-800 shadow-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          Syncing listings... ({queueDepth} job{queueDepth === 1 ? '' : 's'} in queue)
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {reassign && (
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
                  ASSIGNED — {b.agent_name}
                </div>
                <div className="text-[9px] text-gray-500 truncate" title={(b.community_name || '') + ' / ' + (b.municipality_name || '')}>
                  {b.community_name || '(no community)'} / {b.municipality_name || '(no muni)'}
                  {isOrphan && <span className="text-amber-700 ml-1">• orphan</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )}
    </div>
  )
}

export default function TerritoryCascadeChart(props: Props) {
  return (
    <ReactFlowProvider>
      <ChartInner {...props} />
    </ReactFlowProvider>
  )
}