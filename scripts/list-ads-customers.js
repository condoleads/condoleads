// W-GOOGLE-ADS UNIT 55d (2026-06-30) — read-only diagnostic: list customers
// managed by the configured MCC. Queries `customer_client` resource against
// the MCC itself, which returns the full sub-account tree (every customer
// the MCC manages at any nesting level).
//
// Read-only. No writes.
//
// Use this BEFORE attempting to link a new customer — confirms which ID
// to actually point GOOGLE_ADS_CUSTOMER_ID at (or whether 5426857546
// needs to be linked into the MCC).

require('dotenv').config({ path: '.env.local' })
const { GoogleAdsApi } = require('google-ads-api')

const REQUIRED = [
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'GOOGLE_ADS_REFRESH_TOKEN',
]
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`FATAL: ${k} missing from .env.local`)
    process.exit(1)
  }
}

const MCC = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

const api = new GoogleAdsApi({
  client_id:       process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret:   process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
})

// Query the MCC itself — customer_id = login_customer_id = MCC. The
// customer_client resource returns the full descendant tree.
const customer = api.Customer({
  customer_id:       MCC,
  login_customer_id: MCC,
  refresh_token:     process.env.GOOGLE_ADS_REFRESH_TOKEN,
})

function pad(s, n) {
  s = String(s == null ? '' : s)
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

async function main() {
  console.log('=== Google Ads — customers managed by MCC ' + MCC + ' ===')
  console.log('  GAQL: SELECT customer_client.id, descriptive_name, manager, level, status FROM customer_client')
  console.log('')

  try {
    const rows = await customer.query(
      `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.level, customer_client.status FROM customer_client`
    )

    if (!rows || rows.length === 0) {
      console.log('No customers returned. MCC manages nothing (or query returned empty).')
      return
    }

    // Header
    console.log(pad('id', 14) + pad('manager', 9) + pad('level', 7) + pad('status', 14) + 'descriptive_name')
    console.log('-'.repeat(80))

    let mccSelf = null
    const clients = []
    for (const r of rows) {
      const cc = r.customer_client || {}
      // Stash the MCC self-row separately for the legend
      if (String(cc.id) === String(MCC)) {
        mccSelf = cc
      } else {
        clients.push(cc)
      }
    }

    // MCC itself first (it's level 0)
    if (mccSelf) {
      console.log(
        pad(mccSelf.id, 14) +
        pad(mccSelf.manager === true ? 'true' : 'false', 9) +
        pad(mccSelf.level, 7) +
        pad(mccSelf.status, 14) +
        (mccSelf.descriptive_name || '(unset)') + '   <-- MCC self'
      )
    }

    // Sort sub-clients by level, then descriptive name
    clients.sort((a, b) => {
      const la = Number(a.level || 0)
      const lb = Number(b.level || 0)
      if (la !== lb) return la - lb
      return String(a.descriptive_name || '').localeCompare(String(b.descriptive_name || ''))
    })

    for (const cc of clients) {
      console.log(
        pad(cc.id, 14) +
        pad(cc.manager === true ? 'true' : 'false', 9) +
        pad(cc.level, 7) +
        pad(cc.status, 14) +
        (cc.descriptive_name || '(unset)')
      )
    }

    console.log('')
    console.log('Summary: ' + rows.length + ' rows returned (' + clients.length + ' non-MCC client account' + (clients.length === 1 ? '' : 's') + ')')

    // Check whether the operator's currently-configured target customer is in the list
    const target = process.env.GOOGLE_ADS_CUSTOMER_ID
    if (target) {
      const found = rows.some(r => String(r.customer_client && r.customer_client.id) === String(target))
      console.log('')
      if (found) {
        console.log('GOOGLE_ADS_CUSTOMER_ID=' + target + ' IS in the list above. The MCC manages it.')
        console.log('(If verify-ads-auth.js still failed against this customer, the issue is')
        console.log(' a different layer — re-run verify-ads-auth.js for current diagnosis.)')
      } else {
        console.log('GOOGLE_ADS_CUSTOMER_ID=' + target + ' is NOT in the list above.')
        console.log('Either:')
        console.log('  - Link customer ' + target + ' under MCC ' + MCC + ' in Google Ads UI, OR')
        console.log('  - Set GOOGLE_ADS_CUSTOMER_ID to a customer id from the list above.')
      }
    }
  } catch (err) {
    const inner = err && Array.isArray(err.errors) && err.errors[0]
    const msg = (inner && inner.message) || (err && err.message) || String(err)
    console.error('FAIL — ' + msg)
    if (err && Array.isArray(err.errors)) {
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
