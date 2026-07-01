// A-UNIT-1b STAGE 0 REVERT (2026-07-01): revert to working 3-URL diagnostic
// (originally shipped in d324c22) while we rebuild the sitemap as a Route
// Handler (Stage 1+). The full RPC-backed metadata-route implementation
// (b05fbc9) failed to register on Vercel with the same [slug] catchall 404
// signature as the pg-direct version — the metadata-route loader rejects
// this file regardless of pg vs supabase-js. Route Handlers use a
// completely different loader path in Next 14.
//
// Ships a working /sitemap.xml (200 + valid urlset) so robots.txt's
// Sitemap: pointer resolves. This file will be DELETED entirely when
// Stage 1 lands the Route Handler at app/sitemap.xml/route.ts.

import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.aily.ca/' },
    { url: 'https://www.aily.ca/toronto' },
    { url: 'https://www.aily.ca/whitby' },
  ]
}
