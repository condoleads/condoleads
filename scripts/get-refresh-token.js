// W-GOOGLE-ADS UNIT 55b (2026-06-30) — Google Ads OAuth refresh-token
// generator. Run once locally to obtain GOOGLE_ADS_REFRESH_TOKEN; paste the
// resulting token into .env.local manually (the script does NOT auto-write
// any file). Manual-fetch implementation against
// https://oauth2.googleapis.com/token so this stays a zero-dependency
// bootstrap (no googleapis npm install) — dotenv is the only require, and
// it's already in package.json.
//
// Usage:
//   1. node scripts/get-refresh-token.js
//   2. Open the printed consent URL in a browser (any account works — use
//      the Google account that owns the Ads MCC = customer ID
//      9809090748 per UNIT 55a).
//   3. Approve. The browser redirects to http://localhost/?code=... and
//      shows "site can't be reached" — that's expected; localhost isn't
//      serving anything. Copy the FULL URL from the address bar.
//   4. Paste the URL (or just the code= param) when prompted.
//   5. The script prints the refresh_token. Copy it manually into
//      .env.local as GOOGLE_ADS_REFRESH_TOKEN=<value>.
//
// redirect_uri must EXACTLY match what's registered in the Google Cloud
// OAuth client. UNIT 55a + the OAuth client registration use
// 'http://localhost' (no port, no trailing slash). If you see
// "redirect_uri_mismatch" — confirm http://localhost is in the OAuth
// client's Authorized redirect URIs (Google Cloud Console -> OAuth 2.0
// Client IDs -> your client) AND that the change has propagated (~5 min).

require('dotenv').config({ path: '.env.local' })
const https = require('https')
const readline = require('readline')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost'
// C-UNIT-2 PATH-A Step 2 (2026-07-04): added webmasters (read/write) so a
// single re-consent mints a refresh token usable for both Ads AND Search
// Console (sitemaps.submit / sitemaps.get). Keep adwords first so the
// existing Ads token path continues to work until the operator saves the
// new dual-scope token to .env.local under a separate key.
const SCOPES = ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/webmasters']

if (!CLIENT_ID) {
  console.error('FATAL: GOOGLE_ADS_CLIENT_ID missing from .env.local')
  process.exit(1)
}
if (!CLIENT_SECRET) {
  console.error('FATAL: GOOGLE_ADS_CLIENT_SECRET missing from .env.local')
  process.exit(1)
}

function buildConsentUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function extractCode(input) {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const u = new URL(trimmed)
      return u.searchParams.get('code')
    } catch {
      return null
    }
  }
  if (trimmed.includes('code=')) {
    const m = trimmed.match(/code=([^&\s]+)/)
    return m ? decodeURIComponent(m[1]) : null
  }
  return trimmed
}

function exchangeCodeForTokens(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString()

    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            const data = JSON.parse(raw)
            if (res.statusCode !== 200 || data.error) {
              return reject(new Error(data.error_description || data.error || `HTTP ${res.statusCode}: ${raw}`))
            }
            resolve(data)
          } catch (e) {
            reject(new Error(`Failed to parse token response: ${e.message}; raw=${raw.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const consentUrl = buildConsentUrl()
  console.log('')
  console.log('=== Google OAuth - dual-scope refresh token (adwords + webmasters) ===')
  console.log('')
  console.log('Step 1. Open this URL in your browser, authorize the Google')
  console.log('  Ads scope, then copy the FULL redirected URL.')
  console.log('  The browser will show "site can\'t be reached" at')
  console.log('  http://localhost/?code=... — THAT IS EXPECTED. Just copy')
  console.log('  the URL from the address bar.')
  console.log('')
  console.log('  ' + consentUrl)
  console.log('')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const input = await new Promise((resolve) => {
    rl.question('Step 2. Paste the redirected URL (or just the ?code= value): ', (answer) => {
      rl.close()
      resolve(answer)
    })
  })

  const code = extractCode(input)
  if (!code) {
    console.error('')
    console.error('FATAL: could not extract authorization code from your input.')
    console.error('Expected either the full URL (http://localhost/?code=...) or just the code.')
    process.exit(1)
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      console.error('')
      console.error('FATAL: response did not include refresh_token.')
      console.error('Hint: ensure prompt=consent was honored (this script sets it).')
      console.error('If you have already authorized this client without prompt=consent,')
      console.error('revoke at https://myaccount.google.com/permissions and rerun.')
      process.exit(1)
    }
    // C-UNIT-2 Step 2c (2026-07-04): write token directly to .env.local via
    // replace-or-append helper. Fingerprint only to stdout - no token material
    // (refresh_token / access_token / id_token) reaches stdout, logs, or chat.
    const envPath = path.join(__dirname, '..', '.env.local')
    let env = fs.readFileSync(envPath, 'utf8')
    if (env.charCodeAt(0) === 0xFEFF) env = env.slice(1)
    const envNL = env.indexOf('\r\n') !== -1 ? '\r\n' : '\n'
    const KEY = 'GOOGLE_WEBMASTERS_REFRESH_TOKEN'
    const newLine = KEY + '=' + tokens.refresh_token
    const keyRe = new RegExp('^' + KEY + '=.*$', 'm')
    let action
    if (keyRe.test(env)) {
      env = env.replace(keyRe, newLine)
      action = 'REPLACED existing ' + KEY + ' line'
    } else {
      if (!env.endsWith(envNL)) env += envNL
      env += newLine + envNL
      action = 'APPENDED new ' + KEY + ' line'
    }
    fs.writeFileSync(envPath, env, 'utf8')
    const t = tokens.refresh_token
    const fp = t.slice(0, 6) + '...' + t.slice(-4) + ' (len=' + t.length + ')'
    console.log('')
    console.log('=== SUCCESS - token written to .env.local ===')
    console.log('')
    console.log('  file:        ' + envPath)
    console.log('  key:         ' + KEY)
    console.log('  action:      ' + action)
    console.log('  fingerprint: ' + fp)
    console.log('')
    console.log('GOOGLE_ADS_REFRESH_TOKEN was NOT modified.')
    console.log('(No token material printed - fingerprint only, per secrets rule.)')
  } catch (err) {
    console.error('')
    console.error('FATAL: token exchange failed — ' + err.message)
    if (/redirect_uri_mismatch/i.test(err.message)) {
      console.error('')
      console.error('Hint: redirect_uri_mismatch — confirm http://localhost is in the')
      console.error('OAuth client\'s "Authorized redirect URIs" in Google Cloud Console')
      console.error('and has propagated (typically <5 minutes).')
    }
    if (/invalid_grant/i.test(err.message)) {
      console.error('')
      console.error('Hint: invalid_grant — the authorization code is single-use and')
      console.error('expires in ~60 seconds. Rerun the script and complete the flow')
      console.error('within a minute of approving in the browser.')
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL (uncaught): ' + (err && err.message ? err.message : err))
  process.exit(1)
})
