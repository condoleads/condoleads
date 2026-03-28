// components/admin-homes/GeoAssignmentSection.tsx
// Geo territory assignment: Area → Municipality → Community → Neighbourhood
// Supports two modes:
//   Manager/Standalone: shows "Your Territories" (editable)
//   Managed Agent:      shows "Inherited from [Manager]" (read-only) + "Manual Overrides" (editable)
'use client'

import { useState } from 'react'
import { MapPin, Plus, X, Check, Info, Lock } from 'lucide-react'

interface GeoItem { id: string; name: string; slug: string }
interface MuniItem extends GeoItem { area_id: string }
interface CommItem extends GeoItem { municipality_id: string }
interface NeighItem extends GeoItem { area_id: string }

interface Assignment {
  id?: string
  scope: 'area' | 'municipality' | 'community' | 'neighbourhood'
  area_id?: string | null
  municipality_id?: string | null
  community_id?: string | null
  neighbourhood_id?: string | null
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
}

interface Props {
  agentId: string
  areas: GeoItem[]
  municipalities: MuniItem[]
  communities: CommItem[]
  neighbourhoods: NeighItem[]
  currentAssignments: Assignment[]       // this agent's own manual rows
  inheritedAssignments?: Assignment[]    // manager's rows (read-only)
  inheritedFrom?: string | null          // manager's name if applicable
}

const SCOPE_LABELS: Record<string, string> = {
  area: 'Area',
  municipality: 'Municipality',
  community: 'Community',
  neighbourhood: 'Neighbourhood',
}

function AccessBadges({ a }: { a: Assignment }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {a.condo_access && <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded">Condos</span>}
      {a.homes_access && <span className="bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded">Homes</span>}
      {a.buildings_access && <span className="bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded">Buildings ({a.buildings_mode})</span>}
    </div>
  )
}

export default function GeoAssignmentSection({
  agentId, areas, municipalities, communities, neighbourhoods,
  currentAssignments, inheritedAssignments = [], inheritedFrom = null,
}: Props) {
  const isManaged = !!inheritedFrom // true = this agent is under a manager

  const [assignments, setAssignments] = useState<Assignment[]>(currentAssignments)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // New assignment form state
  const [scope, setScope] = useState<Assignment['scope']>('municipality')
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [selectedMuniId, setSelectedMuniId] = useState('')
  const [selectedCommId, setSelectedCommId] = useState('')
  const [selectedNeighId, setSelectedNeighId] = useState('')
  const [condoAccess, setCondoAccess] = useState(true)
  const [homesAccess, setHomesAccess] = useState(true)
  const [buildingsAccess, setBuildingsAccess] = useState(true)
  const [buildingsMode, setBuildingsMode] = useState('all')

  const filteredMunis = selectedAreaId ? municipalities.filter(m => m.area_id === selectedAreaId) : municipalities
  const filteredComms = selectedMuniId ? communities.filter(c => c.municipality_id === selectedMuniId) : communities
  const filteredNeighs = selectedAreaId ? neighbourhoods.filter(n => n.area_id === selectedAreaId) : neighbourhoods

  function getDisplayName(a: Assignment): string {
    if (a.scope === 'area') return areas.find(x => x.id === a.area_id)?.name || a.area_id || '—'
    if (a.scope === 'municipality') return municipalities.find(x => x.id === a.municipality_id)?.name || a.municipality_id || '—'
    if (a.scope === 'community') return communities.find(x => x.id === a.community_id)?.name || a.community_id || '—'
    if (a.scope === 'neighbourhood') return neighbourhoods.find(x => x.id === a.neighbourhood_id)?.name || a.neighbourhood_id || '—'
    return '—'
  }

  function addAssignment() {
    const missingGeo =
      (scope === 'area' && !selectedAreaId) ||
      (scope === 'municipality' && !selectedMuniId) ||
      (scope === 'community' && !selectedCommId) ||
      (scope === 'neighbourhood' && !selectedNeighId)

    if (missingGeo) { alert('Please select a ' + SCOPE_LABELS[scope]); return }

    const newA: Assignment = {
      scope,
      area_id: scope === 'area' ? selectedAreaId : (selectedAreaId || null),
      municipality_id: (scope === 'municipality' || scope === 'community') ? selectedMuniId || null : null,
      community_id: scope === 'community' ? selectedCommId || null : null,
      neighbourhood_id: scope === 'neighbourhood' ? selectedNeighId || null : null,
      condo_access: condoAccess,
      homes_access: homesAccess,
      buildings_access: buildingsAccess,
      buildings_mode: buildingsMode,
    }
    setAssignments([...assignments, newA])
    setSelectedAreaId(''); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('')
  }

  function removeAssignment(idx: number) {
    setAssignments(assignments.filter((_, i) => i !== idx))
  }

  async function saveAssignments() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin-homes/agents/${agentId}/geo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      const data = await res.json()
      if (data.success) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
      else alert('Error: ' + data.error)
    } catch { alert('Failed to save') }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" /> Geo Territory Assignment
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isManaged
              ? `Inherits territories from ${inheritedFrom}. Add overrides to restrict to a subset.`
              : 'Assign areas, municipalities, communities or neighbourhoods. More specific assignments override broader ones.'}
          </p>
        </div>
        <button
          onClick={saveAssignments}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
        >
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving...' : isManaged ? 'Save Overrides' : 'Save Territories'}
        </button>
      </div>

      {/* ── MANAGED AGENT: Inherited section (read-only) ── */}
      {isManaged && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-gray-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Inherited from {inheritedFrom} <span className="font-normal normal-case text-gray-400">— automatic, read-only</span>
            </p>
          </div>

          {inheritedAssignments.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400 italic">
              Manager has no territories assigned — full tenant pool applies.
            </div>
          ) : (
            <div className="space-y-2">
              {inheritedAssignments.map((a, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded">{SCOPE_LABELS[a.scope]}</span>
                  <span className="text-sm font-medium text-gray-700">{getDisplayName(a)}</span>
                  <AccessBadges a={a} />
                  <Lock className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                </div>
              ))}
            </div>
          )}

          {assignments.length === 0 && inheritedAssignments.length > 0 && (
            <div className="flex items-start gap-2 mt-3 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>No overrides set — all {inheritedAssignments.length} inherited {inheritedAssignments.length === 1 ? 'territory applies' : 'territories apply'} automatically.</span>
            </div>
          )}
        </div>
      )}

      {/* ── MANAGER/STANDALONE: Their own territories ── */}
      {!isManaged && assignments.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Your Territories ({assignments.length})
          </p>
          <div className="space-y-2">
            {assignments.map((a, i) => (
              <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">{SCOPE_LABELS[a.scope]}</span>
                  <span className="text-sm font-medium text-gray-900">{getDisplayName(a)}</span>
                  <AccessBadges a={a} />
                </div>
                <button onClick={() => removeAssignment(i)} className="text-red-400 hover:text-red-600 p-1 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MANAGED AGENT: Manual overrides ── */}
      {isManaged && assignments.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Manual Overrides ({assignments.length}) — <span className="font-normal normal-case text-gray-400">overrides inherited territories above</span>
          </p>
          <div className="space-y-2">
            {assignments.map((a, i) => (
              <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded">{SCOPE_LABELS[a.scope]}</span>
                  <span className="text-sm font-medium text-gray-900">{getDisplayName(a)}</span>
                  <AccessBadges a={a} />
                </div>
                <button onClick={() => removeAssignment(i)} className="text-red-400 hover:text-red-600 p-1 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add form ── */}
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          {isManaged ? `Add Override Territory` : 'Add Territory'}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Scope */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
            <select
              value={scope}
              onChange={e => { setScope(e.target.value as Assignment['scope']); setSelectedAreaId(''); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('') }}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="area">Area</option>
              <option value="municipality">Municipality</option>
              <option value="community">Community</option>
              <option value="neighbourhood">Neighbourhood</option>
            </select>
          </div>

          {/* Area filter — always shown */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Area {scope === 'area' ? '*' : '(filter)'}
            </label>
            <select
              value={selectedAreaId}
              onChange={e => { setSelectedAreaId(e.target.value); setSelectedMuniId(''); setSelectedCommId(''); setSelectedNeighId('') }}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All Areas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Municipality */}
          {(scope === 'municipality' || scope === 'community') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Municipality *</label>
              <select
                value={selectedMuniId}
                onChange={e => { setSelectedMuniId(e.target.value); setSelectedCommId('') }}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Select...</option>
                {filteredMunis.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Community */}
          {scope === 'community' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Community *</label>
              <select
                value={selectedCommId}
                onChange={e => setSelectedCommId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Select...</option>
                {filteredComms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Neighbourhood */}
          {scope === 'neighbourhood' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Neighbourhood *</label>
              <select
                value={selectedNeighId}
                onChange={e => setSelectedNeighId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Select...</option>
                {filteredNeighs.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Access toggles */}
        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={condoAccess} onChange={e => setCondoAccess(e.target.checked)} className="w-4 h-4" />
            Condos
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={homesAccess} onChange={e => setHomesAccess(e.target.checked)} className="w-4 h-4" />
            Homes
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={buildingsAccess} onChange={e => setBuildingsAccess(e.target.checked)} className="w-4 h-4" />
            Buildings
          </label>
          {buildingsAccess && (
            <select value={buildingsMode} onChange={e => setBuildingsMode(e.target.value)} className="px-2 py-1 border rounded text-sm">
              <option value="all">All buildings</option>
              <option value="selected">Selected only</option>
              <option value="none">No buildings</option>
            </select>
          )}
        </div>

        <button
          onClick={addAssignment}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800"
        >
          <Plus className="w-4 h-4" />
          {isManaged ? 'Add Override' : 'Add Territory'}
        </button>
      </div>
    </div>
  )
}