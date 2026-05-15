#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w5c-3-action-gates.js
 *
 * feat(W-LEADS-WORKBENCH W5c-3): per-role action gates on the leads list view.
 *
 * Hides the Delete buttons (bulk + per-row) in AdminHomesLeadsClient.tsx
 * when currentRole === 'agent'. Matches the server-side DELETE policy at
 * app/api/admin-homes/leads/[id]/route.ts which returns 403 for agents
 * regardless of own-lead ownership (legacy compliance policy):
 *
 *   // DELETE additionally restricted: no agent destructive deletes.
 *   if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent') {
 *     return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
 *   }
 *
 * Status `<select>` (the "edit" surface mentioned in the W5b->W5c-3 spec)
 * remains visible to all because `can('lead.write', ...)` permits agents
 * to update status on their OWN leads (server scoping ensures only own
 * leads are visible). Assign-agent is not currently in the UI -- out of
 * scope for W5c-3.
 *
 * Single file: components/admin-homes/AdminHomesLeadsClient.tsx (2 anchors):
 *   A1: bulk Delete button (in sort/filter bar) -- visibility gate
 *   A2: per-row Delete button (in table Actions cell) -- visibility gate
 *
 * Idempotency: skips if `currentRole !== 'agent'` already present in file.
 * LE: client.tsx is LF (per W5b detection).
 *
 * Multi-tenant safety: pure UI gating. Server-side enforcement (in
 * lead [id] route.ts via can() + the explicit agent-delete restriction)
 * is the source of truth. Client gate is defense-in-depth UX -- it
 * removes the misleading "Delete" affordance from users who cannot
 * actually perform the action. No tenant_id implications. No new DB
 * queries. No new API surface.
 *
 * No regressions: W5b plumbing (Fragment import, flatRows useMemo, toggle
 * button, +N earlier chip, isEarlier visual treatment, activity preview,
 * plan data panel) all preserved verbatim. Status `<select>` preserved.
 * Plan button preserved. Checkboxes preserved (the bulk-select UI stays
 * visible for agents but the bulk-delete button is hidden -- agents will
 * see checkboxes that have no destructive action attached; this is logged
 * as F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL, acceptable initial UX,
 * candidate for follow-up if user feedback requests hiding the checkbox
 * column for agents).
 *
 * Findings logged in commit message + future W5c tracker entry:
 *   F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL
 *     Agents see selection checkboxes but the bulk-delete button is
 *     hidden, so selections are non-functional. Server side already
 *     blocks the deletes; client gate is informative-UX only. Per-row
 *     checkbox column is preserved to keep the table layout consistent
 *     across roles (avoids colspan recalc + scroll-jank).
 *
 *   F-W5C-3-CLIENT-RBAC-COARSER-THAN-SERVER
 *     Client uses legacy 3-tier currentRole ('admin' | 'manager' | 'agent')
 *     which is coarser than the 7-role surface used by can() server-side.
 *     For most actions this is fine because server-side can() is the source
 *     of truth (defense-in-depth: client hides + server enforces). The
 *     client cannot perfectly mirror server decisions for Manager Platform
 *     (tier 5) or Area Manager (tier 3) which have different scope rules.
 *     Mitigated by server-side enforcement -- client gating is informative
 *     UX, not security.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx')

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
  throw new Error('client file missing: ' + FILE)
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
console.log('AdminHomesLeadsClient.tsx LE: ' + info.LE)

// Idempotency
const MARKER = "currentRole !== 'agent'"
if (info.text.indexOf(MARKER) !== -1) {
  console.log('SKIP: W5c-3 marker (currentRole !== \'agent\') already present. No-op.')
  process.exit(0)
}

let text = info.text

// ----- A1: Bulk Delete button visibility gate -----
const A1_OLD =
  '            {selectedLeads.size > 0 && (\n' +
  '              <button onClick={handleDeleteSelected} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">\n' +
  '                {deleting ? \'Deleting...\' : `Delete (${selectedLeads.size})`}\n' +
  '              </button>\n' +
  '            )}'

const A1_NEW =
  '            {/* W5c-3: bulk-delete hidden for agents (matches server policy:\n' +
  '                lead [id] route.ts 403s agent deletes regardless of ownership). */}\n' +
  '            {selectedLeads.size > 0 && currentRole !== \'agent\' && (\n' +
  '              <button onClick={handleDeleteSelected} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">\n' +
  '                {deleting ? \'Deleting...\' : `Delete (${selectedLeads.size})`}\n' +
  '              </button>\n' +
  '            )}'

// ----- A2: Per-row Delete button visibility gate -----
const A2_OLD =
  '                        <button\n' +
  '                          onClick={() => deleteLead(lead.id)}\n' +
  '                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"\n' +
  '                        >\n' +
  '                          Delete\n' +
  '                        </button>'

const A2_NEW =
  '                        {/* W5c-3: per-row delete hidden for agents (matches server policy). */}\n' +
  '                        {currentRole !== \'agent\' && (\n' +
  '                          <button\n' +
  '                            onClick={() => deleteLead(lead.id)}\n' +
  '                            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"\n' +
  '                          >\n' +
  '                            Delete\n' +
  '                          </button>\n' +
  '                        )}'

const patches = [
  { name: 'A1 bulk-delete button gate', old: A1_OLD, new: A1_NEW },
  { name: 'A2 per-row delete button gate', old: A2_OLD, new: A2_NEW },
].map((p) => ({ name: p.name, old: withLE(p.old, info.LE), new: withLE(p.new, info.LE) }))

// Anchor uniqueness
for (const p of patches) {
  const count = text.split(p.old).length - 1
  if (count !== 1) {
    throw new Error(p.name + ' anchor count ' + count + ' != 1')
  }
}
console.log('all anchor uniqueness checks passed')

// Apply
for (const p of patches) {
  text = text.replace(p.old, p.new)
}

// Post-patch assertions
const ROLE_GATE = withLE("currentRole !== 'agent'", info.LE)
const gateCount = (text.split(ROLE_GATE).length - 1)
if (gateCount !== 2) {
  throw new Error('post-patch: expected exactly 2 currentRole !== \'agent\' gates, found ' + gateCount)
}
if (text.indexOf('W5c-3: bulk-delete hidden for agents') === -1) {
  throw new Error('post-patch: A1 W5c-3 marker comment missing')
}
if (text.indexOf('W5c-3: per-row delete hidden for agents') === -1) {
  throw new Error('post-patch: A2 W5c-3 marker comment missing')
}
// NO REGRESSION: bulk delete button still present (just gated)
if (text.indexOf('onClick={handleDeleteSelected}') === -1) {
  throw new Error('post-patch: bulk delete handler binding missing')
}
// NO REGRESSION: per-row delete button still present (just gated)
if (text.indexOf('onClick={() => deleteLead(lead.id)}') === -1) {
  throw new Error('post-patch: per-row delete handler binding missing')
}
// NO REGRESSION: status select still present and unaffected (agents can edit own status)
if (text.indexOf("onChange={e => updateLeadStatus(lead.id, 'status', e.target.value)}") === -1) {
  throw new Error('post-patch: inline status update select missing')
}
// NO REGRESSION: W5b plumbing intact
if (text.indexOf('const flatRows = useMemo<FlatRow[]>') === -1) {
  throw new Error('post-patch: W5b flatRows useMemo missing -- regression')
}
if (text.indexOf('<Fragment key={rowKey}>') === -1) {
  throw new Error('post-patch: W5b Fragment key missing -- regression')
}
if (text.indexOf("'Show all events'") === -1 || text.indexOf("'Collapse by user'") === -1) {
  throw new Error('post-patch: W5b toggle button labels missing -- regression')
}
// NO REGRESSION: plan-button still present (separate from delete)
if (text.indexOf('Hide Plan') === -1) {
  throw new Error('post-patch: Plan/Hide Plan button missing -- regression')
}
// NO REGRESSION: checkboxes still wired
if (text.indexOf('checked={selectedLeads.has(lead.id)}') === -1) {
  throw new Error('post-patch: per-row checkbox binding missing -- regression')
}

// LE preservation
if (info.LE === 'lf' && text.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF AdminHomesLeadsClient.tsx')
}

console.log('all post-patch assertions passed')

// Backup + write
fs.copyFileSync(FILE, FILE + '.backup_' + stamp)
fs.writeFileSync(FILE, text, 'utf8')

// Re-verify LE
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
  throw new Error('LE drift: LF client.tsx now has ' + postCrlf + ' CRLF lines')
}

console.log('')
console.log('W5c-3 action gates patch applied successfully.')
console.log('')
console.log('  ~ ' + FILE)
console.log('    backup: AdminHomesLeadsClient.tsx.backup_' + stamp)
console.log('  2 patches applied:')
console.log('    A1: bulk Delete button -- currentRole !== \'agent\' gate added')
console.log('    A2: per-row Delete button -- currentRole !== \'agent\' gate added')
console.log('')
console.log('Next:')
console.log('  npx tsc --noEmit')
console.log('  node scripts\\verify-w5c-3-static.js')
console.log('  Visual smoke (agent role -- if no agent test user available,')
console.log('  this commit is a defensive UI gate behind the server enforcement)')