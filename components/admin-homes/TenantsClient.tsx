// components/admin-homes/TenantsClient.tsx
'use client'

import { useState } from 'react'
import { Plus, Pencil, Globe, MapPin, Users, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import AddTenantModal from './AddTenantModal'
import EditTenantModal from './EditTenantModal'

interface Tenant {
  id: string
  name: string
  domain: string
  brand_name: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  admin_email: string
  is_active: boolean
  ai_free_messages: number
  vip_auto_approve: boolean
  ai_auto_approve_limit: number
  ai_manual_approve_limit: number
  ai_hard_cap: number
  created_at: string
  agent_count: number
  lead_count: number
  restriction_count: number
}

export default function TenantsClient({ tenants }: { tenants: Tenant[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-500 mt-1">Manage WALLiam-like branded platforms</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Add Tenant
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Total Tenants</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{tenants.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{tenants.filter(t => t.is_active).length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Total Agents</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{tenants.reduce((s, t) => s + t.agent_count, 0)}</p>
        </div>
      </div>

      {/* Tenant cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {tenants.map(tenant => (
          <div key={tenant.id} className="bg-white rounded-xl shadow overflow-hidden">
            {/* Color bar */}
            <div className="h-2" style={{ background: `linear-gradient(90deg, ${tenant.primary_color}, ${tenant.secondary_color})` }} />

            <div className="p-5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                {tenant.logo_url ? (
                  <img src={tenant.logo_url} alt={tenant.name} className="w-10 h-10 rounded-lg object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-lg"
                    style={{ background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})` }}>
                    ✦
                  </div>
                )}
                <div>
                  <div className="font-bold text-gray-900">{tenant.brand_name || tenant.name}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Globe className="w-3 h-3" /> {tenant.domain}
                  </div>
                </div>
                <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {tenant.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="flex items-center justify-center gap-1 text-gray-400 text-xs mb-1"><Users className="w-3 h-3" /> Agents</div>
                  <div className="font-bold text-gray-900">{tenant.agent_count}</div>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="flex items-center justify-center gap-1 text-gray-400 text-xs mb-1"><TrendingUp className="w-3 h-3" /> Leads</div>
                  <div className="font-bold text-gray-900">{tenant.lead_count}</div>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="flex items-center justify-center gap-1 text-gray-400 text-xs mb-1"><MapPin className="w-3 h-3" /> Restrictions</div>
                  <div className="font-bold text-gray-900">{tenant.restriction_count === 0 ? 'All' : tenant.restriction_count}</div>
                </div>
              </div>

              {/* VIP config */}
              <div className="bg-green-50 rounded-lg p-3 mb-4 text-xs text-gray-600">
                <span className="font-semibold text-green-700">VIP: </span>
                {tenant.ai_free_messages} free · {tenant.vip_auto_approve ? 'Auto' : 'Manual'} approve · Cap {tenant.ai_hard_cap}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditId(tenant.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <Link
                  href={`/admin-homes/tenants/${tenant.id}`}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-700 text-white rounded-lg text-xs font-semibold hover:bg-green-800"
                >
                  <MapPin className="w-3 h-3" /> Territory
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tenants.length === 0 && (
        <div className="text-center py-16 text-gray-400">No tenants yet. Add your first tenant.</div>
      )}

      <AddTenantModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSuccess={() => window.location.reload()} />
      <EditTenantModal isOpen={!!editId} tenantId={editId} onClose={() => setEditId(null)} onSuccess={() => window.location.reload()} />
    </div>
  )
}