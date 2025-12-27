'use client'

import { useState } from 'react'
import { Search, Globe, Edit2, X, Check, Plus } from 'lucide-react'
import { updateAgentBranding, addAgentCustomDomain, removeAgentCustomDomain } from './actions'

interface Agent {
  id: string
  full_name: string
  subdomain: string
  custom_domain: string | null
  site_title: string | null
  site_tagline: string | null
  og_image_url: string | null
  google_analytics_id: string | null
  google_ads_id: string | null
  google_conversion_label: string | null
  facebook_pixel_id: string | null
  is_active: boolean
}

interface BrandingClientProps {
  initialAgents: Agent[]
}

export default function BrandingClient({ initialAgents }: BrandingClientProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents.filter(a => a.custom_domain))
  const [allAgents] = useState<Agent[]>(initialAgents)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Agent>>({})
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [newDomain, setNewDomain] = useState('')

  function startEditing(agent: Agent) {
    setEditingId(agent.id)
    setEditForm({
      custom_domain: agent.custom_domain || '',
      site_title: agent.site_title || '',
      site_tagline: agent.site_tagline || '',
      og_image_url: agent.og_image_url || '',
      google_analytics_id: agent.google_analytics_id || '',
      google_ads_id: agent.google_ads_id || '',
      google_conversion_label: agent.google_conversion_label || '',
      facebook_pixel_id: agent.facebook_pixel_id || ''
    })
  }

  function cancelEditing() {
    setEditingId(null)
    setEditForm({})
  }

  async function saveAgent() {
    if (!editingId) return
    setSaving(true)

    const result = await updateAgentBranding(editingId, {
      custom_domain: editForm.custom_domain || null,
      site_title: editForm.site_title || null,
      site_tagline: editForm.site_tagline || null,
      og_image_url: editForm.og_image_url || null,
      google_analytics_id: editForm.google_analytics_id || null,
      google_ads_id: editForm.google_ads_id || null,
      google_conversion_label: editForm.google_conversion_label || null,
      facebook_pixel_id: editForm.facebook_pixel_id || null
    })

    if (!result.success) {
      alert('Error saving: ' + result.error)
    } else {
      setAgents(prev => prev.map(a => 
        a.id === editingId 
          ? { ...a, ...editForm } as Agent
          : a
      ))
      setEditingId(null)
      setEditForm({})
      alert('Saved successfully!')
    }
    setSaving(false)
  }

  async function handleAddCustomDomain() {
    if (!selectedAgentId || !newDomain) {
      alert('Please select an agent and enter a domain')
      return
    }
    
    setSaving(true)
    const result = await addAgentCustomDomain(selectedAgentId, newDomain)

    if (!result.success) {
      alert('Error adding domain: ' + result.error)
    } else {
      const addedAgent = allAgents.find(a => a.id === selectedAgentId)
      if (addedAgent) {
        setAgents(prev => [...prev, { ...addedAgent, custom_domain: newDomain }])
      }
      setShowAddModal(false)
      setSelectedAgentId('')
      setNewDomain('')
      alert('Custom domain added! Remember to configure DNS in Vercel.')
    }
    setSaving(false)
  }

  async function removeDomain(agentId: string) {
    if (!confirm('Remove custom domain from this agent?')) return
    
    const result = await removeAgentCustomDomain(agentId)

    if (!result.success) {
      alert('Error: ' + result.error)
    } else {
      setAgents(prev => prev.filter(a => a.id !== agentId))
    }
  }

  const filteredAgents = agents.filter(a => 
    a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.custom_domain && a.custom_domain.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const agentsWithoutDomain = allAgents.filter(a => !a.custom_domain)

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Custom Domain Branding</h1>
          <p className="text-gray-600 mt-2">Manage site titles, taglines, and branding for custom domains</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Custom Domain
        </button>
      </div>

      {/* Search */}
      {agents.length > 0 && (
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or domain..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Custom Domains Table */}
      {filteredAgents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Custom Domains Yet</h3>
          <p className="text-gray-500 mb-6">Add a custom domain to an agent to manage their branding.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Custom Domain
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Agent</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Custom Domain</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Site Title</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Tagline</th>
                <th className="text-center px-6 py-3 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
                  {editingId === agent.id ? (
                    <>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{agent.full_name}</div>
                        <div className="text-xs text-gray-500">{agent.subdomain}.condoleads.ca</div>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editForm.custom_domain || ''}
                          onChange={(e) => setEditForm({ ...editForm, custom_domain: e.target.value })}
                          placeholder="example.com"
                          className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editForm.site_title || ''}
                          onChange={(e) => setEditForm({ ...editForm, site_title: e.target.value })}
                          placeholder="e.g. YourCondoRealtor"
                          className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editForm.site_tagline || ''}
                          onChange={(e) => setEditForm({ ...editForm, site_tagline: e.target.value })}
                          placeholder="e.g. Toronto Condo Specialist"
                          className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={saveAgent}
                            disabled={saving}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{agent.full_name}</div>
                        <div className="text-xs text-gray-500">{agent.subdomain}.condoleads.ca</div>
                      </td>
                      <td className="px-6 py-4">
                        <a 
                          href={`https://${agent.custom_domain}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:underline flex items-center gap-1 font-medium"
                        >
                          <Globe className="w-4 h-4" />
                          {agent.custom_domain}
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        {agent.site_title ? (
                          <span className="text-gray-900 font-medium">{agent.site_title}</span>
                        ) : (
                          <span className="text-gray-400 italic">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {agent.site_tagline ? (
                          <span className="text-gray-600 truncate block max-w-xs" title={agent.site_tagline}>
                            {agent.site_tagline}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEditing(agent)}
                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeDomain(agent.id)}
                            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                            title="Remove Domain"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* OG Image Section */}
      {editingId && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Social Sharing Image (OG Image)</h3>
          <p className="text-sm text-gray-600 mb-4">
            This image appears when sharing links on WhatsApp, Facebook, Twitter, etc.
            Recommended size: 1200x630 pixels
          </p>
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <input
                type="text"
                value={editForm.og_image_url || ''}
                onChange={(e) => setEditForm({ ...editForm, og_image_url: e.target.value })}
                placeholder="https://example.com/og-image.jpg"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {editForm.og_image_url && (
              <div className="w-48 h-24 rounded-lg overflow-hidden bg-gray-100 border">
                <img 
                  src={editForm.og_image_url} 
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tracking & Ads Section */}
      {editingId && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Tracking & Advertising</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure Google Analytics, Google Ads, and Facebook Pixel for conversion tracking.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Analytics ID</label>
              <input
                type="text"
                value={editForm.google_analytics_id || ''}
                onChange={(e) => setEditForm({ ...editForm, google_analytics_id: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">GA4 Measurement ID</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Ads ID</label>
              <input
                type="text"
                value={editForm.google_ads_id || ''}
                onChange={(e) => setEditForm({ ...editForm, google_ads_id: e.target.value })}
                placeholder="AW-XXXXXXXXXX"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Google Ads Account ID</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Conversion Label</label>
              <input
                type="text"
                value={editForm.google_conversion_label || ''}
                onChange={(e) => setEditForm({ ...editForm, google_conversion_label: e.target.value })}
                placeholder="AbCdEfGhIjKlMnOp"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">For lead form submissions</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Pixel ID</label>
              <input
                type="text"
                value={editForm.facebook_pixel_id || ''}
                onChange={(e) => setEditForm({ ...editForm, facebook_pixel_id: e.target.value })}
                placeholder="XXXXXXXXXXXXXXXX"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">For Facebook/Instagram retargeting</p>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Domain Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Custom Domain</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Choose an agent...</option>
                  {agentsWithoutDomain.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name} ({a.subdomain})</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Enter without https:// or www.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowAddModal(false); setSelectedAgentId(''); setNewDomain(''); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomDomain}
                disabled={saving || !selectedAgentId || !newDomain}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {saving ? 'Adding...' : 'Add Domain'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}