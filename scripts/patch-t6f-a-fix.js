#!/usr/bin/env node
/**
 * patch-t6f-a-fix.js — T6f-A regression fix.
 *
 * Fixes 13 TSC errors caused by patch-t6f-a-wire.js removing the module-level
 * BASE_URL constant without updating the ${BASE_URL} template-literal
 * references that remained inside email-builder helper bodies. The handler-
 * local BASE_URL is out of scope for module-level helpers; the correct
 * referent is the destructured `baseUrl` param the wire patch added to each
 * helper signature.
 *
 * Strategy: per-file replaceAll('${BASE_URL}', '${baseUrl}') with strict
 * count validation. Expected counts per file derived from TSC errors:
 *   charlie/lead:        4 hits (L362, L438, L513, L525)
 *   charlie/plan-email:  6 hits (L281, L302, L492, L531, L559, L638)
 *   charlie/appointment: 3 hits (L293, L371, L408)
 *
 * Why replaceAll is safe (and not over-broad): POST handlers do NOT contain
 * any `${BASE_URL}` template-literal references — they reference BASE_URL
 * only as a bare identifier when passing to helpers (`baseUrl: BASE_URL`).
 * The pattern `${BASE_URL}` therefore only appears inside helper bodies,
 * where the destructured `baseUrl` param is in scope.
 *
 * Atomic gate: pre-state count must equal expected per file. Post-state
 * count of `${BASE_URL}` must be 0. Any mismatch aborts without writing.
 *
 * Per-file LE preserved. Timestamped backups on every modified file.
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function readFileLF(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}
function writeFilePreserveLE(p, contentLF, usesCRLF) {
  const out = usesCRLF ? contentLF.replace(/\n/g, '\r\n') : contentLF
  fs.writeFileSync(path.resolve(ROOT, p), out, 'utf8')
}
function exists(p) { try { fs.accessSync(p); return true } catch { return false } }
function countOccurrences(text, needle) { return text.split(needle).length - 1 }

const NEEDLE = '${BASE_URL}'
const REPLACEMENT = '${baseUrl}'

const FILE_EXPECTED = {
  'app/api/charlie/lead/route.ts':              4,
  'app/api/charlie/plan-email/route.ts':        6,
  'app/api/charlie/appointment/route.ts':       3,
}

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
const fileState = new Map()

for (const [file, expected] of Object.entries(FILE_EXPECTED)) {
  if (!exists(path.resolve(ROOT, file))) {
    errors.push('file not found: ' + file)
    continue
  }
  const state = readFileLF(file)
  fileState.set(file, state)
  const count = countOccurrences(state.content, NEEDLE)
  if (count !== expected) {
    errors.push(file + ': expected ' + expected + ' occurrences of ' + NEEDLE + ', found ' + count)
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('Pre-state validation:')
for (const [file, expected] of Object.entries(FILE_EXPECTED)) {
  console.log('  ' + file + ': ' + expected + ' x ' + NEEDLE + '  (LE: ' + (fileState.get(file).usesCRLF ? 'CRLF' : 'LF') + ')')
}

// ============================================================================
// APPLY (in-memory replaceAll + post-state check)
// ============================================================================

const fileNewContent = new Map()
const postErrors = []

for (const [file, expected] of Object.entries(FILE_EXPECTED)) {
  const state = fileState.get(file)
  const newContent = state.content.split(NEEDLE).join(REPLACEMENT)
  const postCount = countOccurrences(newContent, NEEDLE)
  if (postCount !== 0) {
    postErrors.push(file + ': post-state ${BASE_URL} count expected 0, found ' + postCount)
  }
  const newBaseUrlCount = countOccurrences(newContent, REPLACEMENT)
  const oldBaseUrlCount = countOccurrences(state.content, REPLACEMENT)
  const delta = newBaseUrlCount - oldBaseUrlCount
  if (delta !== expected) {
    postErrors.push(file + ': ${baseUrl} count grew by ' + delta + ', expected ' + expected)
  }
  fileNewContent.set(file, newContent)
}

if (postErrors.length > 0) {
  console.error('FAIL: post-state validation errors:')
  for (const e of postErrors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('\nPost-state validation: all 3 files clean (0 remaining ${BASE_URL}, +' +
            Object.values(FILE_EXPECTED).reduce((a,b)=>a+b,0) + ' new ${baseUrl})')

// ============================================================================
// BACKUP + WRITE
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
  '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('\nBackup suffix: .backup_' + stamp + '\n')

for (const file of Object.keys(FILE_EXPECTED)) {
  const absSrc = path.resolve(ROOT, file)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log('  backup: ' + path.basename(absBackup) + '  (' + file + ')')
}

for (const file of Object.keys(FILE_EXPECTED)) {
  const { usesCRLF } = fileState.get(file)
  writeFilePreserveLE(file, fileNewContent.get(file), usesCRLF)
  console.log('  wrote:  ' + file + ' (' + (usesCRLF ? 'CRLF' : 'LF') + ')')
}

console.log('\nT6f-A regression fix applied: 13 ${BASE_URL} -> ${baseUrl} swaps across 3 files.')
console.log('\nNext steps:')
console.log('  1. npx tsc --noEmit  (must be silent)')
console.log('  2. node scripts/smoke-t3b.js  (must be 4/4 GREEN)')
console.log('  3. node scripts/smoke-t3c.js  (must be 5/5 GREEN)')