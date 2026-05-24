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
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('domain', cleanHost)
    .eq('is_active', true)
    .single()

  if (!tenant) return null
  return <SiteHeader />
}
