'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Phone, Mail, MessageCircle, ArrowLeft, X } from 'lucide-react'
import { 
  updateLeadStatus, 
  updateLeadQuality, 
  addLeadNote, 
  addLeadTag, 
  removeLeadTag,
  setFollowUpDate 
} from '@/lib/actions/lead-management'

interface LeadDetailClientProps {
  lead: any
  agent: any
  initialNotes: any[]
}

export default function LeadDetailClient({ lead, agent, initialNotes }: LeadDetailClientProps) {
  const [status, setStatus] = useState(lead.status)
  const [quality, setQuality] = useState(lead.quality)
  const [tags, setTags] = useState(lead.tags || [])
  const [notes, setNotes] = useState(initialNotes)
  const [newNote, setNewNote] = useState('')
  const [followUpDate, setFollowUpDate] = useState(lead.follow_up_date || '')
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)

  const predefinedTags = ['Seller', 'Buyer', 'Investor', 'First-time buyer', 'Urgent', 'VIP']

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus)
    await updateLeadStatus(lead.id, newStatus)
  }

  async function handleQualityChange(newQuality: string) {
    setQuality(newQuality)
    await updateLeadQuality(lead.id, newQuality)
  }

  async function handleAddNote(e: React.FormEvent) {
    console.log(' handleAddNote called')
    e.preventDefault()
    if (!newNote.trim()) return

    setLoading(true)
    console.log('🔵 Calling addLeadNote with:', { leadId: lead.id, agentId: agent.id, note: newNote })
    const result = await addLeadNote(lead.id, agent.id, newNote)
    console.log(' addLeadNote result:', result)
    
    if (result.success) {
      setNotes([{
        id: Date.now().toString(),
        note: newNote,
        created_at: new Date().toISOString(),
        agents: { full_name: agent.full_name }
      }, ...notes])
      setNewNote('')
    }
    setLoading(false)
  }

  async function handleAddTag(tag: string) {
    if (tags.includes(tag)) return
    
    const result = await addLeadTag(lead.id, tag)
    if (result.success) {
      setTags([...tags, tag])
      setNewTag('')
    }
  }

  async function handleRemoveTag(tag: string) {
    const result = await removeLeadTag(lead.id, tag)
    if (result.success) {
      setTags(tags.filter((t: string) => t !== tag))
    }
  }

  async function handleFollowUpChange(date: string) {
    setFollowUpDate(date)
    await setFollowUpDate(lead.id, date)
  }

  const phoneNumber = lead.contact_phone ? lead.contact_phone.replace(/\D/g, '') : ''
  const contactName = encodeURIComponent(lead.contact_name || '')
  const agentName = encodeURIComponent(agent.full_name || '')
  const whatsappUrl = 'https://wa.me/' + phoneNumber + '?text=Hi%20' + contactName + '%2C%20this%20is%20' + agentName + '%20from%20CondoLeads.'

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-8">
        <a href="/dashboard/leads" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Leads
        </a>
        
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{lead.contact_name}</h1>
              <span className={'px-3 py-1 rounded-full text-sm font-semibold ' + (quality === 'hot' ? 'bg-red-100 text-red-700' : quality === 'warm' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700')}>
                {quality === 'hot' ? '' : quality === 'warm' ? '' : ''} {quality.toUpperCase()}
              </span>
              <span className={'px-3 py-1 rounded-full text-sm font-semibold ' + (status === 'new' ? 'bg-green-100 text-green-700' : status === 'contacted' ? 'bg-blue-100 text-blue-700' : status === 'qualified' ? 'bg-purple-100 text-purple-700' : status === 'closed' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700')}>
                {status.toUpperCase()}
              </span>
            </div>
            <p className="text-gray-600">{lead.contact_email}</p>
            {lead.contact_phone && <p className="text-gray-600">{lead.contact_phone}</p>}
          </div>

          <div className="flex gap-3">
            {lead.contact_phone && (
              <>
                <a href={'tel:' + lead.contact_phone} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  <Phone className="w-4 h-4" />
                  Call
                </a>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              </>
            )}
            <a href={'mailto:' + lead.contact_email} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Mail className="w-4 h-4" />
              Email
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Lead Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select value={status} onChange={(e) => handleStatusChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="closed">Closed</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quality</label>
                <select value={quality} onChange={(e) => handleQualityChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="hot"> Hot</option>
                  <option value="warm"> Warm</option>
                  <option value="cold"> Cold</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Follow-up Date</label>
                <input type="date" value={followUpDate} onChange={(e) => handleFollowUpChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600"><strong>Source:</strong> {lead.source.replace(/_/g, ' ')}</p>
                <p className="text-sm text-gray-600 mt-1"><strong>Created:</strong> {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</p>
              </div>
              {lead.message && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{lead.message}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Notes</h2>
            <form onSubmit={handleAddNote} className="mb-6">
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <button type="submit" disabled={loading || !newNote.trim()} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
                Add Note
              </button>
            </form>
            <div className="space-y-4">
              {notes.length === 0 ? (
                <p className="text-gray-500 text-sm">No notes yet</p>
              ) : (
                notes.map((note: any) => (
                  <div key={note.id} className="border-l-4 border-blue-500 pl-4 py-2">
                    <p className="text-sm text-gray-900">{note.note}</p>
                    <p className="text-xs text-gray-500 mt-1">{note.agents?.full_name}  {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Tags</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.map((tag: string) => (
                <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:bg-blue-200 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Quick Tags:</p>
              <div className="flex flex-wrap gap-2">
                {predefinedTags.filter(t => !tags.includes(t)).map((tag) => (
                  <button key={tag} onClick={() => handleAddTag(tag)} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200">
                    + {tag}
                  </button>
                ))}
              </div>
              <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Custom tag..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-4" onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newTag.trim()) handleAddTag(newTag.trim()) } }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

