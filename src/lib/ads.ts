// W-GOOGLE-ADS UNIT 55c (2026-06-30) — typed Google Ads API client
// wrapper. ALL credentials sourced from process.env at call time (no
// caching at module-load; lets server runtime swap env without restart).
// Throws a named MissingGoogleAdsEnvError if any of the 6 required env
// vars is missing — error names the missing key so the operator can
// fix .env.local without guessing.
//
// Read .env.local in any caller via dotenv (Next.js loads it
// automatically; one-off scripts call require('dotenv').config()).
//
// Authoring note: project convention is `lib/` at root with `@/*`
// path alias. This file is at `src/lib/ads.ts` per the UNIT 55c spec
// (operator-explicit path). tsconfig include is `**/*.ts` so TypeScript
// picks it up regardless of root vs src/. Import as
// `import { getCustomer } from '@/src/lib/ads'` (or refactor to
// `lib/ads.ts` later for convention parity).

import { GoogleAdsApi, Customer } from 'google-ads-api'

export class MissingGoogleAdsEnvError extends Error {
  constructor(public readonly key: string) {
    super(`Google Ads env var missing: ${key}. Add it to .env.local (UNIT 55a + 55c provisioning).`)
    this.name = 'MissingGoogleAdsEnvError'
  }
}

function envOrThrow(name: string): string {
  const v = process.env[name]
  if (!v) throw new MissingGoogleAdsEnvError(name)
  return v
}

/**
 * Build a configured GoogleAdsApi client. Reads:
 *   GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN.
 * Throws MissingGoogleAdsEnvError if any are missing.
 */
export function buildAdsClient(): GoogleAdsApi {
  return new GoogleAdsApi({
    client_id:       envOrThrow('GOOGLE_ADS_CLIENT_ID'),
    client_secret:   envOrThrow('GOOGLE_ADS_CLIENT_SECRET'),
    developer_token: envOrThrow('GOOGLE_ADS_DEVELOPER_TOKEN'),
  })
}

/**
 * Build a Customer handle for the configured Google Ads account.
 * Reads (additionally):
 *   GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_REFRESH_TOKEN.
 * Throws MissingGoogleAdsEnvError if any are missing.
 */
export function getCustomer(): Customer {
  const api = buildAdsClient()
  return api.Customer({
    customer_id:       envOrThrow('GOOGLE_ADS_CUSTOMER_ID'),
    login_customer_id: envOrThrow('GOOGLE_ADS_LOGIN_CUSTOMER_ID'),
    refresh_token:     envOrThrow('GOOGLE_ADS_REFRESH_TOKEN'),
  })
}
