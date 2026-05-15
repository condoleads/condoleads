#!/usr/bin/env node
/**
 * verify-w5b-static.js
 *
 * Static post-patch verification for W-LEADS-WORKBENCH W5b.
 *
 * Runs after:
 *   1. node scripts/patch-w-leads-workbench-w5b-collapse-by-user.js
 *   2. npx tsc --noEmit
 *
 * Asserts that the patched files have the expected shape -- imports, props,
 * state, helpers, useMemo, render structure, no regressions, LE preserved,
 * backups present. Each check is independent; the script reports PASS/FAIL
 * per check and exits 1 if any fail.
 *
 * Pure read-only. No file writes.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

const FILES = {
  page: path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
  client: path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
}

for (const k of Object.keys(FILES)) {
  if (!fs.existsSync(FILES[k])) {
    console.error('FATAL: file missing: ' + FILES[k])
    process.exit(2)
  }
}

const pageText = fs.readFileSync(FILES.page, 'utf8')
const clientText = fs.readFileSync(FILES.client, 'utf8')

const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================
// page.tsx
// ============================================================
check(
  'page: searchParams in function signature',
  /AdminHomesLeadsPage\(\{\s*searchParams\s*\}/.test(pageText),
  'expected destructured searchParams param'
)
check(
  "page: initialExpanded reads searchParams?.expanded === '1'",
  pageText.indexOf("searchParams?.expanded === '1'") !== -1,
  'expected URL param read'
)
check(
  'page: initialExpanded passed to client (x2)',
  (pageText.match(/initialExpanded=\{initialExpanded\}/g) || []).length === 2,
  'expected exactly 2 occurrences (no-tenant branch + main branch)'
)

// ============================================================
// client.tsx: imports + props + signature
// ============================================================
check(
  'client: Fragment imported from react',
  clientText.indexOf("import { useState, useMemo, useEffect, Fragment } from 'react'") !== -1,
  'expected Fragment added to react import'
)
check(
  'client: Props has initialExpanded: boolean',
  clientText.indexOf('initialExpanded: boolean') !== -1,
  'expected type declaration in Props interface'
)
check(
  'client: function destructures initialExpanded',
  clientText.indexOf('currentAgentId, initialExpanded }: Props') !== -1,
  'expected initialExpanded in destructure'
)

// ============================================================
// client.tsx: state + helpers
// ============================================================
check(
  'client: expanded state initialized from prop',
  clientText.indexOf('useState<boolean>(initialExpanded)') !== -1,
  'expected useState<boolean>(initialExpanded)'
)
check(
  'client: expandedUserIds Set<string> state',
  clientText.indexOf('useState<Set<string>>(new Set())') !== -1,
  'expected useState<Set<string>>(new Set())'
)
check(
  'client: toggleExpanded helper defined',
  /const toggleExpanded\s*=\s*\(\)\s*=>\s*\{/.test(clientText),
  'expected toggleExpanded function declaration'
)
check(
  'client: toggleExpanded calls router.replace',
  /toggleExpanded[\s\S]{0,800}router\.replace/.test(clientText),
  'expected router.replace inside toggleExpanded'
)
check(
  "client: toggleExpanded writes ?expanded=1 via URLSearchParams",
  clientText.indexOf("params.set('expanded', '1')") !== -1,
  'expected URL param set'
)
check(
  'client: toggleUserIdExpand mutates a Set',
  /const toggleUserIdExpand\s*=\s*\(userId: string\)/.test(clientText),
  'expected helper signature'
)

// ============================================================
// client.tsx: flatRows useMemo
// ============================================================
check(
  "client: FlatRow union has kind: 'primary'",
  clientText.indexOf("kind: 'primary'") !== -1,
  'expected primary variant'
)
check(
  "client: FlatRow union has kind: 'earlier'",
  clientText.indexOf("kind: 'earlier'") !== -1,
  'expected earlier variant'
)
check(
  'client: flatRows = useMemo<FlatRow[]>(...)',
  clientText.indexOf('const flatRows = useMemo<FlatRow[]>') !== -1,
  'expected typed useMemo'
)
check(
  'client: flatRows deps = [filteredLeads, expanded, expandedUserIds]',
  clientText.indexOf('}, [filteredLeads, expanded, expandedUserIds])') !== -1,
  'expected correct dep array'
)
check(
  'client: collapsed mode sorts groups by created_at DESC',
  clientText.indexOf('new Date(b.created_at).getTime() - new Date(a.created_at).getTime()') !== -1,
  'expected DESC sort within group'
)

// ============================================================
// client.tsx: toggle button
// ============================================================
check(
  'client: toggle button "Show all events" label',
  clientText.indexOf("'Show all events'") !== -1,
  'expected label string'
)
check(
  'client: toggle button "Collapse by user" label',
  clientText.indexOf("'Collapse by user'") !== -1,
  'expected label string'
)
check(
  'client: toggle button onClick={toggleExpanded}',
  /onClick=\{toggleExpanded\}/.test(clientText),
  'expected handler binding'
)

// ============================================================
// client.tsx: render structure
// ============================================================
check(
  'client: empty-state check uses flatRows.length',
  clientText.indexOf('flatRows.length === 0') !== -1,
  'expected empty state on flatRows'
)
check(
  'client: outer map = flatRows.map(row => { ... })',
  clientText.indexOf('flatRows.map(row => {') !== -1,
  'expected flatRows.map'
)
check(
  'client: row wrapped in <Fragment key={rowKey}>',
  clientText.indexOf('<Fragment key={rowKey}>') !== -1,
  'expected Fragment with key'
)
check(
  'client: isEarlier visual treatment on <tr>',
  clientText.indexOf("isEarlier ? 'bg-slate-50/70 border-l-4 border-slate-300' : ''") !== -1,
  'expected conditional className for earlier rows'
)
check(
  'client: +N earlier badge with both labels',
  clientText.indexOf("'Hide earlier'") !== -1 &&
    /\$\{earlierCount\} earlier/.test(clientText),
  'expected both badge states (collapsed + expanded inline)'
)
check(
  'client: badge handler calls e.stopPropagation()',
  clientText.indexOf('e.stopPropagation()') !== -1,
  'expected stopPropagation to prevent row-click bubbling'
)
check(
  'client: activity preview row gated on !isEarlier',
  clientText.indexOf('{!isEarlier && (activities[lead.id] || []).length > 0 && (') !== -1,
  'expected !isEarlier guard on activity preview'
)
check(
  'client: plan data row gated on !isEarlier',
  clientText.indexOf('{!isEarlier && expandedLead === lead.id && lead.plan_data && (') !== -1,
  'expected !isEarlier guard on plan data'
)

// ============================================================
// client.tsx: no regressions
// ============================================================
check(
  'NO REGRESSION client: exportToCSV row build intact',
  clientText.indexOf('const rows = filteredLeads.map(l => [') !== -1,
  'exportToCSV must still map over filteredLeads'
)
check(
  'NO REGRESSION client: stats useMemo intact',
  clientText.indexOf('const stats = useMemo(() => ({') !== -1,
  'stats declaration must be present'
)
check(
  'NO REGRESSION client: deleteLead handler intact',
  clientText.indexOf('const deleteLead = async (leadId: string)') !== -1,
  'deleteLead must be present'
)
check(
  'NO REGRESSION client: updateLeadStatus handler intact',
  clientText.indexOf('const updateLeadStatus = async (leadId: string') !== -1,
  'updateLeadStatus must be present'
)
check(
  'NO REGRESSION client: select-all checkbox uses filteredLeads.map',
  /new Set\(filteredLeads\.map\(l => l\.id\)\)/.test(clientText),
  'select-all must still cover all filtered leads'
)
check(
  'NO REGRESSION client: row onClick still navigates to lead drawer',
  clientText.indexOf("router.push('/admin-homes/leads/' + lead.id)") !== -1,
  'row click should still navigate'
)
check(
  'NO REGRESSION client: row onClick guards against button/input clicks',
  clientText.indexOf("if (t.closest('button, input, select, a, label')) return") !== -1,
  'click guard must be present'
)
check(
  'NO REGRESSION client: stats counts over leads not flatRows',
  clientText.indexOf('total: leads.length') !== -1,
  'stats must count underlying leads regardless of collapse'
)

// ============================================================
// LE preservation
// ============================================================
function countLE(buf) {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      if (i > 0 && buf[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  return { crlf, lf }
}

const pageLE = countLE(fs.readFileSync(FILES.page))
const clientLE = countLE(fs.readFileSync(FILES.client))
check(
  'page: LE preserved as CRLF',
  pageLE.crlf > 0 && pageLE.lf === 0,
  'got crlf=' + pageLE.crlf + ' lf=' + pageLE.lf + ' (expected pure CRLF)'
)
check(
  'client: LE preserved as LF',
  clientLE.lf > 0 && clientLE.crlf === 0,
  'got crlf=' + clientLE.crlf + ' lf=' + clientLE.lf + ' (expected pure LF)'
)

// ============================================================
// Backups present
// ============================================================
const pageDir = path.dirname(FILES.page)
const clientDir = path.dirname(FILES.client)
const pageBackups = fs
  .readdirSync(pageDir)
  .filter((f) => f.startsWith('page.tsx.backup_'))
const clientBackups = fs
  .readdirSync(clientDir)
  .filter((f) => f.startsWith('AdminHomesLeadsClient.tsx.backup_'))
check(
  'backup: page.tsx backup present',
  pageBackups.length >= 1,
  'expected at least one timestamped backup'
)
check(
  'backup: AdminHomesLeadsClient.tsx backup present',
  clientBackups.length >= 1,
  'expected at least one timestamped backup'
)

// ============================================================
// REPORT
// ============================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5b static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  const mark = c.pass ? '  PASS' : '  FAIL'
  console.log(mark + '  ' + c.name)
  if (!c.pass) {
    console.log('        -> ' + c.detail)
  }
}
console.log('-'.repeat(60))
console.log('Summary: ' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)')

if (failed > 0) {
  process.exit(1)
}
process.exit(0)