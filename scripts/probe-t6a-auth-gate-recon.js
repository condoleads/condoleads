#!/usr/bin/env node
/**
 * probe-t6a-auth-gate-recon.js
 *
 * Read-only. For each of the 5 routes in F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-
 * WALLIAM-SOURCE, locate the auth-gate code block(s) that hardcode the
 * 'walliam' source comparison and dump surrounding context.
 *
 * Also captures:
 *   - Per-file line endings (LF vs CRLF) — informs the patch script's IO model
 *   - All references to `source_key` (or `tenants.source_key`) in the file —
 *     shows whether the route already reads tenant config (or needs to start)
 *   - The route's `tenantId`/`userId`/`sessionId` variable bindings at the
 *     auth-gate site — informs the helper's call signature at each call point
 *
 * No writes. No mutations. No side effects.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const TARGETS = [
  { path: 'app/api/charlie/lead/route.ts',                          knownLine: 84,  variant: ".eq('source', 'walliam')" },
  { path: 'app/api/charlie/plan-email/route.ts',                    knownLine: 64,  variant: ".eq('source', 'walliam')" },
  { path: 'app/api/charlie/appointment/route.ts',                   knownLine: 88,  variant: ".eq('source', 'walliam')" },
  { path: 'app/api/walliam/estimator/session/route.ts',             knownLine: 100, variant: ".eq('source', 'walliam')" },
  { path: 'app/api/walliam/estimator/vip-request/route.ts',         knownLine: 75,  variant: "session.source !== 'walliam'" },
]

const CONTEXT_BEFORE = 12   // lines before the hit (capture function signature + early variable bindings)
const CONTEXT_AFTER  = 25   // lines after the hit (capture the rest of the auth-gate block)

function readFileLF(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}

function exists(p) { try { fs.accessSync(p); return true } catch { return false } }

console.log('=== T6a Auth-Gate Recon ===')
console.log('Target: F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE')
console.log('Read-only. No writes performed.')
console.log('')

const summary = []

for (const t of TARGETS) {
  console.log('')
  console.log('===========================================================================')
  console.log('FILE: ' + t.path)
  console.log('Tracker says: line ~' + t.knownLine + ', pattern: ' + t.variant)
  console.log('===========================================================================')

  if (!exists(path.resolve(ROOT, t.path))) {
    console.log('SKIP: file not found at ' + t.path)
    summary.push({ path: t.path, status: 'MISSING' })
    continue
  }

  const { content, usesCRLF } = readFileLF(t.path)
  const lines = content.split('\n')

  console.log('Line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))
  console.log('Total lines : ' + lines.length)
  console.log('')

  // Pass 1: locate every line containing the 'walliam' literal anywhere in code
  // (catches both `.eq('source', 'walliam')` and `session.source !== 'walliam'` variants)
  const walliamHits = []
  for (let i = 0; i < lines.length; i++) {
    // Match 'walliam' as a string literal — single OR double quoted.
    // We skip comments to avoid noise.
    const L = lines[i]
    if (/['"]walliam['"]/.test(L) && !/^\s*\/\//.test(L) && !/^\s*\*/.test(L)) {
      walliamHits.push(i + 1)
    }
  }

  console.log('--- Pass 1: lines containing \'walliam\' or "walliam" (excl. comments) ---')
  console.log('Hits at lines: ' + (walliamHits.length ? walliamHits.join(', ') : '(none)'))

  // Pass 2: locate every reference to source_key (already-multitenant routes
  // already read this; routes without it are the ones we're refactoring)
  const sourceKeyHits = []
  for (let i = 0; i < lines.length; i++) {
    if (/source_key/.test(lines[i])) sourceKeyHits.push(i + 1)
  }
  console.log('--- Pass 2: lines referencing `source_key` ---')
  console.log('Hits at lines: ' + (sourceKeyHits.length ? sourceKeyHits.join(', ') : '(none)'))

  // Pass 3: locate tenantId / tenant_id variable bindings near function entry
  // (so we know what's in scope when we call validateSession)
  const tenantHits = []
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (/\btenant(?:_)?[Ii]d\b/.test(lines[i])) tenantHits.push(i + 1)
  }
  console.log('--- Pass 3: tenantId / tenant_id references in first 80 lines ---')
  console.log('Hits at lines: ' + (tenantHits.length ? tenantHits.slice(0, 15).join(', ') + (tenantHits.length > 15 ? ' (+' + (tenantHits.length - 15) + ' more)' : '') : '(none)'))

  // Pass 4: dump context around every 'walliam' literal hit
  console.log('')
  console.log('--- Pass 4: context around each walliam-literal hit ---')

  if (walliamHits.length === 0) {
    console.log('(no hits — auth gate may have already been refactored or moved)')
    summary.push({ path: t.path, status: 'NO_HITS', usesCRLF, sourceKeyHits })
    continue
  }

  for (const lineNum of walliamHits) {
    const center = lineNum - 1
    const from = Math.max(0, center - CONTEXT_BEFORE)
    const to = Math.min(lines.length, center + CONTEXT_AFTER + 1)
    console.log('')
    console.log('  ----- lines ' + (from + 1) + '..' + to + ' (centered on ' + lineNum + ') -----')
    for (let i = from; i < to; i++) {
      const marker = (i + 1 === lineNum) ? '>' : ' '
      console.log('  ' + marker + ' ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
    }
  }

  summary.push({
    path: t.path,
    status: 'OK',
    usesCRLF,
    walliamHits,
    sourceKeyHits,
    tenantRefs: tenantHits.length,
  })
}

// ============================================================================
// Reference probe: how does the multitenant-clean route do it?
// F-WELCOME-IS-MULTITENANT-EXEMPLAR points at app/api/email/welcome/route.ts
// We dump its source_key access pattern so the helper can mirror it.
// ============================================================================

console.log('')
console.log('===========================================================================')
console.log('REFERENCE: app/api/email/welcome/route.ts (F-WELCOME-IS-MULTITENANT-EXEMPLAR)')
console.log('===========================================================================')

const REF = 'app/api/email/welcome/route.ts'
if (exists(path.resolve(ROOT, REF))) {
  const { content, usesCRLF } = readFileLF(REF)
  const lines = content.split('\n')
  console.log('Line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))
  console.log('Total lines : ' + lines.length)
  console.log('')

  // Find source_key references and dump ±8 lines around each
  const refHits = []
  for (let i = 0; i < lines.length; i++) {
    if (/source_key/.test(lines[i])) refHits.push(i + 1)
  }
  console.log('source_key references at lines: ' + (refHits.length ? refHits.join(', ') : '(none)'))
  console.log('')

  for (const lineNum of refHits) {
    const center = lineNum - 1
    const from = Math.max(0, center - 8)
    const to = Math.min(lines.length, center + 12)
    console.log('  ----- lines ' + (from + 1) + '..' + to + ' (centered on ' + lineNum + ') -----')
    for (let i = from; i < to; i++) {
      const marker = (i + 1 === lineNum) ? '>' : ' '
      console.log('  ' + marker + ' ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
    }
    console.log('')
  }
} else {
  console.log('SKIP: ' + REF + ' not found — will fall back to tenants schema inspection if helper design needs it')
}

// ============================================================================
// Final summary
// ============================================================================

console.log('')
console.log('===========================================================================')
console.log('SUMMARY')
console.log('===========================================================================')
for (const s of summary) {
  if (s.status === 'OK') {
    console.log('  ' + s.path)
    console.log('    LE: ' + (s.usesCRLF ? 'CRLF' : 'LF') + ' | walliam-hits: ' + s.walliamHits.join(',') +
                ' | source_key-hits: ' + (s.sourceKeyHits.length ? s.sourceKeyHits.join(',') : 'NONE (needs to be added)') +
                ' | tenantRefs in first 80L: ' + s.tenantRefs)
  } else {
    console.log('  ' + s.path + ' — ' + s.status)
  }
}

console.log('')
console.log('=== END PROBE ===')
console.log('Paste the entire output. Next turn delivers:')
console.log('  1. lib/utils/validate-session.ts (new helper)')
console.log('  2. patch-t6a-wire.js (precise anchors per route, CRLF-aware atomic patch)')
console.log('  3. smoke extension if needed (tenant-mismatch rejection assertion)')