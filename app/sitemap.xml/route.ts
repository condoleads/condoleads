// A-UNIT-1b STAGE 1 (2026-07-01): sitemap-index as a Route Handler.
// TRIVIAL — no supabase, no rpc, no slug, no imports. Registration proof
// ONLY. Stage 2 will wire real data through the RPC functions from
// migration 373640a.
//
// Reason for the rebuild: the Metadata Route convention (app/sitemap.ts)
// silently fails to register on Vercel — first with pg imports (ed9de36),
// then also with only supabase-js imports (b05fbc9). Vercel dashboard
// confirmed clean builds both times. Diagnostic (d324c22) proved a
// trivial metadata sitemap DOES register — but adding ANY non-type
// import breaks it. Route Handlers use a different loader path in Next 14
// and are the correct alternative.
//
// URL SHAPE: /sitemap.xml is the index; children live at /sitemap/[id]
// (no .xml suffix on children). Middleware currently excludes /sitemap.xml*
// from the /comprehensive-site rewrite; /sitemap/[id] children may need
// a separate middleware exclusion — flagged in Stage 1 probe.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <sitemap><loc>https://www.aily.ca/sitemap/0</loc></sitemap>\n' +
    '  <sitemap><loc>https://www.aily.ca/sitemap/1</loc></sitemap>\n' +
    '</sitemapindex>\n'
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
