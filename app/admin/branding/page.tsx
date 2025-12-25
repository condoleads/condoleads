'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Save, Globe, Edit2, X, Check } from 'lucide-react'

interface Agent {
  id: string
  full_name: string
  subdomain: string
  custom_domain: string | null
  site_title: string | null
  site_tagline: string | null
  og_image_url: string | null
  is_active: boolean
}

export default function BrandingPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Agent>>({})
  const [saving, setSaving] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    fetchAgents()
  }, [])

  async function fetchAgents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('agents')
      .select('id, full_name, subdomain, custom_domain, site_title, site_tagline, og_image_url, is_active')
      .order('full_name')
    
    if (error) {
      console.error('Error fetching agents:', error)
    } else {
      setAgents(data || [])
    }
    setLoading(false)
  }

  function startEditing(agent: Agent) {
    setEditingId(agent.id)
    setEditForm({
      custom_domain: agent.custom_domain || '',
      site_title: agent.site_title || '',
      site_tagline: agent.site_tagline || '',
      og_image_url: agent.og_image_url || ''
    })
  }

  function cancelEditing() {
    setEditingId(null)
    setEditForm({})
  }

  async function saveAgent() {
    if (!editingId) return
    setSaving(true)

    const { error } = await supabase
      .from('agents')
      .update({
        custom_domain: editForm.custom_domain || null,
        site_title: editForm.site_title || null,
        site_tagline: editForm.site_tagline || null,
        og_image_url: editForm.og_image_url || null
      })
      .eq('id', editingId)

    if (error) {
      alert('Error saving: ' + error.message)
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

  const filteredAgents = agents.filter(a => 
    a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.subdomain.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.custom_domain && a.custom_domain.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Branding & Domains</h1>
        <p className="text-gray-600 mt-2">Manage agent site titles, taglines, and custom domains</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, subdomain, or domain..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Agents Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Agent</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Subdomain</th>
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
                      <div className={`text-xs ${agent.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {agent.is_active ? '● Active' : '○ Inactive'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {agent.subdomain}.condoleads.ca
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
                        placeholder="Site Title"
                        className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={editForm.site_tagline || ''}
                        onChange={(e) => setEditForm({ ...editForm, site_tagline: e.target.value })}
                        placeholder="Your tagline here..."
                        className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={saveAgent}
                          disabled={saving}
                          className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
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
                      <div className={`text-xs ${agent.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {agent.is_active ? '● Active' : '○ Inactive'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <a 
                        href={`https://${agent.subdomain}.condoleads.ca`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {agent.subdomain}.condoleads.ca
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      {agent.custom_domain ? (
                        <a 
                          href={`https://${agent.custom_domain}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-purple-600 hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-4 h-4" />
                          {agent.custom_domain}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {agent.site_title ? (
                        <span className="text-sm text-gray-900">{agent.site_title}</span>
                      ) : (
                        <span className="text-sm text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {agent.site_tagline ? (
                        <span className="text-sm text-gray-600 truncate block max-w-xs" title={agent.site_tagline}>
                          {agent.site_tagline}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => startEditing(agent)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAgents.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No agents found
          </div>
        )}
      </div>

      {/* OG Image Section - Expandable */}
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
    </div>
  )
}
