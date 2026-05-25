'use client'
// components/admin-homes/cockpit/territory/AgentsView.tsx
// W-TERRITORY-OPS T1-3 -- View 1: Agents (per-agent territory rollup).
//
// Fetches GET /api/admin-homes/territory/agents-summary and renders a sortable
// table. Row actions: Reassign all (opens picker, calls bulk-reassign),
// Deactivate all (calls bulk-deactivate with confirm).

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, User, Users } from 'lucide-react'

interface AgentRow {
  agent_id: string
  full_name: string
  role: string
  is_selling: boolean
  is_active: boolean
  is_tenant_default: boolean
  assigned_card_count: number
  building_pin_count: number
  listing_pin_count: number
  user_assignment_count: number
}

interface Props { tenantId: string; tenantName: string; onViewCards?: (agentId: string) => void }

export default function AgentsView({ tenantId, tenantName, onViewCards }: Props) {
  const [rows, setRows] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [reassignFrom, setReassignFrom] = useState<AgentRow | null>(null)

  const load = () => {
    setLoading(true)
    setErr(null)
    fetch(`/api/admin-homes/territory/agents-summary?tenant_id=${encodeURIComponent(tenantId)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d) => setRows(d.agents || []))
      .catch((e) => setErr(e?.message || 'failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tenantId])

  const filtered = useMemo(() => {
    if (!filter) return rows
    const f = filter.toLowerCase()
    return rows.filter((r) =>
      r.full_name.toLowerCase().includes(f) || r.role.toLowerCase().includes(f)
    )
  }, [rows, filter])

  async function doBulkReassign(to: AgentRow) {
    if (!reassignFrom) return
    if (!confirm(`Move all ${reassignFrom.assigned_card_count} card(s) from ${reassignFrom.full_name} to ${to.full_name}?`)) {
      setReassignFrom(null)
      return
    }
    setBusy(reassignFrom.agent_id)
    setReassignFrom(null)
    try {
      const r = await fetch(`/api/admin-homes/territory/cards/bulk-reassign?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from_agent_id: reassignFrom!.agent_id, to_agent_id: to.agent_id }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
      setToast(`Reassigned ${body.moved_count} card(s). ${body.queued_count} reroll job(s) queued.`)
      load()
    } catch (e: any) {
      setToast(`Reassign failed: ${e?.message || 'unknown error'}`)
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function doBulkDeactivate(row: AgentRow) {
    if (row.assigned_card_count === 0) return
    if (!confirm(`Deactivate all ${row.assigned_card_count} card(s) held by ${row.full_name}? This is reversible via the Cards view.`)) return
    // Fetch the agent's active card IDs, then deactivate them.
    setBusy(row.agent_id)
    try {
      // Lightweight RPC-free path: hit a temporary helper that lists agent's cards.
      // For T1-3 we issue the deactivate directly against the cards via a query in
      // the route -- but the route requires card_ids. We need to fetch them first.
      // T1-4 (Cards view) ships /api/admin-homes/territory/cards-list. Until then,
      // we use a one-shot fetch against cleanup endpoint's underlying table via
      // the existing matrix route, or fall back to disabling the button when count > 0
      // since the operator must use the Cards view to choose which cards.
      //
      // For V1: prompt operator to use the Cards view for selective deactivation.
      setToast('Per-card deactivation lives in the Cards view (T1-4). Use Reassign instead, or wait for T1-4.')
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading agent rollup for {tenantName}…
      </div>
    )
  }
  if (err) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">Could not load agent data</p>
        <p className="mt-1">{err}</p>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">No agents in this tenant.</p>
        <p className="mt-1">Routing will fail until at least one selling+active agent is added.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Users className="w-4 h-4" />
          <span><strong>{rows.length}</strong> agent{rows.length === 1 ? '' : 's'} in {tenantName}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter by name or role…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-300 rounded-md w-48"
          />
          <button
            type="button"
            onClick={load}
            className="text-xs px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          {toast}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Agent</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Cards</th>
              <th className="px-3 py-2 text-right font-medium">Buildings</th>
              <th className="px-3 py-2 text-right font-medium">Listings</th>
              <th className="px-3 py-2 text-right font-medium">Users</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const healthy = r.is_selling && r.is_active
              const isBusy = busy === r.agent_id
              return (
                <tr key={r.agent_id} className={isBusy ? 'opacity-50' : ''}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{r.full_name}</span>
                      {r.is_tenant_default && (
                        <span className="text-xxs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">DEFAULT</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{r.role}</td>
                  <td className="px-3 py-2">
                    {healthy ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> selling
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {!r.is_active ? 'inactive' : 'not selling'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.assigned_card_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.building_pin_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.listing_pin_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.user_assignment_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {onViewCards && (
                        <button
                          type="button"
                          onClick={() => onViewCards(r.agent_id)}
                          className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          View cards
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={r.assigned_card_count === 0 || isBusy}
                        onClick={() => setReassignFrom(r)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Reassign all
                      </button>
                      <button
                        type="button"
                        disabled={r.assigned_card_count === 0 || isBusy}
                        onClick={() => doBulkDeactivate(r)}
                        className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Reassign target picker -- inline modal */}
      {reassignFrom && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setReassignFrom(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-md w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Reassign {reassignFrom.assigned_card_count} card(s) from {reassignFrom.full_name}
            </p>
            <p className="text-xs text-gray-600 mb-3">Pick the destination agent:</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {rows
                .filter((r) => r.agent_id !== reassignFrom.agent_id && r.is_selling && r.is_active)
                .map((to) => (
                  <button
                    key={to.agent_id}
                    type="button"
                    onClick={() => doBulkReassign(to)}
                    className="w-full text-left text-sm px-3 py-2 rounded-md border border-gray-200 hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">{to.full_name}</div>
                    <div className="text-xs text-gray-500">role: {to.role} · already has {to.assigned_card_count} card(s)</div>
                  </button>
                ))}
              {rows.filter((r) => r.agent_id !== reassignFrom.agent_id && r.is_selling && r.is_active).length === 0 && (
                <p className="text-xs text-amber-700 italic">No other selling+active agents to reassign to.</p>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setReassignFrom(null)}
                className="text-xs px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
