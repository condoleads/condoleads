#!/usr/bin/env node
/**
 * probe-t6a-route-tops.js
 *
 * Read-only follow-up to probe-t6a-auth-gate-recon.js.
 * Dumps lines 1..55 of each of the 5 T6a target routes so the next-turn
 * patch can design the validateSession helper signature correctly.
 *
 * Specifically targets:
 *   - Where each route resolves tenantId / sessionId / userId
 *   - Whether tenantId is in scope at the auth-gate site
 *   - Existing imports (so the helper import insertion point is known)
 *
 * No writes. No mutations.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const TARGETS = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
]

const HEAD_LINES = 55

function readFileLF(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}

function exists(p) { try { fs.accessSync(p); return true } catch { return false } }

console.log('=== T6a Route-Tops Probe ===')
console.log('Read-only. Dumping lines 1..' + HEAD_LINES + ' of each T6a target.')
console.log('')

for (const t of TARGETS) {
  console.log('')
  console.log('===========================================================================')
  console.log('FILE: ' + t)
  console.log('===========================================================================')

  if (!exists(path.resolve(ROOT, t))) {
    console.log('SKIP: file not found')
    continue
  }

  const { content, usesCRLF } = readFileLF(t)
  const lines = content.split('\n')
  const dumpTo = Math.min(lines.length, HEAD_LINES)

  console.log('Line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))
  console.log('Total lines : ' + lines.length)
  console.log('Dumping lines 1..' + dumpTo + ':')
  console.log('')

  for (let i = 0; i < dumpTo; i++) {
    console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
  }
}

console.log('')
console.log('=== END PROBE ===')
console.log('Paste the entire output. Next turn delivers:')
console.log('  1. lib/utils/validate-session.ts (helper with signature designed to fit all 3 shapes)')
console.log('  2. patch-t6a-wire.js (5-route patch: 3 helper-using + 2 custom shape-B/shape-C)')
console.log('  3. smoke-t3b/t3c extension OR new smoke-t6a.js for tenant-mismatch rejection')
console.log('  4. patch-w-leads-email-tracker-v13.js for T6a CLOSED bookkeeping')