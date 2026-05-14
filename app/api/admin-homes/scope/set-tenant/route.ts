// app/api/admin-homes/scope/set-tenant/route.ts
// W-LEADS-WORKBENCH W5a (2026-05-14)
//
// POST endpoint to set or clear the platform_tenant_override cookie that
// getAdminTenantContext (lib/admin-homes/tenant-context.ts) reads on every
// admin-homes request. Sets the active tenant context for the current user.
//
// PERMISSION CONTRACT
//   platform_admin / platform_assistant (isPlatformAdmin = true)
//     -> may set ANY active tenant_id OR clear (Universal view)
//   tenant_manager (has rows in tenant_manager_assignments)
//     -> may set only tenant_ids in their assignment list; cannot clear
//   all other roles
//     -> 403 (locked to their home tenant; no switching)
//
// REQUEST BODY
//   { tenantId: string | null }
//     - string UUID  -> set platform_tenant_override cookie to that value
//     - null         -> clear the cookie (Universal view, platform admin only)
//
// COOKIE
//   name: platform_tenant_override (constant from tenant-context.ts)
//   maxAge: 30 days
//   httpOnly: true (XSS defense)
//   sameSite: lax (CSRF defense)
//   secure: production-only

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { PLATFORM_TENANT_OVERRIDE_COOKIE } from '@/lib/admin-homes/tenant-context'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function POST(request: NextRequest) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const rawTenantId = body?.tenantId
    const tenantId: string | null =
      typeof rawTenantId === 'string' && rawTenantId.length > 0
        ? rawTenantId
        : null

    const cookieStore = await cookies()

    // ---- Clear cookie path (Universal view) ----
    if (tenantId === null) {
      if (!user.isPlatformAdmin) {
        return NextResponse.json(
          { error: 'Only platform admins can enter Universal view' },
          { status: 403 },
        )
      }
      cookieStore.delete(PLATFORM_TENANT_OVERRIDE_COOKIE)
      return NextResponse.json({ success: true, tenantId: null })
    }

    // ---- Validate UUID shape ----
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tenantId)) {
      return NextResponse.json({ error: 'Invalid tenant ID format' }, { status: 400 })
    }

    // ---- Validate target tenant exists and is active ----
    const supabase = await createClient()
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, is_active')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }
    if (tenant.is_active === false) {
      return NextResponse.json({ error: 'Tenant is not active' }, { status: 400 })
    }

    // ---- Per-role authorization ----
    if (!user.isPlatformAdmin) {
      // Non-platform principals: require an active tenant_manager_assignments
      // row for (this user, this tenant). All other roles already return 403
      // here because they have zero rows in that table.
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { data: assignment } = await supabase
        .from('tenant_manager_assignments')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('tenant_id', tenantId)
        .is('revoked_at', null)
        .maybeSingle()
      if (!assignment) {
        return NextResponse.json(
          { error: 'Forbidden -- no tenant_manager assignment for this tenant' },
          { status: 403 },
        )
      }
    }

    // ---- Set the cookie ----
    cookieStore.set(PLATFORM_TENANT_OVERRIDE_COOKIE, tenantId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })

    return NextResponse.json({ success: true, tenantId })
  } catch (error) {
    console.error('[admin-homes/scope/set-tenant POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
