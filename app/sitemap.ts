// A-UNIT-1b DIAGNOSTIC (2026-07-01): trivial static sitemap to test
// route registration on Vercel. ZERO imports beyond MetadataRoute type,
// ZERO DB, ZERO generateSitemaps. Single-file /sitemap.xml form to
// isolate "does a metadata sitemap route register at all" from the
// index-split complexity.
//
// Real sitemap saved as app/sitemap.ts.backup_DIAG_20260701_094345 —
// restore after diagnosis.

import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.aily.ca/' },
    { url: 'https://www.aily.ca/toronto' },
    { url: 'https://www.aily.ca/whitby' },
  ]
}
