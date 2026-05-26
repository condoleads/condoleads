// scripts/r-territory-ops-T1-6-phase3-apply.js
// W-TERRITORY-OPS T1-6 apply runner.
//
// Idempotent static verification. Reads every artifact off disk and asserts
// expected structural content is present. Run BEFORE smoke.
//
// Sections:
//   1. File presence + size sanity (new artifacts + edited artifacts)
//   2. cards-list scope_id extension invariants
//   3. CardsView initialGeoFilter prop invariants
//   4. geo-search route invariants
//   5. QueueIndicator component invariants
//   6. AuditSidebar component invariants
//   7. TerritorySearchBar component invariants
//   8. TerritoryTab integration invariants
//   9. No-regression on T1-5 (GeographyView untouched) + T1-4 (cards-list,
//      bulk-restore, audit-log)
//  10. TSC --noEmit clean

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = [];
function add(label, ok, detail) { checks.push({ label, ok: !!ok, detail: detail || '' }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function size(p) { try { return fs.statSync(p).size; } catch { return -1; } }

// === Paths ===
const CARDS_LIST = path.join('app','api','admin-homes','territory','cards-list','route.ts');
const CARDS_VIEW = path.join('components','admin-homes','cockpit','territory','CardsView.tsx');
const GEO_SEARCH = path.join('app','api','admin-homes','territory','geo-search','route.ts');
const QUEUE_IND = path.join('components','admin-homes','cockpit','territory','QueueIndicator.tsx');
const AUDIT_SIDE = path.join('components','admin-homes','cockpit','territory','AuditSidebar.tsx');
const SEARCH_BAR = path.join('components','admin-homes','cockpit','territory','TerritorySearchBar.tsx');
const TERR_TAB = path.join('components','admin-homes','cockpit','tabs','TerritoryTab.tsx');
const GEO_VIEW = path.join('components','admin-homes','cockpit','territory','GeographyView.tsx');
const BULK_RESTORE = path.join('app','api','admin-homes','territory','cards','bulk-restore','route.ts');
const AUDIT_LOG = path.join('app','api','admin-homes','territory','audit-log','route.ts');

// === Section 1: file presence + size sanity ===
add('cards-list route present (extended)', size(CARDS_LIST) > 8500, 'size=' + size(CARDS_LIST));
add('CardsView present (extended)', size(CARDS_VIEW) > 28500, 'size=' + size(CARDS_VIEW));
add('geo-search route present', size(GEO_SEARCH) > 5000, 'size=' + size(GEO_SEARCH));
add('QueueIndicator present', size(QUEUE_IND) > 3500, 'size=' + size(QUEUE_IND));
add('AuditSidebar present', size(AUDIT_SIDE) > 9000, 'size=' + size(AUDIT_SIDE));
add('TerritorySearchBar present', size(SEARCH_BAR) > 8000, 'size=' + size(SEARCH_BAR));
add('TerritoryTab present (extended)', size(TERR_TAB) > 3500, 'size=' + size(TERR_TAB));

// === Section 2: cards-list scope_id extension ===
const cardsList = read(CARDS_LIST) || '';
add('cards-list: scopeIdParam declared',
    cardsList.indexOf("url.searchParams.get('scope_id')") > 0);
add('cards-list: scope_id UUID validation',
    cardsList.indexOf('if (scopeIdParam && !UUID_RE.test(scopeIdParam))') > 0);
add('cards-list: 400 bad scope_id error',
    cardsList.indexOf("'bad scope_id'") > 0);
add('cards-list: $8 area filter',
    cardsList.indexOf("apa.scope = 'area' AND apa.area_id = $8::uuid") > 0);
add('cards-list: $8 muni filter',
    cardsList.indexOf("apa.scope = 'municipality' AND apa.municipality_id = $8::uuid") > 0);
add('cards-list: $8 community filter',
    cardsList.indexOf("apa.scope = 'community' AND apa.community_id = $8::uuid") > 0);
add('cards-list: $8 neighbourhood filter',
    cardsList.indexOf("apa.scope = 'neighbourhood' AND apa.neighbourhood_id = $8::uuid") > 0);
add('cards-list: params array includes scopeIdParam',
    cardsList.indexOf('limit, offset, scopeIdParam]') > 0);

// === Section 3: CardsView initialGeoFilter prop ===
const cardsView = read(CARDS_VIEW) || '';
add('CardsView: initialGeoFilter in Props',
    cardsView.indexOf('initialGeoFilter?: { scope: string; scope_id: string; geo_name: string } | null') > 0);
add('CardsView: onClearGeoFilter in Props',
    cardsView.indexOf('onClearGeoFilter?: () => void') > 0);
add('CardsView: destructured new props',
    cardsView.indexOf(', initialGeoFilter, onClearGeoFilter }: Props') > 0);
add('CardsView: filterScopeId state',
    cardsView.indexOf("useState<string | null>(initialGeoFilter?.scope_id || null)") > 0);
add('CardsView: filterGeoName state',
    cardsView.indexOf("useState<string | null>(initialGeoFilter?.geo_name || null)") > 0);
add('CardsView: scope_id added to fetch params',
    cardsView.indexOf("if (filterScopeId) params.set('scope_id', filterScopeId)") > 0);
const scopeIdSetCount = (cardsView.match(/params\.set\('scope_id', filterScopeId\)/g) || []).length;
add('CardsView: scope_id set in BOTH fetch sites', scopeIdSetCount === 2,
    'occurrences=' + scopeIdSetCount);
add('CardsView: clearFilters resets filterScopeId',
    cardsView.indexOf('setFilterScopeId(null)') > 0);
add('CardsView: onClearGeoFilter invoked',
    cardsView.indexOf('if (onClearGeoFilter) onClearGeoFilter()') > 0);
add('CardsView: anyFilterActive includes filterScopeId',
    cardsView.indexOf('filterAgent || filterScope || filterScopeId || includeInactive') > 0);
add('CardsView: useEffect dep array includes filterScopeId',
    cardsView.indexOf('tenantId, filterAgent, filterScope, filterScopeId, includeInactive') > 0);

// === Section 4: geo-search route ===
const geoSearch = read(GEO_SEARCH) || '';
add('geo-search: GET handler exported',
    geoSearch.indexOf('export async function GET(') > 0);
add('geo-search: resolveTenantId helper',
    geoSearch.indexOf('async function resolveTenantId(') > 0);
add('geo-search: tenant_manager_assignments membership',
    geoSearch.indexOf("from('tenant_manager_assignments')") > 0);
add('geo-search: min 2 chars short-circuit',
    geoSearch.indexOf('if (qRaw.length < 2)') > 0);
add('geo-search: agent UNION branch',
    geoSearch.indexOf("'agent'::text AS kind") > 0);
add('geo-search: area UNION branch',
    geoSearch.indexOf("'area'::text AS kind") > 0);
add('geo-search: municipality UNION branch',
    geoSearch.indexOf("'municipality'::text AS kind") > 0);
add('geo-search: community UNION branch',
    geoSearch.indexOf("'community'::text AS kind") > 0);
add('geo-search: neighbourhood UNION branch',
    geoSearch.indexOf("'neighbourhood'::text AS kind") > 0);
add('geo-search: agents tenant-scoped',
    geoSearch.indexOf('WHERE a.tenant_id = $1::uuid') > 0);
add('geo-search: ILIKE pattern match',
    geoSearch.indexOf("ILIKE '%' || $2 || '%'") > 0);
add('geo-search: limit 1..50',
    geoSearch.indexOf('Math.min(50,') > 0);

// === Section 5: QueueIndicator ===
const queueInd = read(QUEUE_IND) || '';
add('QueueIndicator: use client directive', queueInd.startsWith("'use client'"));
add('QueueIndicator: default export',
    queueInd.indexOf('export default function QueueIndicator') > 0);
add('QueueIndicator: polls reroll-worker',
    queueInd.indexOf("'/api/admin-homes/territory/reroll-worker?tenant_id='") > 0);
add('QueueIndicator: default 10s cadence',
    queueInd.indexOf('cadenceMs = 10000') > 0);
add('QueueIndicator: visibility API',
    queueInd.indexOf('document.hidden') > 0);
add('QueueIndicator: 4 states (synced/pending/processing/error)',
    queueInd.indexOf("'Synced'") > 0 &&
    queueInd.indexOf("pending') > 0 || true") < 0 &&  // sanity
    queueInd.indexOf('pending}') > 0 &&
    queueInd.indexOf('processing}') > 0 &&
    queueInd.indexOf('Queue: error') > 0);

// === Section 6: AuditSidebar ===
const auditSide = read(AUDIT_SIDE) || '';
add('AuditSidebar: use client directive', auditSide.startsWith("'use client'"));
add('AuditSidebar: default export',
    auditSide.indexOf('export default function AuditSidebar') > 0);
add('AuditSidebar: polls audit-log',
    auditSide.indexOf("'/api/admin-homes/territory/audit-log?tenant_id='") > 0);
add('AuditSidebar: default 30s cadence',
    auditSide.indexOf('cadenceMs = 30000') > 0);
add('AuditSidebar: visibility API',
    auditSide.indexOf('document.hidden') > 0);
add('AuditSidebar: CHANGE_TYPE_STYLE 11 entries',
    auditSide.indexOf('assignment_granted:') > 0 &&
    auditSide.indexOf('assignment_revoked:') > 0 &&
    auditSide.indexOf('primary_set:') > 0 &&
    auditSide.indexOf('primary_unset:') > 0 &&
    auditSide.indexOf('access_toggle_changed:') > 0 &&
    auditSide.indexOf('scope_widened:') > 0 &&
    auditSide.indexOf('scope_narrowed:') > 0 &&
    auditSide.indexOf('pin_added:') > 0 &&
    auditSide.indexOf('pin_removed:') > 0 &&
    auditSide.indexOf('percentage_set:') > 0 &&
    auditSide.indexOf('percentage_changed:') > 0);
add('AuditSidebar: collapsed + expanded states',
    auditSide.indexOf('if (!expanded)') > 0 && auditSide.indexOf('// Expanded panel') > 0);
add('AuditSidebar: unseenCount tracking',
    auditSide.indexOf('unseenCount') > 0);
add('AuditSidebar: relTime helper',
    auditSide.indexOf('function relTime(') > 0);

// === Section 7: TerritorySearchBar ===
const searchBar = read(SEARCH_BAR) || '';
add('TerritorySearchBar: use client directive', searchBar.startsWith("'use client'"));
add('TerritorySearchBar: SearchResult type exported',
    searchBar.indexOf('export interface SearchResult') > 0);
add('TerritorySearchBar: SearchResultKind type exported',
    searchBar.indexOf('export type SearchResultKind') > 0);
add('TerritorySearchBar: default export',
    searchBar.indexOf('export default function TerritorySearchBar') > 0);
add('TerritorySearchBar: 300ms debounce',
    searchBar.indexOf('debounceMs = 300') > 0);
add('TerritorySearchBar: calls geo-search',
    searchBar.indexOf("'/api/admin-homes/territory/geo-search?tenant_id='") > 0);
add('TerritorySearchBar: keyboard ArrowDown/Up/Enter/Escape',
    searchBar.indexOf("e.key === 'ArrowDown'") > 0 &&
    searchBar.indexOf("e.key === 'ArrowUp'") > 0 &&
    searchBar.indexOf("e.key === 'Enter'") > 0 &&
    searchBar.indexOf("e.key === 'Escape'") > 0);
add('TerritorySearchBar: outside-click handler',
    searchBar.indexOf("addEventListener('mousedown'") > 0);
add('TerritorySearchBar: grouped by kind',
    searchBar.indexOf('const KIND_ORDER') > 0 && searchBar.indexOf('grouped[k]') > 0);

// === Section 8: TerritoryTab integration ===
const tab = read(TERR_TAB) || '';
add('TerritoryTab: QueueIndicator import',
    tab.indexOf("import QueueIndicator from '@/components/admin-homes/cockpit/territory/QueueIndicator'") > 0);
add('TerritoryTab: AuditSidebar import',
    tab.indexOf("import AuditSidebar from '@/components/admin-homes/cockpit/territory/AuditSidebar'") > 0);
add('TerritoryTab: TerritorySearchBar + SearchResult import',
    tab.indexOf("import TerritorySearchBar, { type SearchResult }") > 0);
add('TerritoryTab: cardsGeoFilter state',
    tab.indexOf('const [cardsGeoFilter, setCardsGeoFilter]') > 0);
add('TerritoryTab: onSearchSelect function',
    tab.indexOf('function onSearchSelect(r: SearchResult)') > 0);
add('TerritoryTab: agent kind branch in onSearchSelect',
    tab.indexOf("if (r.kind === 'agent')") > 0);
add('TerritoryTab: TerritorySearchBar JSX',
    tab.indexOf('<TerritorySearchBar tenantId={tenantId} onSelect={onSearchSelect} />') > 0);
add('TerritoryTab: QueueIndicator JSX',
    tab.indexOf('<QueueIndicator tenantId={tenantId} />') > 0);
add('TerritoryTab: AuditSidebar JSX',
    tab.indexOf('<AuditSidebar tenantId={tenantId} />') > 0);
add('TerritoryTab: header is justify-between',
    tab.indexOf('flex items-center justify-between gap-3 mb-3') > 0);
add('TerritoryTab: CardsView initialGeoFilter prop',
    tab.indexOf('initialGeoFilter={cardsGeoFilter}') > 0);
add('TerritoryTab: CardsView onClearGeoFilter prop',
    tab.indexOf('onClearGeoFilter={() => setCardsGeoFilter(null)}') > 0);
add('TerritoryTab: GeographyView onOpenCards passes geo filter',
    tab.indexOf("setCardsGeoFilter({ scope: f.scope, scope_id: f.scope_id, geo_name: '' })") > 0);

// === Section 9: No-regression ===
// T1-5 GeographyView untouched
const geoView = read(GEO_VIEW) || '';
add('T1-5 GeographyView: default export preserved',
    geoView.indexOf('export default function GeographyView') > 0);
add('T1-5 GeographyView: fetches geo-rollup',
    geoView.indexOf("'/api/admin-homes/territory/geo-rollup?'") > 0);
add('T1-5 GeographyView: CarveUpModal preserved',
    geoView.indexOf('function CarveUpModal(') > 0);
// T1-4 baseline
const bulkRestore = read(BULK_RESTORE) || '';
add('T1-4 bulk-restore: POST handler preserved',
    bulkRestore.indexOf('export async function POST(') > 0);
add('T1-4 bulk-restore: SET LOCAL preserved',
    bulkRestore.indexOf('SET LOCAL app.skip_apa_reroll') > 0);
const auditLog = read(AUDIT_LOG) || '';
add('T1-4 audit-log: GET handler preserved',
    auditLog.indexOf('export async function GET(') > 0);
add('T1-4 audit-log: full_name post-bug-fix preserved',
    auditLog.indexOf("'id, full_name'") > 0);
// TerritoryTab regression: all 5 toggle buttons still present
add('TerritoryTab regression: Agents button preserved',
    tab.indexOf("{btn('agents', 'Agents', Users, 'l')}") > 0);
add('TerritoryTab regression: Cards button preserved',
    tab.indexOf("{btn('cards', 'Cards', Table, 'm')}") > 0);
add('TerritoryTab regression: Geography button preserved',
    tab.indexOf("{btn('geography', 'Geography', Map, 'm')}") > 0);
add('TerritoryTab regression: Health button preserved',
    tab.indexOf("{btn('health', 'Health', Activity, 'm')}") > 0);
add('TerritoryTab regression: Detail button preserved',
    tab.indexOf("{btn('detail', 'Detail', Table, 'r')}") > 0);
add('TerritoryTab regression: all 5 view JSX renders preserved',
    tab.indexOf('<AgentsView') > 0 &&
    tab.indexOf('<CardsView') > 0 &&
    tab.indexOf('<GeographyView') > 0 &&
    tab.indexOf('<HealthView') > 0 &&
    tab.indexOf('<TerritoryClient') > 0);

// === Section 10: TSC ===
console.log('=== Section 10: TSC ===');
let tscOk = true;
try {
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('TSC exit: 0');
} catch {
  tscOk = false;
  console.log('TSC FAILED');
}
add('TSC --noEmit clean', tscOk);

// === Report ===
let pass = 0, fail = 0;
console.log('');
console.log('================================================================');
console.log('  W-TERRITORY-OPS T1-6 APPLY -- check results');
console.log('================================================================');
for (const c of checks) {
  if (c.ok) pass++; else fail++;
  console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.label + (c.detail ? '  -- ' + c.detail : ''));
}
console.log('');
console.log('  CHECKS: ' + checks.length + '  PASS: ' + pass + '  FAIL: ' + fail);
console.log('================================================================');
process.exit(fail > 0 ? 1 : 0);