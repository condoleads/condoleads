import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service role client (bypasses RLS, no sessions) - for admin operations
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
     
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

// Server client with session support (reads cookies) - for auth checks
export async function createServerClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component - cookies are read-only
          }
        },
      },
    }
  )
}

// Route Handler client (reads cookies from request) - for API routes
export function createRouteHandlerClient(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  
  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Parse cookies from header
          const cookies: { name: string; value: string }[] = []
          cookieHeader.split(';').forEach(cookie => {
            const [name, ...rest] = cookie.trim().split('=')
            if (name) {
              cookies.push({ name, value: rest.join('=') })
            }
          })
          return cookies
        },
        setAll() {
          // Route handlers can't set cookies this way
        },
      },
    }
  )
}
