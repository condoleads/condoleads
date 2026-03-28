// components/admin-homes/EditAgentModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Upload, Users, Loader2 } from 'lucide-react'

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
  agentId: string | null
  existingAgents?: Agent[]
}

export default function EditAgentModal({ isOpen, onClose, onSuccess, agentId, existingAgents = [] }: Props) {
  const [agents, setAgents] = useState<Agent[]>(existingAgents)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')

  const [formData, setFormData] = useState({
    full_name: '', email: '', cell_phone: '', office_phone: '', whatsapp_number: '',
    title: 'Realtor', customTitle: '', useCustomTitle: false,
    brokerage_name: '', brokerage_address: '', license_number: '',
    subdomain: '', custom_domain: '', bio: '', profile_photo_url: '',
    notification_email: '', is_active: true,
    parent_id: '', can_create_children: false,
    primary_color: '#16a34a', secondary_color: '#15803d', tenant_id: '',
  })

  useEffect(() => {
    if (isOpen && agentId) {
      loadAgent()
      if (existingAgents.length === 0) {
        fetch('/api/admin-homes/agents/list').then(r => r.json()).then(d => { if (d.agents) setAgents(d.agents) })
      }
    }
  }, [isOpen, agentId])

  async function loadAgent() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin-homes/agents/${agentId}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      const a = data.agent
      const branding = a.branding || {}
      const standardTitles = ['Realtor', 'Broker', 'Broker of Record', 'Sales Representative']
      const isCustomTitle = a.title && !standardTitles.includes(a.title)
      setFormData({
        full_name: a.full_name || '',
        email: a.email || '',
        cell_phone: a.cell_phone || '',
        office_phone: a.office_phone || '',
        whatsapp_number: a.whatsapp_number || '',
        title: isCustomTitle ? '' : (a.title || 'Realtor'),
        customTitle: isCustomTitle ? a.title : '',
        useCustomTitle: isCustomTitle,
        brokerage_name: a.brokerage_name || '',
        brokerage_address: a.brokerage_address || '',
        license_number: a.license_number || '',
        subdomain: a.subdomain || '',
        custom_domain: a.custom_domain || '',
        bio: a.bio || '',
        profile_photo_url: a.profile_photo_url || '',
        notification_email: a.notification_email || a.email || '',
        is_active: a.is_active !== false,
        parent_id: a.parent_id || '',
        tenant_id: a.tenant_id || '',
        can_create_children: a.can_create_children || false,
        primary_color: branding.primary_color || '#16a34a',
        secondary_color: branding.secondary_color || '#15803d',
      })
      if (a.profile_photo_url) setPhotoPreview(a.profile_photo_url)
    } catch { setError('Failed to load agent') }
    finally { setLoading(false) }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const fileName = `agents/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { error } = await supabase.storage.from('agent-photos').upload(fileName, file, { cacheControl: '3600', upsert: true })
      if (error) { alert('Upload failed'); return }
      const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName)
      if (urlData?.publicUrl) { setPhotoPreview(urlData.publicUrl); setFormData(p => ({ ...p, profile_photo_url: urlData.publicUrl })) }
    } catch (err) { console.error(err) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const finalTitle = formData.useCustomTitle && formData.customTitle.trim() ? formData.customTitle.trim() : formData.title
    try {
      const res = await fetch(`/api/admin-homes/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          cell_phone: formData.cell_phone,
          office_phone: formData.office_phone,
          whatsapp_number: formData.whatsapp_number,
          title: finalTitle,
          brokerage_name: formData.brokerage_name,
          brokerage_address: formData.brokerage_address,
          license_number: formData.license_number,
          subdomain: formData.subdomain,
          custom_domain: formData.custom_domain || null,
          bio: formData.bio || null,
          profile_photo_url: photoPreview || formData.profile_photo_url || null,
          notification_email: formData.notification_email || formData.email,
          is_active: formData.is_active,
          parent_id: formData.parent_id || null,
            tenant_id: formData.tenant_id || null,
          can_create_children: formData.can_create_children,
          branding: { primary_color: formData.primary_color, secondary_color: formData.secondary_color },
        })
      })
      const data = await res.json()
      if (data.success) { onSuccess(); onClose() }
      else setError(data.error)
    } catch { setError('Failed to update agent') }
    setSaving(false)
  }

  if (!isOpen) return null
  const availableParents = agents.filter(a => a.id !== agentId && a.can_create_children !== false)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Edit Agent</h2>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-400" /></button>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-3" />
            <p className="text-gray-500">Loading agent...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

            {/* Status toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Agent Status</p>
                <p className="text-xs text-gray-500">Inactive agents cannot receive leads</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                <span className="ml-3 text-sm font-medium">{formData.is_active ? 'Active' : 'Inactive'}</span>
              </label>
            </div>

            {/* Team Hierarchy */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Team Hierarchy</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
                  <select value={formData.tenant_id} onChange={e => setFormData({ ...formData, tenant_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">No Tenant</option>
                    <option value="b16e1039-38ed-43d7-bbc5-dd02bb651bc9">WALLiam</option>
                  </select>
                </div>
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

            {/* Personal Info */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input type="text" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notification Email</label>
                  <input type="email" value={formData.notification_email} onChange={e => setFormData({ ...formData, notification_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Defaults to email" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cell Phone</label>
                  <input type="tel" value={formData.cell_phone} onChange={e => setFormData({ ...formData, cell_phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage</label>
                  <input type="text" value={formData.brokerage_name} onChange={e => setFormData({ ...formData, brokerage_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
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
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}