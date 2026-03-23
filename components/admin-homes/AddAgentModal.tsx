// components/admin-homes/AddAgentModal.tsx
// Adapted from components/admin/AddAgentModal.tsx
// WALLiam additions: site_type='comprehensive', VIP config section
'use client'

import { useState, useEffect } from 'react'
import { X, Upload, Users } from 'lucide-react'

interface Agent {
  id: string
  full_name: string
  subdomain: string
  can_create_children?: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingAgents?: Agent[]
  preselectedParentId?: string | null
}

export default function AddAgentModal({ isOpen, onClose, onSuccess, existingAgents = [], preselectedParentId = null }: Props) {
  const [agents, setAgents] = useState<Agent[]>(existingAgents)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')

  const [formData, setFormData] = useState({
    full_name: '', email: '', cell_phone: '', office_phone: '', whatsapp_number: '',
    password: '', confirmPassword: '',
    title: 'Realtor', customTitle: '', useCustomTitle: false,
    brokerage_name: '', brokerage_address: '', license_number: '',
    subdomain: '', custom_domain: '', bio: '', profile_photo_url: '',
    parent_id: '', can_create_children: false,
    primary_color: '#16a34a', secondary_color: '#15803d',
    // WALLiam VIP config
    ai_free_messages: 1,
    vip_auto_approve: false,
    ai_auto_approve_limit: 2,
    ai_manual_approve_limit: 3,
    ai_hard_cap: 10,
  })

  useEffect(() => {
    if (preselectedParentId) setFormData(p => ({ ...p, parent_id: preselectedParentId }))
  }, [preselectedParentId, isOpen])

  useEffect(() => {
    if (isOpen && existingAgents.length === 0) {
      fetch('/api/admin-homes/agents/list').then(r => r.json()).then(d => { if (d.agents) setAgents(d.agents) })
    }
  }, [isOpen])

  function generateSubdomain(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30)
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('File must be under 5MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const fileName = `agents/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { error } = await supabase.storage.from('agent-photos').upload(fileName, file, { cacheControl: '3600', upsert: true })
      if (error) { alert('Upload failed: ' + error.message); return }
      const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName)
      if (urlData?.publicUrl) { setPhotoPreview(urlData.publicUrl); setFormData(p => ({ ...p, profile_photo_url: urlData.publicUrl })) }
    } catch (err) { console.error('Upload error:', err) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return }
    if (formData.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError('')

    const finalTitle = formData.useCustomTitle && formData.customTitle.trim() ? formData.customTitle.trim() : formData.title

    try {
      const res = await fetch('/api/admin-homes/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          title: finalTitle,
          site_type: 'comprehensive',
          profile_photo_url: photoPreview || formData.profile_photo_url,
          parent_id: formData.parent_id || null,
          custom_domain: formData.custom_domain || null,
          branding: { primary_color: formData.primary_color, secondary_color: formData.secondary_color },
          // VIP config
          ai_free_messages: formData.ai_free_messages,
          vip_auto_approve: formData.vip_auto_approve,
          ai_auto_approve_limit: formData.ai_auto_approve_limit,
          ai_manual_approve_limit: formData.ai_manual_approve_limit,
          ai_hard_cap: formData.ai_hard_cap,
        })
      })
      const data = await res.json()
      if (data.success) { onSuccess(); onClose() }
      else setError(data.error)
    } catch { setError('Failed to create agent') }
    setSaving(false)
  }

  if (!isOpen) return null

  const availableParents = agents.filter(a => a.can_create_children !== false)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Add WALLiam Agent</h2>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

          {/* Team Hierarchy */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Team Hierarchy</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reports To</label>
                <select value={formData.parent_id} onChange={e => setFormData({ ...formData, parent_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">None (Solo / Top-level)</option>
                  {availableParents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.can_create_children} onChange={e => setFormData({ ...formData, can_create_children: e.target.checked })} className="w-4 h-4" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Can Manage Team</span>
                    <p className="text-xs text-gray-400">Allow agents under them</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* VIP Config — WALLiam specific */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-3">✦ WALLiam VIP Access Config</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Plans Per User</label>
                <input type="number" min={0} max={10} value={formData.ai_free_messages} onChange={e => setFormData({ ...formData, ai_free_messages: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Plans available before VIP required</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hard Cap (max ever)</label>
                <input type="number" min={1} max={100} value={formData.ai_hard_cap} onChange={e => setFormData({ ...formData, ai_hard_cap: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plans on Auto-Approve</label>
                <input type="number" min={0} value={formData.ai_auto_approve_limit} onChange={e => setFormData({ ...formData, ai_auto_approve_limit: parseInt(e.target.value) || 2 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plans on Manual Approve</label>
                <input type="number" min={0} value={formData.ai_manual_approve_limit} onChange={e => setFormData({ ...formData, ai_manual_approve_limit: parseInt(e.target.value) || 3 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.vip_auto_approve} onChange={e => setFormData({ ...formData, vip_auto_approve: e.target.checked })} className="w-4 h-4 text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Auto-Approve VIP Requests</span>
                    <p className="text-xs text-gray-400">Instantly grant plans without manual review</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value, subdomain: generateSubdomain(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cell Phone *</label>
                <input type="tel" required value={formData.cell_phone} onChange={e => setFormData({ ...formData, cell_phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" required minLength={8} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                <input type="password" required minLength={8} value={formData.confirmPassword} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* Professional Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Professional Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <select value={formData.useCustomTitle ? 'custom' : formData.title} onChange={e => {
                  const v = e.target.value
                  v === 'custom' ? setFormData({ ...formData, useCustomTitle: true, title: '' }) : setFormData({ ...formData, title: v, useCustomTitle: false })
                }} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="Realtor">Realtor</option>
                  <option value="Broker">Broker</option>
                  <option value="Broker of Record">Broker of Record</option>
                  <option value="Sales Representative">Sales Representative</option>
                  <option value="custom">Custom...</option>
                </select>
                {formData.useCustomTitle && <input type="text" required value={formData.customTitle} onChange={e => setFormData({ ...formData, customTitle: e.target.value })} className="w-full mt-2 px-3 py-2 border rounded-lg text-sm" placeholder="Custom title" />}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                <input type="text" value={formData.license_number} onChange={e => setFormData({ ...formData, license_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Name *</label>
                <input type="text" required value={formData.brokerage_name} onChange={e => setFormData({ ...formData, brokerage_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Address *</label>
                <textarea required rows={2} value={formData.brokerage_address} onChange={e => setFormData({ ...formData, brokerage_address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* Website */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Website</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain *</label>
                <div className="flex items-center gap-2">
                  <input type="text" required value={formData.subdomain} onChange={e => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  <span className="text-gray-400 text-xs whitespace-nowrap">.condoleads.ca</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
                <input type="text" value={formData.custom_domain} onChange={e => setFormData({ ...formData, custom_domain: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="agent.ca (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profile Photo</label>
                <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-green-500 text-sm text-gray-500">
                  <Upload className="w-4 h-4" /> Upload
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
                {photoPreview && <img src={photoPreview} alt="Preview" className="w-12 h-12 rounded-full object-cover mt-2" />}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea rows={2} value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}