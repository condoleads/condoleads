// scripts/p5-2c-fix-ascii.js
// W-TERRITORY-MASTER P5.2c hygiene fix.
// Replaces 3 em dashes (U+2014) in buildings/route.ts comments with '--'.
// Atomic: all edits in memory, ASCII purity check post-write, marker checks.

const fs = require('fs')
const path = require('path')

const TARGET = 'app/api/admin-homes/territory/buildings/route.ts'

console.log('=== Read file ===')
const original = fs.readFileSync(TARGET, 'utf8')
console.log('  bytes:', Buffer.byteLength(original, 'utf8'))
console.log('  lines:', original.split(/\r?\n/).length)

const initialLineEnding = original.includes('\r\n') ? 'CRLF' : 'LF'
console.log('  line ending:', initialLineEnding)

console.log('')
console.log('=== Pre-state: locate non-ASCII chars ===')
let preCount = 0
for (let i = 0; i < original.length; i++) {
  if (original.charCodeAt(i) > 127) preCount++
}
console.log('  non-ASCII char count:', preCount)
if (preCount !== 3) {
  throw new Error('Expected exactly 3 non-ASCII chars, got ' + preCount + '. Aborting -- file shape differs from recon. Investigate.')
}

console.log('')
console.log('=== Apply edits in memory ===')

// EM DASH is U+2014. Replace globally with '--'.
const EM_DASH = '\u2014'
const next = original.split(EM_DASH).join('--')

if (next === original) {
  throw new Error('No changes made. Em dash not found in source. Aborting.')
}

console.log('  replacements made: 3 em dashes -> --')
console.log('  bytes after edits:', Buffer.byteLength(next, 'utf8'))

console.log('')
console.log('=== Post-state ASCII purity check ===')
let postCount = 0
for (let i = 0; i < next.length; i++) {
  if (next.charCodeAt(i) > 127) postCount++
}
console.log('  non-ASCII char count:', postCount)
if (postCount !== 0) {
  throw new Error('Post-state still has ' + postCount + ' non-ASCII chars. Aborting WITHOUT writing.')
}

console.log('')
console.log('=== Marker checks (verify file structure intact) ===')
const markers = [
  "// app/api/admin-homes/territory/buildings/route.ts",
  "export async function GET(request: NextRequest)",
  "const validScopes = ['area', 'municipality', 'community', 'neighbourhood']",
  "const cardMap = new Map<string, any>",
  "return NextResponse.json({ data: decorated"
]
for (const m of markers) {
  if (!next.includes(m)) {
    throw new Error('Marker missing after edits: ' + m + '. Aborting WITHOUT writing.')
  }
  console.log('  PRESENT:', m.slice(0, 60))
}

console.log('')
console.log('=== Backup + write ===')
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = TARGET + '.backup_' + ts
fs.writeFileSync(backupPath, original, 'utf8')
console.log('  backed up to:', backupPath)

fs.writeFileSync(TARGET, next, 'utf8')
console.log('  wrote:', TARGET)

console.log('')
console.log('=== Read-back verification ===')
const readBack = fs.readFileSync(TARGET, 'utf8')
let readBackNonAscii = 0
for (let i = 0; i < readBack.length; i++) {
  if (readBack.charCodeAt(i) > 127) readBackNonAscii++
}
console.log('  read-back bytes:', Buffer.byteLength(readBack, 'utf8'))
console.log('  read-back non-ASCII:', readBackNonAscii)
if (readBackNonAscii !== 0) {
  throw new Error('Read-back shows non-ASCII chars still present. Restore from backup: ' + backupPath)
}

console.log('')
console.log('=== FIX COMPLETE ===')