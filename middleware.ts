import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// â”€â”€â”€ Module-level cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Known tenant domains (no DB needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Add new tenants here as they onboard. Format: domain â†’ tenant_id
// This eliminates DB calls entirely for known production tenants.
const KNOWN_TENANT_DOMAINS: Record<string, string> = {
  'walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // W-COCKPIT P-B-1 followup: forward pathname so server components can route-gate
  // (specifically the public TenantHeader, which must skip on /admin-homes/*).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

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

  // Auth refresh â€” races against 800ms timeout
  // If Supabase is slow, we skip the refresh and continue loading the page.
  // Auth cookie will refresh on the next request when Supabase recovers.
  await Promise.race([
    supabase.auth.getUser().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 800)),
  ])

  const reqHost = request.headers.get('host') || ''
  const cleanReqHost = reqHost.replace(/^www\./, '')

  // 01leads.com â€” serve marketing site (no DB needed)
  if (cleanReqHost === '01leads.com') {
    // API routes must stay at their real path (e.g. /api/paddle/webhook)
    // â€” do not prefix them with /zerooneleads
    if (pathname.startsWith('/api')) {
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = '/zerooneleads' + (pathname === '/' ? '' : pathname)
    return NextResponse.rewrite(url, { request })
  }

  // â”€â”€â”€ SYSTEM FORK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ API routes â€” inject tenant header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname.startsWith('/api')) {
    const host = request.headers.get('host') || ''
    const tenantId = await resolveTenantIdFromHost(supabase, host)
    if (tenantId) {
      supabaseResponse.headers.set('x-tenant-id', tenantId)
    }
  }

  // W-ESTIMATOR-TENANT-HEADER (2026-06-17): Next.js server actions.
  // Server actions POST to the PAGE route (e.g. /[slug], /property/[id]),
  // NOT /api/* -- so the branch above never matches them. Without
  // x-tenant-id, every server action that uses headers().get('x-tenant-id')
  // (e.g. app/actions/submitLeadFromForm.ts:51) returns
  // {success:false, error:'Tenant context unavailable.'} BEFORE the work
  // executes. The estimator's lead-create + email-send leg has been
  // dead since this regression -- last estimator lead under WALLiam was
  // 2026-06-08, while Charlie (which IS an /api/* route) creates leads
  // daily on the same tenant.
  //
  // Detection: Next.js 14.2.5 (per node_modules/next/dist/client/
  // components/app-router-headers.js:52: `const ACTION = "Next-Action"`)
  // sets the `Next-Action` request header on POST invocations from
  // `'use server'` actions (the fetch-action path used by client->action
  // calls). The companion checker getServerActionRequestMetadata
  // (node_modules/next/dist/esm/server/lib/server-action-request-meta.js)
  // gates on `method==='POST' && headers.get('next-action')`. We match
  // the tighter signal: POST + next-action header non-null.
  //
  // Resolution: the SAME resolveTenantIdFromHost(supabase, host) the
  // /api/* branch uses. Per-tenant by construction -- walliam.ca -> WALLiam
  // id, aily.ca -> Aily id (DB-backed), zero hardcoded tenant. New
  // tenants Just Work the moment their tenants.domain row is active.
  //
  // Scope: ONLY when pathname does NOT start with /api (the /api/*
  // branch already handled it above -- do not double-inject), /_next
  // (Next.js internals -- server actions never live there), or /admin
  // (System 1 -- must stay isolated). All other POSTs with the
  // Next-Action header are server-action invocations on page routes.
  if (
    request.method === 'POST' &&
    request.headers.get('next-action') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/admin')
  ) {
    const host = request.headers.get('host') || ''
    const tenantId = await resolveTenantIdFromHost(supabase, host)
    if (tenantId) {
      supabaseResponse.headers.set('x-tenant-id', tenantId)
    }
  }

  return supabaseResponse
}

// â”€â”€â”€ Agent resolution â€” cached + known-domain fast path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Known tenant domains â€” zero DB calls
    if (KNOWN_TENANT_DOMAINS[cleanDomain]) {
      result = { full_name: cleanDomain, site_type: 'comprehensive', tenant_id: KNOWN_TENANT_DOMAINS[cleanDomain] }
      setCached(agentCache, host, result)
      return result
    }

    // Custom domain (not a known tenant) â€” check DB
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

    // Subdomain (condoleads.ca) â€” System 1
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
    // DB timeout â€” return null, don't crash the request
    return null
  }

  setCached(agentCache, host, null)
  return null
}

// â”€â”€â”€ Tenant ID resolution â€” cached + known-domain fast path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Known tenant domains â€” zero DB calls
    if (KNOWN_TENANT_DOMAINS[cleanDomain]) {
      const id = KNOWN_TENANT_DOMAINS[cleanDomain]
      setCached(tenantCache, host, id)
      return id
    }

    // Unknown domain â€” check DB
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