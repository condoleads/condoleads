#!/usr/bin/env node
// scripts/wleadflow/setup-t1.js
//
// Atomic W-LEAD-FLOW T1 setup. No artifact-save dependency.
//   Phase 1: Schema probe of all 8 tables we will touch (real columns only).
//   Phase 2: Write docs/W-LEAD-FLOW-VERIFICATION-TRACKER.md from embedded content.
//   Phase 3: Fetch real WALLiam fixtures using ONLY verified columns.
//   Phase 4: Write tests/lead-flow/fixtures.json.
// Aborts on any row miss; never invents data.

const fs = require('fs');
const path = require('path');

// ============================================================
// Embedded tracker content (array-of-lines avoids template-literal escaping)
// ============================================================
const TRACKER_LINES = [
  '# W-LEAD-FLOW-VERIFICATION Tracker',
  '',
  'Workstream: end-to-end runtime verification of every System 2 lead source.',
  'Goal: each lead-creation route, when triggered with a real HTTP request, must',
  'produce a correct lead row in `leads`, fire the correct email(s) with the',
  'correct BCC overlay, and surface correctly in `/admin-homes/leads` with full',
  'origin context. No static checks. No fake data. PASS requires a real lead',
  'UUID created by a real request.',
  '',
  '## Test environment (LOCKED)',
  '',
  '- Server: `npm run dev` on `http://localhost:3000`',
  '- Tenant: WALLiam, `b16e1039-38ed-43d7-bbc5-dd02bb651bc9`',
  '  - `.env.local` must include `DEV_TENANT_DOMAIN=walliam.ca`',
  '- Resolver agent: King Shah, `fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe`',
  '- Notification sender: `notifications@condoleads.ca` (Resend verified)',
  '- Test contact email pattern: `wleadflow+<scenario>+<timestamp>@condoleads.ca`',
  '- Real fixture UUIDs read from `tests/lead-flow/fixtures.json`',
  '',
  '## Scope',
  '',
  'In scope: 7 System 2 lead-write routes (`app/api/walliam/*` and `app/api/charlie/*`).',
  'Out of scope: System 1 `app/api/chat/*` routes (maintenance-only per RULE ZERO).',
  '',
  '## Lead origin inventory (verified by recon 2026-05-18)',
  '',
  '| # | Route | lead_origin_route | Origin |',
  '|---|---|---|---|',
  '| 1 | `app/api/walliam/contact/route.ts` | `contact_form` | Public contact form |',
  '| 2 | `app/api/walliam/charlie/vip-request/route.ts` | `charlie_vip_request` | Charlie chat VIP upgrade |',
  '| 3 | `app/api/walliam/estimator/vip-request/route.ts` | `estimator_vip_request` | Estimator VIP request |',
  '| 4 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | `estimator_questionnaire` | Estimator questionnaire submit |',
  '| 5 | `app/api/charlie/lead/route.ts` | `charlie` (TBC at T2) | Charlie auth/lead capture |',
  '| 6 | `app/api/charlie/appointment/route.ts` | (TBC at T2) | Charlie appointment booking |',
  '| 7 | `app/api/charlie/plan-email/route.ts` | (TBC at T2) | Charlie plan generation + email |',
  '',
  '**Open question**: `LeadOriginRoute` type includes `estimator`. No `.insert()` literal writes it. Either a missing route or a dead enum value. Resolved at T2 by reading each charlie route.',
  '',
  '## Verification matrix (asserted per scenario)',
  '',
  'After the real HTTP request returns 2xx:',
  '',
  '- **DB**: lead row exists with',
  '  - `tenant_id` = WALLiam',
  '  - `agent_id` resolved (not null unless `assignment_source = admin`)',
  '  - `contact_email` = synthetic test address (wleadflow+...)',
  '  - `source` populated (tenant-prefixed where applicable)',
  '  - `lead_origin_route` = expected literal',
  '  - `source_url` populated when request carries it',
  '  - `building_id` / `listing_id` populated when request carries entity context',
  '  - `area_id` / `municipality_id` / `community_id` / `neighbourhood_id` populated when geo context present',
  '  - `manager_id` / `area_manager_id` / `tenant_admin_id` stamped via resolver',
  '  - `plan_data` / `appointment_date` populated where applicable',
  '- **EMAIL**: Resend returns success; King Shah inbox receives notification with correct subject and rendered address. BCC overlay fires (manager + area_manager + tenant_admin + platform_admin per delegation rules).',
  '- **DASHBOARD**: `/admin-homes/leads`',
  '  - Lead row appears at top of list',
  '  - Source pill renders correct label and color',
  '  - `source_url` clickable when present',
  '  - Geo context chain renders below pill',
  '  - Click opens workbench `/admin-homes/leads/[id]`',
  '- **WORKBENCH**: every relevant tab renders without crash',
  '  - Overview (always)',
  '  - Plan (when `plan_data` present)',
  '  - Estimator (when estimator submission present)',
  '  - Estimator Q (when questionnaire message present)',
  '  - Credits & Usage (always)',
  '  - Activity (always)',
  '  - Emails (shows the notification just sent)',
  '  - VIP (shows vip_request row when applicable)',
  '  - Notes (always; empty by default)',
  '',
  '## Phase plan',
  '',
  '| Phase | Status | Description |',
  '|---|---|---|',
  '| T0 Recon | CLOSED | 7 routes, 5 confirmed lead_origin_route literals, type-vs-code gap noted |',
  '| T1 Tracker + fixtures | THIS PHASE | Tracker + fetch-fixtures + fixtures.json |',
  '| T2 Per-route read | NOT STARTED | Read 7 route handlers for request shape + write contract + email path |',
  '| T3 Build harness | NOT STARTED | One `scripts/wleadflow/run-S<n>-<name>.js` per scenario; reads fixtures; real HTTP POST |',
  '| T4 Execute | NOT STARTED | Run S1..S7; PASS requires real lead UUID + timestamp |',
  '| T5 Dashboard cross-check | NOT STARTED | Verify pill + geo chain + workbench tabs render |',
  '| T6 Fix-iterate | NOT STARTED | Each FAIL gets a fix-and-rerun cycle |',
  '| T7 Multi-tenant smoke | NOT STARTED | Re-run S1..S7 against a second tenant |',
  '| T8 Close | NOT STARTED | All scenarios PASS; tracker frozen |',
  '',
  '## Scenario ledger (populated as T4 runs)',
  '',
  '| # | Scenario | Route | Status | Real lead UUID | Timestamp | Notes |',
  '|---|---|---|---|---|---|---|',
  '| S1 | Contact form (public) | `walliam/contact` | NOT STARTED | - | - | - |',
  '| S2 | Charlie VIP request | `walliam/charlie/vip-request` | NOT STARTED | - | - | - |',
  '| S3 | Estimator VIP request | `walliam/estimator/vip-request` | NOT STARTED | - | - | - |',
  '| S4 | Estimator questionnaire | `walliam/estimator/vip-questionnaire` | NOT STARTED | - | - | - |',
  '| S5 | Charlie lead capture | `charlie/lead` | NOT STARTED | - | - | - |',
  '| S6 | Charlie appointment | `charlie/appointment` | NOT STARTED | - | - | - |',
  '| S7 | Charlie plan-email | `charlie/plan-email` | NOT STARTED | - | - | - |',
  '',
  '## Rules',
  '',
  '- No scenario marked PASS without a real lead UUID created by a real HTTP request to the running dev server.',
  '- No fixture values invented. setup-t1.js aborts if any expected entity row is missing in WALLiam.',
  '- Test contact emails follow `wleadflow+<scenario>+<timestamp>@condoleads.ca` so all rows produced by this workstream are greppable for cleanup.',
  '- After T8 close, cleanup script deletes every lead with `contact_email LIKE wleadflow+%@condoleads.ca` and dependent rows.',
  '',
  '_Last updated: T1 in progress 2026-05-18_',
  ''
];

// ============================================================
// Env load
// ============================================================
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ABORT: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================
// Constants (UUIDs verified earlier in session memory; will be re-verified by Phase 3)
// ============================================================
const TENANT_ID   = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'; // WALLiam
const KING_SHAH   = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const NEO_SMITH   = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9bb3f';
const PLATFORM    = 'a7b4c075-60e9-40c3-b708-9a877c464e61';
const WHITBY_AREA = '03d4e133-d9f9-4a7e-ba9a-83e57269c1d4';
const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587';

function abort(msg) {
  console.error('ABORT: ' + msg);
  process.exit(1);
}
function pick(obj, key, fallback = null) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
}

(async () => {
  // ============================================================
  // Phase 1: SCHEMA PROBE
  // ============================================================
  console.log('=== Phase 1: SCHEMA PROBE ===');
  const tables = ['tenants','agents','buildings','mls_listings','treb_areas','municipalities','communities','neighbourhoods'];
  const schemas = {};
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log('  ' + t + ': ERROR ' + error.message);
      schemas[t] = [];
    } else {
      schemas[t] = (data && data[0]) ? Object.keys(data[0]) : [];
      const preview = schemas[t].slice(0, 12).join(', ') + (schemas[t].length > 12 ? ', ...' : '');
      console.log('  ' + t + ' (' + schemas[t].length + ' cols): ' + preview);
    }
  }
  console.log('');

  // ============================================================
  // Phase 2: WRITE TRACKER
  // ============================================================
  console.log('=== Phase 2: WRITE TRACKER ===');
  fs.mkdirSync('docs', { recursive: true });
  const trackerPath = 'docs/W-LEAD-FLOW-VERIFICATION-TRACKER.md';
  fs.writeFileSync(trackerPath, TRACKER_LINES.join('\n'));
  const trackerSize = fs.statSync(trackerPath).size;
  console.log('  Wrote ' + trackerPath + ' (' + trackerSize + ' bytes)');
  console.log('');

  // ============================================================
  // Phase 3: FETCH FIXTURES
  // ============================================================
  console.log('=== Phase 3: FETCH FIXTURES ===');

  // Tenant
  const { data: tenant, error: tErr } = await supabase.from('tenants').select('*').eq('id', TENANT_ID).maybeSingle();
  if (tErr) abort('tenant query: ' + tErr.message);
  if (!tenant) abort('tenant row not found for id ' + TENANT_ID);
  const tenantSlug = pick(tenant, 'slug') ?? pick(tenant, 'subdomain') ?? pick(tenant, 'name');
  const tenantDomain = pick(tenant, 'domain') ?? pick(tenant, 'primary_domain') ?? pick(tenant, 'host');
  console.log('  tenant ok:        ' + tenant.id + '  slug=' + tenantSlug + '  domain=' + tenantDomain);

  // King Shah
  const { data: kingShah, error: kErr } = await supabase.from('agents').select('*').eq('id', KING_SHAH).maybeSingle();
  if (kErr) abort('king shah query: ' + kErr.message);
  if (!kingShah) abort('King Shah agent not found for id ' + KING_SHAH);
  if (pick(kingShah, 'tenant_id') !== TENANT_ID) abort('King Shah agent tenant_id mismatch (got ' + pick(kingShah, 'tenant_id') + ')');
  console.log('  king shah ok:     ' + kingShah.id + '  email=' + kingShah.email);

  // Optional agents
  const { data: neoRow } = await supabase.from('agents').select('*').eq('id', NEO_SMITH).maybeSingle();
  const neoSmith = neoRow && pick(neoRow, 'tenant_id') === TENANT_ID ? neoRow : null;
  console.log('  neo smith:        ' + (neoSmith ? neoSmith.id + '  email=' + neoSmith.email : '(absent or wrong tenant)'));

  const { data: platformRow } = await supabase.from('agents').select('*').eq('id', PLATFORM).maybeSingle();
  console.log('  platform:         ' + (platformRow ? platformRow.id + '  email=' + platformRow.email : '(absent)'));

  // Building -- only filter by tenant_id IF that column exists
  let buildingQuery = supabase.from('buildings').select('*').not('slug', 'is', null);
  if (schemas.buildings.includes('tenant_id')) {
    buildingQuery = buildingQuery.eq('tenant_id', TENANT_ID);
    console.log('  building filter:  tenant_id=' + TENANT_ID + ' AND slug IS NOT NULL');
  } else {
    console.log('  building filter:  slug IS NOT NULL  (no tenant_id column on buildings)');
  }
  const { data: building, error: bErr } = await buildingQuery.limit(1).maybeSingle();
  if (bErr) abort('building query: ' + bErr.message);
  if (!building) abort('no building with slug found');
  console.log('  building ok:      ' + building.id + '  name=' + pick(building, 'building_name') + '  slug=' + pick(building, 'slug'));

  // Listing
  let listingQuery = supabase.from('mls_listings').select('*');
  if (schemas.mls_listings.includes('available_in_vow')) {
    listingQuery = listingQuery.eq('available_in_vow', true);
  }
  if (schemas.mls_listings.includes('unparsed_address')) {
    listingQuery = listingQuery.not('unparsed_address', 'is', null);
  }
  const { data: listing, error: lErr } = await listingQuery.limit(1).maybeSingle();
  if (lErr) abort('listing query: ' + lErr.message);
  if (!listing) abort('no listing found with available_in_vow=true and unparsed_address');
  console.log('  listing ok:       ' + listing.id + '  addr=' + pick(listing, 'unparsed_address'));

  // Geo chain
  const { data: area, error: aErr } = await supabase.from('treb_areas').select('*').eq('id', WHITBY_AREA).maybeSingle();
  if (aErr) abort('treb_areas query: ' + aErr.message);
  if (!area) abort('Whitby area not found for id ' + WHITBY_AREA);
  console.log('  area ok:          ' + area.id + '  name=' + pick(area, 'name'));

  const { data: muni, error: mErr } = await supabase.from('municipalities').select('*').eq('id', WHITBY_MUNI).maybeSingle();
  if (mErr) abort('municipalities query: ' + mErr.message);
  if (!muni) abort('Whitby muni not found for id ' + WHITBY_MUNI);
  console.log('  municipality ok:  ' + muni.id + '  name=' + pick(muni, 'name'));

  const { data: community, error: cErr } = await supabase.from('communities').select('*').eq('municipality_id', WHITBY_MUNI).limit(1).maybeSingle();
  if (cErr) abort('communities query: ' + cErr.message);
  if (!community) abort('no community found in Whitby muni ' + WHITBY_MUNI);
  console.log('  community ok:     ' + community.id + '  name=' + pick(community, 'name'));

  // neighbourhoods.area_id exists (confirmed by probe) but Whitby/Durham has no
  // neighbourhood rows. Pull any neighbourhood; tests at neighbourhood granularity
  // use this one's own area_id.
  const { data: neighbourhood, error: nErr } = await supabase.from('neighbourhoods').select('*').not('slug', 'is', null).limit(1).maybeSingle();
  if (nErr) abort('neighbourhoods query: ' + nErr.message);
  if (!neighbourhood) abort('no neighbourhoods exist in the database at all');
  console.log('  neighbourhood ok: ' + neighbourhood.id + '  name=' + pick(neighbourhood, 'name') + '  area_id=' + pick(neighbourhood, 'area_id'));

  console.log('');

  // ============================================================
  // Phase 4: WRITE FIXTURES.JSON
  // ============================================================
  console.log('=== Phase 4: WRITE FIXTURES.JSON ===');

  const fixtures = {
    captured_at: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
    schemas: schemas,
    tenant: {
      id: tenant.id,
      slug: tenantSlug,
      domain: tenantDomain,
    },
    agents: {
      king_shah: { id: kingShah.id, full_name: pick(kingShah, 'full_name'), email: pick(kingShah, 'email') },
      neo_smith: neoSmith ? { id: neoSmith.id, full_name: pick(neoSmith, 'full_name'), email: pick(neoSmith, 'email') } : null,
      platform:  platformRow ? { id: platformRow.id, full_name: pick(platformRow, 'full_name'), email: pick(platformRow, 'email') } : null,
    },
    building: {
      id: building.id,
      name: pick(building, 'building_name'),
      slug: pick(building, 'slug'),
      address: pick(building, 'address'),
      area_id: pick(building, 'area_id'),
      municipality_id: pick(building, 'municipality_id'),
      community_id: pick(building, 'community_id'),
      neighbourhood_id: pick(building, 'neighbourhood_id'),
    },
    listing: {
      id: listing.id,
      listing_key: pick(listing, 'listing_key'),
      address: pick(listing, 'unparsed_address'),
      area_id: pick(listing, 'area_id'),
      municipality_id: pick(listing, 'municipality_id'),
      community_id: pick(listing, 'community_id'),
      neighbourhood_id: pick(listing, 'neighbourhood_id'),
      building_id: pick(listing, 'building_id'),
    },
    geo: {
      area:          { id: area.id, name: pick(area, 'name'), slug: pick(area, 'slug') },
      municipality:  { id: muni.id, name: pick(muni, 'name'), slug: pick(muni, 'slug') },
      community:     { id: community.id, name: pick(community, 'name'), slug: pick(community, 'slug') },
      neighbourhood: { id: neighbourhood.id, name: pick(neighbourhood, 'name'), slug: pick(neighbourhood, 'slug') },
    },
    test_contact_email_pattern: 'wleadflow+<scenario>+<unix_ms>@condoleads.ca',
  };

  fs.mkdirSync('tests/lead-flow', { recursive: true });
  fs.writeFileSync('tests/lead-flow/fixtures.json', JSON.stringify(fixtures, null, 2) + '\n');
  console.log('  Wrote tests/lead-flow/fixtures.json (' + fs.statSync('tests/lead-flow/fixtures.json').size + ' bytes)');
  console.log('');

  console.log('=== DONE ===');
  console.log('Next: T2 -- read 7 route handlers to capture request shape.');
})().catch(e => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});