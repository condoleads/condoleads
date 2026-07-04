// C-UNIT-2 PATH-A Step 4 (part 1) — list Search Console properties visible
// to the authenticated user (via GOOGLE_WEBMASTERS_REFRESH_TOKEN).
//
// READ-ONLY: calls webmasters.sites.list only. No submit, no delete, no add.
// Prints ONLY siteUrl + permissionLevel per entry. No token material, no
// full-error dump (err.response headers can echo an access-token bearer).
//
// Usage: node scripts/gsc-sites-list.js

require('dotenv').config({ path: '.env.local' })
const { google } = require('googleapis')

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET
const REFRESH = process.env.GOOGLE_WEBMASTERS_REFRESH_TOKEN

if (!CLIENT_ID)      { console.error('FATAL: GOOGLE_ADS_CLIENT_ID missing'); process.exit(1) }
if (!CLIENT_SECRET)  { console.error('FATAL: GOOGLE_ADS_CLIENT_SECRET missing'); process.exit(1) }
if (!REFRESH)        { console.error('FATAL: GOOGLE_WEBMASTERS_REFRESH_TOKEN missing'); process.exit(1) }

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
auth.setCredentials({ refresh_token: REFRESH })
const webmasters = google.webmasters({ version: 'v3', auth })

;(async () => {
  try {
    const res = await webmasters.sites.list()
    const entries = (res.data && res.data.siteEntry) || []
    console.log('=== Search Console sites.list ===')
    console.log('  entries: ' + entries.length)
    if (entries.length === 0) {
      console.log('  (no properties visible to this authenticated user)')
      return
    }
    for (const e of entries) {
      // Only siteUrl + permissionLevel — nothing else on the entry is sensitive
      // but the operator asked for exactly these two fields.
      console.log('  siteUrl=' + JSON.stringify(e.siteUrl) + '  permissionLevel=' + JSON.stringify(e.permissionLevel))
    }
  } catch (err) {
    // Never dump the full err object: err.response.config.headers can carry
    // an active bearer token that the OAuth2 client just minted from the
    // refresh token. err.message is safe; err.code / err.errors[] are safe.
    console.error('ERROR: ' + (err && err.message ? err.message : String(err)))
    if (err && err.code) console.error('  code: ' + err.code)
    if (err && Array.isArray(err.errors)) {
      for (const e of err.errors) console.error('  detail: ' + JSON.stringify(e))
    }
    process.exit(1)
  }
})()
