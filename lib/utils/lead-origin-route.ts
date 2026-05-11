/**
 * Lead origin route derivation.
 *
 * The `leads.lead_origin_route` column (added at T2c, commit ae8454c) is a
 * tenant-agnostic controlled vocabulary identifying the upstream surface
 * that created a lead. It enables indexed equality lookups via
 * `idx_leads_tenant_origin_route (tenant_id, lead_origin_route)` to
 * replace LIKE filters on the loosely-shaped `source` text column.
 *
 * This helper mirrors the SQL CASE in
 *   supabase/migrations/20260510_t2c_lead_origin_route.sql
 * exactly, so TS callers can derive the value at INSERT time without
 * round-tripping through SQL. The SQL CASE remains the canonical source
 * for backfill operations (re-run at T6b 2026-05-11).
 *
 * IMPORTANT: if the controlled vocabulary changes, update three sites in
 * lockstep: this file, the SQL CASE in
 * supabase/migrations/20260510_t2c_lead_origin_route.sql, AND the JS mirror
 * deriveLeadOriginRoute at the top of scripts/smoke-t3c.js. Otherwise the
 * TS path, SQL backfill path, and test fixture path will produce different
 * values for the same source string.
 */

export type LeadOriginRoute =
  | 'charlie_vip_request'
  | 'estimator_vip_request'
  | 'estimator_questionnaire'
  | 'estimator'
  | 'charlie'
  | 'contact_form'
  | 'registration'
  | 'property_inquiry'
  | 'building_visit'
  | 'sale_evaluation'
  | 'unknown'

export function deriveLeadOriginRoute(source: string | null | undefined): LeadOriginRoute {
  if (!source) return 'unknown'

  // Order mirrors the T2c SQL CASE: more-specific patterns before less-specific.
  if (/_charlie_vip_request$/.test(source)) return 'charlie_vip_request'
  if (/_estimator_vip_request$/.test(source)) return 'estimator_vip_request'
  if (/_estimator_questionnaire$/.test(source)) return 'estimator_questionnaire'
  if (/_estimator/.test(source)) return 'estimator'
  if (/_charlie$/.test(source)) return 'charlie'
  if (/_contact$/.test(source)) return 'contact_form'

  if (source === 'contact_form' || source === 'message_agent' || source === 'building_page') {
    return 'contact_form'
  }
  if (source === 'estimator') return 'estimator'
  if (source === 'registration') return 'registration'
  if (source === 'property_inquiry') return 'property_inquiry'
  if (source === 'building_visit_request') return 'building_visit'
  if (source === 'sale_evaluation_request') return 'sale_evaluation'

  return 'unknown'
}
