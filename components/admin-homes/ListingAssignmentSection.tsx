// components/admin-homes/ListingAssignmentSection.tsx
// Single listing assignment (Priority 1 — KING overrides everything)
// Uses agent_listing_assignments table
'use client'

import { useState, useEffect } from 'react'
import { Home, Search, X, Plus } from 'lucide-react'

interface AssignedListing {
  listing_id: string
  mls_listings: {
    id: string
    listing_key: string
    unparsed_address: string
    list_price: number
    standard_status: string
  } | null
}

interface SearchResult {
  id: string
  listing_key: string
  unparsed_address: string
  list_price: number
  standard_status: string
}

interface Props {
  agentId: string
}

export default function ListingAssignmentSection({ agentId }: Props) {
  const [assigned, setAssigned] = useState<AssignedListing[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin-homes/agents/${agentId}/listings`)
      .then(r => r.json())
      .then(d => { setAssigned(d.assignments || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [agentId])

  async function searchListings() {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const params = new URLSearchParams({ q: searchTerm, pageSize: '10' })
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setSearchResults(data.listings || [])
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  async function assignListing(listing: SearchResult) {
    const res = await fetch(`/api/admin-homes/agents/${agentId}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id }),
    })
    const data = await res.json()
    if (data.success) {
      setAssigned(prev => [...prev, {
        listing_id: listing.id,
        mls_listings: listing,
      }])
      setSearchResults(prev => prev.filter(r => r.id !== listing.id))
    } else alert('Error: ' + data.error)
  }

  async function removeListing(listingId: string) {
    if (!confirm('Remove this listing assignment?')) return
    const res = await fetch(`/api/admin-homes/agents/${agentId}/listings`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId }),
    })
    const data = await res.json()
    if (data.success) setAssigned(prev => prev.filter(a => a.listing_id !== listingId))
    else alert('Error: ' + data.error)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Home className="w-5 h-5 text-green-600" /> Single Listing Assignment
          <span className="text-xs font-normal bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-2">Priority 1 — Overrides Everything</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">Manually assign specific listings to this agent. This overrides building and geo assignments.</p>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by address or MLS number..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchListings()}
          className="flex-1 px-4 py-2 border rounded-lg text-sm"
        />
        <button onClick={searchListings} disabled={searching} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
          <Search className="w-4 h-4" />
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="mb-6 border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Search Results</div>
          {searchResults.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 border-t hover:bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">{r.unparsed_address}</p>
                <p className="text-xs text-gray-500">{r.listing_key} · ${Number(r.list_price).toLocaleString('en-CA')} · {r.standard_status}</p>
              </div>
              <button onClick={() => assignListing(r)} className="flex items-center gap-1 px-3 py-1 bg-green-700 text-white rounded text-xs font-semibold hover:bg-green-800">
                <Plus className="w-3 h-3" /> Assign
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Assigned listings */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : assigned.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed rounded-lg">
          No listings manually assigned. Search above to assign specific listings.
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Manually Assigned ({assigned.length})</p>
          <div className="space-y-2">
            {assigned.map(a => (
              <div key={a.listing_id} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.mls_listings?.unparsed_address || a.listing_id}</p>
                  <p className="text-xs text-gray-500">
                    {a.mls_listings?.listing_key} · ${Number(a.mls_listings?.list_price || 0).toLocaleString('en-CA')} · {a.mls_listings?.standard_status}
                  </p>
                </div>
                <button onClick={() => removeListing(a.listing_id)} className="text-red-400 hover:text-red-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}