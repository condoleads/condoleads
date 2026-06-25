// scripts/test-c10-multitenant-regression.js
// C10 regression gate -- 6 brand-leak strings retired across 5 files.
// Static assertions on file contents.

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
let failures = 0
let passes = 0

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }

function assertContains(rel, needle, label) {
  if (readFile(rel).includes(needle)) {
    console.log('PASS [' + label + '] ' + rel)
    passes++
  } else {
    console.error('FAIL [' + label + '] ' + rel + ' -- needle not found:\n' + needle)
    failures++
  }
}

function assertMatches(rel, pattern, label) {
  if (pattern.test(readFile(rel))) {
    console.log('PASS [' + label + '] ' + rel)
    passes++
  } else {
    console.error('FAIL [' + label + '] ' + rel + ' -- pattern not found: ' + pattern)
    failures++
  }
}

function assertNoMatch(rel, pattern, label) {
  const m = readFile(rel).match(pattern)
  if (m) {
    console.error('FAIL [' + label + '] ' + rel + ' -- forbidden pattern found: ' + m[0])
    failures++
  } else {
    console.log('PASS [' + label + '] ' + rel + ' -- pattern absent')
    passes++
  }
}

console.log('\n=== C10 regression gate ===\n')

// ---------- app/admin-homes/leads/page.tsx (server) ----------

assertContains(
  'app/admin-homes/leads/page.tsx',
  'let tenantBrandName: string | null = null',
  'leads-page-tenantBrandName-declared'
)
assertContains(
  'app/admin-homes/leads/page.tsx',
  'let tenantDomain: string | null = null',
  'leads-page-tenantDomain-declared'
)
// W-HOUSE-ACCOUNT UNIT 8B: additive columns past brand_name/name/domain (e.g.
// default_agent_id for the leads-page house-account oversight visibility) are
// permitted by this assertion. Intent: brand_name MUST be in the SELECT.
assertMatches(
  'app/admin-homes/leads/page.tsx',
  /\.select\('brand_name, name, domain[^']*'\)/,
  'leads-page-tenant-fetch-includes-brand_name'
)
assertContains(
  'app/admin-homes/leads/page.tsx',
  'tenantBrandName={tenantBrandName}',
  'leads-page-passes-tenantBrandName-prop'
)
assertContains(
  'app/admin-homes/leads/page.tsx',
  'tenantDomain={tenantDomain}',
  'leads-page-passes-tenantDomain-prop'
)

// ---------- components/admin-homes/AdminHomesLeadsClient.tsx ----------

assertContains(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  'tenantBrandName: string | null',
  'leads-client-Props-tenantBrandName'
)
assertContains(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  'tenantDomain: string | null',
  'leads-client-Props-tenantDomain'
)
assertContains(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  '{tenantBrandName ?? \'Tenant\'} Leads',
  'leads-client-h1-tenant-aware'
)
assertContains(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  '{tenantDomain ?? \'this tenant\'}',
  'leads-client-subtitle-tenant-aware'
)
assertContains(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  '_c10_slug',
  'leads-client-csv-filename-slug-derived'
)
// Negative: confirm hardcoded literals are gone
assertNoMatch(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  /WALLiam Leads</,
  'leads-client-no-hardcoded-WALLiam-Leads-h1'
)
assertNoMatch(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  /All lead sources from walliam\.ca/,
  'leads-client-no-hardcoded-walliam-ca-subtitle'
)
assertNoMatch(
  'components/admin-homes/AdminHomesLeadsClient.tsx',
  /`walliam-leads-/,
  'leads-client-no-hardcoded-csv-filename'
)

// ---------- app/admin-homes/agents/page.tsx (server) ----------

// W-HOUSE-ACCOUNT UNIT 3: additive columns past brand_name (e.g.
// default_agent_id for the house-account marker) are permitted by this
// assertion. Intent: brand_name MUST be in the SELECT; column order + extra
// columns are not what this test guards.
assertMatches(
  'app/admin-homes/agents/page.tsx',
  /\.select\('id, name, domain, brand_name[^']*'\)/,
  'agents-page-tenants-select-includes-brand_name'
)
assertContains(
  'app/admin-homes/agents/page.tsx',
  'const tenantBrandName = _c10_scopedTenant',
  'agents-page-tenantBrandName-derived'
)
assertContains(
  'app/admin-homes/agents/page.tsx',
  'const tenantDomain = _c10_scopedTenant?.domain',
  'agents-page-tenantDomain-derived'
)
assertContains(
  'app/admin-homes/agents/page.tsx',
  'tenantBrandName={tenantBrandName} tenantDomain={tenantDomain}',
  'agents-page-passes-props-populated-state'
)
assertContains(
  'app/admin-homes/agents/page.tsx',
  'tenantBrandName={null} tenantDomain={null}',
  'agents-page-passes-null-props-empty-state'
)

// ---------- components/admin-homes/AgentsManagementClient.tsx ----------

assertContains(
  'components/admin-homes/AgentsManagementClient.tsx',
  'tenantBrandName, tenantDomain',
  'agents-client-destructures-new-props'
)
assertContains(
  'components/admin-homes/AgentsManagementClient.tsx',
  'tenantBrandName: string | null, tenantDomain: string | null',
  'agents-client-types-new-props'
)
assertContains(
  'components/admin-homes/AgentsManagementClient.tsx',
  'tenantBrandName={tenantBrandName}',
  'agents-client-passes-brandName-to-modal'
)
assertContains(
  'components/admin-homes/AgentsManagementClient.tsx',
  'tenantDomain={tenantDomain}',
  'agents-client-passes-domain-to-modal'
)

// ---------- components/admin-homes/AddAgentModal.tsx ----------

assertContains(
  'components/admin-homes/AddAgentModal.tsx',
  'tenantBrandName?: string | null',
  'modal-Props-tenantBrandName-optional'
)
assertContains(
  'components/admin-homes/AddAgentModal.tsx',
  'tenantDomain?: string | null',
  'modal-Props-tenantDomain-optional'
)
assertContains(
  'components/admin-homes/AddAgentModal.tsx',
  'tenantBrandName = null, tenantDomain = null',
  'modal-defaults-null'
)
assertContains(
  'components/admin-homes/AddAgentModal.tsx',
  "Add {tenantBrandName ?? 'Tenant'} Agent",
  'modal-title-tenant-aware'
)
// D21 (P3.F5) anti-regression: VIP Access Config block was REMOVED
// from agent modal -- tenant-level policy belongs on tenant settings,
// not per-agent. Lock the removal in place.
assertNoMatch(
  'components/admin-homes/AddAgentModal.tsx',
  /VIP Access Config/,
  'modal-vip-block-stays-removed-D21'
)
// Negative: confirm hardcoded literals are gone
assertNoMatch(
  'components/admin-homes/AddAgentModal.tsx',
  /Add WALLiam Agent/,
  'modal-no-hardcoded-WALLiam-Agent-title'
)
assertNoMatch(
  'components/admin-homes/AddAgentModal.tsx',
  /WALLiam VIP Access Config/,
  'modal-no-hardcoded-WALLiam-VIP-header'
)

// ---------- D28 (P3.F5) anti-regression: subdomain UI removed ----------
// Subdomain is system-derived server-side (lib/admin-homes/agent-subdomain.ts).
// Lock the removal of UI field + helper + .condoleads.ca display suffix
// so they don't drift back into agent onboarding flow.

assertNoMatch(
  'components/admin-homes/AddAgentModal.tsx',
  /<label[^>]*>Subdomain \*<\/label>/,
  'modal-subdomain-field-stays-removed-D28'
)

console.log('\n=== ' + passes + ' PASS / ' + failures + ' FAIL ===')
process.exit(failures === 0 ? 0 : 1)