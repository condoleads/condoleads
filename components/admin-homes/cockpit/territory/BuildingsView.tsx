'use client'
// components/admin-homes/cockpit/territory/BuildingsView.tsx
// W-TERRITORY-MASTER P5.2 + P5.2c-followup-1: Building-tier assignments UI.
// Tree (drill by geo) and Search (address/name) filters compose at the API.
// Multi-select buildings, bulk-assign to one agent.

import { useEffect, useMemo, useState } from 'react'
import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'
import { Building2, Search as SearchIcon, AlertCircle, Loader2, Check, X } from 'lucide-react'

interface AgentOption {
  id: string
  full_name: string
  is_active: boolean
  is_selling: boolean
}

interface BuildingRow {
  id: string
  slug: string
  building_name: string | null
  canonical_address: string
  street_number: string | null
  street_name: string | null
  city_district: string | null
  postal_code: string | null
  total_units: number | null
  year_built: number | null
  community_id: string | null
  card: {
    id: string
    agent_id: string
    agent_name: string | null
    assigned_by: string | null
    created_at: string
    assigned_reason: string | null
  } | null
}

// /geo-tree response shape (matches app/api/admin-homes/geo-tree/route.ts)
interface GeoTreeCommunity { id: string; name: string; homes_count: number }
interface GeoTreeMuni { id: string; name: string; homes_count: number; communities: GeoTreeCommunity[] }
interface GeoTreeArea { id: string; name: string; homes_count: number; municipalities: GeoTreeMuni[] }

interface Props {
  tenantId: string
  actingAgentId: string | null
}

export default function BuildingsView({ tenantId, actingAgentId }: Props) {
  // Tree-filter state (driven by /geo-tree response)
  const [tree, setTree] = useState<GeoTreeArea[]>([])
  const [areaId, setAreaId] = useState('')
  const [muniId, setMuniId] = useState('')
  const [communityId, setCommunityId] = useState('')

  // Search-filter state
  const [searchInput, setSearchInput] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // Shared results state
  const [buildings, setBuildings] = useState<BuildingRow[]>([])
  const [buildingsLoading, setBuildingsLoading] = useState(false)
  const [buildingsError, setBuildingsError] = useState<string | null>(null)

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Assign panel state
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [assignAgentId, setAssignAgentId] = useState('')
  const [assignReason, setAssignReason] = useState('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [assignResult, setAssignResult] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Deactivate state
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  // P5.2c-followup-2: platform admin act-as-agent picker
  const [actAsAgentId, setActAsAgentId] = useState('')
  const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null

  // Load agents once
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin-homes/territory/pins/agents-for-pinning?tenant_id=${encodeURIComponent(tenantId)}`)
        if (!res.ok) return
        const body = await res.json()
        setAgents(body.data || [])
      } catch { /* non-fatal */ }
    })()
  }, [tenantId])

  // Load geo-tree once
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin-homes/geo-tree')
        if (!res.ok) return
        const body = await res.json()
        setTree(body.tree || [])
      } catch { /* non-fatal */ }
    })()
  }, [])

  // Reset child selections when parent changes
  useEffect(() => { setMuniId(''); setCommunityId('') }, [areaId])
  useEffect(() => { setCommunityId('') }, [muniId])

  // Debounce search input
  useEffect(() => {
    const h = setTimeout(() => setSearchDebounced(searchInput.trim()), 300)
    return () => clearTimeout(h)
  }, [searchInput])

  // Load buildings whenever any filter changes (Tree or Search compose)
  useEffect(() => {
    loadBuildings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, muniId, communityId, searchDebounced])

  async function loadBuildings() {
    setBuildings([])
    setSelected(new Set())
    setAssignResult(null)
    setAssignError(null)

    // Compositional filters: scope (any of area/muni/community) and q can each
    // be present or absent independently. API supports both together.
    const scope = communityId ? 'community' : muniId ? 'municipality' : areaId ? 'area' : null
    const scopeId = communityId || muniId || areaId
    const q = searchDebounced.length >= 3 ? searchDebounced : ''

    // Safety guard: empty geo + empty search -> no fetch (avoid 3,383-row pull)
    if (!scope && !q) return

    const params: Record<string, string> = {}
    if (scope && scopeId) {
      params.scope = scope
      params.scope_id = scopeId
    }
    if (q) {
      params.q = q
    }
    await fetchBuildings(params)
  }

  async function fetchBuildings(params: Record<string, string>) {
    setBuildingsLoading(true)
    setBuildingsError(null)
    try {
      const qs = new URLSearchParams({ tenant_id: tenantId, limit: '500', ...params })
      const res = await fetch(`/api/admin-homes/territory/buildings?${qs.toString()}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setBuildings(body.data || [])
    } catch (e: any) {
      setBuildingsError(e.message || 'Failed to load buildings')
    } finally {
      setBuildingsLoading(false)
    }
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllUnassigned() {
    const ids = buildings.filter(b => !b.card).map(b => b.id)
    setSelected(new Set(ids))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function submitAssign() {
    setAssignResult(null)
    setAssignError(null)
    if (!effectiveActingAgentId) {
      setAssignError('You must be logged in as an agent to assign buildings.')
      return
    }
    if (!assignAgentId) {
      setAssignError('Pick an agent')
      return
    }
    if (selected.size === 0) {
      setAssignError('Select at least one building')
      return
    }
    if (assignReason.length > 500) {
      setAssignError('Reason exceeds 500 chars')
      return
    }
    setAssignSubmitting(true)
    try {
      const res = await fetch('/api/admin-homes/territory/buildings/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          agent_id: assignAgentId,
          building_ids: Array.from(selected),
          assigned_by: effectiveActingAgentId,
          reason: assignReason || null
        })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAssignError(body.error || `HTTP ${res.status}`)
        return
      }
      const d = body.data
      setAssignResult(`Assigned ${d.total_created} of ${d.total_requested}. Skipped ${d.total_skipped}.`)
      setSelected(new Set())
      setAssignReason('')
      await loadBuildings()
    } catch (e: any) {
      setAssignError(e.message || 'Failed to assign')
    } finally {
      setAssignSubmitting(false)
    }
  }

  async function deactivateCard(building: BuildingRow) {
    if (!building.card) return
    if (!effectiveActingAgentId) {
      alert('You must be logged in as an agent to unassign buildings.')
      return
    }
    if (!confirm(`Unassign ${building.canonical_address} from ${building.card.agent_name || 'this agent'}? Listings in this building re-route via the geo cascade.`)) {
      return
    }
    setDeactivatingId(building.id)
    try {
      const res = await fetch(`/api/admin-homes/territory/buildings/${building.card.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deactivated_by: effectiveActingAgentId })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `HTTP ${res.status}`)
        return
      }
      await loadBuildings()
    } finally {
      setDeactivatingId(null)
    }
  }

  // Derived dropdown options from tree state
  const currentArea = useMemo(() => tree.find(a => a.id === areaId) || null, [tree, areaId])
  const currentMuni = useMemo(() => currentArea?.municipalities.find(m => m.id === muniId) || null, [currentArea, muniId])

  const activeAgents = useMemo(
    () => agents.filter(a => a.is_active && a.is_selling),
    [agents]
  )

  return (
    <div className="space-y-4">
      {!actingAgentId && (
        <ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />
      )}
      {/* Filters: Tree + Search compose */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Area
            </label>
            <select value={areaId} onChange={e => setAreaId(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded">
              <option value="">- any area -</option>
              {tree.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Municipality</label>
            <select value={muniId} onChange={e => setMuniId(e.target.value)} disabled={!currentArea} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded disabled:bg-gray-100">
              <option value="">- any muni -</option>
              {(currentArea?.municipalities || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Community</label>
            <select value={communityId} onChange={e => setCommunityId(e.target.value)} disabled={!currentMuni} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded disabled:bg-gray-100">
              <option value="">- any community -</option>
              {(currentMuni?.communities || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1 flex items-center gap-1">
              <SearchIcon className="w-3 h-3" /> Search address / name
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="min 3 chars; e.g. yonge, harbour, 2200"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            />
          </div>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          Filters compose. Pick a geo, type a search, or both. Searching within a geo narrows results to that geo.
        </div>
      </div>

      {/* Assign panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Bulk assign</h3>
          <span className="text-xs text-gray-500">{selected.size} selected</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="md:col-span-1">
            <label className="block text-xs text-gray-600 mb-1">Agent</label>
            <select value={assignAgentId} onChange={e => setAssignAgentId(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" disabled={assignSubmitting}>
              <option value="">- pick agent -</option>
              {activeAgents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-600 mb-1">Reason (optional, max 500)</label>
            <input type="text" value={assignReason} onChange={e => setAssignReason(e.target.value)} maxLength={500} placeholder="e.g. C01 luxury condos to King" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" disabled={assignSubmitting} />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              onClick={submitAssign}
              disabled={assignSubmitting || selected.size === 0 || !assignAgentId || !effectiveActingAgentId}
              className="w-full px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {assignSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {assignSubmitting ? 'Assigning...' : `Assign ${selected.size}`}
            </button>
          </div>
        </div>
        {assignError && (
          <div className="mt-2 text-xs text-red-700 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{assignError}</span>
          </div>
        )}
        {assignResult && (
          <div className="mt-2 text-xs text-green-700">{assignResult}</div>
        )}
      </div>

      {/* Buildings list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-600">{buildings.length} building{buildings.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button onClick={selectAllUnassigned} disabled={buildings.length === 0} className="px-2 py-1 text-[11px] rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">Select all unassigned</button>
            <button onClick={clearSelection} disabled={selected.size === 0} className="px-2 py-1 text-[11px] rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">Clear</button>
          </div>
        </div>
        {buildingsLoading ? (
          <div className="p-6 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading buildings...
          </div>
        ) : buildingsError ? (
          <div className="p-6 text-center text-red-700 text-sm flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" /> {buildingsError}
          </div>
        ) : buildings.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            Pick a geo (area / muni / community) or type 3+ chars to search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Units</th>
                  <th className="px-3 py-2 text-left">Year</th>
                  <th className="px-3 py-2 text-left">Current owner</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {buildings.map(b => {
                  const checked = selected.has(b.id)
                  const owned = !!b.card
                  return (
                    <tr key={b.id} className={`border-t border-gray-100 ${owned ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(b.id)}
                          disabled={owned}
                          title={owned ? 'Already assigned. Unassign first.' : ''}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-900">{b.canonical_address}</td>
                      <td className="px-3 py-2 text-gray-600">{b.building_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{b.total_units ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{b.year_built ?? '-'}</td>
                      <td className="px-3 py-2">
                        {b.card ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                            {b.card.agent_name || b.card.agent_id.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {b.card && (
                          <button
                            onClick={() => deactivateCard(b)}
                            disabled={deactivatingId === b.id}
                            className="px-2 py-1 text-[11px] rounded bg-white border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Unassign
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
