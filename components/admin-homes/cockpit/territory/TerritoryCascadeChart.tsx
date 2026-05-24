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
// C2c: GeoCard moved to cascade-types.ts (shared with walker)
import type { GeoCard } from './cascade-types'
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
  // C2c:
  pulse?: boolean
  onAddCard?: () => void
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
  const pulseCls = data.pulse ? 'ring-4 ring-blue-500 ring-offset-2 animate-pulse' : ''
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
    <div className={`relative group rounded-md px-2.5 py-1.5 shadow-sm ${baseCls} ${dimCls} ${hitCls} ${pulseCls}`} style={{ width: NODE_W }}>
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
  // C2c: agent filter (empty string = all agents).
  const [agentFilter, setAgentFilter] = useState<string>('')
  // C2c: pulse a community node when its building is clicked. Cleared after 1.5s.
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
  const [addCardSaving, setAddCardSaving] = useState(false)
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
  const { fitView, setCenter } = useReactFlow()

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
      // C2c: composite filter (agent + state). hit = matches all active filters; dim = filtered out.
      const aMatchAgent = !agentFilter || aWalk.effectiveAgentId === agentFilter
      const aMatchPhantom = !highlightPhantoms || aWalk.state === 'PHANTOM'
      const aHit = (agentFilter && aMatchAgent && aWalk.state !== 'INHERITED') || (highlightPhantoms && aWalk.state === 'PHANTOM')
      const aDim = (agentFilter && !aMatchAgent) || (highlightPhantoms && !aMatchPhantom)
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
          onAddCard: aWalk.state === 'INHERITED' ? () => setAddCardFor({ scope: 'area', geoId: area.id, geoLabel: area.name }) : undefined,
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
        const mMatchAgent = !agentFilter || mWalk.effectiveAgentId === agentFilter
        const mMatchPhantom = !highlightPhantoms || mWalk.state === 'PHANTOM'
        const mHit = (agentFilter && mMatchAgent && mWalk.state !== 'INHERITED') || (highlightPhantoms && mWalk.state === 'PHANTOM')
        const mDim = (agentFilter && !mMatchAgent) || (highlightPhantoms && !mMatchPhantom)
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
            highlightDim: mDim,
            onAddCard: mWalk.state === 'INHERITED' ? () => setAddCardFor({ scope: 'municipality', geoId: muni.id, geoLabel: muni.name }) : undefined,
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
          const cMatchAgent = !agentFilter || cWalk.effectiveAgentId === agentFilter
          const cMatchPhantom = !highlightPhantoms || cWalk.state === 'PHANTOM'
          const cHit = (agentFilter && cMatchAgent && cWalk.state !== 'INHERITED') || (highlightPhantoms && cWalk.state === 'PHANTOM')
          const cDim = (agentFilter && !cMatchAgent) || (highlightPhantoms && !cMatchPhantom)
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
              highlightDim: cDim,
              pulse: pulseNodeId === ('comm:' + comm.id),
              onAddCard: cWalk.state === 'INHERITED' ? () => setAddCardFor({ scope: 'community', geoId: comm.id, geoLabel: comm.name }) : undefined,
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
  }, [data, tenantName, setNodes, setEdges, fitView, highlightPhantoms, highlightOrphans, agentFilter, pulseNodeId])

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
  })()

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
          onOpenCleanup={summary.health.phantomCount > 0 ? () => setCleanupOpen(true) : undefined}
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
              >{bulkInFlight ? `Deactivating ${bulkDone} / ${phantomRows.length}...` : `Deactivate all (${phantomRows.length})`}</button>
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
            const matchAgent = !agentFilter || b.agent_id === agentFilter
            const dim = (highlightOrphans && !isOrphan) || (agentFilter && !matchAgent)
            const hit = (highlightOrphans && isOrphan) || (agentFilter && matchAgent)
            return (
              <div
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