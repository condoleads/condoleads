'use client'
// components/admin-homes/cockpit/territory/HealthView.tsx
// W-TERRITORY-OPS T1-2 -- View 4: Health.
//
// Fetches GET /api/admin-homes/territory/health and renders the resolver
// health check in a single screen optimized for "find problems fast".
//
// Layout (top to bottom):
//   1. Disaster banner (red, only when disaster_state OR default not healthy)
//   2. Health-grade summary card (color by grade)
//   3. Stats grid (4 tiles: selling agents, total cards, tenant default, active agents)
//   4. Problems sections: phantoms / stale-agents / orphan-buildings
//
// Real data only. No mocks. Loading + error states are explicit.

import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Users,
} from 'lucide-react'

interface TenantDefault {
  agent_id: string
  agent_name: string | null
  is_selling: boolean
  is_active: boolean
  is_healthy: boolean
}

interface FloorAlert {
  id: string
  tenant_id: string
  property_type: string | null
  listing_id: string | null
  alert_type: string
  created_at: string
}

interface NullCacheCount {
  total: number
  condo: number
  home: number
  other: number
}

interface HealthPayload {
  tenant_id: string
  selling_agent_count: number
  active_agent_count: number
  tenant_default: TenantDefault | null
  total_active_cards: number
  phantom_cards: number
  stale_agent_cards: number
  orphan_buildings: number
  disaster_state: boolean
  health_grade: 'critical' | 'warning' | 'caution' | 'healthy'
  // P-DASHBOARD GAP-B: floor-pool alerts (tenant-scoped). Event 4's
  // reflow + Landing 1's pick_floor_agent both INSERT here when a
  // listing's cascade reaches L9/L10 floor with no eligible agent.
  // null = the route's extension query failed (could not read);
  // [] = confirmed zero alerts (healthy); these must render distinctly.
  floor_alerts?: FloorAlert[] | null
  // P-DASHBOARD GAP-D: NULL-cache count (global -- mls_listings has no
  // tenant_id column, so this is system-wide drift visibility).
  // null = the route's extension query failed (could not read);
  // {total: 0, ...} = genuinely zero unrouted (healthy); render distinctly.
  null_cache_count?: NullCacheCount | null
  warnings?: string[]
}

interface Props {
  tenantId: string
  tenantName: string
}

export default function HealthView({ tenantId, tenantName }: Props) {
  const [data, setData] = useState<HealthPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetch(`/api/admin-homes/territory/health?tenant_id=${encodeURIComponent(tenantId)}`, {
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${r.status}`)
        }
        return r.json() as Promise<HealthPayload>
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'failed to load health')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading territory health for {tenantName}…
      </div>
    )
  }

  if (err) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Could not load health data</p>
            <p className="mt-1">{err}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No health data returned.
      </div>
    )
  }

  const gradeStyles: Record<HealthPayload['health_grade'], { bg: string; border: string; text: string; icon: JSX.Element; label: string }> = {
    critical: {
      bg: 'bg-red-50',
      border: 'border-red-300',
      text: 'text-red-900',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      label: 'Critical',
    },
    warning: {
      bg: 'bg-orange-50',
      border: 'border-orange-300',
      text: 'text-orange-900',
      icon: <AlertCircle className="w-5 h-5 text-orange-600" />,
      label: 'Warning',
    },
    caution: {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      text: 'text-amber-900',
      icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
      label: 'Caution',
    },
    healthy: {
      bg: 'bg-green-50',
      border: 'border-green-300',
      text: 'text-green-900',
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      label: 'Healthy',
    },
  }

  const g = gradeStyles[data.health_grade]
  const td = data.tenant_default
  const defaultUnhealthy = td !== null && !td.is_healthy

  return (
    <div className="space-y-4">
      {(data.disaster_state || defaultUnhealthy) && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-red-900">
                Routing in disaster state &mdash; immediate action required
              </p>
              <p className="mt-1 text-red-800">
                {data.disaster_state && data.selling_agent_count === 0
                  ? 'No selling agents are active for this tenant. All routing will return NULL until at least one agent is_selling=true AND is_active=true.'
                  : defaultUnhealthy
                  ? `Tenant default agent (${td?.agent_name ?? 'unnamed'}) is not selling or not active. Listing routing falls through to hash-RR; brand pages will surprise the operator.`
                  : 'Disaster state flagged but cause not identified by client. Inspect resolver_health_check directly.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-md border ${g.border} ${g.bg} p-4`}>
        <div className="flex items-start gap-3">
          {g.icon}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${g.text}`}>
              {tenantName} territory health: <span className="uppercase tracking-wide">{g.label}</span>
            </p>
            <p className={`mt-1 text-xs ${g.text} opacity-80`}>
              Grade derived from selling-agent count, tenant default status, phantom cards, stale-agent cards, and orphan buildings.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Users className="w-4 h-4 text-gray-500" />}
          label="Selling agents"
          value={data.selling_agent_count}
          sub={`${data.active_agent_count} active total`}
        />
        <StatTile
          icon={<Activity className="w-4 h-4 text-gray-500" />}
          label="Active cards"
          value={data.total_active_cards}
          sub="across all scopes"
        />
        <StatTile
          icon={
            td?.is_healthy ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            )
          }
          label="Tenant default"
          value={td ? (td.agent_name ?? '—') : 'unset'}
          sub={
            td
              ? td.is_healthy
                ? 'selling + active'
                : `${td.is_selling ? 'selling' : 'not selling'} / ${td.is_active ? 'active' : 'inactive'}`
              : 'falls back to hash-RR'
          }
          smallValue
        />
        <StatTile
          icon={<Activity className="w-4 h-4 text-gray-500" />}
          label="Disaster state"
          value={data.disaster_state ? 'YES' : 'no'}
          sub={data.disaster_state ? 'routing returning NULL' : 'routing operational'}
          tone={data.disaster_state ? 'red' : undefined}
        />
      </div>

      <div className="space-y-2">
        <ProblemRow
          icon={<AlertCircle className="w-4 h-4 text-amber-600" />}
          tone={data.phantom_cards > 0 ? 'amber' : 'gray'}
          count={data.phantom_cards}
          title="Phantom cards"
          description="Active cards with all three access flags (condo_access / homes_access / buildings_access) set to false. They occupy a routing slot without granting any property-type access."
          ok="No phantom cards detected."
        />
        <ProblemRow
          icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
          tone={data.stale_agent_cards > 0 ? 'orange' : 'gray'}
          count={data.stale_agent_cards}
          title="Stale-agent cards"
          description="Active cards held by agents who are no longer selling or active. Resolver falls through; cards should be reassigned or deactivated."
          ok="No cards held by non-selling or inactive agents."
        />
        <ProblemRow
          icon={<Building2 className="w-4 h-4 text-blue-600" />}
          tone={data.orphan_buildings > 0 ? 'blue' : 'gray'}
          count={data.orphan_buildings}
          title="Orphan buildings"
          description="Building cards whose surrounding municipality has no apa coverage. The building routes via its pin, but everything else in the municipality cascades to the tenant default."
          ok="No orphan buildings detected."
        />
        {/* P-DASHBOARD GAP-B: floor-pool alerts (tenant-scoped).
            F-FALSE-GREEN-VIA-SILENT-SOFT-FAIL fix: null = could-not-read
            renders as a RED error row, NEVER as the green/gray healthy "0". */}
        {data.floor_alerts == null ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-red-900">Floor-pool alerts: could not read</p>
                  <span className="text-sm font-semibold text-red-900">—</span>
                </div>
                <p className="mt-1 text-xs text-red-800">
                  The extension query failed at the route. This is NOT "no alerts" — it means tenant_floor_alerts could not be read. See Diagnostics warnings panel below for the underlying error. Common cause: grant gap (postgres-only) or a pg-direct connection failure.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ProblemRow
            icon={<AlertCircle className="w-4 h-4 text-red-600" />}
            tone={data.floor_alerts.length > 0 ? 'orange' : 'gray'}
            count={data.floor_alerts.length}
            title="Floor-pool alerts"
            description="tenant_floor_alerts rows recorded by Landing 1's pick_floor_agent or Event 4's reflow when a listing's cascade reached the floor (L9/L10) and the floor pool had no eligible agent. Restore floor-pool members or carve coverage at a higher scope."
            ok="No floor-pool alerts."
          />
        )}
      </div>

      {/* P-DASHBOARD GAP-D: NULL-cache drift visibility (global).
          F-FALSE-GREEN fix: null = could-not-read renders as a RED error
          panel with "—" instead of a green "0" that would look healthy. */}
      {data.null_cache_count == null ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-red-900">Unrouted listings (global): could not read</p>
                <span className="text-sm font-semibold text-red-900 tabular-nums">—</span>
              </div>
              <p className="mt-1 text-xs text-red-800">
                The extension query for mls_listings NULL-cache count failed at the route. This is NOT "0 unrouted" — it means the cache health is unknown. See Diagnostics warnings panel below for the underlying error. Common cause: PostgREST 8s timeout on the 1.3M-row scan (the recon ran the same query under postgres in &lt;100ms) or a pg-direct connection failure.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="flex items-start gap-3">
            <Activity className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900">Unrouted listings (global)</p>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {data.null_cache_count.total.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-700">
                mls_listings rows with NULL assigned_agent_id, system-wide (the cache table has no tenant_id; this surfaces F-RESOLVE-AT-INSERT-PRIORITY's drift). Landing 2's sync hooks resolve at insert; any remaining NULL accumulation indicates either an unwired ingestion path or a tenant with no eligible floor-pool member.
              </p>
              <div className="mt-2 flex gap-4 text-xs text-gray-600">
                <span>Condos: <strong className="tabular-nums">{data.null_cache_count.condo.toLocaleString()}</strong></span>
                <span>Homes: <strong className="tabular-nums">{data.null_cache_count.home.toLocaleString()}</strong></span>
                <span>Other: <strong className="tabular-nums">{data.null_cache_count.other.toLocaleString()}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAP-B: floor-alerts detail list (only when read succeeded AND non-empty).
          Array.isArray gate ensures null does not throw on .length access. */}
      {Array.isArray(data.floor_alerts) && data.floor_alerts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900 mb-2">Recent floor-pool alerts ({data.floor_alerts.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.floor_alerts.slice(0, 50).map(a => (
              <div key={a.id} className="text-xs text-amber-900 flex items-center gap-2">
                <span className="font-mono">{new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19)}</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-semibold uppercase">{a.alert_type}</span>
                {a.property_type && <span>property_type: {a.property_type}</span>}
                {a.listing_id && <span className="font-mono">listing: {a.listing_id.slice(0, 8)}…</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings panel (e.g. floor_alerts/null_cache_count query soft-failed) */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-md border border-gray-300 bg-gray-50 p-3 text-xs text-gray-700">
          <p className="font-semibold mb-1">Diagnostics warnings (extended fields):</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  sub,
  smallValue,
  tone,
}: {
  icon: JSX.Element
  label: string
  value: number | string
  sub: string
  smallValue?: boolean
  tone?: 'red'
}) {
  const valueClass = smallValue
    ? 'text-base font-semibold text-gray-900 truncate'
    : 'text-2xl font-semibold text-gray-900'
  const wrapper =
    tone === 'red'
      ? 'rounded-md border border-red-200 bg-red-50 p-3'
      : 'rounded-md border border-gray-200 bg-white p-3'
  return (
    <div className={wrapper}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <div className={`mt-1 ${valueClass}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </div>
  )
}

function ProblemRow({
  icon,
  tone,
  count,
  title,
  description,
  ok,
}: {
  icon: JSX.Element
  tone: 'amber' | 'orange' | 'blue' | 'gray'
  count: number
  title: string
  description: string
  ok: string
}) {
  const toneClass: Record<typeof tone, string> = {
    amber: 'border-amber-200 bg-amber-50',
    orange: 'border-orange-200 bg-orange-50',
    blue: 'border-blue-200 bg-blue-50',
    gray: 'border-gray-200 bg-white',
  }
  const isClean = count === 0
  return (
    <div className={`rounded-md border p-3 ${toneClass[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {isClean ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : icon}
        </div>
        <div className="flex-1 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">{title}</p>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {isClean ? '0' : count}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-700">
            {isClean ? ok : description}
          </p>
        </div>
      </div>
    </div>
  )
}
