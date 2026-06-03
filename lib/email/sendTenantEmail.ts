// lib/email/sendTenantEmail.ts
// W5: per-tenant Resend email sender.
// All System 2 tenant-owned emails route through this function.
// System 1 (Ovais on condoleads.ca) NEVER calls this — keeps using lib/email/resend.ts.
// Platform emails (01leads-contact, paddle/webhook) NEVER call this — keep using process.env.RESEND_API_KEY.

import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

/**
 * W-FUNNEL-VERIFICATION §3.8 (2026-06-03):
 * Shape-validate a Resend API key BEFORE attempting a send. Previously
 * the preflight only checked presence (null / empty); a placeholder string
 * like `REPLACE_ME` or `[YOUR_RESEND_API_KEY]` would pass preflight, then
 * the Resend SDK would 401 at send time. Callers catch TenantEmailFailed
 * and log it but still return success to the user -- emails silently fail.
 *
 * This validator catches placeholders + malformed keys at preflight so
 * the typed TenantEmailNotConfigured surfaces instead. The companion route
 * app/api/admin-homes/tenants/[id]/verify-resend/route.ts also uses this
 * helper (was inline `apiKey.startsWith('re_')` check) -- single source of
 * truth, no divergent copies.
 *
 * Real Resend keys: `re_` prefix, ~36 chars, alphanumeric+underscore.
 * WALLiam's real key (re_BJJ...cqSr, len 36) passes; placeholders fail.
 */
const RESEND_KEY_PLACEHOLDER_RX = /\[|\]|<|>|REPLACE_ME|YOUR_RESEND|placeholder|TODO|xxxx/i

export function looksLikeValidResendKey(key: string | null | undefined): boolean {
  if (!key) return false
  if (!key.startsWith('re_')) return false
  if (key.length < 16) return false
  if (RESEND_KEY_PLACEHOLDER_RX.test(key)) return false
  return true
}

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
  if (!tenant.resend_api_key) {
    missing.push('resend_api_key')
  } else if (!looksLikeValidResendKey(tenant.resend_api_key)) {
    // W-FUNNEL-VERIFICATION §3.8: catch placeholder / malformed keys at
    // preflight instead of after a wasted 401 round-trip to Resend.
    missing.push('resend_api_key invalid (placeholder or malformed)')
  }
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

// ---------------------------------------------------------------------------
// attemptTenantEmail -- F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL fix (Phase 1).
// ---------------------------------------------------------------------------
// Wraps sendTenantEmail with try/catch that returns a typed outcome instead
// of throwing. Callers use this to PROPAGATE the email-delivery result into
// their JSON response so the client can show an honest state -- previously
// every caller swallowed the typed exception, logged to console, and still
// returned `success: true`, telling users their plan was "emailed" when it
// demonstrably wasn't.
//
// `success` (action-level) is independent: the lead/plan/appointment row was
// saved, AI cost was spent, override granted, etc. -- the work succeeded.
// Only the email DELIVERY may have failed. Surfacing both lets the UI render
// the action result + a small "couldn't email it" banner where applicable.
//
// Logging behavior preserved: `not_configured` -> console.warn,
// `send_failed` -> console.error -- so Vercel logs read the same as before.

export type EmailDeliveryReason = 'delivered' | 'not_configured' | 'send_failed'

export interface EmailDeliveryOutcome {
  sent: boolean
  reason: EmailDeliveryReason
  messageId?: string  // Resend message id when sent === true
}

export async function attemptTenantEmail (
  params: SendTenantEmailParams,
  context: string,
): Promise<EmailDeliveryOutcome> {
  try {
    const result = await sendTenantEmail(params)
    return { sent: true, reason: 'delivered', messageId: result.id }
  } catch (err) {
    if (err instanceof TenantEmailNotConfigured) {
      console.warn(`${context} tenant email not configured: ${err.message}`)
      return { sent: false, reason: 'not_configured' }
    }
    if (err instanceof TenantEmailFailed) {
      console.error(`${context} resend send failed: ${err.message}`)
      return { sent: false, reason: 'send_failed' }
    }
    console.error(`${context} unexpected error:`, err)
    return { sent: false, reason: 'send_failed' }
  }
}