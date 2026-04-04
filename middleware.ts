import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  // 01leads.com — serve marketing site
  const reqHost = request.headers.get('host') || ''
  const cleanReqHost = reqHost.replace(/^www\./, '')
  if (cleanReqHost === '01leads.com') {
    const url = request.nextUrl.clone()
    url.pathname = '/zerooneleads' + (pathname === '/' ? '' : pathname)
    return NextResponse.rewrite(url, { request })
  }

    // ============================================
  // SYSTEM FORK: Comprehensive vs Condos routing
  // Skip for API, admin, _next, static routes
  // ============================================


  if (
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/comprehensive-site') &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/reset-password') &&
    !pathname.startsWith('/test-') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/favicon')
  ) {
    const host = request.headers.get('host') || ''
    const agent = await resolveAgentFromHost(supabase, host)

    if (agent?.site_type === 'comprehensive') {
      const url = request.nextUrl.clone()
      url.pathname = `/comprehensive-site${pathname}`

      const rewriteResponse = NextResponse.rewrite(url, { request })

      // Thread tenant_id into request headers for downstream use
      if (agent.tenant_id) {
        rewriteResponse.headers.set('x-tenant-id', agent.tenant_id)
      }

      supabaseResponse.cookies.getAll().forEach(cookie => {
        rewriteResponse.cookies.set(cookie.name, cookie.value)
      })
      return rewriteResponse
    }
  }

  // For API routes on comprehensive domain — resolve tenant and set header
  if (pathname.startsWith('/api')) {
    const host = request.headers.get('host') || ''
    const tenantId = await resolveTenantIdFromHost(supabase, host)
    if (tenantId) {
      supabaseResponse.headers.set('x-tenant-id', tenantId)
    }
  }

  return supabaseResponse
}

// Resolve agent from host — System 1 pattern preserved
async function resolveAgentFromHost(supabase: any, host: string): Promise<{ full_name: string; site_type: string; tenant_id: string | null } | null> {
  // Dev environment
  if (host.includes('localhost') || host.includes('vercel.app')) {
    const subdomain = process.env.DEV_SUBDOMAIN || null
    if (!subdomain) return null
    const { data } = await supabase
      .from('agents')
      .select('full_name, site_type, tenant_id')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    return data
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'

  // Custom domain — could be tenant domain or agent domain
  if (!host.endsWith(rootDomain)) {
    const cleanDomain = host.replace(/^www\./, '')

    // Check tenant domain first
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', cleanDomain)
      .eq('is_active', true)
      .single()

    if (tenant) {
      // Tenant domain — return comprehensive type with tenant_id
      return { full_name: cleanDomain, site_type: 'comprehensive', tenant_id: tenant.id }
    }

    // Fall back to agent custom domain (System 1)
    const { data: agent } = await supabase
      .from('agents')
      .select('full_name, site_type, tenant_id')
      .eq('custom_domain', cleanDomain)
      .eq('is_active', true)
      .single()
    return agent
  }

  // Subdomain check (condoleads.ca subdomains — System 1)
  const parts = host.split('.')
  if (parts.length >= 3 && parts[1] === 'condoleads') {
    const subdomain = parts[0]
    if (subdomain === 'www') return null
    const { data } = await supabase
      .from('agents')
      .select('full_name, site_type, tenant_id')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    return data
  }

  return null
}

// Resolve just tenant_id from host — for API routes
async function resolveTenantIdFromHost(supabase: any, host: string): Promise<string | null> {
  // Dev environment
  if (host.includes('localhost') || host.includes('vercel.app')) {
    const tenantDomain = process.env.DEV_TENANT_DOMAIN || null
    if (!tenantDomain) return null
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', tenantDomain)
      .eq('is_active', true)
      .single()
    return data?.id || null
  }

  const cleanDomain = host.replace(/^www\./, '')
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('domain', cleanDomain)
    .eq('is_active', true)
    .single()
  return data?.id || null
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}