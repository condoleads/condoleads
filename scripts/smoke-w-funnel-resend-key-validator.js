// scripts/smoke-w-funnel-resend-key-validator.js
// W-FUNNEL-VERIFICATION §3.8: verify looksLikeValidResendKey rejects
// placeholders / malformed strings and accepts the real WALLiam key.

// Inline mirror of looksLikeValidResendKey from lib/email/sendTenantEmail.ts.
// Mirror (not import) avoids tsc path-alias resolution for a pure-logic helper.
// If you change the source, mirror this regex too.
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')

const RESEND_KEY_PLACEHOLDER_RX = /\[|\]|<|>|REPLACE_ME|YOUR_RESEND|placeholder|TODO|xxxx/i
function looksLikeValidResendKey (key) {
  if (!key) return false
  if (!key.startsWith('re_')) return false
  if (key.length < 16) return false
  if (RESEND_KEY_PLACEHOLDER_RX.test(key)) return false
  return true
}

let fail = 0
function check (label, input, expected) {
  // Mask the input for display -- show only fingerprint, not full value
  const display = !input ? '(empty)' : input.length > 14 ? input.slice(0,6) + '...' + input.slice(-4) + ' (len=' + input.length + ')' : JSON.stringify(input)
  const got = looksLikeValidResendKey(input)
  const ok = got === expected
  if (!ok) fail++
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + label.padEnd(50) + ' input=' + display.padEnd(30) + ' got=' + got + ' expected=' + expected)
}

console.log('=== Placeholders / malformed values (must REJECT) ===')
check('null', null, false)
check('undefined', undefined, false)
check('empty string', '', false)
check('REPLACE_ME literal', 'REPLACE_ME', false)
check('bracketed placeholder', '[YOUR_RESEND_API_KEY]', false)
check('angle-bracketed placeholder', '<resend-key>', false)
check('lowercase placeholder', 'placeholder', false)
check('TODO marker', 'TODO_set_resend_key', false)
check('xxxx mask', 'xxxxxxxxxxxxxxxxxxxx', false)
check('missing re_ prefix', 'rk_real_looking_thirty_six_chars_aa', false)
check('re_ prefix but too short', 're_abc', false)
check('re_ prefix + REPLACE_ME', 're_REPLACE_ME_PLACEHOLDER', false)
check('re_ prefix + bracket', 're_[YOUR_KEY]', false)

console.log('')
console.log('=== Real-shape values (must ACCEPT) ===')
// Synthetic real-shape keys (no live key printed; pattern only).
check('synthetic real-shape 36char', 're_BJJabcdefghijklmnopqrstuvwxyzcqSr', true)
check('synthetic real-shape minimum length', 're_aaaaaaaaaaaaa', true)  // 16 chars exactly

console.log('')
console.log('=== Live WALLiam key from .env.local (fingerprint-only) ===')
// Pull the real key WITHOUT printing it. Mask, then validate.
require('dotenv').config({ path: path.join(ROOT, '.env.local') })
const supabase = require('@supabase/supabase-js').createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)
;(async () => {
  for (const t of [
    { id: 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9', name: 'WALLiam' },
    { id: 'e2619717-6401-4159-8d4c-d5f87651c8d6', name: 'Aily' },
  ]) {
    const { data } = await supabase.from('tenants').select('resend_api_key').eq('id', t.id).maybeSingle()
    const k = data?.resend_api_key
    const display = k ? k.slice(0,6) + '...' + k.slice(-4) + ' (len=' + k.length + ')' : '(absent)'
    const got = looksLikeValidResendKey(k)
    console.log('  ' + (got ? 'PASS' : 'FAIL') + ' ' + t.name.padEnd(8) + ' fp=' + display + ' valid=' + got)
    if (!got) fail++
  }

  console.log('\n=== Validator smoke: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAIL') + ' ===')
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error(e); process.exit(1) })
