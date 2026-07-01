// W-MARKETING A-UNIT-1 (2026-07-01): dynamic per-host robots policy.
//
// POLICY (config-derived; NO hardcoded brand branch):
//   1. Comprehensive tenant host (tenants.domain match, via
//      getCurrentTenantId which mirrors the middleware fast-path +
//      DB fallback) -> Allow: /  + Sitemap pointer
//   2. Owner promo host (condoleads.ca / 01leads.com) -> Allow: /
//      (status quo; sitemap out of scope here)
//   3. Everything else (legacy agent custom_domain, *.condoleads.ca
//      agent subdomains, unknown hosts) -> Disallow: /
//
// FAIL-CLOSED: unknown hosts fall to Branch 3 (Disallow). Correct
// posture — never accidentally allow crawl on a host we haven't
// explicitly recognized. New comprehensive tenants get auto-allowed
// by adding their tenants.domain row (Branch 1 catches them via the
// existing resolver). Zero code change per new tenant.

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'

// Owner-owned promo/payment hosts — kept crawlable. Compared against
// the www-stripped host so apex + www variants both match without
// duplicate entries. Mirrors the same predicate in middleware.ts
// (kept inline in both files because middleware runs in Edge and
// this route runs in Node — no shared-module import between runtimes).
const OWNER_PROMO_HOSTS = new Set<string>([
  'condoleads.ca',
  '01leads.com',
])

export default async function robots(): Promise<MetadataRoute.Robots> {
  const rawHost = (headers().get('host') || '').toLowerCase()
  const cleanHost = rawHost.replace(/^www\./, '')

  // Branch 2: owner promo — allow, no sitemap pointer here (out of scope)
  if (OWNER_PROMO_HOSTS.has(cleanHost)) {
    return {
      rules: [{ userAgent: '*', allow: '/' }],
    }
  }

  // Branch 1: comprehensive tenant — allow + sitemap pointer
  // getCurrentTenantId reads headers().get('host') internally + queries
  // tenants.domain (with DEV_TENANT_DOMAIN fallback in dev/preview) —
  // same authoritative resolver every production page uses.
  const tenantId = await getCurrentTenantId()
  if (tenantId) {
    return {
      rules: [{ userAgent: '*', allow: '/' }],
      sitemap: `https://${rawHost}/sitemap.xml`,
    }
  }

  // Branch 3: legacy agent hosts + unknown — disallow (fail-closed)
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
