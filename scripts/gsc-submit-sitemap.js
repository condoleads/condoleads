// C-UNIT-2 PATH-A Step 4 (part 2) — submit sitemap(s) to Google Search Console
// via webmasters.sitemaps.submit, then verify each landing via sitemaps.get.
//
// Idempotent: re-running against an already-submitted sitemap updates
// lastSubmitted and is a no-op for indexing. Safe to re-run for
// rotations, sitemap updates, or future multi-tenant onboarding.
//
// Multi-tenant shape (per CLAUDE.md "constant referencing a single tenant
// in business logic is a violation"): targets is a data-plane list. Each
// entry is a { siteUrl, feedpath, note } tuple whose siteUrl was obtained
// from a real sites.list response for a verified property this session.
// Future SEO-enabled tenants append here — same code path, zero branch.
//
// Usage: node scripts/gsc-submit-sitemap.js

require('dotenv').config({ path: '.env.local' })
const { google } = require('googleapis')

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET
const REFRESH = process.env.GOOGLE_WEBMASTERS_REFRESH_TOKEN

if (!CLIENT_ID)      { console.error('FATAL: GOOGLE_ADS_CLIENT_ID missing'); process.exit(1) }
if (!CLIENT_SECRET)  { console.error('FATAL: GOOGLE_ADS_CLIENT_SECRET missing'); process.exit(1) }
if (!REFRESH)        { console.error('FATAL: GOOGLE_WEBMASTERS_REFRESH_TOKEN missing'); process.exit(1) }

// ─── target list (data-plane, per-tenant) ──────────────────────────
// aily: `sc-domain:aily.ca` siteUrl VERIFIED via sites.list this session
// (2026-07-04) — permissionLevel=siteOwner. feedpath verified to serve
// HTTP 200 + application/xml this session. Future SEO-enabled tenants
// append here as { siteUrl (from sites.list), feedpath, note }.
const targets = [
  {
    siteUrl:  'sc-domain:aily.ca',
    feedpath: 'https://www.aily.ca/sitemap.xml',
    note:     'aily — siteOwner verified via sites.list 2026-07-04',
  },
]

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
auth.setCredentials({ refresh_token: REFRESH })
const webmasters = google.webmasters({ version: 'v3', auth })

// Never dump the full err object — err.response.config.headers can carry
// the active bearer access token. Only surface err.message + err.code +
// safe err.errors[] details.
function safeErr(err) {
  const msg = err && err.message ? err.message : String(err)
  const code = err && err.code ? String(err.code) : ''
  const details = err && Array.isArray(err.errors) ? err.errors.map(e => JSON.stringify(e)) : []
  return { msg, code, details }
}

;(async () => {
  let anyFailed = false
  for (const t of targets) {
    console.log('')
    console.log('=== target: ' + t.siteUrl + ' ===')
    console.log('  feedpath: ' + t.feedpath)
    console.log('  note:     ' + t.note)

    // 1. Submit (idempotent — updates lastSubmitted; no-op for indexing)
    console.log('  → sitemaps.submit …')
    try {
      const submitRes = await webmasters.sitemaps.submit({
        siteUrl:  t.siteUrl,
        feedpath: t.feedpath,
      })
      // submit returns 204 No Content with empty body on success — nothing
      // meaningful to print beyond confirmation the call resolved.
      console.log('    submit: OK (HTTP ' + submitRes.status + ')')
    } catch (err) {
      anyFailed = true
      const e = safeErr(err)
      console.error('    submit: FAILED — ' + e.msg + (e.code ? ' [code=' + e.code + ']' : ''))
      for (const d of e.details) console.error('      detail: ' + d)
      continue  // skip get on failure
    }

    // 2. Verify via get (the real success signal — echoes registered
    //    sitemap state as Google sees it)
    console.log('  → sitemaps.get …')
    try {
      const getRes = await webmasters.sitemaps.get({
        siteUrl:  t.siteUrl,
        feedpath: t.feedpath,
      })
      const s = getRes.data || {}
      console.log('    get: OK (HTTP ' + getRes.status + ')')
      console.log('      path:            ' + JSON.stringify(s.path))
      console.log('      lastSubmitted:   ' + JSON.stringify(s.lastSubmitted))
      console.log('      isPending:       ' + JSON.stringify(s.isPending))
      console.log('      isSitemapsIndex: ' + JSON.stringify(s.isSitemapsIndex))
      console.log('      type:            ' + JSON.stringify(s.type))
      console.log('      lastDownloaded:  ' + JSON.stringify(s.lastDownloaded))
      // contents is an array of { type, submitted, indexed }
      const contents = Array.isArray(s.contents) ? s.contents : []
      console.log('      contents count:  ' + contents.length)
      for (const c of contents) {
        console.log('        - ' + JSON.stringify(c))
      }
      // Google reports errors / warnings as scalar counts on the entry itself
      console.log('      errors:          ' + JSON.stringify(s.errors))
      console.log('      warnings:        ' + JSON.stringify(s.warnings))
    } catch (err) {
      anyFailed = true
      const e = safeErr(err)
      console.error('    get: FAILED — ' + e.msg + (e.code ? ' [code=' + e.code + ']' : ''))
      for (const d of e.details) console.error('      detail: ' + d)
    }
  }

  console.log('')
  console.log(anyFailed ? '=== DONE with ONE OR MORE FAILURES ===' : '=== DONE (all targets submitted + verified) ===')
  process.exit(anyFailed ? 1 : 0)
})().catch(err => {
  // Safety net; per-target try/catch above should catch everything.
  const e = safeErr(err)
  console.error('FATAL (uncaught): ' + e.msg + (e.code ? ' [code=' + e.code + ']' : ''))
  process.exit(1)
})
