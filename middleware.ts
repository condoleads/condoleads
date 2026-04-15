import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ─── Module-level cache ─────────────────────────────────────────────────────
// Survives across requests within the same warm Edge instance.
// TTL: 5 minutes. Prevents repeated DB hits for the same host.
type AgentResult = { full_name: string; site_type: string; tenant_id: string | null } | null
const agentCache = new Map<string, { value: AgentResult; expires: number }>()
const tenantCache = new Map<string, { value: string | null; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached<T>(map: Map<string, { value: T; expires: number }>, key: string): T | undefined {
  const entry = map.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expires) { map.delete(key); return undefined }
  return entry.value
}
function setCached<T>(map: Map<string, { value: T; expires: number }>, key: string, value: T) {
  map.set(key, { value, expires: Date.now() + CACHE_TTL })
}

// ─── Known tenant domains (no DB needed) ────────────────────────────────────
// Add new tenants here as they onboard. Format: domain → tenant_id
// This eliminates DB calls entirely for known production tenants.
const KNOWN_TENANT_DOMAINS: Record<string, string> = {
  'walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
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

  // Auth refresh — only needed for non-static routes
  // Wrapped in try/catch so a Supabase timeout never kills the request
  try {
    await supabase.auth.getUser()
  } catch {
    // Auth refresh failed — continue anyway, user just won't be refreshed
  }

  const reqHost = request.headers.get('host') || ''
  const cleanReqHost = reqHost.replace(/^www\./, '')

  // 01leads.com — serve marketing site (no DB needed)
  if (cleanReqHost === '01leads.com') {
    const url = request.nextUrl.clone()
    url.pathname = '/zerooneleads' + (pathname === '/' ? '' : pathname)
    return NextResponse.rewrite(url, { request })
  }

  // ─── SYSTEM FORK ──────────────────────────────────────────────────────────
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
      if (agent.tenant_id) {
        rewriteResponse.headers.set('x-tenant-id', agent.tenant_id)
      }
      supabaseResponse.cookies.getAll().forEach(cookie => {
        rewriteResponse.cookies.set(cookie.name, cookie.value)
      })
      return rewriteResponse
    }
  }

  // ─── API routes — inject tenant header ────────────────────────────────────
  if (pathname.startsWith('/api')) {
    const host = request.headers.get('host') || ''
    const tenantId = await resolveTenantIdFromHost(supabase, host)
    if (tenantId) {
      supabaseResponse.headers.set('x-tenant-id', tenantId)
    }
  }

  return supabaseResponse
}

// ─── Agent resolution — cached + known-domain fast path ───────────────────
async function resolveAgentFromHost(
  supabase: any,
  host: string
): Promise<{ full_name: string; site_type: string; tenant_id: string | null } | null> {
  // Check cache first
  const cached = getCached(agentCache, host)
  if (cached !== undefined) return cached

  let result: { full_name: string; site_type: string; tenant_id: string | null } | null = null

  try {
    // Dev environment
    if (host.includes('localhost') || host.includes('vercel.app')) {
      const subdomain = process.env.DEV_SUBDOMAIN || null
      if (!subdomain) { setCached(agentCache, host, null); return null }
      const { data } = await supabase
        .from('agents')
        .select('full_name, site_type, tenant_id')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .single()
      result = data || null
      setCached(agentCache, host, result)
      return result
    }

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'
    const cleanDomain = host.replace(/^www\./, '')

    // Known tenant domains — zero DB calls
    if (KNOWN_TENANT_DOMAINS[cleanDomain]) {
      result = { full_name: cleanDomain, site_type: 'comprehensive', tenant_id: KNOWN_TENANT_DOMAINS[cleanDomain] }
      setCached(agentCache, host, result)
      return result
    }

    // Custom domain (not a known tenant) — check DB
    if (!host.endsWith(rootDomain)) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('domain', cleanDomain)
        .eq('is_active', true)
        .single()
      if (tenant) {
        result = { full_name: cleanDomain, site_type: 'comprehensive', tenant_id: tenant.id }
        setCached(agentCache, host, result)
        return result
      }
      const { data: agent } = await supabase
        .from('agents')
        .select('full_name, site_type, tenant_id')
        .eq('custom_domain', cleanDomain)
        .eq('is_active', true)
        .single()
      result = agent || null
      setCached(agentCache, host, result)
      return result
    }

    // Subdomain (condoleads.ca) — System 1
    const parts = host.split('.')
    if (parts.length >= 3 && parts[1] === 'condoleads') {
      const subdomain = parts[0]
      if (subdomain === 'www') { setCached(agentCache, host, null); return null }
      const { data } = await supabase
        .from('agents')
        .select('full_name, site_type, tenant_id')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .single()
      result = data || null
      setCached(agentCache, host, result)
      return result
    }
  } catch {
    // DB timeout — return null, don't crash the request
    return null
  }

  setCached(agentCache, host, null)
  return null
}

// ─── Tenant ID resolution — cached + known-domain fast path ───────────────
async function resolveTenantIdFromHost(supabase: any, host: string): Promise<string | null> {
  const cached = getCached(tenantCache, host)
  if (cached !== undefined) return cached

  try {
    // Dev environment
    if (host.includes('localhost') || host.includes('vercel.app')) {
      const tenantDomain = process.env.DEV_TENANT_DOMAIN || null
      if (!tenantDomain) { setCached(tenantCache, host, null); return null }
      const { data } = await supabase
        .from('tenants')
        .select('id')
        .eq('domain', tenantDomain)
        .eq('is_active', true)
        .single()
      const id = data?.id || null
      setCached(tenantCache, host, id)
      return id
    }

    const cleanDomain = host.replace(/^www\./, '')

    // Known tenant domains — zero DB calls
    if (KNOWN_TENANT_DOMAINS[cleanDomain]) {
      const id = KNOWN_TENANT_DOMAINS[cleanDomain]
      setCached(tenantCache, host, id)
      return id
    }

    // Unknown domain — check DB
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', cleanDomain)
      .eq('is_active', true)
      .single()
    const id = data?.id || null
    setCached(tenantCache, host, id)
    return id
  } catch {
    return null
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}