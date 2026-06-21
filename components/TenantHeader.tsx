import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import SiteHeader from './navigation/SiteHeader'

// Shows public SiteHeader on tenant domains for buyer-facing routes only.
// W-COCKPIT P-B-1 followup: never render on admin/dashboard/auth routes —
// those have their own chrome (admin-homes layout's TenantHeader w/ W5a switcher,
// dashboard's own nav, login's bare page) and the public bar buries them visually.
export default async function TenantHeader() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\./, '')
  const pathname = headersList.get('x-pathname') || ''

  // Skip on admin/dashboard/auth routes — public chrome doesn't belong there.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname === '/login' ||
    pathname.startsWith('/reset-password')
  ) return null

  // Skip on condoleads, localhost, vercel.app — public site uses its own chrome there.
  if (
    cleanHost.includes('condoleads.ca') ||
    cleanHost.includes('localhost') ||
    cleanHost.includes('vercel.app')
  ) return null

  // Check if tenant domain
  // W-AILY-ROOT-BRAND M2 (2026-06-21): widen the SELECT to include the
  // fields SiteHeader needs for brand resolution (brand_name, logo_url,
  // primary_color, wordmark_style) AND PASS them as props. Previously
  // this function looked up the tenant but only used the row as a yes/no
  // gate, then rendered <SiteHeader /> with no props — SiteHeader's
  // getTenant() helper relies on the x-tenant-id REQUEST header, which
  // middleware sets only on the RESPONSE headers, so the helper returned
  // null and SiteHeader fell back to its 'CondoLeads' default. Resolving
  // here by host (the same DB lookup the function already did) and
  // threading the brand props eliminates the failure mode for every
  // tenant — not just Aily.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: tenant } = await db
    .from('tenants')
    .select('id, brand_name, logo_url, primary_color, wordmark_style')
    .eq('domain', cleanHost)
    .eq('is_active', true)
    .single()

  if (!tenant) return null
  // W-AILY-AIGLOW-WORDMARK (2026-06-21): thread wordmark_style + brand_name
  // through SiteHeader so the header wordmark branch fires correctly for
  // any tenant whose wordmark_style is set (e.g. 'aiglow' for Aily).
  // Previously SiteHeader relied on getTenant() for these fields, but
  // getTenant() reads x-tenant-id from request headers (unreliable on the
  // middleware-rewrite path). Resolving them HERE by host (same DB lookup
  // this function already does) makes the wordmark render deterministic.
  return (
    <SiteHeader
      agentName={tenant.brand_name ?? undefined}
      agentLogo={tenant.logo_url ?? undefined}
      primaryColor={tenant.primary_color ?? undefined}
      brandName={tenant.brand_name ?? undefined}
      wordmarkStyle={tenant.wordmark_style ?? undefined}
    />
  )
}
