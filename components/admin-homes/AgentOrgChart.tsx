// components/admin-homes/AgentOrgChart.tsx
// Phase 3.3b — React Flow canvas for the org chart with dagre auto-layout.

'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeMouseHandler,
  applyNodeChanges,
  NodeChange,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'

import AgentNodeCard, { AgentNodeData } from './AgentNodeCard'
import AgentDetailDrawer from './AgentDetailDrawer'

interface ApiNode {
  id: string
  name: string
  role: string
  is_admin: boolean
  is_selling: boolean
  is_active: boolean
  parent_id: string | null
  profile_photo_url: string | null
  lead_count_30d: number
  // W-HOUSE-ACCOUNT UNIT 2: true when a.id === tenant.default_agent_id.
  is_house_account: boolean
}
interface ApiEdge { id: string; source: string; target: string; type: string }
interface ApiTenant { id: string; default_agent_id: string | null }
interface ApiResponse {
  nodes: ApiNode[]
  edges: ApiEdge[]
  // W-HOUSE-ACCOUNT UNIT 2: per-tenant context. tenant.id is the PATCH target
  // for inline house-account assignment; tenant.default_agent_id drives the
  // "Current house account" disabled state on the drawer action.
  tenant: ApiTenant
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 70

function applyDagreLayout(rfNodes: Node[], rfEdges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 })

  for (const n of rfNodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const e of rfEdges) g.setEdge(e.source, e.target)
  dagre.layout(g)

  return rfNodes.map(n => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    }
  })
}

const ALL_ROLES = ['tenant_admin', 'assistant', 'support', 'area_manager', 'manager', 'managed', 'agent']

// W-COCKPIT P-B-1: optional props for cockpit context. When omitted (standalone
// /admin-homes/agents/tree route), the chart falls back to its original behavior:
// tenant from user session, node click opens detail drawer.
interface Props {
  tenantId?: string
  onAgentSelect?: (agentId: string) => void
  // W-COCKPIT P-B-1: parent-driven selection. When omitted (standalone), the
  // local selectedAgentId state (drawer trigger) is used as the selection source.
  selectedAgentId?: string | null
}

function ChartInner({ tenantId, onAgentSelect, selectedAgentId: externalSelectedAgentId }: Props) {
  const [api, setApi] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set(ALL_ROLES))
  const [sellingOnly, setSellingOnly] = useState(false)
  const [reassign, setReassign] = useState<{ child: string; childName: string; newParent: string; newParentName: string } | null>(null)
  const [reassigning, setReassigning] = useState(false)
  const { fitView } = useReactFlow()

  // W-COCKPIT P-B-1: prefer external (spine) selection; fall back to local
  // (drawer-driven) selection. Either source paints the ring on the matching node.
  const effectiveSelectedAgentId = externalSelectedAgentId ?? selectedAgentId

  const nodeTypes = useMemo(() => ({ agent: AgentNodeCard }), [])

  // Load tree data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // W-COCKPIT P-B-1: thread tenantId for platform-admin cockpit context.
        const treeUrl = '/api/admin-homes/agents/tree-data'
          + (tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '')
        const res = await fetch(treeUrl, { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        const data: ApiResponse = await res.json()
        if (!cancelled) setApi(data)
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tenantId])

  // Build RF nodes + edges with layout + filters applied
  useEffect(() => {
    if (!api) return
    const search_lc = search.trim().toLowerCase()
    // W-HOUSE-ACCOUNT UNIT 5+7: UNIT 5 wrongly excluded tenant_admin from
    // the visible set, which decapitated anyone whose parent_id pointed at
    // the owner (their incoming edge was dropped → dagre placed them at the
    // top as an orphan). UNIT 7 puts the owner back into the visible set so
    // reports nest under the owner naturally. The owner overlay (top-right
    // of the canvas, see render below) stays as a useful label — the owner
    // is now shown BOTH in the header AND as a real tree node.
    const visible = new Set(
      api.nodes
        .filter(n => roleFilter.has(n.role))
        .filter(n => !sellingOnly || n.is_selling)
        .map(n => n.id)
    )

    const rfNodes: Node[] = api.nodes
      .filter(n => visible.has(n.id))
      .map(n => {
        const dimmed = search_lc.length > 0 && !n.name.toLowerCase().includes(search_lc)
        const data: AgentNodeData = {
          name: n.name,
          role: n.role,
          is_admin: n.is_admin,
          is_selling: n.is_selling,
          is_active: n.is_active,
          profile_photo_url: n.profile_photo_url,
          lead_count_30d: n.lead_count_30d,
          dimmed,
          // W-COCKPIT P-B-1: selected drives the green ring on the node.
          // In cockpit context, parent passes selectedAgentId via prop; in
          // standalone context, local selectedAgentId (drawer state) is used.
          selected: n.id === effectiveSelectedAgentId,
          // W-HOUSE-ACCOUNT UNIT 2: per-tenant house-account marker.
          is_house_account: n.is_house_account,
        }
        return {
          id: n.id,
          type: 'agent',
          position: { x: 0, y: 0 },
          data,
          draggable: true,
        }
      })

    const rfEdges: Edge[] = api.edges
      .filter(e => visible.has(e.source) && visible.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      }))

    const laid = applyDagreLayout(rfNodes, rfEdges)
    setNodes(laid)
    setEdges(rfEdges)
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
  }, [api, search, roleFilter, sellingOnly, fitView, effectiveSelectedAgentId])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(ns => applyNodeChanges(changes, ns))
  }, [])

  const onNodeDragStop: NodeMouseHandler = useCallback((_evt, node) => {
    if (!api) return
    // Find which other node center is closest to dropped position; if within radius -> reassign
    const dropped = node
    let nearest: Node | null = null
    let nearestDist = Infinity
    for (const other of nodes) {
      if (other.id === dropped.id) continue
      const dx = (other.position.x + NODE_WIDTH / 2) - (dropped.position.x + NODE_WIDTH / 2)
      const dy = (other.position.y + NODE_HEIGHT / 2) - (dropped.position.y + NODE_HEIGHT / 2)
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < nearestDist) { nearest = other; nearestDist = dist }
    }
    // Only treat as drop-onto if within 100px (otherwise it's just a layout drag)
    if (nearest && nearestDist < 100) {
      const childApi = api.nodes.find(n => n.id === dropped.id)
      const parentApi = api.nodes.find(n => n.id === nearest!.id)
      if (childApi && parentApi && childApi.parent_id !== parentApi.id) {
        setReassign({
          child: childApi.id,
          childName: childApi.name,
          newParent: parentApi.id,
          newParentName: parentApi.name,
        })
        return
      }
    }
    // Otherwise re-snap to dagre layout
    setNodes(prev => applyDagreLayout(prev, edges))
  }, [api, nodes, edges])

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    // W-COCKPIT P-B-1: in cockpit context, pipe clicks to spine setAgentId.
    // In standalone context, open the existing detail drawer.
    if (onAgentSelect) {
      onAgentSelect(node.id)
    } else {
      setSelectedAgentId(node.id)
    }
  }, [onAgentSelect])

  // W-HOUSE-ACCOUNT UNIT 2: shared tree-reload helper (used by confirmReassign
  // and by the drawer's house-account assignment success path).
  const reloadTree = useCallback(async () => {
    const treeReloadUrl = '/api/admin-homes/agents/tree-data'
      + (tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '')
    const r2 = await fetch(treeReloadUrl, { cache: 'no-store' })
    const fresh: ApiResponse = await r2.json()
    setApi(fresh)
  }, [tenantId])

  async function confirmReassign() {
    if (!reassign) return
    setReassigning(true)
    try {
      const res = await fetch(`/api/admin-homes/agents/${reassign.child}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: reassign.newParent }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Reassign failed (${res.status})`)
      }
      await reloadTree()
      setReassign(null)
    } catch (e: any) {
      setError(e.message || 'Reassign failed')
    } finally {
      setReassigning(false)
    }
  }

  function toggleRole(role: string) {
    setRoleFilter(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role); else next.add(role)
      return next
    })
  }

  const selectedData = selectedAgentId ? nodes.find(n => n.id === selectedAgentId)?.data as AgentNodeData | undefined : undefined

  // W-HOUSE-ACCOUNT UNIT 5: owner(s) for the header overlay. tenant_admin
  // agents are surfaced here, not as tree nodes. Multi-tenant safe — driven
  // by role only.
  const owners = (api?.nodes || []).filter(n => n.role === 'tenant_admin')
  const tenantDefaultAgentId = api?.tenant.default_agent_id ?? null

  if (loading) return <div className="p-8 text-gray-500">Loading org chart...</div>
  if (error) return <div className="p-8 text-red-700">Error: {error}</div>
  if (!api || api.nodes.length === 0) return <div className="p-8 text-gray-500">No agents to display.</div>

  return (
    <div className="relative w-full h-[calc(100vh-160px)] bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
      {/* W-HOUSE-ACCOUNT UNIT 5: owner overlay (top-right). Sits above the
          ReactFlow canvas; tenant owner(s) shown separately from the tree. */}
      {owners.length > 0 && (
        <div className="absolute top-3 right-3 z-10 bg-white border border-purple-200 rounded-md shadow-sm p-3 flex flex-col gap-2 max-w-[260px]">
          <p className="text-[10px] uppercase tracking-wide text-purple-700 font-semibold">Tenant Owner</p>
          {owners.map(o => {
            const isHouse = tenantDefaultAgentId !== null && o.id === tenantDefaultAgentId
            return (
              <div key={o.id} className="flex items-center gap-2">
                {o.profile_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.profile_photo_url} alt={o.name} className="w-8 h-8 rounded-full object-cover bg-gray-100" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-700 text-white flex items-center justify-center text-xs font-semibold">
                    {(o.name || '?').charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-gray-900 truncate">{o.name}</div>
                  {isHouse && (
                    <div className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                      House Account
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="absolute top-3 left-3 z-10 bg-white border border-gray-200 rounded-md shadow-sm p-2 flex items-center gap-2 flex-wrap max-w-[680px]">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="px-2 py-1 text-sm border border-gray-300 rounded w-44"
        />
        <div className="flex gap-1 flex-wrap">
          {ALL_ROLES.map(r => (
            <button
              key={r}
              onClick={() => toggleRole(r)}
              className={`text-[10px] px-2 py-1 rounded-full border ${
                roleFilter.has(r)
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'bg-gray-50 border-gray-300 text-gray-500'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-700 ml-2">
          <input type="checkbox" checked={sellingOnly} onChange={e => setSellingOnly(e.target.checked)} />
          Selling only
        </label>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      <AgentDetailDrawer
        agentId={selectedAgentId}
        data={selectedData ?? null}
        onClose={() => setSelectedAgentId(null)}
        // W-HOUSE-ACCOUNT UNIT 2: tenant context for inline house-account
        // assignment. tenantIdForActions is the PATCH target — comes from the
        // API response, not props, so the standalone /agents/tree route (which
        // mounts AgentOrgChart with no tenantId prop) works the same as the
        // cockpit (which does). currentHouseAccountId disables the button on
        // the agent who already holds it.
        tenantIdForActions={api?.tenant.id ?? null}
        currentHouseAccountId={api?.tenant.default_agent_id ?? null}
        onHouseAccountChanged={reloadTree}
      />

      {reassign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reassign parent?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Move <strong>{reassign.childName}</strong> to report to{' '}
              <strong>{reassign.newParentName}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReassign(null)}
                disabled={reassigning}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmReassign}
                disabled={reassigning}
                className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
              >
                {reassigning ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgentOrgChart(props: Props) {
  return (
    <ReactFlowProvider>
      <ChartInner {...props} />
    </ReactFlowProvider>
  )
}