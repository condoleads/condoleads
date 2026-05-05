// app/api/admin-homes/tenants/[id]/verify-resend/route.ts
// W5.5b: verify a tenant's Resend API key + domain by sending a real test email.
// Replaces the W5.2 GET /domains approach (required Full Access keys, didn't work
// with sending-only keys). Pure health check — does not save config (PATCH /tenants/[id] does).
//
// POST { resend_api_key, email_from_domain, send_from? }
//   -> { valid, error?, messageId?, sentTo?, sentFrom?, lastCheckedAt }
//
// Auth: tenant_admin (own tenant) OR platform admin.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params

  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const body = await request.json().catch(() => ({}))
  const apiKey = typeof body.resend_api_key === 'string' ? body.resend_api_key.trim() : ''
  const fromDomain = typeof body.email_from_domain === 'string' ? body.email_from_domain.trim().toLowerCase() : ''
  const sendFrom = typeof body.send_from === 'string' && body.send_from.trim() ? body.send_from.trim() : ''

  const lastCheckedAt = new Date().toISOString()

  if (!apiKey) {
    return NextResponse.json({ valid: false, error: 'No API key provided', lastCheckedAt })
  }
  if (!apiKey.startsWith('re_')) {
    return NextResponse.json({ valid: false, error: 'Invalid format (expected re_...)', lastCheckedAt })
  }
  if (!fromDomain) {
    return NextResponse.json({ valid: false, error: 'No from-domain provided', lastCheckedAt })
  }

  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('admin_email, brand_name, name')
    .eq('id', tenantId)
    .maybeSingle()

  if (fetchErr || !tenant) {
    return NextResponse.json({ valid: false, error: 'Could not load tenant', lastCheckedAt })
  }

  const toAddress = tenant.admin_email
  if (!toAddress) {
    return NextResponse.json({
      valid: false,
      error: 'Tenant has no admin_email - set in General tab first',
      lastCheckedAt,
    })
  }

  const fromAddress = sendFrom || `${tenant.brand_name || tenant.name || 'Test'} <notifications@${fromDomain}>`
  const timestamp = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })

  let resendRes: Response
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: toAddress,
        subject: `Resend health check - ${timestamp}`,
        text: `This is a health-check email from the Integrations tab in tenant settings.

If you received this, your Resend API key and from-domain are correctly configured for ${tenant.brand_name || tenant.name}.

Timestamp: ${timestamp}
From: ${fromAddress}
To: ${toAddress}`,
      }),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return NextResponse.json({ valid: false, error: `Network error contacting Resend: ${msg}`, lastCheckedAt })
  }

  const payload = (await resendRes.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null

  if (resendRes.status === 401 || resendRes.status === 403) {
    return NextResponse.json({ valid: false, error: 'Invalid API key (401/403)', lastCheckedAt })
  }

  if (resendRes.status === 422) {
    const msg = payload?.message || ''
    if (msg.toLowerCase().includes('domain') || msg.toLowerCase().includes('verify')) {
      return NextResponse.json({
        valid: false,
        error: `Domain ${fromDomain} is not verified in Resend. Verify it in the Resend dashboard.`,
        lastCheckedAt,
      })
    }
    return NextResponse.json({ valid: false, error: msg || 'Resend rejected the request (422)', lastCheckedAt })
  }

  if (!resendRes.ok) {
    return NextResponse.json({
      valid: false,
      error: payload?.message || `Resend returned ${resendRes.status}`,
      lastCheckedAt,
    })
  }

  if (!payload?.id) {
    return NextResponse.json({
      valid: false,
      error: 'Unexpected response from Resend (no message ID)',
      lastCheckedAt,
    })
  }

  // Best-effort: persist verification status. Don't fail the response if this errors.
  await supabase
    .from('tenants')
    .update({
      resend_verification_status: 'verified',
      resend_verified_at: lastCheckedAt,
      updated_at: lastCheckedAt,
    })
    .eq('id', tenantId)

  return NextResponse.json({
    valid: true,
    messageId: payload.id,
    sentTo: toAddress,
    sentFrom: fromAddress,
    lastCheckedAt,
  })
}