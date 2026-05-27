'use client'
// components/admin-homes/cockpit/territory/PinsView.tsx
// W-TERRITORY-MASTER P5: Single-listing pins UI.
// Operator can search MLS, pick an agent, pin (with reason), unpin, reactivate.

import { useEffect, useMemo, useState } from 'react'
import { Pin, PinOff, Search, RotateCcw, AlertCircle, Loader2 } from 'lucide-react'

interface PinRow {
  id: string
  agent_id: string
  agent_name: string | null
  listing_id: string
  listing_mls_number: string | null
  listing_address: string | null
  listing_property_type: string | null
  listing_list_price: number | null
  listing_status: string | null
  is_active: boolean
  pin_reason: string | null
  created_at: string
  assigned_by: string | null
  assigned_by_name: string | null
  deactivated_at: string | null
  deactivated_by: string | null
  deactivated_by_name: string | null
}

interface AgentOption {
  id: string
  full_name: string
  is_active: boolean
  is_selling: boolean
}

interface Props {
  tenantId: string
  actingAgentId: string | null // the operator's own agent_id; null = not logged in as an agent
}

export default function PinsView({ tenantId, actingAgentId }: Props) {
  const [pins, setPins] = useState<PinRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [agents, setAgents] = useState<AgentOption[]>([])

  // Pin form state
  const [pinMlsInput, setPinMlsInput] = useState('')
  const [pinAgentId, setPinAgentId] = useState('')
  const [pinReason, setPinReason] = useState('')
  const [pinSubmitting, setPinSubmitting] = useState(false)
  const [pinFormError, setPinFormError] = useState<string | null>(null)
  const [pinFormOk, setPinFormOk] = useState<string | null>(null)

  // Action state
  const [actionRowId, setActionRowId] = useState<string | null>(null)

  async function loadPins() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenant_id: tenantId })
      if (showAll) params.set('is_active', 'all')
      else params.set('is_active', 'true')
      params.set('limit', '500')
      const res = await fetch(`/api/admin-homes/territory/pins?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const body = await res.json()
      setPins(body.data || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load pins')
    } finally {
      setLoading(false)
    }
  }

  async function loadAgents() {
    try {
      const res = await fetch(
        `/api/admin-homes/territory/pins/agents-for-pinning?tenant_id=${encodeURIComponent(tenantId)}`
      )
      if (!res.ok) return
      const body = await res.json()
      const list = body.data || []
      setAgents(list)
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    loadPins()
    loadAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, showAll])

  async function resolveMlsToListingId(mls: string): Promise<string | null> {
    const trimmed = mls.trim()
    if (!trimmed) return null
    const res = await fetch(
      `/api/admin-homes/listings/lookup?mls=${encodeURIComponent(trimmed)}&tenant_id=${encodeURIComponent(tenantId)}`
    )
    if (!res.ok) return null
    const body = await res.json()
    return body.data?.id ?? null
  }

  async function submitPin() {
    setPinFormError(null)
    setPinFormOk(null)
    if (!actingAgentId) {
      setPinFormError('You must be logged in as an agent to pin listings.')
      return
    }
    if (!pinMlsInput.trim()) {
      setPinFormError('Enter an MLS number')
      return
    }
    if (!pinAgentId) {
      setPinFormError('Pick an agent')
      return
    }
    if (pinReason.length > 500) {
      setPinFormError('Reason exceeds 500 chars')
      return
    }
    setPinSubmitting(true)
    try {
      const listingId = await resolveMlsToListingId(pinMlsInput)
      if (!listingId) {
        setPinFormError(`No listing found for MLS ${pinMlsInput}`)
        return
      }
      const res = await fetch('/api/admin-homes/territory/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          agent_id: pinAgentId,
          listing_id: listingId,
          assigned_by: actingAgentId,
          pin_reason: pinReason || null
        })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.code === 'ALREADY_PINNED') {
          setPinFormError('Listing already has an active pin. Unpin it first.')
        } else {
          setPinFormError(body.error || `HTTP ${res.status}`)
        }
        return
      }
      setPinFormOk(`Pinned MLS ${pinMlsInput}`)
      setPinMlsInput('')
      setPinReason('')
      await loadPins()
    } catch (e: any) {
      setPinFormError(e.message || 'Failed to pin')
    } finally {
      setPinSubmitting(false)
    }
  }

  async function deactivatePin(pin: PinRow) {
    if (!actingAgentId) {
      alert('You must be logged in as an agent to unpin listings.')
      return
    }
    if (!confirm(`Unpin MLS ${pin.listing_mls_number || pin.listing_id}? This routes the listing back to the geo cascade.`)) {
      return
    }
    setActionRowId(pin.id)
    try {
      const res = await fetch(`/api/admin-homes/territory/pins/${pin.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deactivated_by: actingAgentId })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `HTTP ${res.status}`)
        return
      }
      await loadPins()
    } finally {
      setActionRowId(null)
    }
  }

  async function reactivatePin(pin: PinRow) {
    if (!actingAgentId) {
      alert('You must be logged in as an agent to reactivate pins.')
      return
    }
    if (!confirm(`Reactivate pin for MLS ${pin.listing_mls_number || pin.listing_id}? If another active pin exists for this listing, this will fail.`)) {
      return
    }
    setActionRowId(pin.id)
    try {
      // Reactivation is a direct UPDATE; the API surface is a POST to the same
      // pin id with action=reactivate. We use the bulk endpoint pattern by
      // re-inserting via POST /pins, but for an existing soft-deleted row we
      // need a dedicated path. The cleanest UX: surface this only if no active
      // pin currently exists for the listing, then call POST /pins.
      //
      // Implementation: try POST /pins; the partial unique will reject if there's
      // a clash, which is the correct behavior per spec.
      const res = await fetch('/api/admin-homes/territory/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          agent_id: pin.agent_id,
          listing_id: pin.listing_id,
          assigned_by: actingAgentId,
          pin_reason: pin.pin_reason
            ? `Reactivated (was: ${pin.pin_reason.slice(0, 200)})`
            : 'Reactivated'
        })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.code === 'ALREADY_PINNED') {
          alert('Cannot reactivate: another active pin exists for this listing.')
        } else {
          alert(body.error || `HTTP ${res.status}`)
        }
        return
      }
      await loadPins()
    } finally {
      setActionRowId(null)
    }
  }

  const activeAgents = useMemo(
    () => agents.filter(a => a.is_active && a.is_selling),
    [agents]
  )

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pin className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Pin a listing</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="md:col-span-1">
            <label className="block text-xs text-gray-600 mb-1">MLS number</label>
            <input
              type="text"
              value={pinMlsInput}
              onChange={e => setPinMlsInput(e.target.value)}
              placeholder="e.g. C5678901"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              disabled={pinSubmitting}
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs text-gray-600 mb-1">Agent</label>
            <select
              value={pinAgentId}
              onChange={e => setPinAgentId(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              disabled={pinSubmitting}
            >
              <option value="">— pick agent —</option>
              {activeAgents.map(a => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs text-gray-600 mb-1">Reason (optional, max 500)</label>
            <input
              type="text"
              value={pinReason}
              onChange={e => setPinReason(e.target.value)}
              placeholder="e.g. client requested this agent"
              maxLength={500}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              disabled={pinSubmitting}
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              onClick={submitPin}
              disabled={pinSubmitting || !pinMlsInput.trim() || !pinAgentId || !actingAgentId}
              className="w-full px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {pinSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pin className="w-3.5 h-3.5" />}
              {pinSubmitting ? 'Pinning…' : 'Pin'}
            </button>
          </div>
        </div>
        {pinFormError && (
          <div className="mt-2 text-xs text-red-700 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{pinFormError}</span>
          </div>
        )}
        {pinFormOk && (
          <div className="mt-2 text-xs text-green-700">{pinFormOk}</div>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowAll(!showAll)}
          className={
            'px-3 py-1.5 text-xs font-medium rounded border ' +
            (showAll ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
          }
        >
          {showAll ? 'Showing all (incl. inactive)' : 'Active only'}
        </button>
        <span className="text-xs text-gray-500">{pins.length} pin{pins.length === 1 ? '' : 's'}</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading pins…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-700 text-sm flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : pins.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No pins to show.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-left">MLS</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pins.map(p => {
                  const truncated = p.pin_reason && p.pin_reason.length > 60
                    ? p.pin_reason.slice(0, 60) + '…'
                    : (p.pin_reason || '')
                  return (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{p.agent_name || p.agent_id.slice(0, 8)}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{p.listing_mls_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{p.listing_address || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.listing_property_type || '—'}</td>
                      <td className="px-3 py-2 text-gray-600" title={p.pin_reason || ''}>{truncated || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2">
                        {p.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700">Inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.is_active ? (
                          <button
                            onClick={() => deactivatePin(p)}
                            disabled={actionRowId === p.id}
                            className="px-2 py-1 text-[11px] rounded bg-white border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <PinOff className="w-3 h-3" /> Unpin
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivatePin(p)}
                            disabled={actionRowId === p.id}
                            className="px-2 py-1 text-[11px] rounded bg-white border border-gray-300 text-gray-700 hover:bg-green-50 hover:border-green-300 hover:text-green-700 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Reactivate
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