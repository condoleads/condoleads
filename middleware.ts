import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  console.log(' Middleware called for:', pathname)

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookies = request.cookies.getAll()
          console.log(' Cookies seen by middleware:', cookies.map(c => c.name))
          return cookies
        },
        setAll(cookiesToSet) {
          console.log(' Setting cookies:', cookiesToSet.map(c => c.name))
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  console.log(' Middleware auth check:', {
    path: pathname,
    hasUser: !!user,
    userId: user?.id,
    error: error?.message
  })

  // ============================================
  // SYSTEM FORK: Comprehensive vs Condos routing
  // Skip for API, admin, _next, static routes
  // ============================================
  if (
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/favicon')
  ) {
    const host = request.headers.get('host') || ''
    console.log(' System fork check:', { host, pathname })
    const agent = await resolveAgentFromHost(supabase, host)
    console.log(' Agent resolved:', agent)

    if (agent?.site_type === 'comprehensive') {
      const url = request.nextUrl.clone()
      url.pathname = `/comprehensive-site${pathname}`
      console.log(' Comprehensive rewrite:', { agent: agent.full_name, from: pathname, to: url.pathname })
      
      // Preserve cookies in rewrite response
      const rewriteResponse = NextResponse.rewrite(url, { request })
      supabaseResponse.cookies.getAll().forEach(cookie => {
        rewriteResponse.cookies.set(cookie.name, cookie.value)
      })
      return rewriteResponse
    }
  }

  return supabaseResponse
}

// Lightweight agent lookup for middleware (no heavy imports)
async function resolveAgentFromHost(supabase: any, host: string): Promise<{ full_name: string; site_type: string } | null> {
  // Dev environment
  if (host.includes('localhost') || host.includes('vercel.app')) {
    const subdomain = process.env.DEV_SUBDOMAIN || null
    console.log(' Dev subdomain:', subdomain)
    if (!subdomain) return null
    const { data, error: agentErr } = await supabase
      .from('agents')
      .select('full_name, site_type')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    console.log(' Agent lookup result:', { data: data?.full_name, error: agentErr?.message })
    return data
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'

  // Custom domain check
  if (!host.endsWith(rootDomain)) {
    const cleanDomain = host.replace(/^www\./, '')
    const { data } = await supabase
      .from('agents')
      .select('full_name, site_type')
      .eq('custom_domain', cleanDomain)
      .eq('is_active', true)
      .single()
    return data
  }

  // Subdomain check
  const parts = host.split('.')
  if (parts.length >= 3 && parts[1] === 'condoleads') {
    const subdomain = parts[0]
    if (subdomain === 'www') return null
    const { data } = await supabase
      .from('agents')
      .select('full_name, site_type')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    return data
  }

  return null
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}