// components/admin-homes/TerritoryMatrix.tsx
//
// T4c-2 Phase C -- cross-agent territory editing matrix.
//
// UX (per W-TERRITORY v17 design lock: Q1=1 / Q2=2 / Q3=1 / Q4=1):
//   - One scope per matrix; scope picker at top.
//   - Cell content = presence + primary star. Access flags (condo/homes/
//     buildings/mode) are edited via a popover that opens on cell click.
//   - Explicit "Save N changes" button in a sticky toolbar; one POST commits
//     all pending edits in a single transaction (T4c-1 bulk-assign route).
//   - Cross-agent primary conflicts surface server-side (400 with conflict
//     list); banner + cell highlights point at the failing cells.
//
// Data flow:
//   GET /api/admin-homes/territory/matrix?scope=...     (T4c-2 Phase B route)
//   POST /api/admin-homes/territory/bulk-assign         (T4c-1 route)
//
// Rule Zero -- multi-tenant: every fetch is tenant-scoped server-side.
// W-COCKPIT P-A-3: this component mounts in two contexts:
//   1. Standalone /admin-homes/territory -- user.tenantId is set; route
//      picks tenant from auth session.
//   2. Inside the cockpit (/admin-homes/tenants/[id]) -- user is platform
//      admin with user.tenantId = null; route requires ?tenant_id=<id>
//      override (documented in the route handler).
// Reads pass tenant_id explicitly so both contexts work identically.
// Writes (bulk-assign) read tenant from the target agent row, so they
// remain cross-tenant-safe without a query param.

'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Star, Check, AlertCircle, Save as SaveIcon, Lock, MoreVertical } from 'lucide-react'
import {
  type TerritoryMatrix as TerritoryMatrixData,
  type MatrixCell,
  type MatrixScope,
  cellKey,
  defaultCellState,
  serializeMatrixToBulkAssignPayload,
} from '@/lib/admin-homes/territory-matrix'

interface Props {
  tenantId: string
  tenantName: string | null
}

interface ConflictInfo {
  key: string
  agents: string[]
}

const SCOPE_OPTIONS: ReadonlyArray<{ value: MatrixScope; label: string }> = [
  { value: 'area', label: 'Area' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'community', label: 'Community' },
  { value: 'neighbourhood', label: 'Neighbourhood' },
]

export default function TerritoryMatrix({ tenantId, tenantName }: Props) {
  const [scope, setScope] = useState<MatrixScope>('community')
  const [matrix, setMatrix] = useState<TerritoryMatrixData | null>(null)
  const [editedCells, setEditedCells] = useState<Record<string, MatrixCell | null>>({})
  const [editedAgentIds, setEditedAgentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null)
  const [openCellKey, setOpenCellKey] = useState<string | null>(null)
  const [openKebabAgentId, setOpenKebabAgentId] = useState<string | null>(null)

  // ---- Fetch matrix on mount + scope change + tenant change ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setConflicts(null)
      try {
        // W-COCKPIT P-A-3: pass tenant_id explicitly for platform-admin cockpit context.
        const matrixUrl = `/api/admin-homes/territory/matrix?scope=${scope}`
          + (tenantId ? `&tenant_id=${encodeURIComponent(tenantId)}` : '')
        const res = await fetch(matrixUrl)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `matrix fetch failed: ${res.status}`)
        }
        const json = await res.json()
        if (!cancelled) {
          setMatrix(json.matrix as TerritoryMatrixData)
          setEditedCells({})
          setEditedAgentIds(new Set())
          setOpenCellKey(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load matrix')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scope, tenantId])

  // ---- Effective cell state ----
  const getCell = useCallback(
    (agentId: string, geoId: string): MatrixCell | null => {
      const key = cellKey(agentId, geoId)
      if (key in editedCells) return editedCells[key]
      return matrix?.cells[key] ?? null
    },
    [matrix, editedCells]
  )

  // ---- Cell mutation handlers ----
  const togglePresence = useCallback(
    (agentId: string, geoId: string) => {
      const key = cellKey(agentId, geoId)
      const current = getCell(agentId, geoId)
      setEditedCells(prev => {
        const next = { ...prev }
        if (current && current.presence === 'explicit') {
          // Remove (route's diff will toDelete)
          next[key] = null
        } else {
          next[key] = defaultCellState()
        }
        return next
      })
      setEditedAgentIds(prev => new Set(prev).add(agentId))
    },
    [getCell]
  )

  const updateCell = useCallback(
    (agentId: string, geoId: string, patch: Partial<MatrixCell>) => {
      const key = cellKey(agentId, geoId)
      const current = getCell(agentId, geoId)
      if (!current) return
      setEditedCells(prev => ({
        ...prev,
        [key]: { ...current, ...patch, presence: 'explicit' as const },
      }))
      setEditedAgentIds(prev => new Set(prev).add(agentId))
    },
    [getCell]
  )

  // ---- Bulk row actions (kebab menu) ----
  const handleSetAllPrimary = useCallback((agentId: string) => {
    if (!matrix) return
    const updates: Record<string, MatrixCell | null> = {}
    for (const col of matrix.columns) {
      const key = cellKey(agentId, col.geo_id)
      const current = getCell(agentId, col.geo_id)
      if (!current) continue
      if (current.presence === 'explicit' && current.is_primary) continue
      updates[key] = { ...current, presence: 'explicit' as const, is_primary: true }
    }
    if (Object.keys(updates).length === 0) return
    setEditedCells(prev => ({ ...prev, ...updates }))
    setEditedAgentIds(prev => new Set(prev).add(agentId))
  }, [matrix, getCell])

  const handleClearRow = useCallback((agentId: string) => {
    if (!matrix) return
    const updates: Record<string, MatrixCell | null> = {}
    for (const col of matrix.columns) {
      const key = cellKey(agentId, col.geo_id)
      const current = getCell(agentId, col.geo_id)
      if (current?.presence === 'explicit') updates[key] = null
    }
    if (Object.keys(updates).length === 0) return
    setEditedCells(prev => ({ ...prev, ...updates }))
    setEditedAgentIds(prev => new Set(prev).add(agentId))
  }, [matrix, getCell])

  const handleCopyFromAgent = useCallback((targetAgentId: string, sourceAgentId: string) => {
    if (!matrix) return
    const updates: Record<string, MatrixCell | null> = {}
    for (const col of matrix.columns) {
      const sourceCell = getCell(sourceAgentId, col.geo_id)
      if (!sourceCell || sourceCell.presence !== 'explicit') continue
      const targetKey = cellKey(targetAgentId, col.geo_id)
      updates[targetKey] = {
        presence: 'explicit' as const,
        apa_id: null,
        is_primary: false,
        condo_access: sourceCell.condo_access,
        homes_access: sourceCell.homes_access,
        buildings_access: sourceCell.buildings_access,
        buildings_mode: sourceCell.buildings_mode,
      }
    }
    if (Object.keys(updates).length === 0) return
    setEditedCells(prev => ({ ...prev, ...updates }))
    setEditedAgentIds(prev => new Set(prev).add(targetAgentId))
  }, [matrix, getCell])

  // ---- Save lifecycle ----
  const pendingCount = Object.keys(editedCells).length

  const handleSave = async () => {
    if (!matrix || pendingCount === 0 || saving) return
    setSaving(true)
    setError(null)
    setConflicts(null)
    try {
      const payload = serializeMatrixToBulkAssignPayload(
        matrix,
        editedCells,
        Array.from(editedAgentIds)
      )
      const res = await fetch('/api/admin-homes/territory/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 400 && Array.isArray(body.conflicts)) {
        setConflicts(body.conflicts as ConflictInfo[])
        return
      }
      if (!res.ok) {
        throw new Error(body.error || `Save failed: ${res.status}`)
      }
      // Success -- refetch + clear edits
      // W-COCKPIT P-A-3: same tenant_id pass-through as initial fetch.
      const refetchUrl = `/api/admin-homes/territory/matrix?scope=${scope}`
        + (tenantId ? `&tenant_id=${encodeURIComponent(tenantId)}` : '')
      const refetch = await fetch(refetchUrl)
      if (refetch.ok) {
        const j = await refetch.json()
        setMatrix(j.matrix as TerritoryMatrixData)
      }
      setEditedCells({})
      setEditedAgentIds(new Set())
      setOpenCellKey(null)
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    setEditedCells({})
    setEditedAgentIds(new Set())
    setConflicts(null)
    setOpenCellKey(null)
  }

  // ---- Conflict cell highlights ----
  const conflictCellKeys = useMemo(() => {
    if (!conflicts) return new Set<string>()
    const set = new Set<string>()
    for (const c of conflicts) {
      // c.key shape: '${scope}|${geo_id}'
      const parts = c.key.split('|')
      const geoId = parts[1]
      if (!geoId) continue
      for (const agentId of c.agents) set.add(cellKey(agentId, geoId))
    }
    return set
  }, [conflicts])

  // ---- Render ----
  return (
    <div className="space-y-4">
      {/* Header + scope picker */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Territory matrix</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Cross-agent assignment view. Click a cell to toggle; click an explicit cell to edit access flags.
          </p>
          {tenantName && (
            <p className="text-xs text-gray-500 mt-1">Tenant: <strong>{tenantName}</strong></p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="matrix-scope">Scope:</label>
          <select
            id="matrix-scope"
            value={scope}
            onChange={e => setScope(e.target.value as MatrixScope)}
            className="border rounded px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            disabled={loading || saving}
          >
            {SCOPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Conflict banner */}
      {conflicts && conflicts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded p-3">
          <div className="flex items-center gap-2 font-semibold text-red-900">
            <AlertCircle className="w-4 h-4" />
            {conflicts.length} primary conflict{conflicts.length === 1 ? '' : 's'} detected
          </div>
          <p className="text-sm text-red-800 mt-1">
            Two or more agents claim primary on the same geo. Highlighted cells must be resolved before the next save.
          </p>
          <ul className="text-xs text-red-700 mt-2 space-y-0.5">
            {conflicts.map(c => (
              <li key={c.key}>{c.key} &rarr; {c.agents.length} agents</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white border rounded p-6 text-center text-gray-500">Loading matrix&hellip;</div>
      )}

      {/* Empty states */}
      {!loading && matrix && matrix.rows.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900">
          No agents in your authority subtree at this tenant. If you expected to see agents, check whether you&apos;re assigned the right role for this tenant.
        </div>
      )}
      {!loading && matrix && matrix.rows.length > 0 && matrix.columns.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900">
          No assignments at this scope yet. Use the per-agent territory page to seed at least one assignment, then return here to bulk-assign across agents.
        </div>
      )}

      {/* Matrix table */}
      {!loading && matrix && matrix.rows.length > 0 && matrix.columns.length > 0 && (
        <div className="border rounded bg-white overflow-auto max-h-[80vh]">
          <table className="text-sm border-collapse">
            <thead className="bg-gray-50 border-b sticky top-0 z-20">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-gray-50 z-30 min-w-[180px]">Agent</th>
                {matrix.columns.map(col => (
                  <th key={col.geo_id} className="text-left p-2 align-bottom min-w-[80px]">
                    <div className="font-medium leading-tight">{col.geo_name}</div>
                    {col.parent_name && (
                      <div className="text-[10px] text-gray-500 leading-tight">{col.parent_name}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map(row => (
                <tr key={row.agent_id} className="border-t">
                  <td className="p-2 sticky left-0 bg-white z-10 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{row.agent_name}</div>
                        <div className="text-xs text-gray-500">
                          {row.agent_role || 'agent'}{row.is_self ? ' (you)' : ''}
                        </div>
                        {!row.can_write && (
                          <div className="text-[10px] text-gray-400 mt-0.5">read-only</div>
                        )}
                      </div>
                      {row.can_write && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenKebabAgentId(openKebabAgentId === row.agent_id ? null : row.agent_id)}
                            aria-label={`Bulk actions for ${row.agent_name}`}
                            aria-haspopup="menu"
                            aria-expanded={openKebabAgentId === row.agent_id}
                            className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 rounded"
                          >
                            <MoreVertical className="w-4 h-4" aria-hidden="true" />
                          </button>
                          {openKebabAgentId === row.agent_id && (
                            <KebabMenu
                              agentId={row.agent_id}
                              agentName={row.agent_name}
                              matrix={matrix}
                              onSetAllPrimary={() => handleSetAllPrimary(row.agent_id)}
                              onClearRow={() => handleClearRow(row.agent_id)}
                              onCopyFromAgent={(sourceId) => handleCopyFromAgent(row.agent_id, sourceId)}
                              onClose={() => setOpenKebabAgentId(null)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  {matrix.columns.map(col => {
                    const ck = cellKey(row.agent_id, col.geo_id)
                    return (
                      <td key={col.geo_id} className="p-1 align-middle relative">
                        <CellButton
                          cell={getCell(row.agent_id, col.geo_id)}
                          agentName={row.agent_name}
                          geoName={col.geo_name}
                          isEdited={ck in editedCells}
                          isConflict={conflictCellKeys.has(ck)}
                          canWrite={row.can_write}
                          isOpen={openCellKey === ck}
                          onToggle={() => togglePresence(row.agent_id, col.geo_id)}
                          onOpen={() => setOpenCellKey(ck)}
                          onClose={() => setOpenCellKey(null)}
                          onUpdate={patch => updateCell(row.agent_id, col.geo_id, patch)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sticky save toolbar */}
      {pendingCount > 0 && (
        <div className="fixed bottom-4 right-4 z-40 bg-white border-2 border-blue-500 rounded shadow-lg p-3 flex items-center gap-3">
          <span className="text-sm font-semibold text-blue-900">
            {pendingCount} pending change{pendingCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={saving}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-1 rounded"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
          >
            <SaveIcon className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CellButton -- one cell's button + popover
// ============================================================================

interface CellButtonProps {
  cell: MatrixCell | null
  agentName: string
  geoName: string
  isEdited: boolean
  isConflict: boolean
  canWrite: boolean
  isOpen: boolean
  onToggle: () => void
  onOpen: () => void
  onClose: () => void
  onUpdate: (patch: Partial<MatrixCell>) => void
}

function CellButton({
  cell,
  agentName,
  geoName,
  isEdited,
  isConflict,
  canWrite,
  isOpen,
  onToggle,
  onOpen,
  onClose,
  onUpdate,
}: CellButtonProps) {
  const isExplicit = cell?.presence === 'explicit'
  const isInherited = cell?.presence === 'inherited'
  const isPrimary = (isExplicit || isInherited) && cell?.is_primary === true
  const inheritedFrom = isInherited ? (cell?.inherited_from_agent_name ?? 'manager') : null
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Compose a11y label by state.
  const stateLabel = !canWrite
    ? `${isExplicit ? (isPrimary ? 'primary' : 'assigned') : isInherited ? `inherited from ${inheritedFrom}` : 'unassigned'}, read-only`
    : isConflict
      ? 'primary conflict, click to edit'
      : isExplicit
        ? `${isPrimary ? 'primary' : 'assigned'}, click to edit access flags`
        : isInherited
          ? `inherited from ${inheritedFrom}${isPrimary ? ' (primary)' : ''}, click to override`
          : 'unassigned, click to assign'
  const ariaLabel = `${agentName}, ${geoName}, ${stateLabel}`

  // Compose visual classes by precedence: conflict > edited > explicit > inherited > empty,
  // dimmed if !canWrite.
  let bg = 'bg-gray-50 hover:bg-blue-50'
  if (isInherited) bg = 'bg-gray-100 hover:bg-gray-200'
  if (isExplicit) bg = 'bg-blue-100 hover:bg-blue-200'
  if (isEdited) bg = 'bg-yellow-100 border border-yellow-400 hover:bg-yellow-200'
  if (isConflict) bg = 'bg-red-200 border-2 border-red-500 ring-2 ring-red-300'
  if (!canWrite) {
    bg = isExplicit ? 'bg-gray-100' : isInherited ? 'bg-gray-100 opacity-80' : 'bg-gray-50 opacity-60'
  }

  const handleClick = () => {
    if (!canWrite) return
    if (isExplicit || isInherited) {
      // Explicit -> edit; inherited -> open popover (editing creates an override).
      onOpen()
    } else {
      // Empty cell -> toggle to explicit (default state).
      onToggle()
    }
  }

  // Restore focus to originating button after popover closes.
  const handleEditorClose = () => {
    onClose()
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={!canWrite}
        aria-label={ariaLabel}
        aria-pressed={isExplicit}
        aria-haspopup={(isExplicit || isInherited) ? 'dialog' : undefined}
        aria-expanded={(isExplicit || isInherited) ? isOpen : undefined}
        className={`relative w-12 h-10 sm:h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1`}
        title={
          !canWrite
            ? 'You do not have permission to edit this row'
            : isExplicit
              ? `Edit (primary: ${isPrimary ? 'yes' : 'no'})`
              : isInherited
                ? `Inherited from ${inheritedFrom}${isPrimary ? ' (primary)' : ''} -- click to override`
                : 'Click to assign'
        }
      >
        {isInherited && (
          <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-gray-400" aria-hidden="true" />
        )}
        {isExplicit && (
          isPrimary
            ? <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            : <Check className="w-3 h-3 text-blue-700" />
        )}
        {isInherited && (
          isPrimary
            ? <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
            : <Check className="w-3 h-3 text-gray-500" />
        )}
      </button>
      {isOpen && cell && (
        <CellEditor
          cell={cell}
          onUpdate={onUpdate}
          onRemove={() => {
            onToggle()
            handleEditorClose()
          }}
          onClose={handleEditorClose}
        />
      )}
    </>
  )
}

// ============================================================================
// CellEditor -- access-flag popover
// ============================================================================

interface CellEditorProps {
  cell: MatrixCell
  onUpdate: (patch: Partial<MatrixCell>) => void
  onRemove: () => void
  onClose: () => void
}

function CellEditor({ cell, onUpdate, onRemove, onClose }: CellEditorProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Initial focus on first focusable inside the dialog (mount only).
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input, button, select')
    first?.focus()
  }, [])

  // ESC closes; Tab/Shift+Tab traps focus inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'input, button, select, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Click-outside closes.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Edit cell access flags"
      className="absolute top-full left-0 z-50 bg-white border-2 border-gray-300 rounded shadow-lg p-3 min-w-[220px] mt-1"
      onClick={e => e.stopPropagation()}
    >
      {cell.presence === 'inherited' && (
        <div className="bg-gray-50 border-b border-gray-200 -mt-3 -mx-3 mb-3 px-3 py-2 text-xs text-gray-700 flex items-center gap-1.5 rounded-t">
          <Lock className="w-3 h-3 text-gray-500" aria-hidden="true" />
          <span>
            Inherited from <span className="font-medium">{cell.inherited_from_agent_name ?? 'manager'}</span>
            <span className="text-gray-400"> -- editing creates an override</span>
          </span>
        </div>
      )}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={cell.is_primary}
            onChange={e => onUpdate({ is_primary: e.target.checked })}
          />
          <Star className={`w-3.5 h-3.5 ${cell.is_primary ? 'fill-amber-500 text-amber-500' : 'text-gray-400'}`} />
          Primary
        </label>
        <div className="border-t pt-2 space-y-1.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cell.condo_access}
              onChange={e => onUpdate({ condo_access: e.target.checked })}
            />
            Condos
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cell.homes_access}
              onChange={e => onUpdate({ homes_access: e.target.checked })}
            />
            Homes
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cell.buildings_access}
              onChange={e => onUpdate({ buildings_access: e.target.checked })}
            />
            Buildings
          </label>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="cell-buildings-mode">Mode:</label>
            <select
              id="cell-buildings-mode"
              value={cell.buildings_mode}
              onChange={e => onUpdate({ buildings_mode: e.target.value })}
              className="border rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="whitelist">Whitelist</option>
              <option value="blacklist">Blacklist</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t">
        {cell.presence === 'explicit' ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-600 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 rounded"
          >
            Remove assignment
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-1 rounded"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// KebabMenu -- per-row bulk actions dropdown
// ============================================================================

interface KebabMenuProps {
  agentId: string
  agentName: string
  matrix: TerritoryMatrixData
  onSetAllPrimary: () => void
  onClearRow: () => void
  onCopyFromAgent: (sourceAgentId: string) => void
  onClose: () => void
}

function KebabMenu({
  agentId,
  agentName,
  matrix,
  onSetAllPrimary,
  onClearRow,
  onCopyFromAgent,
  onClose,
}: KebabMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Initial focus on first menu item (mount only).
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('button')
    first?.focus()
  }, [])

  // ESC closes; Tab/Shift+Tab traps focus inside the menu.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>('button')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Click-outside closes.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  const otherAgents = matrix.rows.filter(r => r.agent_id !== agentId)

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Bulk actions for ${agentName}`}
      className="absolute right-0 top-full z-30 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[200px] py-1 max-h-[60vh] overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => { onSetAllPrimary(); onClose() }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50"
      >
        Set all primary
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => { onClearRow(); onClose() }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50 text-red-600"
      >
        Clear row
      </button>
      {otherAgents.length > 0 && (
        <>
          <div className="border-t border-gray-200 my-1" role="separator" />
          <div className="px-3 py-1 text-xs text-gray-500 font-medium uppercase tracking-wider">
            Copy from
          </div>
          {otherAgents.map(other => (
            <button
              type="button"
              role="menuitem"
              key={other.agent_id}
              onClick={() => { onCopyFromAgent(other.agent_id); onClose() }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50"
            >
              {other.agent_name}
              {other.agent_role && (
                <span className="text-xs text-gray-400 ml-1">({other.agent_role})</span>
              )}
            </button>
          ))}
        </>
      )}
    </div>
  )
}