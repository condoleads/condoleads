#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w5c-1-resolveuser-agentid-leak.js
 *
 * fix(W-LEADS-WORKBENCH W5c-1): F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW
 *
 * Edits 1 file:
 *   lib/admin-homes/auth.ts (1 anchor)
 *     - Rename `const { data: agent }` -> `const { data: rawAgent }`
 *     - Inject Universal-view guard:
 *         const agent = (!effectiveTenantId && isPlatformAdmin) ? null : rawAgent
 *
 * Behavior:
 *   - Platform admin in Universal view (no cookie + no x-tenant-id header
 *     + no home tenant)  ->  effectiveTenantId === null, isPlatformAdmin === true
 *     ->  agent forced to null
 *     ->  synthetic admin path returns { agentId: null, role: 'admin', ... }
 *     ->  no cross-tenant agentId leak.
 *   - Platform admin with specific tenant selected  ->  unaffected (effectiveTenantId
 *     is truthy, guard is false, rawAgent used as-is).
 *   - Non-platform user with no tenant context (legacy condoleads.ca standalone
 *     agents like Shah)  ->  unaffected (isPlatformAdmin is false, guard is false,
 *     rawAgent used as-is; tenant_id IS NULL agent row matched correctly).
 *   - Non-platform user with tenant context  ->  unaffected.
 *
 * Multi-tenant safety: this is the FIX FOR a multi-tenant safety issue. After this
 * patch, the resolveAdminHomesUser surface is provably tenant-safe for every
 * (effectiveTenantId, isPlatformAdmin) combination -- no implicit cross-tenant
 * fallback path remains for platform admins.
 *
 * No regressions:
 *   - Synthetic admin path already exists and handles agent=null for platform
 *     admins. We do not modify that path.
 *   - All downstream uses of `agent.id`, `agent.role`, `agent.full_name`,
 *     `agent.parent_id` are gated on `if (!agent) { ... return ... }` which
 *     remains in place; TypeScript narrows correctly.
 *   - Non-platform user paths unchanged (guard is platform-admin-specific).
 *
 * Idempotent (skips if 'W5c-1: F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW'
 * marker already present in auth.ts).
 *
 * LE detection per file. Backup before write. LE re-verify on disk after write.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'lib', 'admin-homes', 'auth.ts')

const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

if (!fs.existsSync(FILE)) {
  throw new Error('auth.ts missing: ' + FILE)
}

function detectLE(filepath) {
  const b = fs.readFileSync(filepath)
  let crlf = 0
  let lf = 0
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x0a) {
      if (i > 0 && b[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  if (crlf > 0 && lf > 0) {
    throw new Error('mixed LE in ' + filepath + ': crlf=' + crlf + ', lf=' + lf)
  }
  return { LE: crlf > 0 ? 'crlf' : 'lf', text: b.toString('utf8') }
}

function withLE(s, LE) {
  if (LE === 'crlf') {
    return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
  }
  return s
}

const info = detectLE(FILE)
console.log('auth.ts LE: ' + info.LE)

const MARKER = 'W5c-1: F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW'
if (info.text.indexOf(MARKER) !== -1) {
  console.log('SKIP: W5c-1 marker present. No-op.')
  process.exit(0)
}

let text = info.text

const OLD =
  '  let agentQuery = supabase\n' +
  '    .from(\'agents\')\n' +
  '    .select(\'id, full_name, parent_id, tenant_id, role\')\n' +
  '    .eq(\'user_id\', user.id)\n' +
  '\n' +
  '  if (effectiveTenantId) {\n' +
  '    agentQuery = agentQuery.eq(\'tenant_id\', effectiveTenantId)\n' +
  '  }\n' +
  '\n' +
  '  const { data: agent } = await agentQuery.maybeSingle()'

const NEW =
  '  let agentQuery = supabase\n' +
  '    .from(\'agents\')\n' +
  '    .select(\'id, full_name, parent_id, tenant_id, role\')\n' +
  '    .eq(\'user_id\', user.id)\n' +
  '\n' +
  '  if (effectiveTenantId) {\n' +
  '    agentQuery = agentQuery.eq(\'tenant_id\', effectiveTenantId)\n' +
  '  }\n' +
  '\n' +
  '  const { data: rawAgent } = await agentQuery.maybeSingle()\n' +
  '\n' +
  '  // W5c-1: F-RESOLVEUSER-AGENTID-CROSS-TENANT-LEAK-IN-CROSS-VIEW fix.\n' +
  '  // Universal-view edge case: when a platform admin has no effective tenant scope\n' +
  '  // (no platform_tenant_override cookie + no x-tenant-id header + no home tenant),\n' +
  '  // effectiveTenantId is null and the agent query above lacks .eq(\'tenant_id\', ...).\n' +
  '  // If the platform admin happens to have an agents row in any tenant (e.g., seeded\n' +
  '  // as an agent in tenant #2 for testing), .maybeSingle() may return that row and\n' +
  '  // user.agentId becomes cross-tenant-leaked. Force agent=null in this state so the\n' +
  '  // synthetic admin path below returns agentId=null. Non-platform users with no\n' +
  '  // tenant context (legacy condoleads.ca standalone agents like Shah) are unaffected:\n' +
  '  // they keep their unscoped lookup which correctly matches their tenant_id IS NULL\n' +
  '  // agent row.\n' +
  '  const agent = (!effectiveTenantId && isPlatformAdmin) ? null : rawAgent'

const oldNorm = withLE(OLD, info.LE)
const newNorm = withLE(NEW, info.LE)

const count = text.split(oldNorm).length - 1
if (count !== 1) {
  throw new Error('agent-query anchor count ' + count + ' != 1 (expected exactly one match)')
}

text = text.replace(oldNorm, newNorm)

// Post-patch assertions
if (text.indexOf(MARKER) === -1) {
  throw new Error('post-patch: W5c-1 marker missing')
}
if (text.indexOf('const { data: rawAgent } = await agentQuery.maybeSingle()') === -1) {
  throw new Error('post-patch: rawAgent destructure missing')
}
if (text.indexOf('const agent = (!effectiveTenantId && isPlatformAdmin) ? null : rawAgent') === -1) {
  throw new Error('post-patch: Universal-view guard missing')
}
// The OLD `const { data: agent }` pattern must be gone (replaced by rawAgent).
if (text.indexOf('const { data: agent } = await agentQuery.maybeSingle()') !== -1) {
  throw new Error('post-patch: old `data: agent` destructure still present (replacement failed)')
}
// Synthetic admin path must still be present and unchanged.
if (text.indexOf('// ───── Synthetic admin path:') === -1 &&
    text.indexOf('Synthetic admin path:') === -1) {
  throw new Error('post-patch: synthetic admin path comment missing (unexpected file shape)')
}
if (text.indexOf('if (!agent) {') === -1) {
  throw new Error('post-patch: `if (!agent)` synthetic path guard missing')
}

// LE preservation
if (info.LE === 'lf' && text.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF auth.ts')
}

// Backup + write
fs.copyFileSync(FILE, FILE + '.backup_' + stamp)
fs.writeFileSync(FILE, text, 'utf8')

// Re-verify LE on disk
const postBuf = fs.readFileSync(FILE)
let postCrlf = 0
let postLf = 0
for (let i = 0; i < postBuf.length; i++) {
  if (postBuf[i] === 0x0a) {
    if (i > 0 && postBuf[i - 1] === 0x0d) postCrlf++
    else postLf++
  }
}
if (info.LE === 'lf' && postCrlf > 0) {
  throw new Error('LE drift: LF auth.ts now has ' + postCrlf + ' CRLF lines')
}
if (info.LE === 'crlf' && postLf > 0) {
  throw new Error('LE drift: CRLF auth.ts now has ' + postLf + ' LF-only lines')
}

console.log('')
console.log('W5c-1 patch applied successfully.')
console.log('')
console.log('  ~ ' + FILE)
console.log('    backup: auth.ts.backup_' + stamp)
console.log('  1 patch applied:')
console.log('    A1: resolveAdminHomesUser agent query Universal-view guard')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. node scripts\\verify-w5c-1-static.js')
console.log('  3. Visual smoke (one check):')
console.log('     - npm run dev')
console.log('     - In incognito, open http://localhost:3000/admin-homes/leads')
console.log('     - Pick "All tenants (Universal)" in the tenant switcher')
console.log('     - Page should load (synthetic admin path); leads list shows')
console.log('       all leads from all tenants with no agent-scoped filter')
console.log('     - No 500 errors; no auth redirect loop')
console.log('  4. git add lib/admin-homes/auth.ts \\')
console.log('             scripts/patch-w-leads-workbench-w5c-1-resolveuser-agentid-leak.js \\')
console.log('             scripts/verify-w5c-1-static.js')
console.log('  5. git commit + push')