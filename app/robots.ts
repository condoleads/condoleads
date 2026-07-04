// W-MARKETING A-UNIT-1 (2026-07-01): dynamic per-host robots policy.
// A-UNIT-2 SEO-FLAG (2026-07-04): SEO surface gate moved from
// getCurrentTenantId() (returns non-null for ANY comprehensive tenant)
// to isSeoEnabledTenant() (reads tenants.seo_enabled — aily=true,
// walliam=false by default). Preserves aily behavior BYTE-IDENTICAL
// and swaps walliam from Branch 1 to Branch 3. Non-SEO features
// consuming getCurrentTenantId() (auth, admin-homes, estimators,
// layout, property/geo pages, brand) are UNAFFECTED.
//
// POLICY (config-derived; NO hardcoded brand branch):
//   1. SEO-enabled tenant host (tenants.seo_enabled = true) -> Allow: /
//      + Sitemap pointer
//   2. Owner promo host (condoleads.ca / 01leads.com) -> Allow: /
//      (status quo; sitemap out of scope here)
//   3. Everything else (SEO-disabled tenant, legacy agent, unknown) ->
//      Disallow: /
//
// FAIL-CLOSED: unknown hosts fall to Branch 3 (Disallow). Correct
// posture — never accidentally allow crawl on a host we haven't
// explicitly recognized. New tenants default seo_enabled=false; opt
// in via tenants row-update (UPDATE tenants SET seo_enabled=true
// WHERE id=<uuid>). Zero code change per new tenant.

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

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

  // Branch 2: owner promo — allow, no sitemap pointer here (out of scope).
  // Kept ABOVE the SEO-flag gate so promo pages don't accidentally get
  // Disallowed by the seo_enabled=false default.
  if (OWNER_PROMO_HOSTS.has(cleanHost)) {
    return {
      rules: [{ userAgent: '*', allow: '/' }],
    }
  }

  // Branch 1: SEO-enabled comprehensive tenant — allow + sitemap pointer.
  // isSeoEnabledTenant reads tenants.seo_enabled for the request host's
  // tenant. Aily row seo_enabled=true → Branch 1. Walliam row default
  // false → falls through to Branch 3. Non-SEO callers of the shared
  // getCurrentTenantId() resolver are unaffected — walliam still gets
  // its tenant id resolved for auth/admin/estimator/property/geo/brand.
  if (await isSeoEnabledTenant()) {
    return {
      rules: [{ userAgent: '*', allow: '/' }],
      sitemap: `https://${rawHost}/sitemap.xml`,
    }
  }

  // Branch 3: SEO-disabled tenants + legacy agent hosts + unknown — disallow
  // (fail-closed).
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
