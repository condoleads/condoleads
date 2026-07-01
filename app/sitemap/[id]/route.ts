// A-UNIT-1b STAGE 1 (2026-07-01): sitemap child chunks as a Route Handler.
// TRIVIAL — 3 hardcoded URLs regardless of id. Registration proof only.
// Stage 2 will wire real per-id data (listings chunks / buildings / geo)
// through the RPC functions from migration 373640a.
//
// URL SHAPE: /sitemap/0, /sitemap/1, etc. (no .xml suffix on children).
// NOTE: middleware currently excludes /sitemap.xml* from the
// /comprehensive-site rewrite — but /sitemap/[id] children may not be
// excluded. Stage 1 probe will surface this if it's an issue.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <!-- STAGE 1 trivial handler, id=' + params.id + ' -->\n' +
    '  <url><loc>https://www.aily.ca/</loc></url>\n' +
    '  <url><loc>https://www.aily.ca/toronto</loc></url>\n' +
    '  <url><loc>https://www.aily.ca/whitby</loc></url>\n' +
    '</urlset>\n'
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
