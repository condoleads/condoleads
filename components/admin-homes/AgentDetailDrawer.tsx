// components/admin-homes/AgentDetailDrawer.tsx
// Phase 3.3b — side drawer that opens on node click in the org chart.
//
// W-HOUSE-ACCOUNT UNIT 2 (2026-06-25): added inline "Set as house account"
// action. Uses the SAME validated write path as the Settings picker
// (PATCH /api/admin-homes/tenants/[tenantId] { default_agent_id }) — the
// validate_house_account trigger is the authoritative backstop. tenantId
// comes from the chart's API response (not props), so the standalone
// /agents/tree route works the same as the cockpit People tab.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, Crown } from 'lucide-react'
import type { AgentNodeData } from './AgentNodeCard'

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Tenant Admin',
  assistant:    'Assistant',
  support:      'Support',
  area_manager: 'Area Manager',
  manager:      'Manager',
  managed:      'Managed',
  agent:        'Agent',
}

interface Props {
  agentId: string | null
  data: AgentNodeData | null
  onClose: () => void
  // W-HOUSE-ACCOUNT UNIT 2: tenant context passed from AgentOrgChart based on
  // the per-tenant API response (NOT from a chart prop), so the standalone
  // route + cockpit both work without per-tenant constants.
  tenantIdForActions?: string | null
  currentHouseAccountId?: string | null
  onHouseAccountChanged?: () => void | Promise<void>
}

export default function AgentDetailDrawer({
  agentId,
  data,
  onClose,
  tenantIdForActions = null,
  currentHouseAccountId = null,
  onHouseAccountChanged,
}: Props) {
  const [setting, setSetting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  if (!agentId || !data) return null

  const isCurrentHouse = !!currentHouseAccountId && agentId === currentHouseAccountId
  const canSetHouseAccount = !!tenantIdForActions && !!agentId && !isCurrentHouse

  async function setAsHouseAccount() {
    if (!tenantIdForActions || !agentId) return
    setSetting(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/admin-homes/tenants/${tenantIdForActions}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_agent_id: agentId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Friendly 400 from the Phase 1 PATCH pre-validation (mirrors the
        // validate_house_account trigger's 4 conditions). Surface inline.
        throw new Error(j.error || `Update failed (${res.status})`)
      }
      setActionSuccess('House account updated.')
      if (onHouseAccountChanged) await onHouseAccountChanged()
    } catch (e: any) {
      setActionError(e.message || 'Update failed')
    } finally {
      setSetting(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-40 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Agent Detail</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center gap-3">
          {data.profile_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.profile_photo_url} alt={data.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold text-lg">
              {data.name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-base font-semibold text-gray-900">{data.name}</div>
            <div className="text-sm text-gray-500">{ROLE_LABELS[data.role] || data.role}</div>
            {data.is_house_account && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <Crown className="w-3 h-3" /> House account
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Capability" value={data.is_admin ? 'Admin' : 'Non-admin'} />
          <Stat label="Visibility" value={data.is_selling ? 'Selling (public)' : 'Internal'} />
          <Stat label="Leads (30d)" value={String(data.lead_count_30d)} />
          <Stat label="Status" value={data.is_active ? 'Active' : 'Inactive'} />
        </div>

        {/* W-HOUSE-ACCOUNT UNIT 2: inline house-account assignment.
            tenantIdForActions=null guards the no-tenant-context case (renders
            nothing). isCurrentHouse swaps the button to a disabled label. */}
        {tenantIdForActions && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={setAsHouseAccount}
              disabled={!canSetHouseAccount || setting}
              className={
                'w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-md border ' +
                (isCurrentHouse
                  ? 'bg-amber-50 border-amber-200 text-amber-800 cursor-default'
                  : canSetHouseAccount
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 disabled:opacity-60'
                    : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed')
              }
            >
              <Crown className="w-4 h-4" />
              {isCurrentHouse
                ? 'Current house account'
                : setting ? 'Setting...' : 'Set as house account'}
            </button>
            {actionError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{actionError}</p>
            )}
            {actionSuccess && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">{actionSuccess}</p>
            )}
            <p className="text-[11px] text-gray-500 leading-snug">
              Leads with no territory match fall back to the house account. Must be an active agent in this tenant with an eligible role.
            </p>
          </div>
        )}

        <Link
          href={`/admin-homes/agents/${agentId}`}
          className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          Open full agent page →
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className="text-sm font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  )
}