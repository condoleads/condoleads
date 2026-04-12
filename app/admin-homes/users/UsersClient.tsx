'use client'
import { useState } from 'react'

interface Usage { chat: number; plans: number; estimator: number }
interface Props {
  users: any[]
  usageMap: Record<string, Usage>
  overrideMap: Record<string, any>
  tenant: any
  agentMap: Record<string, string>
  adminUser: any
  tenantId: string
}

function getTenantDefaults(tenant: any): Usage {
  return {
    chat:      (tenant?.ai_free_messages ?? 1) + (tenant?.ai_auto_approve_limit ?? 2) + (tenant?.ai_manual_approve_limit ?? 3),
    plans:     (tenant?.plan_free_attempts ?? 1) + (tenant?.plan_auto_approve_limit ?? 0) + (tenant?.plan_manual_approve_limit ?? 3),
    estimator: (tenant?.estimator_free_attempts ?? 1) + (tenant?.estimator_auto_approve_attempts ?? 2) + (tenant?.estimator_manual_approve_attempts ?? 3),
  }
}

function getResolvedLimits(tenant: any, override: any): Usage {
  const d = getTenantDefaults(tenant)
  return {
    chat:      override?.ai_chat_limit      != null ? Math.min(override.ai_chat_limit,      tenant?.ai_hard_cap ?? 10)          : d.chat,
    plans:     override?.buyer_plan_limit   != null ? Math.min(override.buyer_plan_limit,   tenant?.plan_hard_cap ?? 10)        : d.plans,
    estimator: override?.estimator_limit    != null ? Math.min(override.estimator_limit,    tenant?.estimator_hard_cap ?? 10)   : d.estimator,
  }
}

const POOLS: { key: keyof Usage; label: string; overrideKey: string }[] = [
  { key: 'chat',      label: 'AI Chat',     overrideKey: 'ai_chat_limit' },
  { key: 'plans',     label: 'AI Plans',    overrideKey: 'buyer_plan_limit' },
  { key: 'estimator', label: 'Estimator',   overrideKey: 'estimator_limit' },
]

export default function UsersClient({ users, usageMap, overrideMap, tenant, agentMap, adminUser, tenantId }: Props) {
  const [search, setSearch]               = useState('')
  const [modalUser, setModalUser]         = useState<any>(null)
  const [overrides, setOverrides]         = useState<Record<string, any>>(overrideMap)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [chatLimit, setChatLimit]         = useState('')
  const [plansLimit, setPlansLimit]       = useState('')
  const [estimatorLimit, setEstimatorLimit] = useState('')
  const [note, setNote]                   = useState('')

  const hardCaps = {
    chat:      tenant?.ai_hard_cap ?? 10,
    plans:     tenant?.plan_hard_cap ?? 10,
    estimator: tenant?.estimator_hard_cap ?? 10,
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q)
  })

  function openModal(user: any) {
    const ex = overrides[user.id]
    setChatLimit(ex?.ai_chat_limit      != null ? String(ex.ai_chat_limit)      : '')
    setPlansLimit(ex?.buyer_plan_limit  != null ? String(ex.buyer_plan_limit)   : '')
    setEstimatorLimit(ex?.estimator_limit != null ? String(ex.estimator_limit)  : '')
    setNote(ex?.note || '')
    setSaveError(null)
    setModalUser(user)
  }

  function closeModal() { setModalUser(null); setSaveError(null) }

  async function handleSave() {
    if (!modalUser) return
    setSaving(true); setSaveError(null)
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
          planLimit:  plansLimit     !== '' ? parseInt(plansLimit)     : null,
          estimatorLimit:  estimatorLimit !== '' ? parseInt(estimatorLimit) : null,
        }),
      })
      if (!res.ok) { const e = await res.json(); setSaveError(e.error || 'Failed'); return }
      const { override } = await res.json()
      setOverrides(prev => ({ ...prev, [modalUser.id]: override }))
      closeModal()
    } catch { setSaveError('Network error — try again') }
    finally { setSaving(false) }
  }

  async function handleClear(userId: string) {
    try {
      await fetch('/api/admin-homes/users/override', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tenantId }),
      })
      setOverrides(prev => { const n = { ...prev }; delete n[userId]; return n })
    } catch (e) { console.error('Clear failed', e) }
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
              <th className="px-4 py-3 font-medium">Agent</th>
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
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
            )}
            {filtered.map(user => {
              const usage    = usageMap[user.id]  || { chat: 0, plans: 0, estimator: 0 }
              const override = overrides[user.id] || null
              const limits   = getResolvedLimits(tenant, override)
              const hasOverride = !!override
              return (
                <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{user.full_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-400">{user.phone || '—'}</div>
                    <div className="text-xs text-gray-400">{new Date(user.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {user.assigned_agent_id ? (agentMap[user.assigned_agent_id] || '—') : '—'}
                  </td>
                  {POOLS.map(({ key, overrideKey, label }) => {
                    const used = usage[key]
                    const limit = limits[key]
                    const remaining = Math.max(0, limit - used)
                    const isOverridden = override?.[overrideKey] != null
                    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
                    const isEmpty = remaining === 0
                    const isLow = remaining === 1
                    const barColor = isEmpty ? '#ef4444' : isLow ? '#f59e0b' : isOverridden ? '#3b82f6' : '#10b981'
                    const textColor = isEmpty ? 'text-red-600' : isLow ? 'text-amber-500' : isOverridden ? 'text-blue-600' : 'text-gray-700'
                    const icons: Record<string,string> = { chat: '💬', plans: '📋', estimator: '📊' }
                    return (
                      <td key={key} className="px-3 py-3">
                        <div className="flex flex-col items-center gap-1 min-w-16">
                          <div className={`flex items-center gap-1 text-sm font-bold ${textColor}`}>
                            <span className="text-xs">{icons[key]}</span>
                            <span>{remaining}</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div style={{ width: `${pct}%`, background: barColor }} className="h-full rounded-full transition-all" />
                          </div>
                          <div className="text-xs text-gray-400">{used}/{limit}</div>
                          {isOverridden && <div className="text-xs text-blue-500 font-medium">custom</div>}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-center">
                    {hasOverride
                      ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Custom</span>
                      : <span className="text-xs text-gray-400">Default</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openModal(user)} className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors">
                        Set Limits
                      </button>
                      {hasOverride && (
                        <button onClick={() => handleClear(user.id)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors">
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

      {modalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Set Credit Limits</h2>
            <p className="text-sm text-gray-500 mb-5">{modalUser.full_name || 'User'} — leave blank to use tenant default</p>
            {saveError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{saveError}</div>}
            <div className="space-y-4">
              {[
                { label: 'AI Chat',     value: chatLimit,       set: setChatLimit,       cap: hardCaps.chat },
                { label: 'AI Plans',  value: plansLimit,      set: setPlansLimit,      cap: hardCaps.plans },
                { label: 'Estimator',   value: estimatorLimit,  set: setEstimatorLimit,  cap: hardCaps.estimator },
              ].map(({ label, value, set, cap }) => (
                <div key={label} className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 w-28">{label}</label>
                  <input
                    type="number" min={0} max={cap} value={value}
                    onChange={e => set(e.target.value)}
                    placeholder="Tenant default"
                    className="border rounded px-3 py-1.5 text-sm flex-1"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">max {cap}</span>
                </div>
              ))}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Note (internal)</label>
                <input
                  type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Serious buyer, approved extended access"
                  className="border rounded px-3 py-1.5 text-sm w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save Limits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}