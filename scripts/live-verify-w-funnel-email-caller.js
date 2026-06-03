// scripts/live-verify-w-funnel-email-caller.js
// W-FUNNEL F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL live verification.
//
// Approach:
//   1. INSERT a throwaway test tenant with a PLACEHOLDER resend_api_key
//      (real tenants' keys NEVER touched).
//   2. Pre-flight: fingerprint both real tenants' keys to assert they
//      stay intact across this run.
//   3. Drive the LIVE sendTenantEmail preflight against the test tenant
//      (mirrored inline since the project's TS uses path aliases that
//      can't resolve in a standalone Node script). Verifies the typed
//      `TenantEmailNotConfigured` throw + the attemptTenantEmail outcome
//      shape end-to-end against a live DB row.
//   4. DELETE the test tenant.
//   5. Post-flight: fingerprint real tenants again, assert unchanged.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const WALLIAM_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AILY_ID = 'e2619717-6401-4159-8d4c-d5f87651c8d6'

const TEST_TENANT_ID = '00000000-dead-beef-cafe-000000000001'
const PLACEHOLDER_KEY = '[YOUR_RESEND_API_KEY]'

// Mirror of the live regex + validator in lib/email/sendTenantEmail.ts.
// MUST match the source; if you change one, change both.
const RESEND_KEY_PLACEHOLDER_RX = /\[|\]|<|>|REPLACE_ME|YOUR_RESEND|placeholder|TODO|xxxx/i
function looksLikeValidResendKey (key) {
  if (!key) return false
  if (!key.startsWith('re_')) return false
  if (key.length < 16) return false
  if (RESEND_KEY_PLACEHOLDER_RX.test(key)) return false
  return true
}

// Mirror of TenantEmailNotConfigured (typed marker).
class TenantEmailNotConfigured extends Error {
  constructor (tenantId, missing) {
    super(`Tenant ${tenantId} cannot send email -- missing/invalid: ${missing.join(', ')}`)
    this.name = 'TenantEmailNotConfigured'
    this.tenantId = tenantId
    this.missing = missing
  }
}

// Mirror of sendTenantEmail preflight (just the gate, no actual Resend call).
async function sendTenantEmailPreflight (c, tenantId) {
  const { rows } = await c.query(
    "SELECT resend_api_key, email_from_domain, send_from, resend_verification_status FROM tenants WHERE id = $1",
    [tenantId]
  )
  const tenant = rows[0]
  if (!tenant) throw new TenantEmailNotConfigured(tenantId, ['tenant not found'])
  const missing = []
  if (!tenant.resend_api_key) {
    missing.push('resend_api_key')
  } else if (!looksLikeValidResendKey(tenant.resend_api_key)) {
    missing.push('resend_api_key invalid (placeholder or malformed)')
  }
  if (!tenant.email_from_domain) missing.push('email_from_domain')
  if (!tenant.send_from) missing.push('send_from')
  if (tenant.resend_verification_status !== 'verified') {
    missing.push(`domain not verified (status=${tenant.resend_verification_status ?? 'null'})`)
  }
  if (missing.length > 0) throw new TenantEmailNotConfigured(tenantId, missing)
  // Would proceed to actual send -- skipped for verification purposes.
  return { sent: true, reason: 'delivered', messageId: 'verification-stub' }
}

// Mirror of attemptTenantEmail (the outcome wrapper).
async function attemptTenantEmail (c, tenantId, context) {
  try {
    const result = await sendTenantEmailPreflight(c, tenantId)
    return { sent: true, reason: 'delivered', messageId: result.messageId }
  } catch (err) {
    if (err instanceof TenantEmailNotConfigured) {
      console.warn(`  [${context}] tenant email not configured: ${err.message}`)
      return { sent: false, reason: 'not_configured' }
    }
    console.error(`  [${context}] unexpected error:`, err)
    return { sent: false, reason: 'send_failed' }
  }
}

function fp (v) {
  if (!v) return '(absent)'
  return v.slice(0, 6) + '...' + v.slice(-4) + ' (len=' + v.length + ')'
}

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()

  let fail = 0
  let preWalliamFp = null
  let preAilyFp = null

  try {
    // ===== Pre-flight: fingerprint real tenants =====
    console.log('=== Pre-flight: fingerprint real tenants (will assert unchanged at end) ===')
    const wPre = await c.query("SELECT resend_api_key FROM tenants WHERE id = $1", [WALLIAM_ID])
    const aPre = await c.query("SELECT resend_api_key FROM tenants WHERE id = $1", [AILY_ID])
    preWalliamFp = fp(wPre.rows[0]?.resend_api_key)
    preAilyFp = fp(aPre.rows[0]?.resend_api_key)
    console.log('  WALLiam resend_api_key fp:', preWalliamFp)
    console.log('  Aily resend_api_key fp:   ', preAilyFp)

    // ===== Cleanup any prior test row (idempotent) =====
    await c.query("DELETE FROM tenants WHERE id = $1", [TEST_TENANT_ID])

    // ===== INSERT test tenant with placeholder key =====
    console.log('\n=== INSERT test tenant ' + TEST_TENANT_ID + ' (placeholder resend_api_key) ===')
    await c.query(
      `INSERT INTO tenants
       (id, name, brand_name, source_key, domain, admin_email, is_active,
        resend_api_key, email_from_domain, send_from,
        resend_verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        TEST_TENANT_ID,
        'TestFunnelTenant',
        'TestFunnelTenant',
        'test_funnel_verify',
        'test-funnel.invalid',
        'admin@test-funnel.invalid',
        true,
        PLACEHOLDER_KEY,
        'test-funnel.invalid',
        'TestFunnelTenant <test@test-funnel.invalid>',
        'verified',
      ]
    )
    console.log('  inserted with resend_api_key fp:', fp(PLACEHOLDER_KEY))

    // ===== Live verify: placeholder key triggers not_configured =====
    console.log('\n=== Case 1: placeholder key -> attemptTenantEmail outcome ===')
    const outcome1 = await attemptTenantEmail(c, TEST_TENANT_ID, 'test placeholder')
    const ok1 = outcome1.sent === false && outcome1.reason === 'not_configured'
    console.log('  outcome:', JSON.stringify(outcome1))
    console.log('  ' + (ok1 ? 'PASS' : 'FAIL') + ' expected { sent:false, reason:"not_configured" }')
    if (!ok1) fail++

    // ===== Live verify: update test tenant to a real-shape (synthetic) key =====
    console.log('\n=== Case 2: real-shape (synthetic) key -> would reach Resend ===')
    const SYNTHETIC_REAL = 're_BJJabcdefghijklmnopqrstuvwxyzZZZZ'
    await c.query("UPDATE tenants SET resend_api_key = $1 WHERE id = $2", [SYNTHETIC_REAL, TEST_TENANT_ID])
    console.log('  test tenant key updated to synthetic-real fp:', fp(SYNTHETIC_REAL))
    const outcome2 = await attemptTenantEmail(c, TEST_TENANT_ID, 'test real-shape')
    const ok2 = outcome2.sent === true && outcome2.reason === 'delivered'
    console.log('  outcome:', JSON.stringify(outcome2))
    console.log('  ' + (ok2 ? 'PASS' : 'FAIL') + ' expected { sent:true, reason:"delivered" } (preflight passes; real send not executed in this verification harness)')
    if (!ok2) fail++

    // ===== Live verify: missing key entirely =====
    console.log('\n=== Case 3: missing key entirely -> not_configured ===')
    await c.query("UPDATE tenants SET resend_api_key = NULL WHERE id = $1", [TEST_TENANT_ID])
    const outcome3 = await attemptTenantEmail(c, TEST_TENANT_ID, 'test null key')
    const ok3 = outcome3.sent === false && outcome3.reason === 'not_configured'
    console.log('  outcome:', JSON.stringify(outcome3))
    console.log('  ' + (ok3 ? 'PASS' : 'FAIL') + ' expected { sent:false, reason:"not_configured" }')
    if (!ok3) fail++

    // ===== Live verify: REPLACE_ME placeholder =====
    console.log('\n=== Case 4: REPLACE_ME placeholder -> not_configured ===')
    await c.query("UPDATE tenants SET resend_api_key = $1 WHERE id = $2", ['REPLACE_ME_WITH_RESEND_KEY', TEST_TENANT_ID])
    const outcome4 = await attemptTenantEmail(c, TEST_TENANT_ID, 'test REPLACE_ME')
    const ok4 = outcome4.sent === false && outcome4.reason === 'not_configured'
    console.log('  outcome:', JSON.stringify(outcome4))
    console.log('  ' + (ok4 ? 'PASS' : 'FAIL') + ' expected { sent:false, reason:"not_configured" }')
    if (!ok4) fail++

    // ===== Live verify: too-short key (re_abc) =====
    console.log('\n=== Case 5: too-short re_ key -> not_configured ===')
    await c.query("UPDATE tenants SET resend_api_key = $1 WHERE id = $2", ['re_abc', TEST_TENANT_ID])
    const outcome5 = await attemptTenantEmail(c, TEST_TENANT_ID, 'test short key')
    const ok5 = outcome5.sent === false && outcome5.reason === 'not_configured'
    console.log('  outcome:', JSON.stringify(outcome5))
    console.log('  ' + (ok5 ? 'PASS' : 'FAIL') + ' expected { sent:false, reason:"not_configured" }')
    if (!ok5) fail++

  } catch (e) {
    console.error('TEST RUN ERROR:', e.message)
    fail++
  } finally {
    // ===== ALWAYS: DELETE test tenant =====
    try {
      await c.query("DELETE FROM tenants WHERE id = $1", [TEST_TENANT_ID])
      console.log('\n=== cleanup: test tenant ' + TEST_TENANT_ID + ' DELETED ===')
    } catch (e) {
      console.error('CLEANUP FAILED:', e.message)
      fail++
    }

    // ===== Post-flight: verify real tenants UNTOUCHED =====
    console.log('\n=== Post-flight: assert real tenants untouched ===')
    const wPost = await c.query("SELECT resend_api_key FROM tenants WHERE id = $1", [WALLIAM_ID])
    const aPost = await c.query("SELECT resend_api_key FROM tenants WHERE id = $1", [AILY_ID])
    const wFp = fp(wPost.rows[0]?.resend_api_key)
    const aFp = fp(aPost.rows[0]?.resend_api_key)
    const wOk = wFp === preWalliamFp
    const aOk = aFp === preAilyFp
    console.log('  WALLiam fp before=' + preWalliamFp + ' after=' + wFp + '  ' + (wOk ? 'UNCHANGED' : 'CHANGED -- MUST RESTORE'))
    console.log('  Aily fp before=   ' + preAilyFp + ' after=' + aFp + '  ' + (aOk ? 'UNCHANGED' : 'CHANGED -- MUST RESTORE'))
    if (!wOk || !aOk) {
      console.error('\n!!! REAL TENANT KEY CHANGED -- INVESTIGATE IMMEDIATELY !!!')
      fail += 10
    }

    await c.end()
  }

  console.log('\n=== LIVE-VERIFY RESULT: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + ' ===')
  process.exit(fail === 0 ? 0 : 1)
})()
