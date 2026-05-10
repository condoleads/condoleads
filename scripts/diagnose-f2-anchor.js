#!/usr/bin/env node
/**
 * diagnose-f2-anchor.js
 *
 * Pinpoints exactly where F2_P2_OLD diverges from the actual file content.
 * Read-only — no writes.
 */

const fs = require('fs')

const j = (...lines) => lines.join('\n')

// Verbatim copy of F2_P2_OLD from patch-t3b-wire-and-tracker-v7.js
const F2_P2_OLD = j(
  "    if (userEmail) {",
  "      const { error: leadError } = await supabase.from('leads').insert({",
  "        agent_id: agent?.id || null,",
  "        user_id: session.user_id || null,",
  "        tenant_id: tenantId,",
  "        manager_id: chainManagerId,",
  "        area_manager_id: chainAreaManagerId,",
  "        tenant_admin_id: chainTenantAdminId,",
  "        contact_name: userName,",
  "        contact_email: userEmail,",
  "        contact_phone: userPhone || null,",
  "        source: `${sourceKey}_charlie_vip_request`,",
  "        intent: planType || 'buyer',",
  "        status: 'new',",
  "        quality: 'hot',",
  "        assignment_source: agent?.id ? 'geo' : 'admin',",
  "      })",
  "      if (leadError) console.error('[walliam/vip-request] lead error:', leadError)",
  "    }"
)

const filePath = 'app/api/walliam/charlie/vip-request/route.ts'
const file = fs.readFileSync(filePath, 'utf8')

console.log('Anchor length    :', F2_P2_OLD.length)
console.log('File length      :', file.length)
console.log('Anchor in file?  :', file.includes(F2_P2_OLD))
console.log('')

// Try CRLF normalization
const fileLF = file.replace(/\r\n/g, '\n')
console.log('After CRLF→LF normalize, anchor in file?:', fileLF.includes(F2_P2_OLD))
console.log('File contains \\r?:', file.includes('\r'))
console.log('')

// Find anchor start in file
const startIdx = file.indexOf('    if (userEmail) {')
if (startIdx === -1) {
  console.log('FAIL: could not find anchor start "    if (userEmail) {" in file')
  process.exit(1)
}
console.log('Anchor start index in file:', startIdx)

// Slice file to same length as anchor + 100 char buffer
const fileSlice = file.slice(startIdx, startIdx + F2_P2_OLD.length + 100)

// Find first divergence char-by-char
let i = 0
while (i < F2_P2_OLD.length && i < fileSlice.length && F2_P2_OLD[i] === fileSlice[i]) i++

if (i === F2_P2_OLD.length) {
  console.log('Anchor matches file slice fully through anchor length. Should not have failed.')
  console.log('First 50 chars after anchor in file:', JSON.stringify(fileSlice.slice(F2_P2_OLD.length, F2_P2_OLD.length + 50)))
  process.exit(0)
}

console.log('')
console.log('=== FIRST DIVERGENCE ===')
console.log('Index           :', i)
console.log('Anchor char     :', JSON.stringify(F2_P2_OLD[i]), 'code:', F2_P2_OLD.charCodeAt(i))
console.log('File char       :', JSON.stringify(fileSlice[i]), 'code:', fileSlice.charCodeAt(i))
console.log('')
console.log('=== CONTEXT (40 chars before, 40 after divergence) ===')
const ctxStart = Math.max(0, i - 40)
const ctxEnd = Math.min(F2_P2_OLD.length, i + 40)
console.log('Anchor context  :', JSON.stringify(F2_P2_OLD.slice(ctxStart, ctxEnd)))
console.log('File context    :', JSON.stringify(fileSlice.slice(ctxStart, Math.min(fileSlice.length, i + 40))))
console.log('')
console.log('=== HEX DUMP (10 bytes each side of divergence) ===')
const hexStart = Math.max(0, i - 10)
const hexEnd = Math.min(i + 10, F2_P2_OLD.length, fileSlice.length)
console.log('Anchor bytes    :', Array.from(F2_P2_OLD.slice(hexStart, hexEnd)).map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join(' '))
console.log('File bytes      :', Array.from(fileSlice.slice(hexStart, hexEnd)).map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join(' '))