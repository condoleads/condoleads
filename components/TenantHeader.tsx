import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import SiteHeader from './navigation/SiteHeader'

// Shows WALLiam SiteHeader on tenant domains only
export default async function TenantHeader() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\./, '')
  
  // Skip on condoleads, localhost, vercel.app
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
