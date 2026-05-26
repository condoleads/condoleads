'use client'
// components/admin-homes/cockpit/territory/CardsView.tsx
// W-TERRITORY-OPS T1-4 -- View 2: Cards (paginated card list with bulk actions).
//
// Fetches GET /api/admin-homes/territory/cards-list and renders a filterable,
// paginated table with bulk-select checkboxes. Row actions: Deactivate/Restore
// per-card (the per-card affordance deferred from T1-3 AgentsView).
//
// Audit side panel queries the canonical audit-log endpoint with scope+scope_id
// filters (added to audit-log/route.ts as part of this commit).

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, RefreshCw, X, ChevronLeft, ChevronRight,
  Home, Building2, Building, MapPin, Search, Filter,
} from 'lucide-react'

interface CardRow {
  id: string
  agent_id: string
  agent_name: string
  agent_is_selling: boolean
  agent_is_active: boolean
  scope: 'area' | 'municipality' | 'community' | 'neighbourhood'
  scope_id: string
  geo_name: string | null
  is_primary: boolean
  is_active: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
  created_at: string
  updated_at: string
  last_event: {
    change_type: string
    changed_at: string
    changed_by_name: string | null
  } | null
}

interface AuditEvent {
  id: string
  agent_id: string | null
  agent_name: string | null
  scope: string
  scope_id: string | null
  change_type: string
  before_state: any
  after_state: any
  changed_by: string | null
  changed_at: string
  notes: string | null
}

interface AgentOption {
  agent_id: string
  full_name: string
  is_selling: boolean
  is_active: boolean
}

interface Props {
  tenantId: string
  tenantName: string
  initialAgentFilter?: string | null
  onClearAgentFilter?: () => void
  initialGeoFilter?: { scope: string; scope_id: string; geo_name: string } | null
  onClearGeoFilter?: () => void
}

const SCOPE_LABELS: Record<string, string> = {
  area: 'Area',
  municipality: 'Municipality',
  community: 'Community',
  neighbourhood: 'Neighbourhood',
}

const PAGE_SIZE = 50

export default function CardsView({ tenantId, tenantName, initialAgentFilter, onClearAgentFilter, initialGeoFilter, onClearGeoFilter }: Props) {
  const [cards, setCards] = useState<CardRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [filterAgent, setFilterAgent] = useState<string | null>(initialAgentFilter || null)
  const [filterScope, setFilterScope] = useState<string | null>(initialGeoFilter?.scope || null)
  const [filterScopeId, setFilterScopeId] = useState<string | null>(initialGeoFilter?.scope_id || null)
  const [filterGeoName, setFilterGeoName] = useState<string | null>(initialGeoFilter?.geo_name || null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchQDebounced, setSearchQDebounced] = useState('')
  const [offset, setOffset] = useState(0)

  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)

  const [panelCard, setPanelCard] = useState<CardRow | null>(null)
  const [panelEvents, setPanelEvents] = useState<AuditEvent[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelErr, setPanelErr] = useState<string | null>(null)

  // Debounce search input (300ms).
  useEffect(() => {
    const h = setTimeout(() => setSearchQDebounced(searchQ.trim()), 300)
    return () => clearTimeout(h)
  }, [searchQ])

  // Re-fetch cards on any filter/pagination change.
  useEffect(() => {
    setLoading(true)
    setErr(null)
    const params = new URLSearchParams()
    params.set('tenant_id', tenantId)
    if (filterAgent) params.set('agent_id', filterAgent)
    if (filterScope) params.set('scope', filterScope)
    if (filterScopeId) params.set('scope_id', filterScopeId)
    if (includeInactive) params.set('include_inactive', 'true')
    if (searchQDebounced) params.set('q', searchQDebounced)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    fetch(`/api/admin-homes/territory/cards-list?${params.toString()}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d) => {
        setCards(d.cards || [])
        setTotalCount(d.total_count || 0)
        setHasMore(!!d.has_more)
        setSelectedIds(new Set()) // clear selection on refetch
      })
      .catch((e) => setErr(e?.message || 'failed to load'))
      .finally(() => setLoading(false))
  }, [tenantId, filterAgent, filterScope, filterScopeId, includeInactive, searchQDebounced, offset])

  // Fetch agents-summary once (for filter dropdown + reassign destination picker).
  useEffect(() => {
    fetch(`/api/admin-homes/territory/agents-summary?tenant_id=${encodeURIComponent(tenantId)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setAgents(d.agents || []))
      .catch(() => {/* non-fatal */})
  }, [tenantId])

  // Audit side panel: fetch on open.
  useEffect(() => {
    if (!panelCard) {
      setPanelEvents([])
      setPanelErr(null)
      return
    }
    setPanelLoading(true)
    setPanelErr(null)
    const params = new URLSearchParams()
    params.set('tenant_id', tenantId)
    params.set('agent_id', panelCard.agent_id)
    params.set('scope', panelCard.scope)
    params.set('scope_id', panelCard.scope_id)
    params.set('limit', '20')
    fetch(`/api/admin-homes/territory/audit-log?${params.toString()}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d) => setPanelEvents(d.rows || []))
      .catch((e) => setPanelErr(e?.message || 'failed to load audit'))
      .finally(() => setPanelLoading(false))
  }, [panelCard, tenantId])

  const refresh = () => {
    // Force reload by toggling offset to itself (the effect dep array picks it up if anything else changed).
    // Simpler: nudge offset to a new sentinel and back. But cleanest is just re-running the fetch directly.
    setOffset((o) => o) // no-op; instead call the fetcher explicitly via a key bump
    // Bumping a refresh key:
    setRefreshKey((k) => k + 1)
  }
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    if (refreshKey === 0) return
    setLoading(true)
    setErr(null)
    const params = new URLSearchParams()
    params.set('tenant_id', tenantId)
    if (filterAgent) params.set('agent_id', filterAgent)
    if (filterScope) params.set('scope', filterScope)
    if (filterScopeId) params.set('scope_id', filterScopeId)
    if (includeInactive) params.set('include_inactive', 'true')
    if (searchQDebounced) params.set('q', searchQDebounced)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    fetch(`/api/admin-homes/territory/cards-list?${params.toString()}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d) => {
        setCards(d.cards || [])
        setTotalCount(d.total_count || 0)
        setHasMore(!!d.has_more)
        setSelectedIds(new Set())
      })
      .catch((e) => setErr(e?.message || 'failed to load'))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const toggleSelectAll = () => {
    if (selectedIds.size === cards.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(cards.map((c) => c.id)))
    }
  }
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectedCards = useMemo(
    () => cards.filter((c) => selectedIds.has(c.id)),
    [cards, selectedIds]
  )
  const allSelectedAreActive = selectedCards.length > 0 && selectedCards.every((c) => c.is_active)
  const allSelectedAreInactive = selectedCards.length > 0 && selectedCards.every((c) => !c.is_active)

  async function doBulkDeactivate() {
    if (selectedIds.size === 0) return
    if (!confirm(`Deactivate ${selectedIds.size} card(s)? This is reversible from this view (toggle 'Include inactive' to find them).`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin-homes/territory/cards/bulk-deactivate?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ card_ids: Array.from(selectedIds) }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`)
      setToast(`Deactivated ${b.deactivated_count} card(s). ${b.queued_count} reroll job(s) queued.`)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      setToast(`Deactivate failed: ${e?.message || 'unknown error'}`)
    } finally {
      setBusy(false)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function doBulkRestore() {
    if (selectedIds.size === 0) return
    if (!confirm(`Restore ${selectedIds.size} card(s)?`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin-homes/territory/cards/bulk-restore?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ card_ids: Array.from(selectedIds) }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`)
      setToast(`Restored ${b.restored_count} card(s). ${b.queued_count} reroll job(s) queued.`)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      setToast(`Restore failed: ${e?.message || 'unknown error'}`)
    } finally {
      setBusy(false)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function doBulkReassign(toAgentId: string) {
    if (selectedIds.size === 0) return
    // Group selected cards by source agent.
    const bySource = new Map<string, string[]>()
    for (const c of selectedCards) {
      if (!bySource.has(c.agent_id)) bySource.set(c.agent_id, [])
      bySource.get(c.agent_id)!.push(c.id)
    }
    setReassignOpen(false)
    setBusy(true)
    let totalMoved = 0
    let totalQueued = 0
    const errors: string[] = []
    for (const [fromAgentId, cardIds] of bySource.entries()) {
      if (fromAgentId === toAgentId) continue
      try {
        const r = await fetch(`/api/admin-homes/territory/cards/bulk-reassign?tenant_id=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ from_agent_id: fromAgentId, to_agent_id: toAgentId, card_ids: cardIds }),
        })
        const b = await r.json()
        if (!r.ok) errors.push(b.error || `HTTP ${r.status}`)
        else {
          totalMoved += b.moved_count || 0
          totalQueued += b.queued_count || 0
        }
      } catch (e: any) {
        errors.push(e?.message || 'unknown')
      }
    }
    if (errors.length === 0) {
      setToast(`Reassigned ${totalMoved} card(s). ${totalQueued} reroll job(s) queued.`)
    } else {
      setToast(`Partial: ${totalMoved} moved, ${errors.length} error(s): ${errors[0]}`)
    }
    setBusy(false)
    setRefreshKey((k) => k + 1)
    setTimeout(() => setToast(null), 6000)
  }

  const clearFilters = () => {
    setFilterAgent(null)
    setFilterScope(null)
    setFilterScopeId(null)
    setFilterGeoName(null)
    setIncludeInactive(false)
    setSearchQ('')
    setOffset(0)
    if (onClearAgentFilter) onClearAgentFilter()
    if (onClearGeoFilter) onClearGeoFilter()
  }
  const anyFilterActive = !!(filterAgent || filterScope || filterScopeId || includeInactive || searchQDebounced)

  const sellingActiveAgents = agents.filter((a) => a.is_selling && a.is_active)

  return (
    <div className="space-y-3">
      {/* Header + counts + filter controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Filter className="w-4 h-4" />
          <span><strong>{totalCount}</strong> card{totalCount === 1 ? '' : 's'} in {tenantName}</span>
          {anyFilterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-blue-700 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-xs px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterScope || ''}
          onChange={(e) => { setFilterScope(e.target.value || null); setOffset(0) }}
          className="text-xs px-2 py-1 border border-gray-300 rounded-md"
        >
          <option value="">All scopes</option>
          <option value="area">Area</option>
          <option value="municipality">Municipality</option>
          <option value="community">Community</option>
          <option value="neighbourhood">Neighbourhood</option>
        </select>
        <select
          value={filterAgent || ''}
          onChange={(e) => { setFilterAgent(e.target.value || null); setOffset(0) }}
          className="text-xs px-2 py-1 border border-gray-300 rounded-md"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.full_name}{!a.is_active ? ' (inactive)' : !a.is_selling ? ' (non-selling)' : ''}
            </option>
          ))}
        </select>
        <label className="text-xs text-gray-700 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => { setIncludeInactive(e.target.checked); setOffset(0) }}
          />
          Include inactive
        </label>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agent or geo name…"
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setOffset(0) }}
            className="text-xs pl-7 pr-2 py-1 border border-gray-300 rounded-md w-full"
          />
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-medium text-blue-900">{selectedIds.size} selected</span>
          {allSelectedAreActive && (
            <button
              type="button"
              disabled={busy}
              onClick={doBulkDeactivate}
              className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              Deactivate selected
            </button>
          )}
          {allSelectedAreInactive && (
            <button
              type="button"
              disabled={busy}
              onClick={doBulkRestore}
              className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-40"
            >
              Restore selected
            </button>
          )}
          <button
            type="button"
            disabled={busy || !allSelectedAreActive}
            onClick={() => setReassignOpen(true)}
            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
            title={!allSelectedAreActive ? 'Reassign only available for active cards' : ''}
          >
            Reassign selected
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-700 hover:underline ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {toast && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          {toast}
        </div>
      )}

      {/* Loading / error / empty states */}
      {loading ? (
        <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading cards…
        </div>
      ) : err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Could not load cards</p>
          <p className="mt-1">{err}</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">No cards match filters.</p>
          {anyFilterActive && (
            <button type="button" onClick={clearFilters} className="mt-1 text-blue-700 hover:underline text-xs">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === cards.length && cards.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Agent</th>
                <th className="px-3 py-2 text-left font-medium">Scope</th>
                <th className="px-3 py-2 text-left font-medium">Geo</th>
                <th className="px-3 py-2 text-left font-medium">Access</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Updated</th>
                <th className="px-3 py-2 text-left font-medium">Last event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cards.map((c) => {
                const sel = selectedIds.has(c.id)
                return (
                  <tr
                    key={c.id}
                    className={`${!c.is_active ? 'opacity-60' : ''} ${sel ? 'bg-blue-50' : ''} cursor-pointer hover:bg-gray-50`}
                    onClick={(e) => {
                      // Don't open panel if click was on checkbox
                      const tgt = e.target as HTMLElement
                      if (tgt.tagName === 'INPUT') return
                      setPanelCard(c)
                    }}
                  >
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSelect(c.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{c.agent_name}</div>
                      {(!c.agent_is_selling || !c.agent_is_active) && (
                        <div className="text-[10px] text-red-700 mt-0.5">
                          {!c.agent_is_active ? 'agent inactive' : 'agent not selling'}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {SCOPE_LABELS[c.scope] || c.scope}
                      </span>
                      {c.is_primary && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">PRIMARY</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{c.geo_name || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {c.condo_access && <Building className="w-3.5 h-3.5 text-blue-600" />}
                        {c.homes_access && <Home className="w-3.5 h-3.5 text-green-600" />}
                        {c.buildings_access && <Building2 className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {c.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <AlertTriangle className="w-3.5 h-3.5" /> inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {c.last_event ? (
                        <span title={`by ${c.last_event.changed_by_name || 'system'} at ${new Date(c.last_event.changed_at).toLocaleString()}`}>
                          {c.last_event.change_type}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer */}
      {cards.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div>
            Showing {offset + 1}–{offset + cards.length} of {totalCount}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="text-xs px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" /> Previous
            </button>
            <button
              type="button"
              disabled={!hasMore || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="text-xs px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Reassign destination picker modal */}
      {reassignOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setReassignOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-md w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Reassign {selectedIds.size} card(s)
            </p>
            <p className="text-xs text-gray-600 mb-3">Pick the destination agent (selling + active only):</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {sellingActiveAgents.map((to) => (
                <button
                  key={to.agent_id}
                  type="button"
                  onClick={() => doBulkReassign(to.agent_id)}
                  className="w-full text-left text-sm px-3 py-2 rounded-md border border-gray-200 hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">{to.full_name}</div>
                </button>
              ))}
              {sellingActiveAgents.length === 0 && (
                <p className="text-xs text-amber-700 italic">No selling+active agents available.</p>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setReassignOpen(false)}
                className="text-xs px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit side panel */}
      {panelCard && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl z-40 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{panelCard.agent_name}</p>
              <p className="text-xs text-gray-600">{SCOPE_LABELS[panelCard.scope]}: {panelCard.geo_name || '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => setPanelCard(null)}
              className="p-1 rounded hover:bg-gray-100"
              aria-label="Close audit panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="text-xs space-y-1 text-gray-700">
              <div><span className="font-medium">Status:</span> {panelCard.is_active ? 'active' : 'inactive'}</div>
              <div><span className="font-medium">Primary:</span> {panelCard.is_primary ? 'yes' : 'no'}</div>
              <div><span className="font-medium">Access:</span>
                {panelCard.condo_access ? ' condo' : ''}
                {panelCard.homes_access ? ' homes' : ''}
                {panelCard.buildings_access ? ' buildings' : ''}
                {!panelCard.condo_access && !panelCard.homes_access && !panelCard.buildings_access ? ' none' : ''}
              </div>
              <div><span className="font-medium">Created:</span> {new Date(panelCard.created_at).toLocaleString()}</div>
              <div><span className="font-medium">Updated:</span> {new Date(panelCard.updated_at).toLocaleString()}</div>
            </div>
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-900 mb-2">Audit history</p>
              {panelLoading ? (
                <p className="text-xs text-gray-500">Loading…</p>
              ) : panelErr ? (
                <p className="text-xs text-red-700">{panelErr}</p>
              ) : panelEvents.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No audit events for this card slot.</p>
              ) : (
                <ul className="space-y-2">
                  {panelEvents.map((ev) => (
                    <li key={ev.id} className="text-xs border-l-2 border-gray-200 pl-2">
                      <div className="font-medium text-gray-900">{ev.change_type}</div>
                      <div className="text-gray-600">
                        {new Date(ev.changed_at).toLocaleString()}
                        {ev.agent_name ? ` · ${ev.agent_name}` : ''}
                      </div>
                      {ev.notes && <div className="text-gray-500 italic mt-0.5">{ev.notes}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}