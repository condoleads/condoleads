// W-GOOGLE-ADS UNIT 55c (2026-06-30) — read-only auth verification.
// Makes ONE GAQL SELECT against `customer` to prove the full chain
// (client + dev token + login_customer_id + customer_id + refresh
// token) authenticates end-to-end. Returns account facts on success
// (id, descriptive_name, currency, time_zone — all non-secret),
// maps the common error classes to actionable hints on failure.
//
// Read-only. Does NOT create, modify, or spend anything.

require('dotenv').config({ path: '.env.local' })
const { GoogleAdsApi } = require('google-ads-api')

const REQUIRED = [
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_REFRESH_TOKEN',
]

function failFastOnMissingEnv() {
  for (const k of REQUIRED) {
    if (!process.env[k]) {
      console.error(`FATAL: ${k} missing from .env.local`)
      process.exit(1)
    }
  }
}

// Extract a usable diagnostic string from a google-ads-api error. The library
// sometimes throws an object whose `.message` is unhelpful ("[object Object]")
// while the real detail lives in `.errors[].message`. Build a combined string
// so the hint matcher and the human-facing output both get the real text.
function extractDiagnostic(err) {
  const parts = []
  if (err && err.message && err.message !== '[object Object]') parts.push(String(err.message))
  if (err && Array.isArray(err.errors)) {
    for (const inner of err.errors) {
      if (inner && inner.message) parts.push(String(inner.message))
      if (inner && inner.error_code) parts.push(JSON.stringify(inner.error_code))
    }
  }
  if (parts.length === 0 && err) parts.push(String(err.message || err))
  return parts.join(' | ')
}

function mapErrorToHint(msg) {
  if (/AUTHENTICATION_ERROR|invalid_grant/i.test(msg)) {
    return [
      'Hint: refresh token bad or expired.',
      'Google OAuth refresh tokens issued while the OAuth client is in "Testing" mode',
      'expire ~7 days after issue. Re-run `node scripts/get-refresh-token.js` to mint',
      'a new one and replace GOOGLE_ADS_REFRESH_TOKEN in .env.local.',
    ].join('\n')
  }
  if (/DEVELOPER_TOKEN_NOT_APPROVED|TEST_ACCOUNTS_ONLY|developer.*token.*test/i.test(msg)) {
    return [
      'Hint: developer token is in Test mode.',
      'A Test-mode developer token only works against TEST manager accounts',
      '(not real production customers). Apply for Basic Access at',
      'https://ads.google.com/aw/apicenter to unlock production customer queries.',
    ].join('\n')
  }
  if (/authorization_error.*:\s*24|not yet enabled|CUSTOMER_NOT_ENABLED|has been deactivated/i.test(msg)) {
    return [
      'Hint: customer is not yet enabled (authorization_error code 24).',
      '',
      `Customer ${process.env.GOOGLE_ADS_CUSTOMER_ID} exists under MCC`,
      `${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID} (linkage works — we got a`,
      'different error code than the not-linked case), but the account itself',
      'is in an unactivated state.',
      '',
      'Common causes for a brand-new sub-account:',
      '  - Billing not yet configured (Tools & Settings -> Billing -> Settings)',
      '  - Terms of Service not yet accepted by the account owner',
      '  - Currency / timezone not finalized in account setup',
      '  - Account in "draft" state, never opened in the UI to complete setup',
      '',
      'Fix: open the customer in Google Ads UI as the account owner,',
      'complete any pending setup steps (you\'ll see warning banners at the',
      'top of the dashboard pointing to what\'s missing). Billing setup is',
      'the most common gate. Re-run verify after.',
    ].join('\n')
  }
  if (/USER_PERMISSION_DENIED|PERMISSION_DENIED|doesn't have permission|authorization_error|login.customer.id/i.test(msg)) {
    return [
      'Hint: the authorized Google account does not have access to',
      `customer ${process.env.GOOGLE_ADS_CUSTOMER_ID} via MCC ${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}.`,
      '',
      'Two failure modes share this error:',
      '  (a) Account permission: the Google account that completed OAuth',
      '      must be added as a user on the MCC (Google Ads UI -> Tools &',
      '      Settings -> Access and security -> Users) with at least',
      '      Read access. Email access invites are pending until the',
      '      recipient signs in and accepts.',
      '  (b) Account linkage: MCC must actually MANAGE the customer.',
      `      Confirm MCC ${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID} has`,
      `      customer ${process.env.GOOGLE_ADS_CUSTOMER_ID} in its Sub-Account`,
      '      Settings tree (Tools & Settings -> Setup -> Sub-account',
      '      settings). If not linked, the MCC cannot proxy queries to it.',
      '',
      'Quick read: run the same GAQL against the MCC ITSELF first to',
      'isolate which side fails:',
      `  customer_id = login_customer_id = ${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}`,
      'If THAT succeeds and the original 5426857546 query still fails,',
      "it's (b) — the link relationship isn't in place.",
    ].join('\n')
  }
  if (/CUSTOMER_NOT_FOUND|customer.*not.*found/i.test(msg)) {
    return [
      'Hint: customer_id or login_customer_id mismatch.',
      `Confirm GOOGLE_ADS_CUSTOMER_ID=${process.env.GOOGLE_ADS_CUSTOMER_ID}`,
      `and GOOGLE_ADS_LOGIN_CUSTOMER_ID=${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}`,
      'are the correct 10-digit IDs (no dashes) for your account + MCC.',
    ].join('\n')
  }
  if (/Cannot read properties of undefined.*get|getGoogleAdsError/i.test(msg)) {
    // Library crashes here because Google returned a non-Ads-API error shape
    // (e.g. google.rpc.PreconditionFailure with metadata.service /
    // metadata.activation_url). The "No data type found for metadata.service"
    // warnings printed earlier are the protobuf signature for this case.
    // Diagnosis: Google Ads API is not enabled on the Google Cloud project
    // that owns the OAuth client. Extract project number from client_id
    // (prefix before '-...apps.googleusercontent.com') to build the
    // activation URL.
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID || ''
    const projectNum = clientId.split('-')[0] || '<project-number>'
    return [
      'Hint: Google Ads API is likely NOT enabled on the Google Cloud project',
      'that owns this OAuth client. The "No data type found for metadata.service /',
      'activation_url / consumer" warnings printed above are protobuf decode',
      'failures on Google\'s "service not enabled" error shape — the library',
      'cannot parse it, hence the unhelpful TypeError.',
      '',
      'Fix:',
      `  1. Visit https://console.cloud.google.com/apis/library/googleads.googleapis.com?project=${projectNum}`,
      '  2. Click Enable.',
      '  3. Wait ~1-2 minutes for propagation.',
      '  4. Re-run: node scripts/verify-ads-auth.js',
    ].join('\n')
  }
  return null
}

async function main() {
  failFastOnMissingEnv()

  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret:   process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  })

  const customer = api.Customer({
    customer_id:       process.env.GOOGLE_ADS_CUSTOMER_ID,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token:     process.env.GOOGLE_ADS_REFRESH_TOKEN,
  })

  console.log('=== Google Ads — read-only auth verification ===')
  console.log('  customer_id:       ' + process.env.GOOGLE_ADS_CUSTOMER_ID)
  console.log('  login_customer_id: ' + process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID + '  (MCC)')
  console.log('  running GAQL: SELECT customer.id, descriptive_name, currency_code, time_zone FROM customer LIMIT 1')
  console.log('')

  try {
    const rows = await customer.query(
      `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1`
    )

    if (!rows || rows.length === 0) {
      console.error('FAIL — query returned 0 rows. Auth ok but customer.query empty (unusual).')
      process.exit(1)
    }

    const r = rows[0].customer || {}
    console.log('OK — Google Ads API authenticated end-to-end.')
    console.log('')
    console.log('  customer.id:               ' + r.id)
    console.log('  customer.descriptive_name: ' + (r.descriptive_name || '(unset)'))
    console.log('  customer.currency_code:    ' + (r.currency_code || '(unset)'))
    console.log('  customer.time_zone:        ' + (r.time_zone || '(unset)'))
    process.exit(0)
  } catch (err) {
    const msg = extractDiagnostic(err)
    console.error('FAIL — ' + msg)
    const hint = mapErrorToHint(msg)
    if (hint) {
      console.error('')
      console.error(hint)
    }
    // Surface inner errors arrays from google-ads-api if present
    if (err && Array.isArray(err.errors)) {
      console.error('')
      console.error('Inner errors:')
      for (const e of err.errors) {
        console.error('  - ' + JSON.stringify(e).slice(0, 300))
      }
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL (uncaught): ' + (err && err.message ? err.message : err))
  process.exit(1)
})
