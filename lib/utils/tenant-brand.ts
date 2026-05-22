/**
 * Tenant brand-context helper (W-LEADS-EMAIL T6f).
 *
 * Used by routes that do not go through validateSession (Shape B routes —
 * estimator/{vip-request, vip-approve, session, vip-questionnaire},
 * walliam/charlie/vip-approve, walliam/contact). Provides a single
 * multi-tenant-correct accessor for the tenant brand identity + canonical
 * base URL for outbound links and email CTAs.
 *
 * For Shape A routes (charlie/{lead, plan-email, appointment}), the same
 * fields (sourceKey, brandName, domain) are returned by validateSession
 * directly; those routes do NOT call getTenantContext.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TenantContext {
  id: string
  sourceKey: string
  brandName: string
  domain: string
  name: string
  wordmarkStyle: string
}

export async function getTenantContext(
  supabase: SupabaseClient,
  tenantId: string | null | undefined
): Promise<TenantContext | null> {
  if (!tenantId) return null

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, source_key, brand_name, name, domain, wordmark_style')
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !tenant?.id || !tenant?.source_key || !tenant?.domain) return null

  const brandName = tenant.brand_name || tenant.name
  if (!brandName) return null

  return {
    id: tenant.id,
    sourceKey: tenant.source_key,
    brandName,
    domain: tenant.domain,
    name: tenant.name || brandName,
    wordmarkStyle: tenant.wordmark_style || 'standard',
  }
}

// C7/D10-D12 -- single source of truth for host-based tenant resolution
// Used by root layout metadata, comprehensive-site metadata + page, /og route.
// Dev fallback: when host is localhost or vercel.app preview, uses DEV_TENANT_DOMAIN.
export async function getTenantByHost(
  supabase: SupabaseClient,
  host: string | null | undefined
): Promise<TenantContext | null> {
  if (!host) return null

  // Dev / preview fallback -- match getCurrentTenantId behavior (lib/utils/tenant-resolver.ts)
  let lookupDomain: string
  if (host.includes('localhost') || host.includes('vercel.app')) {
    const devDomain = process.env.DEV_TENANT_DOMAIN
    if (!devDomain) return null
    lookupDomain = devDomain
  } else {
    lookupDomain = host.replace(/^www\./, '')
  }

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, source_key, brand_name, name, domain, wordmark_style')
    .eq('domain', lookupDomain)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !tenant?.id || !tenant?.source_key || !tenant?.domain) return null

  const brandName = tenant.brand_name || tenant.name
  if (!brandName) return null

  return {
    id: tenant.id,
    sourceKey: tenant.source_key,
    brandName,
    domain: tenant.domain,
    name: tenant.name || brandName,
    wordmarkStyle: tenant.wordmark_style || 'standard',
  }
}

/**
 * Build the canonical base URL for outbound links. Respects the
 * NEXT_PUBLIC_APP_URL env override (used in dev / staging) and falls back
 * to https://<tenant.domain> for production tenant traffic.
 */
export function buildBaseUrl(domain: string | null | undefined): string {
  const envOverride = process.env.NEXT_PUBLIC_APP_URL
  if (envOverride) return envOverride
  if (!domain) return ''
  return `https://${domain}`
}
