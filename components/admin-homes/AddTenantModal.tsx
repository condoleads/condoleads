// components/admin-homes/AddTenantModal.tsx
'use client'

import { useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddTenantModal({ isOpen, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [formData, setFormData] = useState({
    // Brand
    name: '', domain: '', brand_name: '', admin_email: '',
    logo_url: '', primary_color: '#1d4ed8', secondary_color: '#4f46e5',
    // API Key
    anthropic_api_key: '',
    // AI Configuration (Charlie chat)
    ai_free_messages: 1, vip_auto_approve: false,
    ai_auto_approve_limit: 2, ai_manual_approve_limit: 3, ai_hard_cap: 10,
    // Estimator Configuration (non-AI comparables)
    estimator_nonai_enabled: true,
    estimator_free_attempts: 1, estimator_vip_auto_approve: false,
    estimator_auto_approve_attempts: 2, estimator_manual_approve_attempts: 3,
    estimator_hard_cap: 10,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { error: err } = await supabase.from('tenants').insert({
        name: formData.name,
        domain: formData.domain.toLowerCase(),
        brand_name: formData.brand_name || formData.name,
        admin_email: formData.admin_email,
        logo_url: formData.logo_url || null,
        primary_color: formData.primary_color,
        secondary_color: formData.secondary_color,
        anthropic_api_key: formData.anthropic_api_key || null,
        ai_free_messages: formData.ai_free_messages,
        vip_auto_approve: formData.vip_auto_approve,
        ai_auto_approve_limit: formData.ai_auto_approve_limit,
        ai_manual_approve_limit: formData.ai_manual_approve_limit,
        ai_hard_cap: formData.ai_hard_cap,
        estimator_ai_enabled: false,
        estimator_nonai_enabled: formData.estimator_nonai_enabled,
        estimator_free_attempts: formData.estimator_free_attempts,
        estimator_vip_auto_approve: formData.estimator_vip_auto_approve,
        estimator_auto_approve_attempts: formData.estimator_auto_approve_attempts,
        estimator_manual_approve_attempts: formData.estimator_manual_approve_attempts,
        estimator_hard_cap: formData.estimator_hard_cap,
      })
      if (err) { setError(err.message); return }
      onSuccess(); onClose()
    } catch { setError('Failed to create tenant') }
    setSaving(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Add Tenant</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

          {/* Brand */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Brand</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="WALLiam" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <input type="text" value={formData.brand_name} onChange={e => setFormData({ ...formData, brand_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Defaults to name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain *</label>
                <input required type="text" value={formData.domain} onChange={e => setFormData({ ...formData, domain: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="walliam.ca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input required type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="admin@walliam.ca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.primary_color} onChange={e => setFormData({ ...formData, primary_color: e.target.value })} className="w-10 h-10 border rounded cursor-pointer" />
                  <input type="text" value={formData.primary_color} onChange={e => setFormData({ ...formData, primary_color: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.secondary_color} onChange={e => setFormData({ ...formData, secondary_color: e.target.value })} className="w-10 h-10 border rounded cursor-pointer" />
                  <input type="text" value={formData.secondary_color} onChange={e => setFormData({ ...formData, secondary_color: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                <input type="url" value={formData.logo_url} onChange={e => setFormData({ ...formData, logo_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://..." />
              </div>
            </div>
          </div>

          {/* Anthropic API Key */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-1">Anthropic API Key</h3>
            <p className="text-xs text-blue-600 mb-3">Powers Charlie AI for this tenant. Falls back to platform key if not set.</p>
            <div className="flex gap-2">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData.anthropic_api_key}
                onChange={e => setFormData({ ...formData, anthropic_api_key: e.target.value })}
                className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                placeholder="sk-ant-..."
              />
              <button type="button" onClick={() => setShowApiKey(v => !v)} className="px-3 py-2 border rounded-lg text-gray-500 hover:bg-gray-50">
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* AI Configuration — Charlie chat */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-1">✦ AI Configuration</h3>
            <p className="text-xs text-green-700 mb-3">Controls Charlie AI chat access for all users on this tenant.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Plans Per User</label>
                <input type="number" min={0} value={formData.ai_free_messages} onChange={e => setFormData({ ...formData, ai_free_messages: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Plans before approval required</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hard Cap</label>
                <input type="number" min={1} value={formData.ai_hard_cap} onChange={e => setFormData({ ...formData, ai_hard_cap: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plans on Auto-Approve</label>
                <input type="number" min={0} value={formData.ai_auto_approve_limit} onChange={e => setFormData({ ...formData, ai_auto_approve_limit: parseInt(e.target.value) || 2 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plans on Manual Approve</label>
                <input type="number" min={0} value={formData.ai_manual_approve_limit} onChange={e => setFormData({ ...formData, ai_manual_approve_limit: parseInt(e.target.value) || 3 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.vip_auto_approve} onChange={e => setFormData({ ...formData, vip_auto_approve: e.target.checked })} className="w-4 h-4 text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Auto-Approve Requests</span>
                    <p className="text-xs text-gray-400">Instantly grant plans without manual review</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Estimator Configuration — non-AI comparables */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-1">⊹ Estimator Configuration</h3>
            <p className="text-xs text-purple-700 mb-3">Controls property estimator access (comparable data) for all users on this tenant.</p>

            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-white rounded-lg border">
                <input type="checkbox" checked={formData.estimator_nonai_enabled} onChange={e => setFormData({ ...formData, estimator_nonai_enabled: e.target.checked })} className="w-4 h-4 text-purple-600" />
                <div>
                  <span className="text-sm font-medium text-gray-700">Enable Estimator</span>
                  <p className="text-xs text-gray-400">Allow users to request property estimates</p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Attempts Per User</label>
                <input type="number" min={0} value={formData.estimator_free_attempts} onChange={e => setFormData({ ...formData, estimator_free_attempts: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hard Cap</label>
                <input type="number" min={1} value={formData.estimator_hard_cap} onChange={e => setFormData({ ...formData, estimator_hard_cap: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attempts on Auto-Approve</label>
                <input type="number" min={0} value={formData.estimator_auto_approve_attempts} onChange={e => setFormData({ ...formData, estimator_auto_approve_attempts: parseInt(e.target.value) || 2 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attempts on Manual Approve</label>
                <input type="number" min={0} value={formData.estimator_manual_approve_attempts} onChange={e => setFormData({ ...formData, estimator_manual_approve_attempts: parseInt(e.target.value) || 3 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.estimator_vip_auto_approve} onChange={e => setFormData({ ...formData, estimator_vip_auto_approve: e.target.checked })} className="w-4 h-4 text-purple-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Auto-Approve Estimator Requests</span>
                    <p className="text-xs text-gray-400">Instantly grant attempts without manual review</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}