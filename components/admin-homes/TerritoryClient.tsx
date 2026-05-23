// components/admin-homes/TerritoryClient.tsx
// T4a-2: Client component -- coverage table + audit log + stats card.
// Per-tenant view scope (W-TERRITORY v12 Q1 product call).

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, Activity, Users, Star } from 'lucide-react'
import TerritoryMatrix from './TerritoryMatrix'

interface CoverageRow {
  id: string
  agent_id: string | null
  agent_name: string | null
  scope: string
  geo_id: string | null
  geo_name: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
  created_at: string
  updated_at: string
}

interface CoverageStats {
  total: number
  by_scope: { area: number; municipality: number; community: number; neighbourhood: number }
  primary_count: number
  distinct_agents: number
}

interface AuditRow {
  id: string
  agent_id: string | null
  agent_name: string | null
  scope: string
  scope_id: string | null
  change_type: string
  before_state: any
  after_state: any
  changed_by: string | null
  changed_at: string
  notes: string | null
}

interface Props {
  tenantId: string | null
  tenantName: string | null
  seeAll: boolean
}

export default function TerritoryClient({ tenantId, tenantName, seeAll }: Props) {
  const [activeTab, setActiveTab] = useState<'coverage' | 'matrix' | 'audit'>('coverage')
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [stats, setStats] = useState<CoverageStats | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [distinctChangeTypes, setDistinctChangeTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<string>('all')
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>('')

  const noTenantScope = !tenantId

  useEffect(() => {
    if (noTenantScope) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        // W-COCKPIT P-A-3 fix: pass tenant_id explicitly so the platform-admin
        // cockpit context (user.tenantId = null) hits the route's documented
        // ?tenant_id= override path. Harmless for tenant-scoped users (route
        // picks tenant from auth session when override is absent).
        const auditUrl = '/api/admin-homes/territory/audit-log?limit=100'
          + (tenantId ? '&tenant_id=' + encodeURIComponent(tenantId) : '')
          + (changeTypeFilter ? '&change_type=' + encodeURIComponent(changeTypeFilter) : '')
        const coverageUrl = '/api/admin-homes/territory/coverage'
          + (tenantId ? '?tenant_id=' + encodeURIComponent(tenantId) : '')
        const [covRes, audRes] = await Promise.all([
          fetch(coverageUrl),
          fetch(auditUrl),
        ])
        if (!covRes.ok) throw new Error('coverage fetch: ' + covRes.status)
        if (!audRes.ok) throw new Error('audit fetch: ' + audRes.status)
        const covJson = await covRes.json()
        const audJson = await audRes.json()
        if (!cancelled) {
          setCoverage(covJson.rows || [])
          setStats(covJson.stats || null)
          setAudit(audJson.rows || [])
          setDistinctChangeTypes(audJson.distinct_change_types || [])
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [noTenantScope, changeTypeFilter])

  const filteredCoverage = scopeFilter === 'all'
    ? coverage
    : coverage.filter(r => r.scope === scopeFilter)

  if (noTenantScope && seeAll) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Territory</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900">
          You are signed in as a platform admin without a tenant scope. Switch into a specific tenant to view its territory configuration.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            Territory
          </h1>
          {tenantName && <p className="text-sm text-gray-600 mt-1">Tenant: <strong>{tenantName}</strong></p>}
        </div>
        <Link href="/admin-homes/agents" className="text-sm text-blue-600 hover:underline">
          → Manage agent assignments
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total assignments" value={stats?.total ?? '—'} icon={<MapPin className="w-4 h-4" />} />
        <StatCard label="Primary" value={stats?.primary_count ?? '—'} icon={<Star className="w-4 h-4" />} />
        <StatCard label="Distinct agents" value={stats?.distinct_agents ?? '—'} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Communities" value={stats?.by_scope.community ?? '—'} />
        <StatCard label="Audit events" value={audit.length === 100 ? '100+' : audit.length} icon={<Activity className="w-4 h-4" />} />
      </div>

      <div className="border-b mb-4">
        <nav className="flex gap-1">
          <button type="button" onClick={() => setActiveTab('coverage')} className={'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === 'coverage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>Coverage</button>
          <button type="button" onClick={() => setActiveTab('matrix')} className={'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === 'matrix' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>Matrix</button>
          <button type="button" onClick={() => setActiveTab('audit')} className={'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900')}>Audit log</button>
        </nav>
      </div>

      {activeTab === 'coverage' && (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Coverage</h2>
          <div className="flex items-center gap-2 text-sm">
            <label>Scope:</label>
            <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value)} className="border rounded px-2 py-1">
              <option value="all">All ({coverage.length})</option>
              <option value="area">Area ({stats?.by_scope.area ?? 0})</option>
              <option value="municipality">Municipality ({stats?.by_scope.municipality ?? 0})</option>
              <option value="community">Community ({stats?.by_scope.community ?? 0})</option>
              <option value="neighbourhood">Neighbourhood ({stats?.by_scope.neighbourhood ?? 0})</option>
            </select>
          </div>
        </div>
        <div className="border rounded overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2">Agent</th>
                <th className="text-left p-2">Scope</th>
                <th className="text-left p-2">Geo</th>
                <th className="text-left p-2">Primary</th>
                <th className="text-left p-2">Access</th>
                <th className="text-left p-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">Loading…</td></tr>
              )}
              {!loading && filteredCoverage.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">No active assignments</td></tr>
              )}
              {!loading && filteredCoverage.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.agent_name || <span className="text-gray-400">—</span>}</td>
                  <td className="p-2"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{r.scope}</span></td>
                  <td className="p-2 font-medium">{r.geo_name || <span className="text-gray-400 text-xs">{r.geo_id ?? '—'}</span>}</td>
                  <td className="p-2">{r.is_primary ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : <span className="text-gray-300">—</span>}</td>
                  <td className="p-2 text-xs text-gray-600">
                    {r.condo_access && <span className="mr-1 px-1 bg-blue-50 rounded">condo</span>}
                    {r.homes_access && <span className="mr-1 px-1 bg-green-50 rounded">homes</span>}
                    {r.buildings_access && <span className="mr-1 px-1 bg-purple-50 rounded">bldg:{r.buildings_mode}</span>}
                  </td>
                  <td className="p-2 text-xs text-gray-500">{new Date(r.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {activeTab === 'matrix' && tenantId && (
        <TerritoryMatrix tenantId={tenantId} tenantName={tenantName} />
      )}

      {activeTab === 'audit' && (
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <div className="flex items-center gap-2 text-sm">
            <label>Change type:</label>
            <select value={changeTypeFilter} onChange={e => setChangeTypeFilter(e.target.value)} className="border rounded px-2 py-1">
              <option value="">All</option>
              {distinctChangeTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
            </select>
          </div>
        </div>
        <div className="border rounded overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2">When</th>
                <th className="text-left p-2">Agent</th>
                <th className="text-left p-2">Scope</th>
                <th className="text-left p-2">Change</th>
                <th className="text-left p-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading…</td></tr>
              )}
              {!loading && audit.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">No audit events</td></tr>
              )}
              {!loading && audit.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 text-xs text-gray-600 whitespace-nowrap">{new Date(r.changed_at).toLocaleString()}</td>
                  <td className="p-2">{r.agent_name || <span className="text-gray-400">—</span>}</td>
                  <td className="p-2 text-xs"><span className="px-2 py-0.5 rounded bg-gray-100">{r.scope}</span></td>
                  <td className="p-2"><ChangeTypeBadge type={r.change_type} /></td>
                  <td className="p-2 text-xs text-gray-500">{r.notes || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Showing latest {audit.length} events{audit.length === 100 ? ' (capped at 100)' : ''}.
        </p>
      </section>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="bg-white border rounded p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

function ChangeTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    primary_set: 'bg-amber-100 text-amber-800',
    primary_unset: 'bg-gray-100 text-gray-700',
    access_toggle_changed: 'bg-blue-100 text-blue-800',
    assignment_granted: 'bg-green-100 text-green-800',
    assignment_revoked: 'bg-red-100 text-red-800',
    scope_widened: 'bg-purple-100 text-purple-800',
    scope_narrowed: 'bg-purple-100 text-purple-800',
    pin_added: 'bg-indigo-100 text-indigo-800',
    pin_removed: 'bg-indigo-100 text-indigo-800',
    percentage_set: 'bg-teal-100 text-teal-800',
    percentage_changed: 'bg-teal-100 text-teal-800',
  }
  const cls = colorMap[type] || 'bg-gray-100 text-gray-700'
  return <span className={'px-2 py-0.5 rounded text-xs ' + cls}>{type}</span>
}
