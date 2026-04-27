// lib/email/sendTenantEmail.ts
// W5: per-tenant Resend email sender.
// All System 2 tenant-owned emails route through this function.
// System 1 (Ovais on condoleads.ca) NEVER calls this — keeps using lib/email/resend.ts.
// Platform emails (01leads-contact, paddle/webhook) NEVER call this — keep using process.env.RESEND_API_KEY.

import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

export class TenantEmailNotConfigured extends Error {
  constructor(public tenantId: string, public missing: string[]) {
    super(`Tenant ${tenantId} cannot send email — missing/invalid: ${missing.join(', ')}`)
    this.name = 'TenantEmailNotConfigured'
  }
}

export class TenantEmailFailed extends Error {
  constructor(public tenantId: string, public resendError: unknown) {
    super(`Resend send failed for tenant ${tenantId}: ${JSON.stringify(resendError)}`)
    this.name = 'TenantEmailFailed'
  }
}

export interface SendTenantEmailParams {
  tenantId: string
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  bcc?: string | string[]
  text?: string
  replyTo?: string | string[]
}

export interface SendTenantEmailResult {
  id: string
  from: string
}

/**
 * Sends a tenant-owned email via the tenant's own Resend credentials.
 * Throws TenantEmailNotConfigured if the tenant is not set up.
 * Throws TenantEmailFailed if Resend rejects the send.
 *
 * Caller pattern:
 *   try { await sendTenantEmail({ tenantId, to, subject, html }) }
 *   catch (e) {
 *     if (e instanceof TenantEmailNotConfigured) { ... soft-fail, lead still captured ... }
 *     if (e instanceof TenantEmailFailed) { ... return 502 ... }
 *     throw e
 *   }
 */
export async function sendTenantEmail(
  params: SendTenantEmailParams
): Promise<SendTenantEmailResult> {
  const supabase = createClient()

  const { data: tenant, error: dbError } = await supabase
    .from('tenants')
    .select('resend_api_key, email_from_domain, send_from, resend_verification_status, brand_name')
    .eq('id', params.tenantId)
    .maybeSingle()

  if (dbError) {
    throw new TenantEmailNotConfigured(params.tenantId, [`db error: ${dbError.message}`])
  }
  if (!tenant) {
    throw new TenantEmailNotConfigured(params.tenantId, ['tenant not found'])
  }

  const missing: string[] = []
  if (!tenant.resend_api_key) missing.push('resend_api_key')
  if (!tenant.email_from_domain) missing.push('email_from_domain')
  if (!tenant.send_from) missing.push('send_from')
  if (tenant.resend_verification_status !== 'verified') {
    missing.push(`domain not verified (status=${tenant.resend_verification_status ?? 'null'})`)
  }
  if (missing.length > 0) {
    throw new TenantEmailNotConfigured(params.tenantId, missing)
  }

  const resend = new Resend(tenant.resend_api_key!)

  const { data, error: sendError } = await resend.emails.send({
    from: tenant.send_from!,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    replyTo: params.replyTo,
    subject: params.subject,
    html: params.html,
    text: params.text,
  })

  if (sendError) {
    throw new TenantEmailFailed(params.tenantId, sendError)
  }
  if (!data?.id) {
    throw new TenantEmailFailed(params.tenantId, { reason: 'no id returned from Resend' })
  }

  return { id: data.id, from: tenant.send_from! }
}