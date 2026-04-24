// app/platform/page.tsx
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PlatformHomePage() {
  // Service-role client — Platform Admin has already been authenticated in the layout.
  // Gate happens in app/platform/layout.tsx via resolvePlatformAdmin().
  const db = createClient()

  const [tenantsRes, agentsRes, usersRes, leadsRes] = await Promise.all([
    db.from('tenants').select('id', { count: 'exact', head: true }),
    db.from('agents').select('id', { count: 'exact', head: true }),
    db.from('user_profiles').select('id', { count: 'exact', head: true }),
    db.from('leads').select('id', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'Tenants', value: tenantsRes.count ?? 0 },
    { label: 'Agents', value: agentsRes.count ?? 0 },
    { label: 'Users', value: usersRes.count ?? 0 },
    { label: 'Leads', value: leadsRes.count ?? 0 },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Platform Overview</h1>
        <p className="text-sm text-slate-400 mt-1">
          Foundation gate active. Tenant matrix, drill-down, and cross-tenant search coming next.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-slate-800 bg-slate-900 p-5"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {s.label}
            </div>
            <div className="text-3xl font-semibold text-slate-100 mt-2 tabular-nums">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
          Next up
        </div>
        <ul className="text-sm text-slate-300 space-y-1.5 list-disc pl-5 marker:text-slate-600">
          <li>Tenant matrix with per-tenant health, agents, users (30d), leads, last activity</li>
          <li>Drill into any tenant (banner + audit + exit)</li>
          <li>Cross-tenant search, platform audit log, approval inbox</li>
        </ul>
      </div>
    </div>
  )
}
