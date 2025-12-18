'use client'

import { useState, useEffect } from 'react'
import { X, Upload, Users, Globe, Loader2 } from 'lucide-react'

interface Agent {
  id: string
  full_name: string
  subdomain: string
  custom_domain?: string
  can_create_children?: boolean
}

interface EditAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  agentId: string | null
  existingAgents?: Agent[]
}

export default function EditAgentModal({ isOpen, onClose, onSuccess, agentId, existingAgents = [] }: EditAgentModalProps) {
  const [agents, setAgents] = useState<Agent[]>(existingAgents)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    cell_phone: '',
    office_phone: '',
    whatsapp_number: '',
    title: 'Realtor',
    customTitle: '',
    useCustomTitle: false,
    brokerage_name: '',
    brokerage_address: '',
    license_number: '',
    subdomain: '',
    custom_domain: '',
    bio: '',
    profile_photo_url: '',
    notification_email: '',
    is_active: true,
    parent_id: '',
    can_create_children: false,
    primary_color: '#2563eb',
    secondary_color: '#1e40af'
  })

  useEffect(() => {
    if (isOpen && agentId) {
      loadAgent()
      if (existingAgents.length === 0) {
        fetchAgents()
      }
    }
  }, [isOpen, agentId])

  async function fetchAgents() {
    try {
      const res = await fetch('/api/admin/agents/list')
      const data = await res.json()
      if (data.agents) setAgents(data.agents)
    } catch (err) {
      console.error('Failed to fetch agents:', err)
    }
  }

  async function loadAgent() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/agents/${agentId}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      const agent = data.agent
      const branding = agent.branding || {}
      const standardTitles = ['Realtor', 'Broker', 'Broker of Record', 'Sales Representative']
      const isCustomTitle = agent.title && !standardTitles.includes(agent.title)
      setFormData({
        full_name: agent.full_name || '',
        email: agent.email || '',
        cell_phone: agent.cell_phone || '',
        office_phone: agent.office_phone || '',
        whatsapp_number: agent.whatsapp_number || '',
        title: isCustomTitle ? '' : (agent.title || 'Realtor'),
        customTitle: isCustomTitle ? agent.title : '',
        useCustomTitle: isCustomTitle,
        brokerage_name: agent.brokerage_name || '',
        brokerage_address: agent.brokerage_address || '',
        license_number: agent.license_number || '',
        subdomain: agent.subdomain || '',
        custom_domain: agent.custom_domain || '',
        bio: agent.bio || '',
        profile_photo_url: agent.profile_photo_url || '',
        notification_email: agent.notification_email || agent.email || '',
        is_active: agent.is_active !== false,
        parent_id: agent.parent_id || '',
        can_create_children: agent.can_create_children || false,
        primary_color: branding.primary_color || '#2563eb',
        secondary_color: branding.secondary_color || '#1e40af'
      })
      if (agent.profile_photo_url) setPhotoPreview(agent.profile_photo_url)
    } catch (err) { setError('Failed to load agent') }
    finally { setLoading(false) }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const finalTitle = formData.useCustomTitle && formData.customTitle.trim() ? formData.customTitle.trim() : formData.title
    try {
      const response = await fetch(`/api/admin/agents/${agentId}`, {
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
          can_create_children: formData.can_create_children,
          branding: { primary_color: formData.primary_color, secondary_color: formData.secondary_color }
        })
      })
      const data = await response.json()
      if (data.success) { onSuccess(); onClose() }
      else { setError(data.error) }
    } catch (err) { setError('Failed to update agent') }
    setSaving(false)
  }

  if (!isOpen) return null
  const availableParents = agents.filter(a => a.id !== agentId && a.can_create_children !== false)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Edit Agent</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Loading agent...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

            {/* Status Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Agent Status</p>
                <p className="text-sm text-gray-500">Inactive agents cannot log in or receive leads</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({...formData, is_active: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">{formData.is_active ? 'Active' : 'Inactive'}</span>
              </label>
            </div>

            {/* Team Hierarchy */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />Team Hierarchy
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reports To (Parent)</label>
                  <select value={formData.parent_id} onChange={(e) => setFormData({...formData, parent_id: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="">None (Top-level / Solo)</option>
                    {availableParents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.full_name} {agent.custom_domain ? `(${agent.custom_domain})` : `(${agent.subdomain})`}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Leave empty for solo agents or top-level managers</p>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={formData.can_create_children} onChange={(e) => setFormData({...formData, can_create_children: e.target.checked})} className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                    <div>
                      <span className="font-medium text-gray-700">Can Manage Team</span>
                      <p className="text-xs text-gray-500">Allow this agent to have agents under them</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cell Phone <span className="text-red-500">*</span></label>
                  <input type="tel" value={formData.cell_phone} onChange={(e) => setFormData({...formData, cell_phone: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Office Phone</label>
                  <input type="tel" value={formData.office_phone} onChange={(e) => setFormData({...formData, office_phone: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="416-555-0100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                  <input type="tel" value={formData.whatsapp_number} onChange={(e) => setFormData({...formData, whatsapp_number: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="+1 416-555-0123" />
                  <p className="text-xs text-gray-500 mt-1">Include country code for WhatsApp</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notification Email</label>
                  <input type="email" value={formData.notification_email} onChange={(e) => setFormData({...formData, notification_email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Defaults to primary email" />
                  <p className="text-xs text-gray-500 mt-1">Where lead notifications are sent</p>
                </div>
              </div>
            </div>

            {/* Professional Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Professional Information (RECO)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                  <select required={!formData.useCustomTitle} value={formData.useCustomTitle ? 'custom' : formData.title} onChange={(e) => { const val = e.target.value; if (val === 'custom') { setFormData({...formData, useCustomTitle: true, title: ''}) } else { setFormData({...formData, title: val, useCustomTitle: false, customTitle: ''}) }}} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="Realtor">Realtor</option>
                    <option value="Broker">Broker</option>
                    <option value="Broker of Record">Broker of Record</option>
                    <option value="Sales Representative">Sales Representative</option>
                    <option value="custom">Custom Title...</option>
                  </select>
                  {formData.useCustomTitle && <input type="text" required value={formData.customTitle} onChange={(e) => setFormData({...formData, customTitle: e.target.value})} className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Enter custom title" />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                  <input type="text" value={formData.license_number} onChange={(e) => setFormData({...formData, license_number: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.brokerage_name} onChange={(e) => setFormData({...formData, brokerage_name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Address <span className="text-red-500">*</span></label>
                  <textarea required value={formData.brokerage_address} onChange={(e) => setFormData({...formData, brokerage_address: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" rows={2} />
                </div>
              </div>
            </div>

            {/* Website Setup */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Globe className="w-5 h-5" />Website Setup</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain <span className="text-red-500">*</span></label>
                    <div className="flex items-center gap-2">
                      <input type="text" required value={formData.subdomain} onChange={(e) => setFormData({...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                      <span className="text-gray-500 whitespace-nowrap">.condoleads.ca</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
                    <input type="text" value={formData.custom_domain} onChange={(e) => setFormData({...formData, custom_domain: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '')})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="kingshah.ca (optional)" />
                    <p className="text-xs text-gray-500 mt-1">For managers/brokerages with their own domain</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={formData.primary_color} onChange={(e) => setFormData({...formData, primary_color: e.target.value})} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
                      <input type="text" value={formData.primary_color} onChange={(e) => setFormData({...formData, primary_color: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={formData.secondary_color} onChange={(e) => setFormData({...formData, secondary_color: e.target.value})} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
                      <input type="text" value={formData.secondary_color} onChange={(e) => setFormData({...formData, secondary_color: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio / Description</label>
                  <textarea value={formData.bio} onChange={(e) => setFormData({...formData, bio: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" rows={3} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Profile Photo</label>
                  <div className="flex items-start gap-4">
                    {photoPreview && <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover" />}
                    <div className="flex-1">
                      <label className="flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                        <Upload className="w-5 h-5 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-600">Upload Photo</span>
                        <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                      </label>
                      <p className="text-xs text-gray-500 mt-1">Or paste URL below</p>
                      <input type="url" value={formData.profile_photo_url} onChange={(e) => { setFormData({...formData, profile_photo_url: e.target.value}); setPhotoPreview(e.target.value) }} className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm" placeholder="https://example.com/photo.jpg" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold overflow-hidden" style={{ backgroundColor: formData.primary_color }}>
                  {photoPreview ? <img src={photoPreview} alt="Agent" className="w-full h-full object-cover" /> : (formData.full_name?.charAt(0) || 'A')}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{formData.full_name || 'Agent Name'}</p>
                  <p className="text-sm text-gray-500">{formData.custom_domain || `${formData.subdomain || 'subdomain'}.condoleads.ca`}</p>
                  {formData.parent_id && <p className="text-xs text-blue-600">Under: {agents.find(a => a.id === formData.parent_id)?.full_name}</p>}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 font-medium">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
