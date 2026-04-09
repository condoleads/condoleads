// app/admin-homes/users/UsersClient.tsx
'use client'
import { useState } from 'react'

interface Props {
  users: any[]
  usageMap: Record<string, { chat: number; buyer: number; seller: number; estimator: number }>
  overrideMap: Record<string, any>
  tenant: any
  agentMap: Record<string, string>
  adminUser: any
  tenantId: string
}

function getTenantDefaults(tenant: any) {
  return {
    chat:      (tenant?.ai_free_messages ?? 1) + (tenant?.ai_auto_approve_limit ?? 2) + (tenant?.ai_manual_approve_limit ?? 3),
    buyer:     (tenant?.plan_free_attempts ?? 1) + (tenant?.plan_auto_approve_limit ?? 0) + (tenant?.plan_manual_approve_limit ?? 3),
    seller:    (tenant?.seller_plan_free_attempts ?? 1) + (tenant?.seller_plan_auto_approve_limit ?? 0) + (tenant?.seller_plan_manual_approve_limit ?? 3),
    estimator: (tenant?.estimator_free_attempts ?? 1) + (tenant?.estimator_auto_approve_attempts ?? 2) + (tenant?.estimator_manual_approve_attempts ?? 3),
  }
}

function getResolvedLimits(tenant: any, override: any) {
  const defaults = getTenantDefaults(tenant)
  return {
    chat:      override?.ai_chat_limit      != null ? Math.min(override.ai_chat_limit,      tenant?.ai_hard_cap ?? 10)        : defaults.chat,
    buyer:     override?.buyer_plan_limit   != null ? Math.min(override.buyer_plan_limit,   tenant?.plan_hard_cap ?? 10)      : defaults.buyer,
    seller:    override?.seller_plan_limit  != null ? Math.min(override.seller_plan_limit,  tenant?.seller_plan_hard_cap ?? 10) : defaults.seller,
    estimator: override?.estimator_limit    != null ? Math.min(override.estimator_limit,    tenant?.estimator_hard_cap ?? 10) : defaults.estimator,
  }
}

export default function UsersClient({ users, usageMap, overrideMap, tenant, agentMap, adminUser, tenantId }: Props) {
  const [search, setSearch] = useState('')
  const [modalUser, setModalUser] = useState<any>(null)
  const [overrides, setOverrides] = useState<Record<string, any>>(overrideMap)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Modal form state
  const [chatLimit, setChatLimit]           = useState<string>('')
  const [buyerLimit, setBuyerLimit]         = useState<string>('')
  const [sellerLimit, setSellerLimit]       = useState<string>('')
  const [estimatorLimit, setEstimatorLimit] = useState<string>('')
  const [note, setNote]                     = useState<string>('')

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q)
  })

  function openModal(user: any) {
    const existing = overrides[user.id]
    setChatLimit(existing?.ai_chat_limit      != null ? String(existing.ai_chat_limit)      : '')
    setBuyerLimit(existing?.buyer_plan_limit  != null ? String(existing.buyer_plan_limit)   : '')
    setSellerLimit(existing?.seller_plan_limit != null ? String(existing.seller_plan_limit) : '')
    setEstimatorLimit(existing?.estimator_limit != null ? String(existing.estimator_limit)  : '')
    setNote(existing?.note || '')
    setSaveError(null)
    setModalUser(user)
  }

  function closeModal() {
    setModalUser(null)
    setSaveError(null)
  }

  async function handleSave() {
    if (!modalUser) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/admin-homes/users/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:          modalUser.id,
          tenantId,
          agentId:         adminUser.agentId,
          agentTier:       adminUser.role === 'admin' ? 'admin' : adminUser.role === 'manager' ? 'manager' : 'managed',
          note:            note.trim() || null,
          aiChatLimit:     chatLimit      !== '' ? parseInt(chatLimit)      : null,
          buyerPlanLimit:  buyerLimit     !== '' ? parseInt(buyerLimit)     : null,
          sellerPlanLimit: sellerLimit    !== '' ? parseInt(sellerLimit)    : null,
          estimatorLimit:  estimatorLimit !== '' ? parseInt(estimatorLimit) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveError(err.error || 'Failed to save')
        return
      }
      const { override } = await res.json()
      setOverrides(prev => ({ ...prev, [modalUser.id]: override }))
      closeModal()
    } catch (e) {
      setSaveError('Network error — try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleClearOverride(userId: string) {
    try {
      await fetch('/api/admin-homes/users/override', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tenantId }),
      })
      setOverrides(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    } catch (e) {
      console.error('Clear override failed', e)
    }
  }

  const hardCaps = {
    chat:      tenant?.ai_hard_cap ?? 10,
    buyer:     tenant?.plan_hard_cap ?? 10,
    seller:    tenant?.seller_plan_hard_cap ?? 10,
    estimator: tenant?.estimator_hard_cap ?? 10,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1 text-sm">Manage AI credit limits per user</p>
        </div>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-64"
        />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Assigned Agent</th>
              <th className="px-4 py-3 font-medium text-center">AI Chat</th>
              <th className="px-4 py-3 font-medium text-center">Buyer Plan</th>
              <th className="px-4 py-3 font-medium text-center">Seller Plan</th>
              <th className="px-4 py-3 font-medium text-center">Estimator</th>
              <th className="px-4 py-3 font-medium text-center">Override</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No users found</td>
              </tr>
            )}
            {filtered.map(user => {
              const usage    = usageMap[user.id]    || { chat: 0, buyer: 0, seller: 0, estimator: 0 }
              const override = overrides[user.id]   || null
              const limits   = getResolvedLimits(tenant, override)
              const hasOverride = !!override

              return (
                <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{user.full_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-400">{user.phone || '—'}</div>
                    <div className="text-xs text-gray-400">{new Date(user.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.assigned_agent_id ? agentMap[user.assigned_agent_id] || '—' : '—'}
                  </td>
                  {(['chat', 'buyer', 'seller', 'estimator'] as const).map(pool => (
                    <td key={pool} className="px-4 py-3 text-center">
                      <span className={ont-semibold }>
                        {usage[pool]}
                      </span>
                      <span className="text-gray-400"> / </span>
                      <span className={hasOverride && overrides[user.id]?.[pool === 'chat' ? 'ai_chat_limit' : pool === 'buyer' ? 'buyer_plan_limit' : pool === 'seller' ? 'seller_plan_limit' : 'estimator_limit'] != null ? 'text-blue-600 font-semibold' : 'text-gray-500'}>
                        {limits[pool]}
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    {hasOverride
                      ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Custom</span>
                      : <span className="text-xs text-gray-400">Tenant Default</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openModal(user)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                      >
                        Set Limits
                      </button>
                      {hasOverride && (
                        <button
                          onClick={() => handleClearOverride(user.id)}
                          className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Override Modal */}
      {modalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Set Credit Limits</h2>
            <p className="text-sm text-gray-500 mb-5">
              {modalUser.full_name || 'User'} — leave blank to use tenant default
            </p>

            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{saveError}</div>
            )}

            <div className="space-y-4">
              {[
                { label: 'AI Chat', value: chatLimit, set: setChatLimit, cap: hardCaps.chat },
                { label: 'Buyer Plan', value: buyerLimit, set: setBuyerLimit, cap: hardCaps.buyer },
                { label: 'Seller Plan', value: sellerLimit, set: setSellerLimit, cap: hardCaps.seller },
                { label: 'Estimator', value: estimatorLimit, set: setEstimatorLimit, cap: hardCaps.estimator },
              ].map(({ label, value, set, cap }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium text-gray-700 w-28">{label}</label>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      min={0}
                      max={cap}
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="Tenant default"
                      className="border rounded px-3 py-1.5 text-sm w-full"
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">max {cap}</span>
                  </div>
                </div>
              ))}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Note (internal)</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
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
                {saving ? 'Saving...' : 'Save Limits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}