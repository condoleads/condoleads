// lib/admin-homes/api-auth.ts
// Phase 3.4+: shared auth + tenant + role guards for admin-homes API routes.
// Pure auth/authorization helpers. No business logic.
//
// Each helper returns one of two shapes:
//   { error: NextResponse }                        — caller returns this directly
//   { user, supabase, ... }                        — caller proceeds with these
// Use `if ('error' in auth) return auth.error` to discriminate.

import { NextResponse } from 'next/server'
import { createClient as createServiceSupabase } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import type { AdminHomesUser } from '@/lib/admin-homes/auth'

// Service-role client. Bypasses RLS. Use only after auth checks pass.
export function createServiceClient() {
  return createServiceSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type ServiceClient = ReturnType<typeof createServiceClient>

interface AgentRow {
  id: string
  tenant_id: string | null
  parent_id: string | null
  site_type: string
}

interface LeadRow {
  id: string
  tenant_id: string | null
  agent_id: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Bare auth: caller must be logged in. No tenant or role check.
// ─────────────────────────────────────────────────────────────────────────────
export async function requireAdminHomesUser():
  Promise<{ error: NextResponse } | { user: AdminHomesUser; supabase: ServiceClient }>
{
  const user = await resolveAdminHomesUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, supabase: createServiceClient() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Admin only. Use for cross-tenant operations.
// ─────────────────────────────────────────────────────────────────────────────
export async function requirePlatformAdmin():
  Promise<{ error: NextResponse } | { user: AdminHomesUser; supabase: ServiceClient }>
{
  const auth = await requireAdminHomesUser()
  if ('error' in auth) return auth
  if (!auth.user.isPlatformAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 }) }
  }
  return auth
}

// ─────────────────────────────────────────────────────────────────────────────
// Caller must belong to the tenant in the body, or be Platform Admin.
// Optionally restrict by role.
// ─────────────────────────────────────────────────────────────────────────────
export async function requireTenantAccess(
  tenantIdInBody: string,
  opts: { allowedRoles?: ('admin' | 'manager' | 'agent')[] } = {}
): Promise<{ error: NextResponse } | { user: AdminHomesUser; supabase: ServiceClient }>
{
  const auth = await requireAdminHomesUser()
  if ('error' in auth) return auth
  const { user } = auth

  if (user.isPlatformAdmin) return auth

  if (!user.tenantId || user.tenantId !== tenantIdInBody) {
    return { error: NextResponse.json({ error: 'Forbidden — cross-tenant access blocked' }, { status: 403 }) }
  }

  if (opts.allowedRoles && !opts.allowedRoles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden — role not permitted' }, { status: 403 }) }
  }

  return auth
}

// ─────────────────────────────────────────────────────────────────────────────
// Caller operates on a specific agent (by id).
// Auth + tenant match + optional write/admin gates.
// Returns the target agent row.
// ─────────────────────────────────────────────────────────────────────────────
export async function requireAgentAccess(
  agentId: string,
  opts: { requireWrite?: boolean; requireAdmin?: boolean } = {}
): Promise<{ error: NextResponse } | { user: AdminHomesUser; supabase: ServiceClient; target: AgentRow }>
{
  const baseAuth = await requireAdminHomesUser()
  if ('error' in baseAuth) return baseAuth
  const { user, supabase } = baseAuth

  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type')
    .eq('id', agentId)
    .maybeSingle()

  if (!target || (target as AgentRow).site_type !== 'comprehensive') {
    return { error: NextResponse.json({ error: 'Agent not found' }, { status: 404 }) }
  }

  const t = target as AgentRow

  if (!user.isPlatformAdmin) {
    if (!user.tenantId || t.tenant_id !== user.tenantId) {
      return { error: NextResponse.json({ error: 'Forbidden — cross-tenant access blocked' }, { status: 403 }) }
    }
    if (opts.requireWrite) {
      if (user.role === 'agent') {
        return { error: NextResponse.json({ error: 'Forbidden — role cannot mutate agents' }, { status: 403 }) }
      }
      if (user.role === 'manager' && user.agentId) {
        const allowed = t.id === user.agentId
          || t.parent_id === user.agentId
          || user.managedAgentIds.includes(t.id)
        if (!allowed) {
          return { error: NextResponse.json({ error: 'Forbidden — outside manager scope' }, { status: 403 }) }
        }
      }
    }
    if (opts.requireAdmin && user.role !== 'admin') {
      return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) }
    }
  }

  return { user, supabase, target: t }
}

// ─────────────────────────────────────────────────────────────────────────────
// Caller operates on a specific lead (by id).
// Auth + tenant match + role-based ownership scope.
// Returns the lead row.
// ─────────────────────────────────────────────────────────────────────────────
export async function requireLeadAccess(
  leadId: string
): Promise<{ error: NextResponse } | { user: AdminHomesUser; supabase: ServiceClient; lead: LeadRow }>
{
  const baseAuth = await requireAdminHomesUser()
  if ('error' in baseAuth) return baseAuth
  const { user, supabase } = baseAuth

  const { data: lead } = await supabase
    .from('leads')
    .select('id, tenant_id, agent_id')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) {
    return { error: NextResponse.json({ error: 'Lead not found' }, { status: 404 }) }
  }

  const l = lead as LeadRow

  if (!user.isPlatformAdmin) {
    if (!user.tenantId || l.tenant_id !== user.tenantId) {
      return { error: NextResponse.json({ error: 'Forbidden — cross-tenant access blocked' }, { status: 403 }) }
    }
    if (user.role === 'manager' && user.agentId) {
      const allowed = new Set([user.agentId, ...user.managedAgentIds])
      if (!l.agent_id || !allowed.has(l.agent_id)) {
        return { error: NextResponse.json({ error: 'Forbidden — outside manager scope' }, { status: 403 }) }
      }
    } else if (user.role === 'agent' && user.agentId) {
      if (l.agent_id !== user.agentId) {
        return { error: NextResponse.json({ error: 'Forbidden — not your lead' }, { status: 403 }) }
      }
    }
  }

  return { user, supabase, lead: l }
}