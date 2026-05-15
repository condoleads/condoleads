#!/usr/bin/env node
/**
 * verify-w5c-3-static.js
 *
 * Static post-patch verification for W-LEADS-WORKBENCH W5c-3.
 *
 * Read-only. Exits 0 if all PASS, 1 if any FAIL.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx')
const ROUTE = path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts')

if (!fs.existsSync(FILE)) {
  console.error('FATAL: client file missing: ' + FILE)
  process.exit(2)
}

const text = fs.readFileSync(FILE, 'utf8')
const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================
// W5c-3 gates present
// ============================================================
check(
  'client: A1 W5c-3 marker comment present (bulk delete)',
  text.indexOf('W5c-3: bulk-delete hidden for agents') !== -1,
  'expected A1 marker comment'
)
check(
  'client: A2 W5c-3 marker comment present (per-row delete)',
  text.indexOf('W5c-3: per-row delete hidden for agents') !== -1,
  'expected A2 marker comment'
)
check(
  "client: exactly 2 currentRole !== 'agent' gates present",
  (text.match(/currentRole !== 'agent'/g) || []).length === 2,
  'expected 2 occurrences (one per delete surface)'
)
check(
  'client: bulk-delete button gated alongside selectedLeads.size > 0',
  text.indexOf("{selectedLeads.size > 0 && currentRole !== 'agent' && (") !== -1,
  'expected combined predicate on bulk-delete render'
)
check(
  'client: per-row delete wrapped in role gate',
  /currentRole !== 'agent' && \(\s*<button\s+onClick=\{\(\) => deleteLead\(lead\.id\)\}/.test(text),
  'expected per-row delete inside the gate'
)

// ============================================================
// NO REGRESSIONS -- delete handlers preserved, just gated
// ============================================================
check(
  'NO REGRESSION client: bulk delete handler binding intact',
  text.indexOf('onClick={handleDeleteSelected}') !== -1,
  'bulk delete handler still wired'
)
check(
  'NO REGRESSION client: per-row delete handler binding intact',
  text.indexOf('onClick={() => deleteLead(lead.id)}') !== -1,
  'per-row delete handler still wired'
)
check(
  'NO REGRESSION client: handleDeleteSelected fn still defined',
  text.indexOf('const handleDeleteSelected = async () => {') !== -1,
  'bulk delete fn declaration'
)
check(
  'NO REGRESSION client: deleteLead fn still defined',
  text.indexOf('const deleteLead = async (leadId: string) => {') !== -1,
  'per-row delete fn declaration'
)

// ============================================================
// NO REGRESSIONS -- status select (the "edit" surface) unaffected
// ============================================================
check(
  'NO REGRESSION client: inline status select unchanged',
  text.indexOf("onChange={e => updateLeadStatus(lead.id, 'status', e.target.value)}") !== -1,
  'status onChange handler binding'
)
check(
  'NO REGRESSION client: updateLeadStatus fn unchanged',
  text.indexOf("const updateLeadStatus = async (leadId: string, field: 'status' | 'quality', value: string) => {") !== -1,
  'status update fn declaration'
)

// ============================================================
// NO REGRESSIONS -- W5b plumbing preserved
// ============================================================
check(
  'NO REGRESSION client: W5b flatRows useMemo present',
  text.indexOf('const flatRows = useMemo<FlatRow[]>') !== -1,
  'W5b useMemo'
)
check(
  'NO REGRESSION client: W5b Fragment key wrap present',
  text.indexOf('<Fragment key={rowKey}>') !== -1,
  'W5b Fragment wrap'
)
check(
  "NO REGRESSION client: W5b 'Show all events' label present",
  text.indexOf("'Show all events'") !== -1,
  'W5b toggle label'
)
check(
  "NO REGRESSION client: W5b 'Collapse by user' label present",
  text.indexOf("'Collapse by user'") !== -1,
  'W5b toggle label'
)
check(
  'NO REGRESSION client: W5b +N earlier badge present',
  /\$\{earlierCount\} earlier/.test(text) && text.indexOf("'Hide earlier'") !== -1,
  'W5b chip both states'
)
check(
  'NO REGRESSION client: W5b activity preview !isEarlier guard present',
  text.indexOf('{!isEarlier && (activities[lead.id] || []).length > 0 && (') !== -1,
  'W5b activity preview guard'
)
check(
  'NO REGRESSION client: W5b plan-data !isEarlier guard present',
  text.indexOf('{!isEarlier && expandedLead === lead.id && lead.plan_data && (') !== -1,
  'W5b plan-data guard'
)

// ============================================================
// NO REGRESSIONS -- checkboxes preserved (intentional per finding)
// ============================================================
check(
  'NO REGRESSION client: per-row checkbox binding intact',
  text.indexOf('checked={selectedLeads.has(lead.id)}') !== -1,
  'per-row checkbox preserved (F-W5C-3-AGENT-CHECKBOXES-NON-FUNCTIONAL is accepted UX)'
)
check(
  'NO REGRESSION client: header select-all checkbox binding intact',
  text.indexOf('checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}') !== -1,
  'header checkbox preserved'
)
check(
  'NO REGRESSION client: Plan button still present (separate from Delete)',
  text.indexOf('Hide Plan') !== -1 && text.indexOf("'Plan'") !== -1,
  'Plan toggle button preserved'
)
check(
  'NO REGRESSION client: exportToCSV still wired',
  text.indexOf('onClick={exportToCSV}') !== -1,
  'CSV export button preserved'
)
check(
  'NO REGRESSION client: currentRole prop in destructure preserved',
  text.indexOf('currentRole, currentAgentId, initialExpanded }: Props') !== -1,
  'props destructure intact'
)

// ============================================================
// Server-side policy unchanged (we did not touch the route)
// ============================================================
if (fs.existsSync(ROUTE)) {
  const routeText = fs.readFileSync(ROUTE, 'utf8')
  check(
    'NO REGRESSION route: DELETE agent-restriction still in place',
    routeText.indexOf("if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent')") !== -1,
    'server-side agent-delete 403 must remain (defense-in-depth)'
  )
  check(
    'NO REGRESSION route: can() decision still applied to DELETE',
    /export async function DELETE[\s\S]{0,2000}can\(user\.permissions, 'lead\.write'/.test(routeText),
    'server-side can() check on DELETE preserved'
  )
  check(
    'NO REGRESSION route: can() decision still applied to PATCH',
    /export async function PATCH[\s\S]{0,2000}can\(user\.permissions, 'lead\.write'/.test(routeText),
    'server-side can() check on PATCH preserved'
  )
} else {
  check('NO REGRESSION route: leads [id] route.ts present', false, 'expected route file to exist')
}

// ============================================================
// LE preservation
// ============================================================
const buf = fs.readFileSync(FILE)
let crlf = 0
let lf = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlf++
    else lf++
  }
}
check(
  'client: LE pure (no mixed line endings)',
  !(crlf > 0 && lf > 0),
  'got crlf=' + crlf + ' lf=' + lf
)

// ============================================================
// Backup present
// ============================================================
const dir = path.dirname(FILE)
const backups = fs.readdirSync(dir).filter((f) => f.startsWith('AdminHomesLeadsClient.tsx.backup_'))
check(
  'client: at least one backup file present',
  backups.length >= 1,
  'expected timestamped backup'
)

// ============================================================
// REPORT
// ============================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5c-3 static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  const mark = c.pass ? '  PASS' : '  FAIL'
  console.log(mark + '  ' + c.name)
  if (!c.pass) console.log('        -> ' + c.detail)
}
console.log('-'.repeat(60))
console.log('Summary: ' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)')

if (failed > 0) process.exit(1)
process.exit(0)