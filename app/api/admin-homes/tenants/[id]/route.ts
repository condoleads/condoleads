// app/api/admin-homes/tenants/[id]/route.ts
// Phase 3.3 W1.1 — per-tenant CRUD for the settings workspace.
// GET: fetch single tenant by path id
// PATCH: partial update with allowed-fields whitelist (used by SettingsClient)
// Auth: Platform Admin OR Tenant Admin of the same tenant (via requireTenantAccess).
// Sibling routes: ?id=xxx variant in tenants/route.ts (Platform-Admin only, kept for AddTenantModal compat).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'

// Whitelist of columns SettingsClient is allowed to update via PATCH.
// Keeps the route surface tight — anything not in this list is silently dropped.
//
// W-TENANT-GOV-PHASE1 (2026-06-25, D3): default_agent_id now lives in the
// per-tenant Settings → General tab (was earmarked for /platform 3.7). Set
// via the House Account picker; validated by the validate_house_account
// DB trigger (20260625) AND the app-layer pre-check below for friendly errors.
// default_claim_quota remains platform-admin-only and is NOT in this list.
const ALLOWED_FIELDS = new Set<string>([
  // General
  'name', 'brand_name', 'domain', 'admin_email', 'homepage_layout', 'assistant_name', 'default_agent_id',
  // Branding
  'primary_color', 'secondary_color', 'logo_url', 'footer_tagline',
  'brokerage_name', 'brokerage_address', 'brokerage_phone', 'broker_of_record', 'license_number',
  // Site Content
  'about_content', 'privacy_content', 'terms_content',
  // Integrations
  'anthropic_api_key', 'google_analytics_id', 'resend_api_key', 'email_from_domain',
  'google_ads_id', 'google_conversion_label', 'facebook_pixel_id',
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
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'tenant.read', { kind: 'tenant', tenantId: params.id })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const { data, error } = await supabase
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
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId: params.id })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

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

  // W-TENANT-GOV-PHASE1 (2026-06-25): if default_agent_id is being changed,
  // app-layer pre-validate so the operator gets a friendly 400 instead of the
  // raw PG 23514. The validate_house_account trigger (20260625) is the DB
  // backstop; these checks mirror its 4 reject conditions.
  if (Object.prototype.hasOwnProperty.call(update, 'default_agent_id')) {
    const raw = update.default_agent_id
    if (raw !== null) {
      const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (typeof raw !== 'string' || !UUID_RX.test(raw)) {
        return NextResponse.json(
          { error: 'default_agent_id must be a valid UUID (or null to clear)' },
          { status: 400 }
        )
      }
      const { data: agent, error: agentErr } = await supabase
        .from('agents')
        .select('id, tenant_id, is_active, role')
        .eq('id', raw)
        .maybeSingle()
      if (agentErr) {
        return NextResponse.json({ error: 'Failed to validate agent: ' + agentErr.message }, { status: 500 })
      }
      if (!agent) {
        return NextResponse.json({ error: 'Selected agent not found' }, { status: 400 })
      }
      if (agent.tenant_id !== params.id) {
        return NextResponse.json({ error: 'That agent belongs to a different tenant' }, { status: 400 })
      }
      if (!agent.is_active) {
        return NextResponse.json({ error: 'That agent is inactive' }, { status: 400 })
      }
      // W-TENANT-ASSISTANT UNIT 27: 'tenant_assistant' added — mirror of the
      // validate_house_account trigger eligible list (which was extended in
      // the companion migration).
      const ELIGIBLE_ROLES = ['agent', 'manager', 'area_manager', 'tenant_admin', 'admin', 'tenant_assistant']
      if (!ELIGIBLE_ROLES.includes(agent.role)) {
        return NextResponse.json({ error: "That agent's role can't be a house account" }, { status: 400 })
      }
    }
  }

  update.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('tenants')
    .update(update)
    .eq('id', params.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({ tenant: data, updated_fields: Object.keys(update).filter(k => k !== 'updated_at') })
}