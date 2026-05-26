// scripts/r-territory-ops-T1-5-phase3-apply.js
// W-TERRITORY-OPS T1-5 apply runner.
//
// Idempotent static verification. Reads every artifact off disk and asserts
// the expected structural content is present. Auto-revert is NOT a feature
// here -- the artifacts are already on disk by the time this runs; if any
// check fails, the runner exits non-zero and the operator restores from
// the timestamped backups (TerritoryTab.tsx backup_*) and writer-rerun.
//
// Run BEFORE smoke. Verifies the artifact set without touching the database.
//
// Sections:
//   1. File presence + size sanity
//   2. geo-rollup/route.ts content invariants
//   3. cards/bulk-create/route.ts content invariants
//   4. GeographyView.tsx content invariants
//   5. TerritoryTab.tsx 5-way toggle invariants
//   6. No-regression on T1-4 baseline (cards-list, bulk-restore, audit-log)
//   7. TSC clean

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = [];
function add(label, ok, detail) {
  checks.push({ label, ok: !!ok, detail: detail || '' });
}

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function size(p) {
  try { return fs.statSync(p).size; } catch { return -1; }
}

// === Section 1: file presence + size sanity ===
const GEO_ROLLUP = path.join('app','api','admin-homes','territory','geo-rollup','route.ts');
const BULK_CREATE = path.join('app','api','admin-homes','territory','cards','bulk-create','route.ts');
const GEO_VIEW = path.join('components','admin-homes','cockpit','territory','GeographyView.tsx');
const TERR_TAB = path.join('components','admin-homes','cockpit','tabs','TerritoryTab.tsx');

add('geo-rollup route present', size(GEO_ROLLUP) > 5000, 'size=' + size(GEO_ROLLUP));
add('bulk-create route present', size(BULK_CREATE) > 5000, 'size=' + size(BULK_CREATE));
add('GeographyView present', size(GEO_VIEW) > 15000, 'size=' + size(GEO_VIEW));
add('TerritoryTab present', size(TERR_TAB) > 2700, 'size=' + size(TERR_TAB));

// === Section 2: geo-rollup invariants ===
const geoRollup = read(GEO_ROLLUP) || '';
add('geo-rollup: resolveTenantId helper', geoRollup.indexOf('async function resolveTenantId(') > 0);
add('geo-rollup: tenant_manager_assignments membership',
    geoRollup.indexOf("from('tenant_manager_assignments')") > 0);
add('geo-rollup: TABLE_BY_LEVEL declared', geoRollup.indexOf('const TABLE_BY_LEVEL') > 0);
add('geo-rollup: treb_areas mapped', geoRollup.indexOf("area: 'treb_areas'") > 0);
add('geo-rollup: municipalities mapped', geoRollup.indexOf("municipality: 'municipalities'") > 0);
add('geo-rollup: communities mapped', geoRollup.indexOf("community: 'communities'") > 0);
add('geo-rollup: neighbourhoods mapped', geoRollup.indexOf("neighbourhood: 'neighbourhoods'") > 0);
add('geo-rollup: neighbourhood listing_count = 0',
    geoRollup.indexOf('neighbourhood: null') > 0);
add('geo-rollup: neighbourhood parent = area_id',
    /neighbourhood:\s*['"]area_id['"]/.test(geoRollup));
add('geo-rollup: parent_level neighbourhood -> area',
    /neighbourhood:\s*['"]area['"]/.test(geoRollup));
add('geo-rollup: available_in_vow filter', geoRollup.indexOf('available_in_vow = true') > 0);
add('geo-rollup: resolve_geo_primary call',
    geoRollup.indexOf('resolve_geo_primary(') > 0);
add('geo-rollup: has_own_card EXISTS check',
    geoRollup.indexOf('has_own_card') > 0 && geoRollup.indexOf('agent_property_access apa') > 0);
add('geo-rollup: inherited_from_level walk',
    geoRollup.indexOf('inherited_from_level') > 0 && geoRollup.indexOf('PARENT_LEVEL_BY_LEVEL') > 0);
add('geo-rollup: 401 unauthorized response', geoRollup.indexOf("'unauthorized'") > 0);
add('geo-rollup: 403 forbidden response', geoRollup.indexOf("'forbidden'") > 0);
add('geo-rollup: GET handler exported', geoRollup.indexOf('export async function GET(') > 0);

// === Section 3: bulk-create invariants ===
const bulkCreate = read(BULK_CREATE) || '';
add('bulk-create: POST handler exported', bulkCreate.indexOf('export async function POST(') > 0);
add('bulk-create: SET LOCAL app.skip_apa_reroll',
    bulkCreate.indexOf("SET LOCAL app.skip_apa_reroll") > 0);
add('bulk-create: BEGIN/COMMIT/ROLLBACK transaction',
    bulkCreate.indexOf("'BEGIN'") > 0 && bulkCreate.indexOf("'COMMIT'") > 0 && bulkCreate.indexOf("'ROLLBACK'") > 0);
add('bulk-create: GEO_TABLE_BY_SCOPE declared',
    bulkCreate.indexOf('GEO_TABLE_BY_SCOPE') > 0);
add('bulk-create: APA_FK_BY_SCOPE declared',
    bulkCreate.indexOf('APA_FK_BY_SCOPE') > 0);
add('bulk-create: agent tenant-membership check',
    bulkCreate.indexOf('agent does not belong to tenant') > 0);
add('bulk-create: duplicate (scope, scope_id) check',
    bulkCreate.indexOf('duplicate (scope,scope_id)') > 0);
add('bulk-create: 200-card cap',
    bulkCreate.indexOf('capped at 200') > 0);
add('bulk-create: territory_reroll_queue read',
    bulkCreate.indexOf('territory_reroll_queue') > 0);
add('bulk-create: tenant_manager_assignments membership',
    bulkCreate.indexOf("from('tenant_manager_assignments')") > 0);
add('bulk-create: INSERT into agent_property_access',
    bulkCreate.indexOf('INSERT INTO agent_property_access') > 0);
add('bulk-create: buildings_mode = all default',
    bulkCreate.indexOf("\\'all\\'") > 0 || bulkCreate.indexOf("'all'") > 0);

// === Section 4: GeographyView invariants ===
const geoView = read(GEO_VIEW) || '';
add('GeographyView: use client directive', geoView.startsWith("'use client'"));
add('GeographyView: default export', geoView.indexOf('export default function GeographyView') > 0);
add('GeographyView: Props with tenantId tenantName', /tenantId:\s*string/.test(geoView) && /tenantName:\s*string/.test(geoView));
add('GeographyView: onOpenCards optional prop',
    geoView.indexOf('onOpenCards?:') > 0);
add('GeographyView: fetches /api/admin-homes/territory/geo-rollup',
    geoView.indexOf("'/api/admin-homes/territory/geo-rollup?'") > 0);
add('GeographyView: posts to /api/admin-homes/territory/cards/bulk-create',
    geoView.indexOf("'/api/admin-homes/territory/cards/bulk-create'") > 0);
add('GeographyView: CarveUpModal component',
    geoView.indexOf('function CarveUpModal(') > 0);
add('GeographyView: LEVEL_LABEL all 4 levels',
    geoView.indexOf("area: 'Area'") > 0 && geoView.indexOf("municipality: 'Municipality'") > 0 &&
    geoView.indexOf("community: 'Community'") > 0 && geoView.indexOf("neighbourhood: 'Neighbourhood'") > 0);
add('GeographyView: drilldown via CHILD_LEVEL',
    geoView.indexOf('const CHILD_LEVEL') > 0);
add('GeographyView: conflict-zone filter',
    geoView.indexOf('conflictOnly') > 0);
add('GeographyView: breadcrumb crumb state',
    geoView.indexOf('crumb') > 0 && geoView.indexOf('jumpToCrumb') > 0);
add('GeographyView: ASSIGNED/INHERITED/NONE states',
    geoView.indexOf("'ASSIGNED'") > 0 && geoView.indexOf("'INHERITED'") > 0 && geoView.indexOf("'NONE'") > 0);

// === Section 5: TerritoryTab 5-way toggle invariants ===
const tab = read(TERR_TAB) || '';
add('TerritoryTab: Map icon import',
    tab.indexOf("import { Activity, Map, Table, Users } from 'lucide-react'") > 0);
add('TerritoryTab: GeographyView import',
    tab.indexOf("import GeographyView from '@/components/admin-homes/cockpit/territory/GeographyView'") > 0);
add('TerritoryTab: View type has geography',
    tab.indexOf("'agents' | 'cards' | 'geography' | 'health' | 'detail'") > 0);
add('TerritoryTab: Geography button',
    tab.indexOf("{btn('geography', 'Geography', Map, 'm')}") > 0);
add('TerritoryTab: view === geography branch',
    tab.indexOf("view === 'geography'") > 0);
add('TerritoryTab: GeographyView JSX with onOpenCards',
    tab.indexOf('<GeographyView tenantId={tenantId} tenantName={tenantName} onOpenCards=') > 0);

// No-regression: original 4 buttons + 4 views preserved.
add('TerritoryTab regression: Agents button preserved',
    tab.indexOf("{btn('agents', 'Agents', Users, 'l')}") > 0);
add('TerritoryTab regression: Cards button preserved',
    tab.indexOf("{btn('cards', 'Cards', Table, 'm')}") > 0);
add('TerritoryTab regression: Health button preserved',
    tab.indexOf("{btn('health', 'Health', Activity, 'm')}") > 0);
add('TerritoryTab regression: Detail button preserved',
    tab.indexOf("{btn('detail', 'Detail', Table, 'r')}") > 0);
add('TerritoryTab regression: AgentsView render preserved',
    tab.indexOf('<AgentsView tenantId={tenantId}') > 0);
add('TerritoryTab regression: CardsView render preserved',
    tab.indexOf('<CardsView tenantId={tenantId}') > 0);
add('TerritoryTab regression: HealthView render preserved',
    tab.indexOf('<HealthView tenantId={tenantId}') > 0);
add('TerritoryTab regression: TerritoryClient render preserved',
    tab.indexOf('<TerritoryClient tenantId={tenantId}') > 0);

// === Section 6: T1-4 baseline files unchanged-by-structure ===
const cardsList = read(path.join('app','api','admin-homes','territory','cards-list','route.ts')) || '';
const bulkRestore = read(path.join('app','api','admin-homes','territory','cards','bulk-restore','route.ts')) || '';
const auditLog = read(path.join('app','api','admin-homes','territory','audit-log','route.ts')) || '';

add('T1-4 cards-list: still exports GET',
    cardsList.indexOf('export async function GET(') > 0);
add('T1-4 cards-list: still uses tenant_manager_assignments',
    cardsList.indexOf("from('tenant_manager_assignments')") > 0);
add('T1-4 bulk-restore: still exports POST',
    bulkRestore.indexOf('export async function POST(') > 0);
add('T1-4 bulk-restore: still uses SET LOCAL app.skip_apa_reroll',
    bulkRestore.indexOf('SET LOCAL app.skip_apa_reroll') > 0);
add('T1-4 audit-log: still uses agents.full_name (post-bug-fix preserved)',
    auditLog.indexOf("'id, full_name'") > 0 || auditLog.indexOf('"id, full_name"') > 0);
add('T1-4 audit-log: scope filter still present',
    auditLog.indexOf("'scope'") > 0);

// === Section 7: TSC clean ===
console.log('=== Section 7: TSC ===');
let tscOk = true;
try {
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('TSC exit: 0');
} catch (e) {
  tscOk = false;
  console.log('TSC FAILED');
}
add('TSC --noEmit clean', tscOk);

// === Report ===
let pass = 0, fail = 0;
console.log('');
console.log('================================================================');
console.log('  W-TERRITORY-OPS T1-5 APPLY -- check results');
console.log('================================================================');
for (const c of checks) {
  if (c.ok) pass++; else fail++;
  console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.label + (c.detail ? '  -- ' + c.detail : ''));
}
console.log('');
console.log('  CHECKS: ' + checks.length + '  PASS: ' + pass + '  FAIL: ' + fail);
console.log('================================================================');
process.exit(fail > 0 ? 1 : 0);