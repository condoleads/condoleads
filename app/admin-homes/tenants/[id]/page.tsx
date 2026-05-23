// app/admin-homes/tenants/[id]/page.tsx
// W-COCKPIT P-A-2 — per-tenant cockpit entry point.
//
// Server component: validates platform-admin access, fetches tenant + geo lists +
// active restrictions, passes them to CockpitShell. The shell client component
// owns selection state and renders the active lens.
//
// Tenant-wide content (VIP Access Config + Tenant Restrictions) lives in the
// Settings tab (lens 6) and is functionally identical to the prior page.
// Lenses 1-5 ship placeholders in P-A-2 and are filled in Phase B/C.

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import CockpitShell from '@/components/admin-homes/cockpit/CockpitShell'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TenantCockpitPage({ params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) redirect(`/login?redirect=/admin-homes/tenants/${params.id}`)
  if (!user.isPlatformAdmin) redirect('/admin-homes')

  const supabase = createClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!tenant) notFound()

  const [
    { data: areas },
    { data: municipalities },
    { data: communities },
    { data: neighbourhoods },
    { data: currentRestrictions },
  ] = await Promise.all([
    supabase.from('treb_areas').select('id, name, slug').order('name'),
    supabase.from('municipalities').select('id, name, slug, area_id').order('name'),
    supabase.from('communities').select('id, name, slug, municipality_id').order('name'),
    supabase.from('neighbourhoods').select('id, name, slug, area_id').order('name'),
    supabase.from('tenant_property_access')
      .select('*')
      .eq('tenant_id', params.id)
      .eq('is_active', true),
  ])

  const tenantName = tenant.brand_name || tenant.name

  return (
    <div className="-m-6">
      {/* Page chrome above the cockpit shell */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <Link
          href="/admin-homes/tenants"
          className="text-sm text-green-600 hover:text-green-700 inline-block mb-3"
        >
          {'\u2190'} Back to Tenants
        </Link>
        <div className="flex items-center gap-4">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="w-14 h-14 rounded-lg object-contain" />
          ) : (
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-2xl font-black"
              style={{ background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})` }}
            >
              {'\u2728'}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tenantName}</h1>
            <p className="text-gray-500">{tenant.domain} {'\u00B7'} {tenant.admin_email}</p>
            <span
              className={
                'text-xs font-semibold px-2 py-1 rounded-full ' +
                (tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
              }
            >
              {tenant.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      <CockpitShell
        tenantId={params.id}
        tenantName={tenantName}
        settings={{
          tenant: {
            id: tenant.id,
            name: tenant.name,
            brand_name: tenant.brand_name,
            ai_free_messages: tenant.ai_free_messages,
            ai_auto_approve_limit: tenant.ai_auto_approve_limit,
            ai_manual_approve_limit: tenant.ai_manual_approve_limit,
            ai_hard_cap: tenant.ai_hard_cap,
            vip_auto_approve: tenant.vip_auto_approve,
          },
          areas: areas || [],
          municipalities: municipalities || [],
          communities: communities || [],
          neighbourhoods: neighbourhoods || [],
          currentRestrictions: currentRestrictions || [],
        }}
      />
    </div>
  )
}
