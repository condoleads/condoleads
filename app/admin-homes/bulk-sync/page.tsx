// app/admin-homes/bulk-sync/page.tsx
'use client'

import { useState, useEffect } from 'react'

interface Area { id: string; name: string }
interface Municipality { id: string; name: string; area_id: string; homes_count: number }
interface Community { id: string; name: string; municipality_id: string; homes_count: number }

export default function HomesBulkSync() {
  const [areas, setAreas] = useState<Area[]>([])
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [communities, setCommunities] = useState<Community[]>([])

  const [selectedArea, setSelectedArea] = useState('')
  const [selectedMunicipality, setSelectedMunicipality] = useState('')
  const [selectedMunicipalityName, setSelectedMunicipalityName] = useState('')
  const [selectedCommunity, setSelectedCommunity] = useState('')
  const [selectedCommunityName, setSelectedCommunityName] = useState('')

  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<{ active: number; sold: number; leased: number } | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncLogs, setSyncLogs] = useState<string[]>([])
  const [syncComplete, setSyncComplete] = useState(false)
  const [syncSummary, setSyncSummary] = useState<any>(null)

  // Load areas on mount
  useEffect(() => {
    fetch('/api/admin/bulk-discovery/geo-tree?level=areas')
      .then(r => r.json())
      .then(data => { if (data.success) setAreas(data.items || []) })
  }, [])

  // Load municipalities when area selected
  useEffect(() => {
    if (!selectedArea) { setMunicipalities([]); return }
    fetch(`/api/admin/bulk-discovery/geo-tree?level=municipalities&areaId=${selectedArea}`)
      .then(r => r.json())
      .then(data => { if (data.success) setMunicipalities(data.items || []) })
  }, [selectedArea])

  // Load communities when municipality selected
  useEffect(() => {
    if (!selectedMunicipality) { setCommunities([]); return }
    fetch(`/api/admin/bulk-discovery/geo-tree?level=communities&municipalityId=${selectedMunicipality}`)
      .then(r => r.json())
      .then(data => { if (data.success) setCommunities(data.items || []) })
  }, [selectedMunicipality])

  // Preview counts from PropTx
  const handlePreview = async () => {
    if (!selectedMunicipalityName) return
    setPreviewing(true)
    setPreview(null)
    setSyncComplete(false)
    setSyncSummary(null)
    setSyncLogs([])

    try {
      const res = await fetch('/api/admin-homes/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipalityName: selectedMunicipalityName,
          communityName: selectedCommunityName || undefined
        })
      })
      const data = await res.json()
      if (data.success) {
        setPreview(data.counts)
      } else {
        setSyncLogs([`Error: ${data.error}`])
      }
    } catch (err: any) {
      setSyncLogs([`Error: ${err.message}`])
    }
    setPreviewing(false)
  }

  // Start sync with SSE
  const handleSync = async () => {
    if (!selectedMunicipality || !selectedMunicipalityName) return
    setSyncing(true)
    setSyncLogs([])
    setSyncComplete(false)
    setSyncSummary(null)

    try {
      const res = await fetch('/api/admin-homes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipalityId: selectedMunicipality,
          municipalityName: selectedMunicipalityName,
          communityName: selectedCommunityName || undefined
        })
      })

      const reader = res.body?.getReader()
      if (!reader) { setSyncing(false); return }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const data = JSON.parse(line.substring(5))
            if (data.type === 'progress') {
              setSyncLogs(prev => [...prev, data.message])
            } else if (data.type === 'complete') {
              setSyncComplete(true)
              setSyncSummary(data.summary)
              setSyncLogs(prev => [...prev, ` Sync complete!`])
            } else if (data.type === 'error') {
              setSyncLogs(prev => [...prev, ` Error: ${data.message}`])
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setSyncLogs(prev => [...prev, ` Error: ${err.message}`])
    }
    setSyncing(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Bulk Sync  Residential Homes</h1>
      <p className="text-gray-500 mt-1">Sync freehold properties from PropTx by geographic area</p>

      {/* Geographic Selection */}
      <div className="bg-white rounded-lg border mt-6 p-4">
        <h2 className="text-lg font-semibold mb-3">Select Geography</h2>
        <div className="grid grid-cols-3 gap-4">
          {/* Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
            <select
              value={selectedArea}
              onChange={(e) => {
                setSelectedArea(e.target.value)
                setSelectedMunicipality('')
                setSelectedMunicipalityName('')
                setSelectedCommunity('')
                setSelectedCommunityName('')
                setPreview(null)
              }}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Select Area...</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Municipality */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Municipality</label>
            <select
              value={selectedMunicipality}
              onChange={(e) => {
                const muni = municipalities.find(m => m.id === e.target.value)
                setSelectedMunicipality(e.target.value)
                setSelectedMunicipalityName(muni?.name || '')
                setSelectedCommunity('')
                setSelectedCommunityName('')
                setPreview(null)
              }}
              disabled={!selectedArea}
              className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
            >
              <option value="">Select Municipality...</option>
              {municipalities.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.homes_count > 0 ? `(${m.homes_count} homes)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Community (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Community (Optional)</label>
            <select
              value={selectedCommunity}
              onChange={(e) => {
                const comm = communities.find(c => c.id === e.target.value)
                setSelectedCommunity(e.target.value)
                setSelectedCommunityName(comm?.name || '')
                setPreview(null)
              }}
              disabled={!selectedMunicipality}
              className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
            >
              <option value="">All Communities</option>
              {communities.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.homes_count > 0 ? `(${c.homes_count} homes)` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!selectedMunicipalityName || previewing || syncing}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {previewing ? ' Counting...' : ' Preview Available Homes'}
          </button>
        </div>
      </div>

      {/* Preview Results */}
      {preview && (
        <div className="bg-white rounded-lg border mt-4 p-4">
          <h2 className="text-lg font-semibold mb-3">
            PropTx Preview: {selectedMunicipalityName}
            {selectedCommunityName ? ` / ${selectedCommunityName}` : ''}
          </h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-green-50 rounded p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{preview.active.toLocaleString()}</p>
              <p className="text-xs text-green-600">Active</p>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-2xl font-bold text-gray-700">{preview.sold.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Sold</p>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-2xl font-bold text-gray-700">{preview.leased.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Leased</p>
            </div>
            <div className="bg-green-50 rounded p-3 text-center">
              <p className="text-2xl font-bold text-green-800">
                {(preview.active + preview.sold + preview.leased).toLocaleString()}
              </p>
              <p className="text-xs text-green-600">Total</p>
            </div>
          </div>

          <div className="mt-4 flex gap-3 items-center">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-6 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {syncing ? ' Syncing...' : ' Sync All Homes'}
            </button>
            <p className="text-xs text-gray-500">
              This will fetch all listings with full data (media, rooms, open houses)
            </p>
          </div>
        </div>
      )}

      {/* Sync Progress */}
      {syncLogs.length > 0 && (
        <div className="bg-white rounded-lg border mt-4 p-4">
          <h2 className="text-lg font-semibold mb-3">
            {syncing ? ' Sync Progress' : syncComplete ? ' Sync Complete' : 'Sync Log'}
          </h2>
          <div className="bg-gray-900 text-green-400 rounded p-3 font-mono text-xs max-h-64 overflow-y-auto">
            {syncLogs.map((log, i) => (
              <div key={i} className="py-0.5">{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Summary */}
      {syncSummary && (
        <div className="bg-green-50 rounded-lg border border-green-200 mt-4 p-4">
          <h2 className="text-lg font-semibold text-green-800 mb-3">Sync Summary</h2>
          <div className="grid grid-cols-5 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-green-700">{syncSummary.listings}</p>
              <p className="text-xs text-green-600">Listings</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-700">{syncSummary.media}</p>
              <p className="text-xs text-green-600">Media</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-700">{syncSummary.rooms}</p>
              <p className="text-xs text-green-600">Rooms</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-700">{syncSummary.openHouses}</p>
              <p className="text-xs text-green-600">Open Houses</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-500">{syncSummary.skipped}</p>
              <p className="text-xs text-gray-400">Skipped</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
