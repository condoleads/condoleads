'use client'
// components/admin-homes/cockpit/territory/GeographyView.tsx
// W-TERRITORY-OPS T1-5 -- View 3: Geography.
//
// Hierarchical drill: Area > Municipality > Community > Neighbourhood.
// Each level is a flat paged table. Click a row to drill down to its
// children. Breadcrumb at top navigates back up.
//
// Per-row badges show whether the geo has its own card (ASSIGNED) or is
// inheriting from an ancestor (INHERITED from <level>). Click "Open Cards"
// on any row to cross-link into View 2 (Cards) pre-filtered to that geo.
//
// "Carve up" action opens a modal pre-loaded with children of the current
// geo; operator picks an agent and submits bulk-create in one transaction.
//
// Scale strategy (verified pre-flight 2026-05-26): lazy load one level at
// a time. Worst case (community level, 1948 globally) is naturally bounded
// when filtered by parent_id; unfiltered community list is paginated 200/page.

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, RefreshCw, X, ChevronRight, ChevronDown,
  MapPin, Building, Home, ListChecks, Filter, Plus, ExternalLink,
} from 'lucide-react'

type Level = 'area' | 'municipality' | 'community' | 'neighbourhood'

interface GeoRow {
  id: string
  name: string
  slug: string | null
  level: Level
  parent_id: string | null
  listing_count: number
  building_count: number
  child_count: number
  has_own_card: boolean
  primary_card_holder_agent_id: string | null
  primary_card_holder_name: string | null
  inherited_from_level: Level | null
  inherited_from_id: string | null
}

interface AgentOption {
  id: string
  full_name: string
  is_selling: boolean
  is_active: boolean
}

interface CrumbStep {
  level: Level
  parent_id: string | null
  label: string
}

interface Props {
  tenantId: string
  tenantName: string
  onOpenCards?: (filter: { scope: Level; scope_id: string }) => void
}

const LEVEL_LABEL: Record<Level, string> = {
  area: 'Area',
  municipality: 'Municipality',
  community: 'Community',
  neighbourhood: 'Neighbourhood',
}

const CHILD_LEVEL: Record<Level, Level | null> = {
  area: 'municipality',
  municipality: 'community',
  community: null,
  neighbourhood: null,
}

export default function GeographyView({ tenantId, tenantName, onOpenCards }: Props) {
  const [currentLevel, setCurrentLevel] = useState<Level>('area')
  const [currentParent, setCurrentParent] = useState<string | null>(null)
  const [crumb, setCrumb] = useState<CrumbStep[]>([])
  const [rows, setRows] = useState<GeoRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictOnly, setConflictOnly] = useState(false)
  const [carvingFor, setCarvingFor] = useState<GeoRow | null>(null)
  const [agents, setAgents] = useState<AgentOption[]>([])

  async function loadRows(level: Level, parentId: string | null) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tenant_id: tenantId, level })
      if (parentId) params.set('parent_id', parentId)
      const res = await fetch('/api/admin-homes/territory/geo-rollup?' + params.toString(), { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'load failed')
      setRows(j.rows as GeoRow[])
    } catch (e: any) {
      setError(e.message || 'load failed')
      setRows(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadAgents() {
    try {
      const res = await fetch('/api/admin-homes/territory/agents-summary?tenant_id=' + tenantId, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) return
      const arr: AgentOption[] = (j.agents || []).map((a: any) => ({
        id: a.agent_id, full_name: a.full_name, is_selling: !!a.is_selling, is_active: !!a.is_active,
      }))
      setAgents(arr)
    } catch { /* silent */ }
  }

  useEffect(() => {
    loadRows('area', null)
    loadAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  function drillInto(row: GeoRow) {
    const child = CHILD_LEVEL[row.level]
    if (!child) return
    const nextCrumb: CrumbStep[] = [...crumb, { level: row.level, parent_id: currentParent, label: row.name }]
    setCrumb(nextCrumb)
    setCurrentLevel(child)
    setCurrentParent(row.id)
    loadRows(child, row.id)
  }

  function jumpToCrumb(idx: number) {
    if (idx < 0) {
      setCrumb([])
      setCurrentLevel('area')
      setCurrentParent(null)
      loadRows('area', null)
      return
    }
    const step = crumb[idx]
    const nextCrumb = crumb.slice(0, idx)
    setCrumb(nextCrumb)
    setCurrentLevel(step.level)
    setCurrentParent(step.parent_id)
    loadRows(step.level, step.parent_id)
  }

  const filtered = useMemo(() => {
    if (!rows) return null
    if (!conflictOnly) return rows
    // Conflict definition: has_own_card=true (own card exists) OR no holder at all.
    // The own-card case is flagged because operators want to verify whether the
    // own card is functional vs phantom (full functional-vs-phantom requires the
    // Cards view; this is the entry point).
    return rows.filter(r => r.has_own_card || !r.primary_card_holder_agent_id)
  }, [rows, conflictOnly])

  return (
    <div>
      <div className='flex items-center justify-between mb-3'>
        <div className='flex items-center gap-2 text-sm'>
          <button onClick={() => jumpToCrumb(-1)} className='text-blue-600 hover:underline flex items-center gap-1'>
            <MapPin className='w-3.5 h-3.5' /> All Areas
          </button>
          {crumb.map((s, i) => (
            <span key={i} className="flex items-center gap-2">
              <ChevronRight className='w-3.5 h-3.5 text-gray-400' />
              <button onClick={() => jumpToCrumb(i)} className='text-blue-600 hover:underline'>{s.label}</button>
            </span>
          ))}
          {crumb.length > 0 && (
            <span className="flex items-center gap-2">
              <ChevronRight className='w-3.5 h-3.5 text-gray-400' />
              <span className='text-gray-700 font-medium'>{LEVEL_LABEL[currentLevel]}</span>
            </span>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <label className='flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer'>
            <input type='checkbox' checked={conflictOnly} onChange={e => setConflictOnly(e.target.checked)} className='rounded' />
            <Filter className="w-3 h-3" /> Conflict zones only
          </label>
          <button onClick={() => loadRows(currentLevel, currentParent)} className='px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-1'>
            <RefreshCw className='w-3 h-3' /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className='mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2'>
          <AlertTriangle className='w-4 h-4' /> {error}
        </div>
      )}

      <div className='border border-gray-200 rounded-md overflow-hidden bg-white'>
        <table className='w-full text-sm'>
          <thead className='bg-gray-50 text-xs text-gray-600 uppercase'>
            <tr>
              <th className='px-3 py-2 text-left'>{LEVEL_LABEL[currentLevel]}</th>
              <th className='px-3 py-2 text-right'>Listings</th>
              <th className='px-3 py-2 text-right'>Buildings</th>
              <th className='px-3 py-2 text-right'>Children</th>
              <th className='px-3 py-2 text-left'>Holder</th>
              <th className='px-3 py-2 text-right'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className='px-3 py-6 text-center text-gray-500'>
                  <RefreshCw className='w-4 h-4 animate-spin inline-block mr-2' /> Loading {LEVEL_LABEL[currentLevel].toLowerCase()}...
                </td>
              </tr>
            )}
            {!loading && filtered && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className='px-3 py-6 text-center text-gray-500'>
                  No rows match the current filter.
                </td>
              </tr>
            )}
            {!loading && filtered && filtered.map(r => {
              const childLevel = CHILD_LEVEL[r.level]
              const canDrill = childLevel !== null && r.child_count > 0
              const holderState = r.has_own_card
                ? 'ASSIGNED'
                : r.primary_card_holder_agent_id
                  ? 'INHERITED'
                  : 'NONE'
              const stateClass =
                holderState === 'ASSIGNED' ? 'bg-green-50 text-green-700 border-green-200' :
                holderState === 'INHERITED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                'bg-amber-50 text-amber-700 border-amber-200'
              return (
                <tr key={r.id} className='border-t border-gray-100 hover:bg-gray-50'>
                  <td className='px-3 py-2'>
                    <div className='flex items-center gap-2'>
                      <MapPin className='w-3.5 h-3.5 text-gray-400' />
                      <span className='font-medium'>{r.name}</span>
                      {r.slug && (
                        <span className='text-xs text-gray-400'>/{r.slug}</span>
                      )}
                    </div>
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>{r.listing_count.toLocaleString()}</td>
                  <td className='px-3 py-2 text-right tabular-nums'>{r.building_count.toLocaleString()}</td>
                  <td className='px-3 py-2 text-right tabular-nums'>{r.child_count.toLocaleString()}</td>
                  <td className='px-3 py-2'>
                    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + stateClass}>
                      {holderState === 'ASSIGNED' && <CheckCircle2 className='w-3 h-3' />}
                      {holderState === 'INHERITED' && <ChevronDown className='w-3 h-3' />}
                      {holderState === 'NONE' && <AlertTriangle className='w-3 h-3' />}
                      {r.primary_card_holder_name || "no holder"}
                    </span>
                    {holderState === 'INHERITED' && r.inherited_from_level && (
                      <span className='ml-2 text-xs text-gray-500'>
                        from {LEVEL_LABEL[r.inherited_from_level].toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className='px-3 py-2 text-right'>
                    <div className='inline-flex items-center gap-2'>
                      {canDrill && (
                        <button onClick={() => drillInto(r)} className='text-xs text-blue-600 hover:underline inline-flex items-center gap-1'>
                          Drill <ChevronRight className='w-3 h-3' />
                        </button>
                      )}
                      {r.child_count > 0 && r.level !== 'community' && r.level !== 'neighbourhood' && (
                        <button onClick={() => setCarvingFor(r)} className='text-xs text-purple-600 hover:underline inline-flex items-center gap-1'>
                          <Plus className='w-3 h-3' /> Carve
                        </button>
                      )}
                      {onOpenCards && (
                        <button onClick={() => onOpenCards({ scope: r.level, scope_id: r.id })} className='text-xs text-gray-600 hover:underline inline-flex items-center gap-1'>
                          <ExternalLink className='w-3 h-3' /> Cards
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!loading && filtered && (
        <div className='mt-2 text-xs text-gray-500'>
          {filtered.length} {LEVEL_LABEL[currentLevel].toLowerCase()}{filtered.length === 1 ? "" : "s"} shown
          {rows && filtered.length !== rows.length && (
            <span className='ml-1'>(of {rows.length} total)</span>
          )}
        </div>
      )}

      {carvingFor && (
        <CarveUpModal
          tenantId={tenantId}
          parentRow={carvingFor}
          agents={agents}
          onClose={() => setCarvingFor(null)}
          onSuccess={() => {
            setCarvingFor(null)
            loadRows(currentLevel, currentParent)
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// CarveUpModal -- assign children of a parent geo to an agent in bulk.
// Uses POST /api/admin-homes/territory/cards/bulk-create.
// ============================================================

interface CarveProps {
  tenantId: string
  parentRow: GeoRow
  agents: AgentOption[]
  onClose: () => void
  onSuccess: () => void
}

function CarveUpModal({ tenantId, parentRow, agents, onClose, onSuccess }: CarveProps) {
  const [children, setChildren] = useState<GeoRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [isPrimary, setIsPrimary] = useState(true)
  const [condoAccess, setCondoAccess] = useState(true)
  const [homesAccess, setHomesAccess] = useState(true)
  const [buildingsAccess, setBuildingsAccess] = useState(true)

  const childLevel = CHILD_LEVEL[parentRow.level]

  useEffect(() => {
    if (!childLevel) {
      setError('no child level for ' + parentRow.level)
      setLoading(false)
      return
    }
    (async () => {
      try {
        const params = new URLSearchParams({ tenant_id: tenantId, level: childLevel, parent_id: parentRow.id })
        const res = await fetch('/api/admin-homes/territory/geo-rollup?' + params.toString(), { cache: 'no-store' })
        const j = await res.json()
        if (!res.ok) throw new Error(j?.error || 'load failed')
        const ch = (j.rows as GeoRow[])
        setChildren(ch)
        // Pre-select children that do NOT currently have their own card.
        const initial = new Set<string>(ch.filter(r => !r.has_own_card).map(r => r.id))
        setSelected(initial)
      } catch (e: any) {
        setError(e.message || 'load failed')
      } finally {
        setLoading(false)
      }
    })()
  }, [parentRow.id, tenantId, parentRow.level, childLevel])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  async function submit() {
    if (!agentId) {
      setError('pick an agent')
      return
    }
    if (selected.size === 0) {
      setError('select at least one geo to carve')
      return
    }
    if (!childLevel) return
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        tenant_id: tenantId,
        agent_id: agentId,
        cards: Array.from(selected).map(id => ({
          scope: childLevel,
          scope_id: id,
          is_primary: isPrimary,
          condo_access: condoAccess,
          homes_access: homesAccess,
          buildings_access: buildingsAccess,
        })),
      }
      const res = await fetch('/api/admin-homes/territory/cards/bulk-create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'bulk-create failed')
      onSuccess()
    } catch (e: any) {
      setError(e.message || 'bulk-create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-md shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col'>
        <div className='flex items-center justify-between px-4 py-3 border-b border-gray-200'>
          <div className='flex items-center gap-2'>
            <Plus className='w-4 h-4 text-purple-600' />
            <h3 className='font-semibold'>Carve up {parentRow.name}</h3>
            <span className='text-xs text-gray-500'>
              → {childLevel ? LEVEL_LABEL[childLevel].toLowerCase() : "(no children)"} 
              ({parentRow.child_count})
            </span>
          </div>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-700'>
            <X className='w-4 h-4' />
          </button>
        </div>

        <div className='px-4 py-3 border-b border-gray-200 space-y-2'>
          <div className='text-xs font-medium text-gray-700'>Assign to agent</div>
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className='w-full px-2 py-1.5 border border-gray-300 rounded text-sm'
          >
            <option value=''>-- pick agent --</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.full_name}
                {!a.is_active && ' (inactive)'}
                {a.is_active && !a.is_selling && ' (non-selling)'}
              </option>
            ))}
          </select>
          <div className='flex items-center gap-3 text-xs text-gray-700 mt-2'>
            <label className='flex items-center gap-1 cursor-pointer'>
              <input type='checkbox' checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} className='rounded' />
              is_primary
            </label>
            <label className='flex items-center gap-1 cursor-pointer'>
              <input type='checkbox' checked={condoAccess} onChange={e => setCondoAccess(e.target.checked)} className='rounded' />
              condo
            </label>
            <label className='flex items-center gap-1 cursor-pointer'>
              <input type='checkbox' checked={homesAccess} onChange={e => setHomesAccess(e.target.checked)} className='rounded' />
              homes
            </label>
            <label className='flex items-center gap-1 cursor-pointer'>
              <input type='checkbox' checked={buildingsAccess} onChange={e => setBuildingsAccess(e.target.checked)} className='rounded' />
              buildings
            </label>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto px-4 py-3'>
          {loading && (
            <div className='text-center text-gray-500 py-6'>
              <RefreshCw className='w-4 h-4 animate-spin inline-block mr-2' />
              Loading children of {parentRow.name}...
            </div>
          )}
          {!loading && children && children.length === 0 && (
            <div className='text-center text-gray-500 py-6'>No children to carve.</div>
          )}
          {!loading && children && children.length > 0 && (
            <div className='space-y-1'>
              <div className='flex items-center justify-between mb-2 text-xs'>
                <button onClick={() => setSelected(new Set(children.map(c => c.id)))} className='text-blue-600 hover:underline'>Select all</button>
                <span className='text-gray-500'>{selected.size} / {children.length} selected</span>
                <button onClick={() => setSelected(new Set())} className='text-blue-600 hover:underline'>Clear</button>
              </div>
              {children.map(ch => (
                <label key={ch.id} className='flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm'>
                  <input
                    type='checkbox'
                    checked={selected.has(ch.id)}
                    onChange={() => toggle(ch.id)}
                    className='rounded'
                  />
                  <span className='flex-1'>{ch.name}</span>
                  <span className='text-xs text-gray-500'>{ch.listing_count.toLocaleString()} listings</span>
                  {ch.has_own_card && (
                    <span className='text-xs text-amber-600' title='Already has its own card -- bulk-create will conflict'>
                      has card
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className='px-4 py-3 border-t border-gray-200 flex items-center justify-between'>
          {error ? (
            <div className='text-xs text-red-600 flex items-center gap-1'>
              <AlertTriangle className='w-3.5 h-3.5' /> {error}
            </div>
          ) : <div />}
          <div className='flex items-center gap-2'>
            <button onClick={onClose} className='px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50'>Cancel</button>
            <button
              onClick={submit}
              disabled={submitting || selected.size === 0 || !agentId}
              className='px-3 py-1.5 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5'
            >
              {submitting ? <RefreshCw className='w-3.5 h-3.5 animate-spin' /> : <Plus className='w-3.5 h-3.5' />}
              Carve {selected.size}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
