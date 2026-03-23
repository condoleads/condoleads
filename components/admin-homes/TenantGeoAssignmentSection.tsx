// components/admin-homes/TenantGeoAssignmentSection.tsx
// Tenant territory RESTRICTIONS (not assignments)
// Empty = full access. Rows = restricted to these territories only.
'use client'

import { useState } from 'react'
import { MapPin, Plus, X, Check, AlertCircle } from 'lucide-react'

interface GeoItem { id: string; name: string; slug: string }
interface MuniItem extends GeoItem { area_id: string }
interface CommItem extends GeoItem { municipality_id: string }
interface NeighItem extends GeoItem { area_id: string }

interface Restriction {
  id?: string
  scope: 'area' | 'municipality' | 'community' | 'neighbourhood'
  area_id?: string | null
  municipality_id?: string | null
  community_id?: string | null
  neighbourhood_id?: string | null
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
}

interface Props {
  tenantId: string
  areas: GeoItem[]
  municipalities: MuniItem[]
  communities: CommItem[]
  neighbourhoods: NeighItem[]
  currentRestrictions: Restriction[]
}

const SCOPE_LABELS: Record<string, string> = {
  area: 'Area', municipality: 'Municipality',
  community: 'Community', neighbourhood: 'Neighbourhood',
}

export default function TenantGeoAssignmentSection({
  tenantId, areas, municipalities, communities, neighbourhoods, currentRestrictions
}: Props) {
  const [restrictions, setRestrictions] = useState<Restriction[]>(currentRestrictions)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [scope, setScope] = useState<Restriction['scope']>('area')
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [selectedMuniId, setSelectedMuniId] = useState('')
  const [selectedCommId, setSelectedCommId] = useState('')
  const [selectedNeighId, setSelectedNeighId] = useState('')
  const [condoAccess, setCondoAccess] = useState(true)
  const [homesAccess, setHomesAccess] = useState(true)
  const [buildingsAccess, setBuildingsAccess] = useState(true)

  const filteredMunis = selectedAreaId ? municipalities.filter(m => m.area_id === selectedAreaId) : municipalities
  const filteredComms = selectedMuniId ? communities.filter(c => c.municipality_id === selectedMuniId) : communities
  const filteredNeighs = selectedAreaId ? neighbourhoods.filter(n => n.area_id === selectedAreaId) : neighbourhoods

  function getDisplayName(r: Restriction): string {
    if (r.scope === 'area') return areas.find(x => x.id === r.area_id)?.name || '—'
    if (r.scope === 'municipality') return municipalities.find(x => x.id === r.municipality_id)?.name || '—'
    if (r.scope === 'community') return communities.find(x => x.id === r.community_id)?.name || '—'
    if (r.scope === 'neighbourhood') return neighbourhoods.find(x => x.id === r.neighbourhood_id)?.name || '—'
    return '—'
  }

  function addRestriction() {
    const missing =
      (scope === 'area' && !selectedAreaId) ||
      (scope === 'municipality' && !selectedMuniId) ||
      (scope === 'community' && !selectedCommId) ||
      (scope === 'neighbourhood' && !selectedNeighId)
    if (missing) { alert('Please select a ' + SCOPE_LABELS[scope]); return }

    setRestrictions([...restrictions, {
      scope,
      area_id: scope === 'area' ? selectedAreaId : (selectedAreaId || null),
      municipality_id: (scope === 'municipality' || scope === 'community') ? selectedMuniId || null : null,
      community_id: scope === 'community' ? selectedCommId || null : null,
      neighbourhood_id: scope === 'neighbourhood' ? selectedNeighId || null : null,
      condo_access: condoAccess,
      homes_access: homesAccess,
      buildings_access: buildingsAccess,
    }])
    setSelectedAreaId(''); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('')
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin-homes/tenants/${tenantId}/geo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restrictions }),
      })
      const data = await res.json()
      if (data.success) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
      else alert('Error: ' + data.error)
    } catch { alert('Failed to save') }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" /> Territory Restrictions
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Leave empty = full access to everything. Add restrictions to limit tenant to specific territories.
          </p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving...' : 'Save Restrictions'}
        </button>
      </div>

      {/* Full access banner */}
      {restrictions.length === 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700">
            <strong>Full Access</strong> — This tenant has access to all territories. Add restrictions below to limit scope.
          </p>
        </div>
      )}

      {/* Current restrictions */}
      {restrictions.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Active Restrictions ({restrictions.length}) — Tenant can only operate in:
          </p>
          <div className="space-y-2">
            {restrictions.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded">{SCOPE_LABELS[r.scope]}</span>
                  <span className="text-sm font-medium text-gray-900">{getDisplayName(r)}</span>
                  <div className="flex gap-1 text-xs">
                    {r.condo_access && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">Condos</span>}
                    {r.homes_access && <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded">Homes</span>}
                    {r.buildings_access && <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded">Buildings</span>}
                  </div>
                </div>
                <button onClick={() => setRestrictions(restrictions.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add restriction */}
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Add Territory Restriction</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
            <select value={scope} onChange={e => { setScope(e.target.value as Restriction['scope']); setSelectedAreaId(''); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('') }} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="area">Area</option>
              <option value="municipality">Municipality</option>
              <option value="community">Community</option>
              <option value="neighbourhood">Neighbourhood</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Area {scope === 'area' ? '*' : '(filter)'}</label>
            <select value={selectedAreaId} onChange={e => { setSelectedAreaId(e.target.value); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('') }} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">All Areas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {(scope === 'municipality' || scope === 'community') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Municipality *</label>
              <select value={selectedMuniId} onChange={e => { setSelectedMuniId(e.target.value); setSelectedCommId('') }} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select...</option>
                {filteredMunis.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {scope === 'community' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Community *</label>
              <select value={selectedCommId} onChange={e => setSelectedCommId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select...</option>
                {filteredComms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {scope === 'neighbourhood' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Neighbourhood *</label>
              <select value={selectedNeighId} onChange={e => setSelectedNeighId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select...</option>
                {filteredNeighs.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Category toggles */}
        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={condoAccess} onChange={e => setCondoAccess(e.target.checked)} className="w-4 h-4" /> Condos
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={homesAccess} onChange={e => setHomesAccess(e.target.checked)} className="w-4 h-4" /> Homes
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={buildingsAccess} onChange={e => setBuildingsAccess(e.target.checked)} className="w-4 h-4" /> Buildings
          </label>
        </div>

        <button onClick={addRestriction} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700">
          <Plus className="w-4 h-4" /> Add Restriction
        </button>
      </div>
    </div>
  )
}