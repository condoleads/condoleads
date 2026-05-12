// scripts/patch-t6e-trackuseractivity-and-comment.js
// W-LEADS-EMAIL T6e-1 + T6e-2 + T6e-3 — single wire patch
//
// T6e-1: plan-email trackUserActivity helper — add tenantId param, write tenant_id, capture supabase error
// T6e-2: plan-email caller L150 — pass tenantId, change 'contact_form' -> 'plan_generated'
// T6e-3: charlie/lead L12 — fix stale F57 contract comment (session_id -> tenant_id, source)

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PLAN_EMAIL = path.join(ROOT, 'app/api/charlie/plan-email/route.ts')
const CHARLIE_LEAD = path.join(ROOT, 'app/api/charlie/lead/route.ts')

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}

function ts() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear().toString() +
    pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

function backup(filepath) {
  const bk = filepath + '.backup_' + ts()
  fs.copyFileSync(filepath, bk)
  return bk
}

function readFileWithMeta(filepath) {
  const buf = fs.readFileSync(filepath)
  const hasBOM = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
  const text = buf.toString('utf8')
  let crlf = 0, lf = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0A) {
      if (i > 0 && buf[i-1] === 0x0D) crlf++
      else lf++
    }
  }
  const lineEnding = (crlf > 0 && lf === 0) ? 'CRLF' : (crlf === 0 && lf > 0) ? 'LF' : 'MIXED'
  return { buf, text, hasBOM, lineEnding, size: buf.length }
}

function atomicReplace(text, oldStr, newStr, label) {
  const first = text.indexOf(oldStr)
  const last = text.lastIndexOf(oldStr)
  if (first === -1) fail(label + ': anchor not found in file')
  if (first !== last) fail(label + ': anchor not unique (first=' + first + ', last=' + last + ')')
  console.log('  [' + label + '] anchor unique at offset ' + first + ', oldLen=' + oldStr.length + ', newLen=' + newStr.length + ', delta=' + (newStr.length - oldStr.length))
  return text.substring(0, first) + newStr + text.substring(first + oldStr.length)
}

// ========================================================
// ENTRY
// ========================================================

console.log('=== T6e wire patch starting ===')
console.log('')

// ----- Read both files and verify baseline -----
const peMeta0 = readFileWithMeta(PLAN_EMAIL)
const clMeta0 = readFileWithMeta(CHARLIE_LEAD)

console.log('pre-patch state:')
console.log('  plan-email   : ' + peMeta0.size + ' bytes, BOM=' + peMeta0.hasBOM + ', ' + peMeta0.lineEnding)
console.log('  charlie/lead : ' + clMeta0.size + ' bytes, BOM=' + clMeta0.hasBOM + ', ' + clMeta0.lineEnding)
console.log('')

if (peMeta0.size !== 42518) fail('plan-email baseline size mismatch: expected 42518, got ' + peMeta0.size)
if (clMeta0.size !== 27071) fail('charlie/lead baseline size mismatch: expected 27071, got ' + clMeta0.size)
if (peMeta0.lineEnding !== 'CRLF') fail('plan-email baseline line ending: expected CRLF, got ' + peMeta0.lineEnding)
if (clMeta0.lineEnding !== 'LF') fail('charlie/lead baseline line ending: expected LF, got ' + clMeta0.lineEnding)
if (!peMeta0.hasBOM) fail('plan-email baseline: BOM expected but missing')
if (!clMeta0.hasBOM) fail('charlie/lead baseline: BOM expected but missing')

// ----- Idempotency guard -----
if (peMeta0.text.indexOf('plan_generated') !== -1) {
  fail('plan-email already contains "plan_generated" - already patched, aborting')
}
if (peMeta0.text.indexOf('tenantId: string | null, contactEmail') !== -1) {
  fail('plan-email helper signature already updated - already patched, aborting')
}
if (clMeta0.text.indexOf('(user_id, tenant_id, source, intent)') !== -1) {
  fail('charlie/lead L12 comment already updated - already patched, aborting')
}

// ----- Backups (Rule Zero: backup before mutation) -----
const peBackup = backup(PLAN_EMAIL)
const clBackup = backup(CHARLIE_LEAD)
console.log('backups created:')
console.log('  ' + peBackup)
console.log('  ' + clBackup)
console.log('')

// ========================================================
// plan-email patches (CRLF)
// ========================================================
let peText = peMeta0.text

// --- T6e-1.P1 — Helper signature (single-line anchor) ---
const PE_P1_OLD = "async function trackUserActivity(supabase: any, contactEmail: string, agentId: string | null, activityType: string, activityData: any, pageUrl?: string) {"
const PE_P1_NEW = "async function trackUserActivity(supabase: any, tenantId: string | null, contactEmail: string, agentId: string | null, activityType: string, activityData: any, pageUrl?: string) {"
peText = atomicReplace(peText, PE_P1_OLD, PE_P1_NEW, 'T6e-1.P1 helper signature')

// --- T6e-1.P2 — Helper body (multi-line CRLF anchor) ---
const PE_P2_OLD =
  "    await supabase.from('user_activities').insert({\r\n" +
  "      contact_email: contactEmail,\r\n" +
  "      agent_id: agentId || null,\r\n" +
  "      activity_type: activityType,\r\n" +
  "      activity_data: activityData || {},\r\n" +
  "      page_url: pageUrl || '',\r\n" +
  "    })"
const PE_P2_NEW =
  "    const { error } = await supabase.from('user_activities').insert({\r\n" +
  "      tenant_id: tenantId,\r\n" +
  "      contact_email: contactEmail,\r\n" +
  "      agent_id: agentId || null,\r\n" +
  "      activity_type: activityType,\r\n" +
  "      activity_data: activityData || {},\r\n" +
  "      page_url: pageUrl || '',\r\n" +
  "    })\r\n" +
  "    if (error) {\r\n" +
  "      console.error('[trackUserActivity] insert error:', error)\r\n" +
  "    }"
peText = atomicReplace(peText, PE_P2_OLD, PE_P2_NEW, 'T6e-1.P2 helper body')

// --- T6e-2.P3 — Caller (multi-line CRLF anchor) ---
const PE_P3_OLD =
  "    // Track activity\r\n" +
  "    await trackUserActivity(supabase, userEmail, agent?.id || null, 'contact_form', {"
const PE_P3_NEW =
  "    // Track activity\r\n" +
  "    await trackUserActivity(supabase, tenantId, userEmail, agent?.id || null, 'plan_generated', {"
peText = atomicReplace(peText, PE_P3_OLD, PE_P3_NEW, 'T6e-2.P3 caller')

// ========================================================
// charlie/lead patch (LF)
// ========================================================
let clText = clMeta0.text

const CL_P1_OLD = "//   - F57: INSERT \u2192 UPSERT keyed on (user_id, session_id, intent)."
const CL_P1_NEW = "//   - F57: INSERT \u2192 UPSERT keyed on (user_id, tenant_id, source, intent)."
clText = atomicReplace(clText, CL_P1_OLD, CL_P1_NEW, 'T6e-3.P1 L12 comment')

// ----- Write -----
fs.writeFileSync(PLAN_EMAIL, Buffer.from(peText, 'utf8'))
fs.writeFileSync(CHARLIE_LEAD, Buffer.from(clText, 'utf8'))

// ----- Post-patch verification -----
const peMeta1 = readFileWithMeta(PLAN_EMAIL)
const clMeta1 = readFileWithMeta(CHARLIE_LEAD)

console.log('')
console.log('post-patch state:')
console.log('  plan-email   : ' + peMeta1.size + ' bytes (delta +' + (peMeta1.size - peMeta0.size) + '), BOM=' + peMeta1.hasBOM + ', ' + peMeta1.lineEnding)
console.log('  charlie/lead : ' + clMeta1.size + ' bytes (delta +' + (clMeta1.size - clMeta0.size) + '), BOM=' + clMeta1.hasBOM + ', ' + clMeta1.lineEnding)

if (peMeta1.lineEnding !== 'CRLF') fail('plan-email line ending corrupted post-patch: ' + peMeta1.lineEnding)
if (clMeta1.lineEnding !== 'LF') fail('charlie/lead line ending corrupted post-patch: ' + clMeta1.lineEnding)
if (!peMeta1.hasBOM) fail('plan-email BOM lost post-patch')
if (!clMeta1.hasBOM) fail('charlie/lead BOM lost post-patch')

// ----- Adjacency checks (semantic verification) -----
if (peMeta1.text.indexOf("tenant_id: tenantId,\r\n      contact_email: contactEmail") === -1) {
  fail('post-patch adjacency: tenant_id field not preceding contact_email in helper body')
}
if (peMeta1.text.indexOf("trackUserActivity(supabase, tenantId, userEmail, agent?.id || null, 'plan_generated'") === -1) {
  fail('post-patch adjacency: caller not updated correctly')
}
if (peMeta1.text.indexOf("if (error) {\r\n      console.error('[trackUserActivity] insert error:'") === -1) {
  fail('post-patch adjacency: error capture block not present in helper body')
}
if (clMeta1.text.indexOf('(user_id, tenant_id, source, intent)') === -1) {
  fail('post-patch adjacency: L12 comment not updated correctly')
}

// ----- Confirm no surprise 'contact_form' literal remains in plan-email caller scope -----
// (it can legitimately appear elsewhere as a string; we just want the caller site clear)
if (peMeta1.text.indexOf("trackUserActivity(supabase, userEmail, agent?.id || null, 'contact_form'") !== -1) {
  fail('post-patch: legacy caller form still present (untransformed)')
}

console.log('')
console.log('=== T6e wire patch COMPLETE ===')
console.log('Backups:')
console.log('  ' + peBackup)
console.log('  ' + clBackup)
console.log('')
console.log('Next: npx tsc --noEmit')