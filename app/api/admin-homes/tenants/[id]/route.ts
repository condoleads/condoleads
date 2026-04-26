// app/api/admin-homes/tenants/[id]/route.ts
// Phase 3.3 W1.1 — per-tenant CRUD for the settings workspace.
// GET: fetch single tenant by path id
// PATCH: partial update with allowed-fields whitelist (used by SettingsClient)
// Auth: Platform Admin OR Tenant Admin of the same tenant (via requireTenantAccess).
// Sibling routes: ?id=xxx variant in tenants/route.ts (Platform-Admin only, kept for AddTenantModal compat).

import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAccess } from '@/lib/admin-homes/api-auth'

// Whitelist of columns SettingsClient is allowed to update via PATCH.
// Keeps the route surface tight — anything not in this list is silently dropped.
// Platform-admin-only fields (default_claim_quota, default_agent_id) are NOT in this list;
// those will live on /platform/tenants in 3.7.
const ALLOWED_FIELDS = new Set<string>([
  // General
  'name', 'brand_name', 'domain', 'admin_email', 'homepage_layout', 'assistant_name',
  // Branding
  'primary_color', 'secondary_color', 'logo_url', 'footer_tagline',
  'brokerage_name', 'brokerage_address', 'brokerage_phone', 'broker_of_record', 'license_number',
  // Site Content
  'about_content', 'privacy_content', 'terms_content',
  // Integrations
  'anthropic_api_key', 'google_analytics_id',
  // VIP & Credits — Charlie
  'ai_free_messages', 'vip_auto_approve',
  'ai_auto_approve_limit', 'ai_manual_approve_limit', 'ai_hard_cap',
  // VIP & Credits — Buyer plans
  'plan_mode', 'plan_vip_auto_approve',
  'plan_free_attempts', 'plan_auto_approve_limit', 'plan_manual_approve_limit', 'plan_hard_cap',
  // VIP & Credits — Seller plans
  'seller_plan_free_attempts', 'seller_plan_auto_approve_limit',
  'seller_plan_manual_approve_limit', 'seller_plan_hard_cap',
  // VIP & Credits — Estimator
  'estimator_ai_enabled', 'estimator_nonai_enabled', 'estimator_vip_auto_approve',
  'estimator_free_attempts', 'estimator_auto_approve_attempts',
  'estimator_manual_approve_attempts', 'estimator_hard_cap',
  // Notifications
  'manager_cc', 'admin_bcc', 'send_from',
])

// GET /api/admin-homes/tenants/[id]
// Returns the tenant row. Useful for client-side refetches after save.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantAccess(params.id)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
    .from('tenants')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({ tenant: data })
}

// PATCH /api/admin-homes/tenants/[id]
// Partial update — only fields in ALLOWED_FIELDS are persisted.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantAccess(params.id)
  if ('error' in auth) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Filter the body down to whitelisted fields only.
  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) update[key] = value
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No allowed fields in request body' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const { data, error } = await auth.supabase
    .from('tenants')
    .update(update)
    .eq('id', params.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({ tenant: data, updated_fields: Object.keys(update).filter(k => k !== 'updated_at') })
}