#!/usr/bin/env node
/**
 * patch-t6f-b-2-session-wire.js — T6f-B-2: brand-strings + URL refactor
 * for app/api/walliam/estimator/session/route.ts.
 *
 * 5 atomic anchors. Per-file LE + BOM preserved (this route: CRLF + BOM).
 *
 * Pattern: Shape B/C — route loads tenant directly via x-tenant-id header
 * (Shape C — no validateSession). Existing SELECT extended with brand_name +
 * name + domain. brandName + baseUrl declared at function scope right after
 * tenant null-check (before estimator_nonai_enabled gate, both checks now
 * see brandName/baseUrl in scope). agentName fallback at L86 and inline
 * NEXT_PUBLIC_APP_URL at L191 substituted.
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'app/api/walliam/estimator/session/route.ts'

function readFile(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const hasBOM = raw.charCodeAt(0) === 0xFEFF
  let content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  if (hasBOM) content = content.slice(1)
  return { content, usesCRLF, hasBOM }
}

function writeFile(p, contentLF, usesCRLF, hasBOM) {
  let out = usesCRLF ? contentLF.replace(/\n/g, '\r\n') : contentLF
  if (hasBOM) out = '\uFEFF' + out
  fs.writeFileSync(path.resolve(ROOT, p), out, 'utf8')
}

function count(text, needle) { return text.split(needle).length - 1 }
function exists(p) { try { fs.accessSync(p); return true } catch { return false } }

// ============================================================================
// P1: import buildBaseUrl from tenant-brand helper
// ============================================================================

const P1_OLD =
  "import { NextRequest, NextResponse } from 'next/server'\n" +
  "import { createClient } from '@supabase/supabase-js'"

const P1_NEW =
  "import { NextRequest, NextResponse } from 'next/server'\n" +
  "import { createClient } from '@supabase/supabase-js'\n" +
  "import { buildBaseUrl } from '@/lib/utils/tenant-brand'"

// ============================================================================
// P2: extend tenant SELECT (multi-line backtick template)
// ============================================================================

const P2_OLD =
  '        source_key\n' +
  '      `)'

const P2_NEW =
  '        source_key,\n' +
  '        brand_name,\n' +
  '        name,\n' +
  '        domain\n' +
  '      `)'

// ============================================================================
// P3: brandName + baseUrl derivation post tenant-null-check
// ============================================================================

const P3_OLD =
  '    if (tenantError || !tenant) {\n' +
  "      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })\n" +
  '    }\n' +
  '\n' +
  '    if (!tenant.estimator_nonai_enabled) {'

const P3_NEW =
  '    if (tenantError || !tenant) {\n' +
  "      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })\n" +
  '    }\n' +
  '\n' +
  "    const brandName: string = (tenant.brand_name || tenant.name) ?? ''  // T6f-B — multitenant brand-string (empty fallback for unhappy-path safety)\n" +
  '    const baseUrl: string = buildBaseUrl(tenant.domain)  // T6f-B — multitenant URL fallback\n' +
  '\n' +
  '    if (!tenant.estimator_nonai_enabled) {'

// ============================================================================
// P4: L86 agentName fallback
// ============================================================================

const P4_OLD = "    let agentName = 'WALLiam'"
const P4_NEW = '    let agentName = brandName'

// ============================================================================
// P5: L191 inline URL → baseUrl
// ============================================================================

const P5_OLD =
  "      fetch(new URL('/api/email/low-credits', process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca').toString(), {"

const P5_NEW =
  "      fetch(new URL('/api/email/low-credits', baseUrl).toString(), {"

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
if (!exists(F)) errors.push('file not found: ' + F)

let state = null
if (errors.length === 0) {
  state = readFile(F)

  const singles = [
    ['P1', P1_OLD], ['P2', P2_OLD], ['P3', P3_OLD], ['P4', P4_OLD], ['P5', P5_OLD],
  ]
  for (const [name, old] of singles) {
    const c = count(state.content, old)
    if (c !== 1) errors.push(name + ': expected 1 match, found ' + c)
  }

  // Idempotence check (T6f-B marker introduced by P3)
  if (state.content.includes('T6f-B — multitenant brand-string')) {
    errors.push('T6f-B marker already present in this file (re-run after partial state?)')
  }

  // BOM expected
  if (!state.hasBOM) {
    errors.push('expected BOM (per probe — session route has UTF-8 BOM); detected no-BOM. Aborting to avoid LE/encoding drift.')
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 5 anchors validated. LE: ' + (state.usesCRLF ? 'CRLF' : 'LF') + ' | ' + (state.hasBOM ? 'BOM' : 'no-BOM'))

// ============================================================================
// BACKUP + APPLY + WRITE
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
  '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('Backup suffix: .backup_' + stamp)

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup) + '  (' + F + ')')

let working = state.content
working = working.replace(P1_OLD, P1_NEW); console.log('  applied: P1 import buildBaseUrl')
working = working.replace(P2_OLD, P2_NEW); console.log('  applied: P2 SELECT extension (+brand_name, name, domain)')
working = working.replace(P3_OLD, P3_NEW); console.log('  applied: P3 brandName + baseUrl derivation post tenant-null-check')
working = working.replace(P4_OLD, P4_NEW); console.log('  applied: P4 agentName fallback (WALLiam -> brandName)')
working = working.replace(P5_OLD, P5_NEW); console.log('  applied: P5 inline URL -> baseUrl in low-credits fetch')

// Post-state assertions
const postWalliamLit = count(working, "'WALLiam'")
if (postWalliamLit !== 0) {
  console.error('POST-STATE FAIL: \'WALLiam\' literal still present (' + postWalliamLit + ' refs) — patch incomplete')
  process.exit(1)
}
const postEnvUrl = count(working, "process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'")
if (postEnvUrl !== 0) {
  console.error('POST-STATE FAIL: inline NEXT_PUBLIC_APP_URL fallback still present (' + postEnvUrl + ' refs) — patch incomplete')
  process.exit(1)
}

writeFile(F, working, state.usesCRLF, state.hasBOM)
const delta = working.length - state.content.length
console.log('  wrote: ' + F + ' (' + (state.usesCRLF ? 'CRLF' : 'LF') + ' + ' + (state.hasBOM ? 'BOM' : 'no-BOM') + ', delta ' + (delta >= 0 ? '+' : '') + delta + ' chars)')

console.log('')
console.log('T6f-B-2 wire patch applied: 5 atomic anchors.')