// app/api/admin-homes/tenants/[id]/verify-resend/route.ts
// W5.2: verify a tenant's Resend API key + domain.
// POST { apiKey: string, fromDomain: string } -> { valid: boolean, error?: string, verifiedAt?: string }
//
// Tests the supplied apiKey against Resend's GET /domains endpoint.
// On success, confirms fromDomain is present in the verified-domains list.
// Writes resend_api_key, email_from_domain, resend_verification_status='verified',
// resend_verified_at=NOW() to the tenants row.
//
// Auth: tenant_admin (own tenant) OR platform admin.

import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAccess } from '@/lib/admin-homes/api-auth'

interface ResendDomain {
  id: string
  name: string
  status: string  // 'verified' | 'pending' | 'failed' | etc.
  region?: string
}

interface ResendDomainsResponse {
  data?: ResendDomain[]
  error?: { message?: string; statusCode?: number }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params

  const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin'] })
  if ('error' in auth) return auth.error

  const { supabase } = auth

  const body = await request.json().catch(() => ({}))
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const fromDomain = typeof body.fromDomain === 'string' ? body.fromDomain.trim().toLowerCase() : ''

  if (!apiKey) {
    return NextResponse.json({ valid: false, error: 'No API key provided' }, { status: 400 })
  }
  if (!apiKey.startsWith('re_')) {
    return NextResponse.json({ valid: false, error: 'Invalid format (expected re_...)' })
  }
  if (!fromDomain) {
    return NextResponse.json({ valid: false, error: 'No domain provided' }, { status: 400 })
  }

  // Test apiKey by listing domains
  let resendRes: Response
  try {
    resendRes = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return NextResponse.json({ valid: false, error: `Network error contacting Resend: ${msg}` })
  }

  if (resendRes.status === 401 || resendRes.status === 403) {
    return NextResponse.json({ valid: false, error: 'Invalid API key' })
  }
  if (!resendRes.ok) {
    return NextResponse.json({ valid: false, error: `Resend returned ${resendRes.status}` })
  }

  const payload = (await resendRes.json().catch(() => null)) as ResendDomainsResponse | null
  if (!payload || !Array.isArray(payload.data)) {
    return NextResponse.json({ valid: false, error: 'Unexpected response from Resend' })
  }

  const match = payload.data.find(d => d.name.toLowerCase() === fromDomain)
  if (!match) {
    return NextResponse.json({
      valid: false,
      error: `Domain ${fromDomain} not found in Resend account. Add and verify it first.`,
    })
  }
  if (match.status !== 'verified') {
    return NextResponse.json({
      valid: false,
      error: `Domain ${fromDomain} is "${match.status}" — must be verified.`,
    })
  }

  // Both checks passed — write to DB
  const verifiedAt = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('tenants')
    .update({
      resend_api_key: apiKey,
      email_from_domain: fromDomain,
      resend_verification_status: 'verified',
      resend_verified_at: verifiedAt,
      updated_at: verifiedAt,
    })
    .eq('id', tenantId)

  if (updateErr) {
    return NextResponse.json({
      valid: false,
      error: `Verification succeeded but DB write failed: ${updateErr.message}`,
    }, { status: 500 })
  }

  return NextResponse.json({ valid: true, verifiedAt })
}