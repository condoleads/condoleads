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
  parent_id: string | null
  profile_photo_url: string | null
  lead_count_30d: number
}
interface ApiEdge { id: string; source: string; target: string; type: string }
interface ApiResponse { nodes: ApiNode[]; edges: ApiEdge[] }

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

function ChartInner() {
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

  const nodeTypes = useMemo(() => ({ agent: AgentNodeCard }), [])

  // Load tree data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin-homes/agents/tree-data', { cache: 'no-store' })
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
  }, [])

  // Build RF nodes + edges with layout + filters applied
  useEffect(() => {
    if (!api) return
    const search_lc = search.trim().toLowerCase()
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
          profile_photo_url: n.profile_photo_url,
          lead_count_30d: n.lead_count_30d,
          dimmed,
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
  }, [api, search, roleFilter, sellingOnly, fitView])

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
    setSelectedAgentId(node.id)
  }, [])

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
      // Reload tree
      const r2 = await fetch('/api/admin-homes/agents/tree-data', { cache: 'no-store' })
      const fresh: ApiResponse = await r2.json()
      setApi(fresh)
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

  if (loading) return <div className="p-8 text-gray-500">Loading org chart...</div>
  if (error) return <div className="p-8 text-red-700">Error: {error}</div>
  if (!api || api.nodes.length === 0) return <div className="p-8 text-gray-500">No agents to display.</div>

  return (
    <div className="relative w-full h-[calc(100vh-160px)] bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
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

export default function AgentOrgChart() {
  return (
    <ReactFlowProvider>
      <ChartInner />
    </ReactFlowProvider>
  )
}