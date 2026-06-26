// app/admin-homes/agents/page.tsx
// Phase 3.4 — tenant-scoped agent list + tenant-aware title

import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import { isCrossTenantView, getScopedTenantId } from '@/lib/admin-homes/scope'
import { redirect } from 'next/navigation'
import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'

export const metadata = { title: 'Agents – Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminHomesAgentsPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/agents')

  const supabase = createClient()
  const hostTenantId = await getCurrentTenantId()

  // W5c-2: scope.ts consumer migration. Tenant scoping via helpers; no role
  // gate applied (preserved per current behavior -- agents management page
  // lists all tenant agents regardless of manager/agent role to avoid behavior
  // change in this refactor commit; see F-W5C-2-AGENTS-PAGE-NO-ROLE-GATE).
  // Pre-W5c-2 seeAll missed hostTenantId; helper-based check adds it as belt-
  // and-suspenders. In practice user.tenantId already incorporates hostTenantId
  // via auth.ts/getAdminTenantContext priority chain, so no observable delta.
  const seeAll = isCrossTenantView(user, hostTenantId)
  const scopedTenantId = getScopedTenantId(user, hostTenantId)

  // W-HOUSE-ACCOUNT UNIT 3: filter inactive agents from the management list.
  // Inactive agents (e.g. retired seed roots after UNIT 3 D-phase) clutter the
  // hierarchy display and create phantom "Under: <seed>" lines. The list view
  // is the active-roster surface; deactivated agents are recoverable via the
  // PUT /api/admin-homes/agents/[id] handler (is_active: true) for now and a
  // dedicated archive view in a future unit.
  let agentsQuery = supabase
    .from('agents')
    .select('*')
    .eq('site_type', 'comprehensive')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (!seeAll) {
    if (!scopedTenantId) {
      // Authenticated but no tenant context — return empty
      return <AgentsManagementClient agents={[]} tenants={[]} tenantName={null} tenantBrandName={null} tenantDomain={null} tenantId={null} tenantDefaultAgentId={null} />
    }
    agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)
  }

  // C10 -- include brand_name for admin modal display strings.
  // W-HOUSE-ACCOUNT UNIT 3: include default_agent_id so the client can render
  // the house-account marker (Crown badge) on the holding agent's row. Explicit
  // cols only (CLAUDE.md: NEVER SELECT * on tenants — holds api keys).
  // W-AGENT-CREATE UNIT 18: include brokerage_name + brokerage_address so the
  // Add Agent modal can pre-fill those inputs from the tenant's values. Keeps
  // the allow-list narrow; never *.
  let tenantsQuery = supabase
    .from('tenants')
    .select('id, name, domain, brand_name, default_agent_id, brokerage_name, brokerage_address')
    .order('name')

  if (!seeAll && scopedTenantId) {
    tenantsQuery = tenantsQuery.eq('id', scopedTenantId)
  }

  const [{ data: agents }, { data: tenants }] = await Promise.all([
    agentsQuery,
    tenantsQuery,
  ])

  const tenantName =
    scopedTenantId
      ? (tenants || []).find(t => t.id === scopedTenantId)?.name ?? null
      : null

  // C10 -- brand_name (falls back to name) + domain for admin modal display strings.
  const _c10_scopedTenant = scopedTenantId
    ? (tenants || []).find(t => t.id === scopedTenantId)
    : null
  const tenantBrandName = _c10_scopedTenant
    ? (_c10_scopedTenant.brand_name || _c10_scopedTenant.name || null)
    : null
  const tenantDomain = _c10_scopedTenant?.domain ?? null
  // W-AGENT-CREATE UNIT 18: scoped-tenant brokerage values for Add Agent
  // pre-fill. Tenant is the source of truth for "the brokerage this tenant
  // operates as." Each falls back to null if the tenant row has no value —
  // the modal then leaves the input blank (no fabricated default).
  const tenantBrokerageName = _c10_scopedTenant?.brokerage_name ?? null
  const tenantBrokerageAddress = _c10_scopedTenant?.brokerage_address ?? null

  const agentsWithStats = await Promise.all(
    (agents || []).map(async (agent) => {
      const [{ data: leads }, { data: geoAssignments }, { data: buildingAssignments }] = await Promise.all([
        // C4/D2 -- tenant boundary enforced by agent_id (leads belong to one agent in one tenant). LIKE filter dropped (was tenant-specific, broke non-WALLiam tenants).
        supabase.from('leads').select('id, status, quality, temperature').eq('agent_id', agent.id),
        supabase.from('agent_property_access').select('id').eq('agent_id', agent.id).eq('is_active', true),
        supabase.from('agent_geo_buildings').select('id').eq('agent_id', agent.id),
      ])
      return {
        ...agent,
        total_leads: leads?.length || 0,
        new_leads: leads?.filter(l => l.status === 'new').length || 0,
        hot_leads: leads?.filter(l => l.temperature === 'hot').length || 0,
        geo_territories: geoAssignments?.length || 0,
        assigned_buildings: buildingAssignments?.length || 0,
      }
    })
  )

  // W-HOUSE-ACCOUNT UNIT 3: pick the scoped tenant's default_agent_id (the
  // house account). NULL when no tenant in scope or no default set. Multi-tenant
  // safe — derived from the same scopedTenantId, never hardcoded per tenant.
  const tenantDefaultAgentId = scopedTenantId
    ? (tenants || []).find(t => t.id === scopedTenantId)?.default_agent_id ?? null
    : null

  // W-TENANT-ASSISTANT UNIT 27 (supersedes Unit 25 anchor-based gating):
  // admin-rights for assistants are now ROLE-BASED, not anchor-derived.
  //   - 'tenant_assistant' (top-tier role) -> full admin rights, BY ROLE.
  //   - 'assistant' (branch role) -> NO tenant-wide admin rights, regardless
  //     of where they report. Their lead-flow scope is still anchor-derived
  //     via Unit 19; admin-rights are not.
  // The Unit 25 viewerIsTopTierAssistant helper is RETIRED.

  // W-HOUSE-ACCOUNT UNIT 10 + W-TENANT-ASSISTANT UNIT 27: opt-out write gate.
  // Population: platform admins / DB role='admin' (legacy) / position='tenant_admin' /
  // position='tenant_assistant'. The PUT route in app/api/admin-homes/agents/
  // [id]/route.ts is tightened in lockstep so a plain 'assistant' caller
  // cannot escalate by calling the API directly.
  const canSetOversightOptOut: boolean =
    user?.isPlatformAdmin === true
    || user?.role === 'admin'
    || user?.position === 'tenant_admin'
    || user?.position === 'tenant_assistant'

  // W-HOUSE-ACCOUNT UNIT 21 + W-TENANT-ASSISTANT UNIT 27: NARROW predicate
  // for the set-as-house action. Top-tier roles only — platform_admin (kept
  // so the system operator isn't locked out), tenant_admin owner, and
  // tenant_assistant. DB role='admin' alone (no top-tier position) is
  // intentionally NOT admitted here (Unit 21 design: rare + sensitive).
  const canSetHouseAccount: boolean =
    user?.isPlatformAdmin === true
    || user?.position === 'tenant_admin'
    || user?.position === 'tenant_assistant'

  return <AgentsManagementClient agents={agentsWithStats} tenants={tenants || []} tenantName={tenantName} tenantBrandName={tenantBrandName} tenantDomain={tenantDomain} tenantId={scopedTenantId} tenantDefaultAgentId={tenantDefaultAgentId} canSetOversightOptOut={canSetOversightOptOut} canSetHouseAccount={canSetHouseAccount} tenantBrokerageName={tenantBrokerageName} tenantBrokerageAddress={tenantBrokerageAddress} />
}