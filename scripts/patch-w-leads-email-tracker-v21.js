// scripts/patch-w-leads-email-tracker-v21.js
// W-LEADS-EMAIL tracker v20 -> v21 close (T7 phase FULLY CLOSED).
// Payload arrives via 4 env vars (base64-encoded UTF-8): P1_OLD_B64, P1_NEW_B64, P2_OLD_B64, P2_NEW_B64.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TRACKER = path.join(ROOT, 'docs/W-LEADS-EMAIL-TRACKER.md')

function fail(msg) { console.error('FAIL:', msg); process.exit(1) }
function decode(b64) { return Buffer.from(b64, 'base64').toString('utf8') }
function countOcc(s, n) { let c = 0, i = 0; while ((i = s.indexOf(n, i)) !== -1) { c++; i += n.length } return c }
function ts() {
  const d = new Date(); const pad = n => String(n).padStart(2, '0')
  return d.getFullYear().toString() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

for (const k of ['P1_OLD_B64','P1_NEW_B64','P2_OLD_B64','P2_NEW_B64']) {
  if (!process.env[k]) fail('env var ' + k + ' not set')
}

const P1_OLD = decode(process.env.P1_OLD_B64)
const P1_NEW = decode(process.env.P1_NEW_B64)
const P2_OLD = decode(process.env.P2_OLD_B64)
const P2_NEW = decode(process.env.P2_NEW_B64)

// Read with binary fidelity
const buf = fs.readFileSync(TRACKER)
const hasBOM = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
const text = buf.toString('utf8')

let crlf = 0, lf = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0A) { if (i > 0 && buf[i-1] === 0x0D) crlf++; else lf++ }
}
const LE = (crlf > 0 && lf === 0) ? 'CRLF' : (crlf === 0 && lf > 0) ? 'LF' : 'MIXED'
console.log('Pre-state: bytes=' + buf.length + ' BOM=' + hasBOM + ' LE=' + LE + ' (CRLF=' + crlf + ' LF=' + lf + ')')

// Pre-state guards
if (text.indexOf('Version:** v21') >= 0) fail('v21 marker already in tracker (re-run after partial state?)')
if (text.indexOf('Version:** v20') < 0) fail('v20 marker NOT found (wrong file state?)')

// Anchor validation
const c1 = countOcc(text, P1_OLD)
if (c1 !== 1) fail('P1 anchor (version header): expected 1 match, found ' + c1)
const c2 = countOcc(text, P2_OLD)
if (c2 !== 1) fail('P2 anchor (v20 entry start): expected 1 match, found ' + c2)
console.log('Anchors validated: P1=1x P2=1x')

// Compute expected byte delta
const expectedDelta = (Buffer.byteLength(P1_NEW,'utf8') - Buffer.byteLength(P1_OLD,'utf8'))
                    + (Buffer.byteLength(P2_NEW,'utf8') - Buffer.byteLength(P2_OLD,'utf8'))
console.log('Expected byte delta: +' + expectedDelta)

// Backup
const stamp = ts()
const backup = TRACKER + '.backup_' + stamp
fs.copyFileSync(TRACKER, backup)
console.log('Backup: ' + path.basename(backup))

// Apply
let newText = text.replace(P1_OLD, P1_NEW).replace(P2_OLD, P2_NEW)

// Post-state guards
if (newText.indexOf('Version:** v21') < 0) fail('post-patch: v21 marker missing (P1 did not apply)')
if (newText.indexOf('Version:** v20') >= 0) fail('post-patch: v20 marker still present (P1 did not replace)')
const v21Refs = countOcc(newText, 'v21 T7 CLOSED')
if (v21Refs < 2) fail('post-patch: expected >=2 refs to "v21 T7 CLOSED" (header + entry), found ' + v21Refs)
console.log('Post-state guards passed: v21 marker present, v20 marker absent, v21Refs=' + v21Refs)

// Re-encode and verify byte delta + LE preservation
const newBuf = Buffer.from(newText, 'utf8')
let crlf2 = 0, lf2 = 0
for (let i = 0; i < newBuf.length; i++) {
  if (newBuf[i] === 0x0A) { if (i > 0 && newBuf[i-1] === 0x0D) crlf2++; else lf2++ }
}
const newLE = (crlf2 > 0 && lf2 === 0) ? 'CRLF' : (crlf2 === 0 && lf2 > 0) ? 'LF' : 'MIXED'
if (newLE !== LE) fail('LE drift: was ' + LE + ', now ' + newLE)

const newHasBOM = newBuf.length >= 3 && newBuf[0] === 0xEF && newBuf[1] === 0xBB && newBuf[2] === 0xBF
if (newHasBOM !== hasBOM) fail('BOM state drifted: was ' + hasBOM + ', now ' + newHasBOM)

const actualDelta = newBuf.length - buf.length
if (Math.abs(actualDelta - expectedDelta) > 4) fail('byte delta mismatch: actual=' + actualDelta + ' expected=' + expectedDelta)
console.log('Post-state: bytes=' + newBuf.length + ' (delta +' + actualDelta + ') BOM=' + newHasBOM + ' LE=' + newLE)

// Write
fs.writeFileSync(TRACKER, newBuf)
console.log('Tracker patched and written.')