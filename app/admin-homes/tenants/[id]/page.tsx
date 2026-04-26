// app/admin-homes/tenants/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import TenantGeoAssignmentSection from '@/components/admin-homes/TenantGeoAssignmentSection'
import Link from 'next/link'

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  // Phase 3.4+: Platform Admin only
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
    supabase.from('tenant_property_access').select('*').eq('tenant_id', params.id).eq('is_active', true),
  ])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/admin-homes/tenants" className="text-sm text-green-600 hover:text-green-700 mb-4 inline-block">
          ← Back to Tenants
        </Link>
        <div className="flex items-center gap-4">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="w-14 h-14 rounded-lg object-contain" />
          ) : (
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-2xl font-black"
              style={{ background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})` }}>
              ✦
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tenant.brand_name || tenant.name}</h1>
            <p className="text-gray-500">{tenant.domain} · {tenant.admin_email}</p>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {tenant.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* VIP Config summary */}
      <div className="bg-white rounded-lg shadow p-5 mb-8">
        <h2 className="font-semibold text-gray-900 mb-3">✦ VIP Access Config</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{tenant.ai_free_messages}</div>
            <div className="text-xs text-gray-500 mt-1">Free Plans</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{tenant.ai_auto_approve_limit}</div>
            <div className="text-xs text-gray-500 mt-1">Auto-Approve</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-700">{tenant.ai_manual_approve_limit}</div>
            <div className="text-xs text-gray-500 mt-1">Manual Approve</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{tenant.ai_hard_cap}</div>
            <div className="text-xs text-gray-500 mt-1">Hard Cap</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-700">{tenant.vip_auto_approve ? '✓' : '✗'}</div>
            <div className="text-xs text-gray-500 mt-1">Auto-Approve On</div>
          </div>
        </div>
        <div className="mt-3">
          <Link href={`/admin-homes/tenants`} className="text-xs text-green-600 hover:underline">
            Edit VIP config → Edit Tenant
          </Link>
        </div>
      </div>

      {/* Territory restrictions */}
      <TenantGeoAssignmentSection
        tenantId={params.id}
        areas={areas || []}
        municipalities={municipalities || []}
        communities={communities || []}
        neighbourhoods={neighbourhoods || []}
        currentRestrictions={currentRestrictions || []}
      />
    </div>
  )
}