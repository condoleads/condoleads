// lib/utils/seo-scope.ts
//
// A-UNIT-2 / SEO-FLAG (2026-07-04): tenant-scoped SEO capability gate.
//
// Reads tenants.seo_enabled (added by scripts/apply-seo-flag.js this same
// dispatch — aily=true, walliam=false, new tenants default false). Used
// by every SEO surface (robots policy, sitemap-index, sitemap children,
// A-UNIT-2 JSON-LD emitters) to decide whether to emit for the current
// request's tenant.
//
// Placement rationale (per SEO-FLAG PRE-BUILD RECON):
//   The shared tenant resolver getCurrentTenantId() is consumed by ~24
//   non-SEO features (auth, admin-homes, estimators, layout, property/
//   geo pages, brand). Gating seo_enabled INSIDE getCurrentTenantId()
//   would cross-tenant-regress every one of them for walliam. This
//   helper wraps getCurrentTenantId() and layers the SEO-only check on
//   top — non-SEO callers of getCurrentTenantId() are unaffected.
//
// Fail-closed on every error path (null tenant, DB error, missing row,
// seo_enabled=false/null): return false. Matches the robots.ts Branch 3
// posture — never accidentally enable SEO on an unrecognized host.
//
// Multi-tenant-safe by construction: new tenants default seo_enabled=false
// and are opted in by row-update, not code change. Zero brand branch.
// The banned pattern `if (host === 'aily.ca')` never appears in this
// file — the aily-only outcome is a data-plane fact of
// tenants.seo_enabled, not a code-plane branch.

import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'
import { createClient } from '@/lib/supabase/server'

/**
 * Returns true if the current request's tenant has `seo_enabled = true` in
 * the `tenants` table. Returns false in every other case:
 *   - no tenant matches the request host (legacy agent site / unknown host)
 *   - tenant row exists but `seo_enabled` is false or null
 *   - database error, missing row, or any unexpected throw
 *
 * Never touches `getCurrentTenantId()`'s behavior — that resolver stays
 * SEO-agnostic and continues to serve every non-SEO tenant-scoped feature.
 */
export async function isSeoEnabledTenant(): Promise<boolean> {
  try {
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return false

    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('seo_enabled')
      .eq('id', tenantId)
      .single()

    return data?.seo_enabled === true
  } catch {
    return false
  }
}
