#!/usr/bin/env node
/**
 * patch-t6f-a-fix-v2.js — T6f-A regression fix, context-aware.
 *
 * v1 fail: blanket replaceAll wrongly assumed all ${BASE_URL} were in helpers.
 * v2 fix: per-file strategy from probe classification:
 *   - charlie/lead:        replaceAll '${BASE_URL}' -> '${baseUrl}' (4 hits, all in helpers)
 *   - charlie/plan-email:  replaceAll '${BASE_URL}' -> '${baseUrl}' (4 hits, all in helper)
 *                          + 2 per-line swaps for bare BASE_URL in helper template-literal exprs (L281, L302)
 *   - charlie/appointment: 3 per-line swaps for helper hits (L293, L371, L408).
 *                          NO replaceAll: POST handler L177 has valid ${BASE_URL} that must stay.
 *
 * Atomic: pre-validate all counts/anchors, in-memory apply, post-validate
 * ${BASE_URL} counts per expected, then backup + write. Per-file LE preserved.
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

// ============================================================================
// LINE ANCHORS (verbatim from probe-classification recon)
// ============================================================================

const PL_L281_OLD = '            <a href="${b.url || BASE_URL}" style="display:block;text-decoration:none;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:6px;">'
const PL_L281_NEW = '            <a href="${b.url || baseUrl}" style="display:block;text-decoration:none;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:6px;">'

const PL_L302_OLD = '              <a href="${r.url || BASE_URL}" style="font-size:13px;font-weight:600;color:#1d4ed8;text-decoration:none;">#${r.rank} ${r.entity_name}</a>'
const PL_L302_NEW = '              <a href="${r.url || baseUrl}" style="font-size:13px;font-weight:600;color:#1d4ed8;text-decoration:none;">#${r.rank} ${r.entity_name}</a>'

const AP_L293_OLD = '        <a href="${BASE_URL}/${p.slug || p.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; text-decoration: none;">'
const AP_L293_NEW = '        <a href="${baseUrl}/${p.slug || p.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; text-decoration: none;">'

const AP_L371_OLD = '      <a href="${BASE_URL}/${p.slug || p.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; text-decoration: none;">'
const AP_L371_NEW = '      <a href="${baseUrl}/${p.slug || p.listing_key}" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; text-decoration: none;">'

const AP_L408_OLD = '          <a href="${BASE_URL}/admin-homes/leads" style="display: inline-block; padding: 10px 24px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">'
const AP_L408_NEW = '          <a href="${baseUrl}/admin-homes/leads" style="display: inline-block; padding: 10px 24px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">'

// ============================================================================
// FILE OPS
// ============================================================================

const FILES = {
  'app/api/charlie/lead/route.ts': {
    replaceAlls: [
      { name: 'lead-TL', from: '${BASE_URL}', to: '${baseUrl}', expectedPre: 4 },
    ],
    lineSwaps: [],
    expectedPost_TL: 0,
  },
  'app/api/charlie/plan-email/route.ts': {
    replaceAlls: [
      { name: 'plan-TL', from: '${BASE_URL}', to: '${baseUrl}', expectedPre: 4 },
    ],
    lineSwaps: [
      { name: 'plan-L281-bare', old: PL_L281_OLD, new: PL_L281_NEW },
      { name: 'plan-L302-bare', old: PL_L302_OLD, new: PL_L302_NEW },
    ],
    expectedPost_TL: 0,
  },
  'app/api/charlie/appointment/route.ts': {
    replaceAlls: [],
    lineSwaps: [
      { name: 'appt-L293-TL', old: AP_L293_OLD, new: AP_L293_NEW },
      { name: 'appt-L371-TL', old: AP_L371_OLD, new: AP_L371_NEW },
      { name: 'appt-L408-TL', old: AP_L408_OLD, new: AP_L408_NEW },
    ],
    expectedPost_TL: 1, // POST handler L177 rescheduleUrl ref preserved
  },
}

const TL_PATTERN = '${BASE_URL}'

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
const fileState = new Map()

for (const file of Object.keys(FILES)) {
  if (!exists(path.resolve(ROOT, file))) {
    errors.push('file not found: ' + file)
    continue
  }
  fileState.set(file, readFileLF(file))
}

if (errors.length === 0) {
  for (const [file, ops] of Object.entries(FILES)) {
    const content = fileState.get(file).content
    for (const ra of ops.replaceAlls) {
      const c = countOccurrences(content, ra.from)
      if (c !== ra.expectedPre) {
        errors.push(file + ' ' + ra.name + ': expected ' + ra.expectedPre + ' x ' + ra.from + ', found ' + c)
      }
    }
    for (const ls of ops.lineSwaps) {
      const c = countOccurrences(content, ls.old)
      if (c !== 1) {
        errors.push(file + ' ' + ls.name + ': expected 1 anchor match, found ' + c)
      }
    }
  }
}

if (errors.length > 0) {
  console.error('FAIL: pre-state validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('Pre-state validation OK.')
for (const [file, state] of fileState.entries()) {
  console.log('  ' + file + ' (LE: ' + (state.usesCRLF ? 'CRLF' : 'LF') + ')')
}

// ============================================================================
// APPLY IN-MEMORY + POST-VALIDATE
// ============================================================================

const fileNewContent = new Map()
const postErrors = []

for (const [file, ops] of Object.entries(FILES)) {
  let content = fileState.get(file).content
  for (const ra of ops.replaceAlls) content = content.split(ra.from).join(ra.to)
  for (const ls of ops.lineSwaps) content = content.replace(ls.old, ls.new)

  const postTL = countOccurrences(content, TL_PATTERN)
  if (postTL !== ops.expectedPost_TL) {
    postErrors.push(file + ': post-state ${BASE_URL} count expected ' + ops.expectedPost_TL + ', found ' + postTL)
  }
  fileNewContent.set(file, content)
}

if (postErrors.length > 0) {
  console.error('FAIL: post-state validation errors:')
  for (const e of postErrors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('\nPost-state validation OK:')
for (const [file, ops] of Object.entries(FILES)) {
  console.log('  ' + file + ': ' + countOccurrences(fileNewContent.get(file), TL_PATTERN) + ' ${BASE_URL} remaining (expected ' + ops.expectedPost_TL + ')')
}

// ============================================================================
// BACKUP + WRITE
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
  '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('\nBackup suffix: .backup_' + stamp + '\n')

for (const file of Object.keys(FILES)) {
  const absSrc = path.resolve(ROOT, file)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log('  backup: ' + path.basename(absBackup) + '  (' + file + ')')
}

for (const file of Object.keys(FILES)) {
  const { usesCRLF } = fileState.get(file)
  writeFilePreserveLE(file, fileNewContent.get(file), usesCRLF)
  console.log('  wrote:  ' + file + ' (' + (usesCRLF ? 'CRLF' : 'LF') + ')')
}

console.log('\nT6f-A regression fix v2 applied:')
console.log('  charlie/lead:        4 ${BASE_URL} -> ${baseUrl} (replaceAll, all helpers)')
console.log('  charlie/plan-email:  4 ${BASE_URL} -> ${baseUrl} (replaceAll, all helpers) + 2 bare BASE_URL -> baseUrl (line swaps)')
console.log('  charlie/appointment: 3 ${BASE_URL} -> ${baseUrl} (line swaps); L177 POST handler ref preserved')

console.log('\nNext: npx tsc --noEmit  (must be silent), then re-run both smokes.')