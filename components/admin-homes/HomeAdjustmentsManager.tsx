'use client'

// components/admin-homes/HomeAdjustmentsManager.tsx
//
// v10 step 3 Phase 1: System 2 admin UI for editing per-tenant per-geo home
// adjustment overrides. Mirrors the shape of components/admin/AdjustmentsManager
// but with 15 numeric fields (vs condo's 4) and SF-only geo cascade (community
// → municipality → area → generic; no building tier).
//
// UX: list rows in a table; "Add Row" opens modal with scope picker + 15
// numeric fields. Empty fields = inherit from broader scope or DEFAULT. Each
// row carries one `type` ('sale' | 'lease'). Delete is allowed except for
// tenant-generic row.

import { useState, useEffect } from 'react'

interface HomeAdjustment {
  id: string
  tenant_id: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  type: 'sale' | 'lease'
  scope_level: 'Community' | 'Municipality' | 'Area' | 'Generic'
  scope_name: string
  lot_frontage_per_foot_pct: number | null
  lot_frontage_max_pct: number | null
  lot_depth_per_10ft: number | null
  lot_depth_max: number | null
  basement_finished: number | null
  basement_sep_entrance: number | null
  basement_walkout_bonus: number | null
  garage_detached_single: number | null
  garage_attached_single: number | null
  garage_builtin: number | null
  garage_attached_double: number | null
  pool_inground: number | null
  bathroom_full: number | null
  bathroom_half: number | null
  parking_per_space: number | null
  created_at: string
  updated_at: string
}

interface Options {
  areas: { id: string; name: string }[]
  municipalities: { id: string; name: string; code: string }[]
  communities: { id: string; name: string }[]
}

// Column meta for the form layout. Order = render order in the modal.
const COLS: { key: keyof HomeAdjustment; label: string; group: 'sale' | 'lease' | 'both'; hint: string }[] = [
  { key: 'lot_frontage_per_foot_pct', label: 'Frontage % per ft', group: 'sale', hint: 'h6: e.g. 0.008 = 0.8% of comp price per ft of diff' },
  { key: 'lot_frontage_max_pct', label: 'Frontage cap %', group: 'sale', hint: 'h6: e.g. 0.20 = max 20% of comp price' },
  { key: 'lot_depth_per_10ft', label: 'Depth $/10ft', group: 'sale', hint: 'e.g. 5000' },
  { key: 'lot_depth_max', label: 'Depth cap $', group: 'sale', hint: 'e.g. 30000' },
  { key: 'basement_finished', label: 'Basement: Finished $', group: 'sale', hint: 'e.g. 50000' },
  { key: 'basement_sep_entrance', label: 'Basement: Sep. Entrance $', group: 'sale', hint: 'e.g. 80000' },
  { key: 'basement_walkout_bonus', label: 'Basement: Walk-Out bonus $', group: 'sale', hint: 'e.g. 30000' },
  { key: 'garage_detached_single', label: 'Garage: Detached $', group: 'sale', hint: 'e.g. 30000' },
  { key: 'garage_attached_single', label: 'Garage: Attached $', group: 'sale', hint: 'e.g. 45000' },
  { key: 'garage_builtin', label: 'Garage: Built-In $', group: 'sale', hint: 'e.g. 60000' },
  { key: 'garage_attached_double', label: 'Garage: Attached Double $', group: 'sale', hint: 'e.g. 70000' },
  { key: 'pool_inground', label: 'Pool: Inground $', group: 'sale', hint: 'e.g. 30000' },
  { key: 'bathroom_full', label: 'Bathroom: Full $', group: 'both', hint: 'sale: $/bath ; lease: $/mo per bath' },
  { key: 'bathroom_half', label: 'Bathroom: Half $', group: 'sale', hint: 'e.g. 10000' },
  { key: 'parking_per_space', label: 'Parking: $/space', group: 'lease', hint: 'lease: $/mo per parking space' },
]

export default function HomeAdjustmentsManager() {
  const [rows, setRows] = useState<HomeAdjustment[]>([])
  const [options, setOptions] = useState<Options | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [scopeLevel, setScopeLevel] = useState<'generic' | 'area' | 'municipality' | 'community'>('generic')
  const [scopeId, setScopeId] = useState<string>('')
  const [type, setType] = useState<'sale' | 'lease'>('sale')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin-homes/home-adjustments')
      const data = await res.json()
      if (res.ok) {
        setRows(data.adjustments || [])
        setOptions(data.options || null)
        setTenantId(data.tenantId || null)
      } else {
        setError(data.error || 'Failed to load')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({})
    setScopeLevel('generic')
    setScopeId('')
    setType('sale')
    setError(null)
    setShowModal(true)
  }

  const openEdit = (row: HomeAdjustment) => {
    setEditingId(row.id)
    const f: Record<string, string> = {}
    for (const c of COLS) {
      const v = row[c.key]
      f[c.key as string] = v == null ? '' : String(v)
    }
    setForm(f)
    setType(row.type)
    if (row.community_id) { setScopeLevel('community'); setScopeId(row.community_id) }
    else if (row.municipality_id) { setScopeLevel('municipality'); setScopeId(row.municipality_id) }
    else if (row.area_id) { setScopeLevel('area'); setScopeId(row.area_id) }
    else { setScopeLevel('generic'); setScopeId('') }
    setError(null)
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, any> = { type, scope_level: scopeLevel, scope_id: scopeId || null }
      for (const c of COLS) {
        const v = form[c.key as string]
        body[c.key as string] = v === '' || v === undefined ? null : Number(v)
      }
      const res = editingId
        ? await fetch('/api/admin-homes/home-adjustments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingId, ...body }),
          })
        : await fetch('/api/admin-homes/home-adjustments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Save failed')
      } else {
        setShowModal(false)
        await fetchRows()
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: HomeAdjustment) => {
    if (row.scope_level === 'Generic') {
      alert('Tenant-generic row cannot be deleted — edit it to reset values instead.')
      return
    }
    if (!confirm(`Delete the ${row.scope_level} (${row.scope_name}) ${row.type} override?`)) return
    const res = await fetch(`/api/admin-homes/home-adjustments?id=${row.id}`, { method: 'DELETE' })
    if (res.ok) await fetchRows()
    else { const d = await res.json(); alert(d?.error || 'Delete failed') }
  }

  if (loading) return <div className="p-8 text-slate-600">Loading…</div>

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Home Adjustment Overrides</h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Per-geo manual overrides for the home estimator's adjustment math. Cascade:
            <span className="font-semibold"> Community → Municipality → Area → Tenant default → Hardcoded</span>.
            Empty fields fall through to the next broader scope. Empty table = the matcher uses hardcoded defaults
            (zero behavior change vs ungated estimator).
          </p>
          {tenantId
            ? <p className="text-xs text-slate-500 mt-2">Tenant: <code className="font-mono">{tenantId}</code></p>
            : <p className="text-xs text-amber-700 mt-2 bg-amber-50 px-2 py-1 rounded inline-block">
                Platform admin: no tenant selected. Use the tenant override cookie to scope edits.
              </p>}
        </div>
        {tenantId && (
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold text-sm">
            + Add override
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{error}</div>
      )}

      {rows.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded p-8 text-center">
          <p className="text-slate-600">No overrides configured for this tenant.</p>
          <p className="text-xs text-slate-500 mt-2">
            The matcher will use hardcoded defaults from <code className="font-mono">home-adjustment-math.js</code>.
            Add a row to customize values per community, municipality, area, or tenant-wide.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Scope</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Set fields</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const setCount = COLS.filter(c => row[c.key] != null).length
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{row.scope_level}</td>
                    <td className="px-3 py-2">{row.scope_name}</td>
                    <td className="px-3 py-2 capitalize">{row.type}</td>
                    <td className="px-3 py-2 text-slate-500">{setCount} of {COLS.length}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {new Date(row.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline mr-3 text-sm">Edit</button>
                      <button onClick={() => remove(row)} className="text-red-600 hover:underline text-sm" disabled={row.scope_level === 'Generic'}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">{editingId ? 'Edit override' : 'Add override'}</h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select value={type} onChange={e => setType(e.target.value as any)} disabled={!!editingId}
                          className="w-full border rounded px-2 py-1 text-sm">
                    <option value="sale">sale</option>
                    <option value="lease">lease</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Scope</label>
                  <select value={scopeLevel} onChange={e => { setScopeLevel(e.target.value as any); setScopeId('') }} disabled={!!editingId}
                          className="w-full border rounded px-2 py-1 text-sm">
                    <option value="generic">Tenant default (generic)</option>
                    <option value="area">Area</option>
                    <option value="municipality">Municipality</option>
                    <option value="community">Community</option>
                  </select>
                </div>
              </div>

              {scopeLevel !== 'generic' && options && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {scopeLevel === 'area' ? 'Area' : scopeLevel === 'municipality' ? 'Municipality' : 'Community'}
                  </label>
                  <select value={scopeId} onChange={e => setScopeId(e.target.value)} disabled={!!editingId}
                          className="w-full border rounded px-2 py-1 text-sm">
                    <option value="">— select —</option>
                    {(scopeLevel === 'area' ? options.areas : scopeLevel === 'municipality' ? options.municipalities : options.communities).map((opt: any) => (
                      <option key={opt.id} value={opt.id}>{opt.code ? `${opt.code} — ${opt.name}` : opt.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-slate-600 mb-3">
                  Leave a field empty to inherit from the next broader scope. Set a value to override.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {COLS.map(c => (
                    <div key={c.key as string}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {c.label}
                        {c.group !== 'both' && <span className="text-slate-400 ml-1 font-normal">({c.group})</span>}
                      </label>
                      <input
                        type="number" step="any"
                        value={form[c.key as string] || ''}
                        onChange={e => setForm({ ...form, [c.key as string]: e.target.value })}
                        placeholder="(inherit)"
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">{c.hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800">{error}</div>
              )}
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} disabled={saving}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
              <button onClick={save} disabled={saving || (scopeLevel !== 'generic' && !scopeId && !editingId)}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
