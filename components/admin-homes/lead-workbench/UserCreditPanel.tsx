'use client'

// components/admin-homes/lead-workbench/UserCreditPanel.tsx
// W-LEADS-WORKBENCH W4c (2026-05-14).
//
// User credit panel extracted from app/admin-homes/users/UsersClient.tsx
// surface (3-pool model: chat / plans / estimator). Embedded in the
// workbench Credits tab keyed on anchorLead.user_id. Empty state when
// user_id IS NULL is handled by the LeadWorkbenchClient parent.
//
// F-USERS-NO-SELLER-PLAN-INPUT remains OPEN: override API + DB support
// seller_plan_limit but neither this panel nor the Users page UI surface
// it (matches existing Users page behavior). Future phase can split when
// tenant.plan_mode = 'independent'.
//
// F-W4C-USERCREDITPANEL-LOCATION: lives in lead-workbench/ for now;
// known move-candidate when Users page migrates to consume this component.

import { useState } from 'react'

export interface UserCreditData {
  userProfile: {
    id: string
    full_name?: string | null
    phone?: string | null
    created_at?: string | null
    last_active_at?: string | null
    assigned_agent_id?: string | null
    looking_to?: string | null
  } | null
  usage: { chat: number; plans: number; estimator: number }
  override: {
    user_id: string
    ai_chat_limit: number | null
    buyer_plan_limit: number | null
    seller_plan_limit: number | null
    estimator_limit: number | null
    note?: string | null
    granted_at?: string | null
    granted_by_tier?: string | null
    granted_by_agent_id?: string | null
  } | null
  tenant: any | null
  assignedAgent: { id: string; full_name?: string | null } | null
}

interface Props {
  userId: string
  tenantId: string
  userCredit: UserCreditData
  adminUser: {
    agentId: string | null
    role: string | null
    isPlatformAdmin: boolean
    tenantId: string | null
  }
}

interface Usage { chat: number; plans: number; estimator: number }

function getTenantDefaults(tenant: any): Usage {
  return {
    chat:      tenant?.ai_free_messages    ?? 1,
    plans:     tenant?.plan_free_attempts  ?? 1,
    estimator: tenant?.estimator_free_attempts ?? 1,
  }
}

function getResolvedLimits(tenant: any, override: any): Usage {
  const d = getTenantDefaults(tenant)
  return {
    chat:      override?.ai_chat_limit    != null ? Math.min(override.ai_chat_limit,    tenant?.ai_hard_cap ?? 10)        : d.chat,
    plans:     override?.buyer_plan_limit != null ? Math.min(override.buyer_plan_limit, tenant?.plan_hard_cap ?? 10)      : d.plans,
    estimator: override?.estimator_limit  != null ? Math.min(override.estimator_limit,  tenant?.estimator_hard_cap ?? 10) : d.estimator,
  }
}

const POOLS: { key: keyof Usage; label: string; overrideKey: string; icon: string }[] = [
  { key: 'chat',      label: 'AI Chat',   overrideKey: 'ai_chat_limit',    icon: '💬' },
  { key: 'plans',     label: 'AI Plans',  overrideKey: 'buyer_plan_limit', icon: '📋' },
  { key: 'estimator', label: 'Estimator', overrideKey: 'estimator_limit',  icon: '📊' },
]

export default function UserCreditPanel({ userId, tenantId, userCredit, adminUser }: Props) {
  const { userProfile, usage, tenant, assignedAgent } = userCredit
  const [override, setOverride] = useState<any>(userCredit.override)

  const [modalOpen, setModalOpen]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [chatLimit, setChatLimit]   = useState('')
  const [plansLimit, setPlansLimit] = useState('')
  const [estimatorLimit, setEstimatorLimit] = useState('')
  const [note, setNote] = useState('')

  const hardCaps = {
    chat:      tenant?.ai_hard_cap        ?? 10,
    plans:     tenant?.plan_hard_cap      ?? 10,
    estimator: tenant?.estimator_hard_cap ?? 10,
  }

  const limits = getResolvedLimits(tenant, override)
  const hasOverride = !!override
  const planMode: string = tenant?.plan_mode || 'shared'

  function openModal() {
    setChatLimit(override?.ai_chat_limit       != null ? String(override.ai_chat_limit)       : '')
    setPlansLimit(override?.buyer_plan_limit   != null ? String(override.buyer_plan_limit)    : '')
    setEstimatorLimit(override?.estimator_limit != null ? String(override.estimator_limit)    : '')
    setNote(override?.note || '')
    setSaveError(null)
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setSaveError(null) }

  async function handleSave() {
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/admin-homes/users/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          tenantId,
          agentId:        adminUser.agentId,
          agentTier:      adminUser.role === 'admin' ? 'admin' : adminUser.role === 'manager' ? 'manager' : 'managed',
          note:           note.trim() || null,
          aiChatLimit:    chatLimit      !== '' ? parseInt(chatLimit)      : null,
          buyerPlanLimit: plansLimit     !== '' ? parseInt(plansLimit)     : null,
          estimatorLimit: estimatorLimit !== '' ? parseInt(estimatorLimit) : null,
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        setSaveError(e.error || 'Failed')
        return
      }
      const { override: newOverride } = await res.json()
      setOverride(newOverride)
      closeModal()
    } catch {
      setSaveError('Network error -- try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!confirm('Clear all credit overrides for this user? They will fall back to tenant defaults.')) return
    try {
      await fetch('/api/admin-homes/users/override', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tenantId }),
      })
      setOverride(null)
    } catch (e) {
      console.error('Clear failed', e)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">User</h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Name" value={userProfile?.full_name} />
          <Field label="Phone" value={userProfile?.phone} />
          <Field label="Registered" value={userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString('en-CA') : null} />
          <Field label="Last active" value={userProfile?.last_active_at ? new Date(userProfile.last_active_at).toLocaleDateString('en-CA') : null} />
          <Field label="Assigned agent" value={assignedAgent?.full_name} />
          <Field label="Looking to" value={userProfile?.looking_to} />
        </dl>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Credit pools
            {planMode === 'shared' && (
              <span className="ml-2 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                shared plan mode
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openModal}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
            >
              Set limits
            </button>
            {hasOverride && (
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors"
              >
                Clear override
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {POOLS.map(({ key, label, overrideKey, icon }) => {
            const used = usage[key]
            const limit = limits[key]
            const remaining = Math.max(0, limit - used)
            const isOverridden = override?.[overrideKey] != null
            const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
            const isEmpty = remaining === 0
            const isLow = remaining === 1
            const barColor = isEmpty ? '#ef4444' : isLow ? '#f59e0b' : isOverridden ? '#3b82f6' : '#10b981'
            const textColor = isEmpty ? 'text-red-600' : isLow ? 'text-amber-500' : isOverridden ? 'text-blue-600' : 'text-gray-900'
            return (
              <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-slate-700">{icon} {label}</div>
                  {isOverridden && (
                    <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">custom</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <div className={'text-3xl font-extrabold ' + textColor}>{remaining}</div>
                  <div className="text-xs text-slate-500">remaining of {limit}</div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div
                    style={{ width: pct + '%', background: barColor }}
                    className="h-full rounded-full transition-all"
                  />
                </div>
                <div className="text-xs text-slate-500">{used} used</div>
              </div>
            )
          })}
        </div>

        {override?.note && (
          <div className="mt-3 text-xs text-slate-500">
            <span className="font-medium">Override note:</span> {override.note}
            {override.granted_at && (
              <span className="ml-2 text-slate-400">({new Date(override.granted_at).toLocaleDateString('en-CA')})</span>
            )}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Set credit limits</h2>
            <p className="text-sm text-gray-500 mb-5">
              {userProfile?.full_name || 'User'} — leave blank to use tenant default
            </p>
            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{saveError}</div>
            )}
            <div className="space-y-4">
              {[
                { label: 'AI Chat',   value: chatLimit,      set: setChatLimit,      cap: hardCaps.chat },
                { label: 'AI Plans',  value: plansLimit,     set: setPlansLimit,     cap: hardCaps.plans },
                { label: 'Estimator', value: estimatorLimit, set: setEstimatorLimit, cap: hardCaps.estimator },
              ].map(({ label, value, set, cap }) => (
                <div key={label} className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 w-28">{label}</label>
                  <input
                    type="number"
                    min={0}
                    max={cap}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="Tenant default"
                    className="border rounded px-3 py-1.5 text-sm flex-1"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">max {cap}</span>
                </div>
              ))}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Note (internal)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Serious buyer, approved extended access"
                  className="border rounded px-3 py-1.5 text-sm w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save limits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800">{value || '—'}</dd>
    </div>
  )
}
