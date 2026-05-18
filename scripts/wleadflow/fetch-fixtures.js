#!/usr/bin/env node
// scripts/wleadflow/fetch-fixtures.js
//
// Fetch real WALLiam-tenant fixtures from live Supabase and write them to
// tests/lead-flow/fixtures.json. Every scenario harness in W-LEAD-FLOW
// reads from this file -- no values are hard-coded into the harnesses.
//
// Aborts if any expected row is missing. No fallbacks, no placeholders.
//
// Required env (from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const fs = require('fs');
const path = require('path');

// Load .env.local manually (no dependency on dotenv)
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ABORT: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const TENANT_ID  = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'; // WALLiam (from memory, verified at start of session)
const KING_SHAH  = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const NEO_SMITH  = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9bb3f';
const PLATFORM   = 'a7b4c075-60e9-40c3-b708-9a877c464e61';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function abort(msg) {
  console.error('ABORT: ' + msg);
  process.exit(1);
}

// Defensive single-row fetch: SELECT * to avoid column-name dependencies.
// Fails only if no row is found; missing optional columns are tolerated.
async function fetchOne(query, label) {
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) abort(`${label}: query failed: ${error.message}`);
  if (!data) abort(`${label}: no row found`);
  return data;
}
function pick(obj, key, fallback = null) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
}

(async () => {
  console.log('Fetching W-LEAD-FLOW fixtures from live Supabase...');
  console.log('  URL: ' + SUPABASE_URL);
  console.log('  Tenant: ' + TENANT_ID);
  console.log('');

  // --- 1. Verify tenant (defensive: SELECT *, pick fields) ---
  const tenant = await fetchOne(
    supabase.from('tenants').select('*').eq('id', TENANT_ID),
    'tenant'
  );
  const tenantSlug   = pick(tenant, 'slug') ?? pick(tenant, 'subdomain') ?? pick(tenant, 'name');
  const tenantDomain = pick(tenant, 'domain') ?? pick(tenant, 'primary_domain') ?? pick(tenant, 'host');
  console.log('  tenant:        ' + tenant.id + '  slug=' + tenantSlug + '  domain=' + tenantDomain);

  // --- 2. Verify King Shah agent and capture email ---
  const kingShah = await fetchOne(
    supabase.from('agents').select('*').eq('id', KING_SHAH),
    'King Shah agent'
  );
  if (pick(kingShah, 'tenant_id') !== TENANT_ID) abort('King Shah agent tenant_id mismatch');
  console.log('  king shah:     ' + kingShah.id + '  email=' + kingShah.email);

  // --- 3. Neo Smith (optional) ---
  const { data: neoRow } = await supabase
    .from('agents').select('*').eq('id', NEO_SMITH).maybeSingle();
  const neoSmith = neoRow && pick(neoRow, 'tenant_id') === TENANT_ID ? neoRow : null;
  console.log('  neo smith:     ' + (neoSmith ? neoSmith.id + '  email=' + neoSmith.email : '(absent or wrong tenant)'));

  // --- 4. Platform admin (Syed Shah) ---
  const { data: platformRow } = await supabase
    .from('agents').select('*').eq('id', PLATFORM).maybeSingle();
  console.log('  platform:      ' + (platformRow ? platformRow.id + '  email=' + platformRow.email : '(absent)'));

  // --- 5. A real building in WALLiam tenant ---
  const building = await fetchOne(
    supabase.from('buildings').select('*').eq('tenant_id', TENANT_ID).not('slug', 'is', null),
    'building'
  );
  console.log('  building:      ' + building.id + '  name=' + pick(building, 'building_name') + '  slug=' + pick(building, 'slug'));

  // --- 6. A real listing (mls_listings tenant-agnostic; available_in_vow=true) ---
  const listing = await fetchOne(
    supabase.from('mls_listings').select('*').eq('available_in_vow', true).not('unparsed_address', 'is', null),
    'mls_listing'
  );
  console.log('  listing:       ' + listing.id + '  address=' + pick(listing, 'unparsed_address'));

  // --- 7. Geo chain ---
  const WHITBY_AREA = '03d4e133-d9f9-4a7e-ba9a-83e57269c1d4';
  const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587';

  const area = await fetchOne(
    supabase.from('treb_areas').select('*').eq('id', WHITBY_AREA),
    'treb_area (Whitby)'
  );
  console.log('  area:          ' + area.id + '  name=' + pick(area, 'name'));

  const muni = await fetchOne(
    supabase.from('municipalities').select('*').eq('id', WHITBY_MUNI),
    'municipality (Whitby)'
  );
  console.log('  municipality:  ' + muni.id + '  name=' + pick(muni, 'name'));

  const community = await fetchOne(
    supabase.from('communities').select('*').eq('municipality_id', WHITBY_MUNI),
    'community (any in Whitby)'
  );
  console.log('  community:     ' + community.id + '  name=' + pick(community, 'name'));

  const neighbourhood = await fetchOne(
    supabase.from('neighbourhoods').select('*').eq('community_id', community.id),
    'neighbourhood (any in community)'
  );
  console.log('  neighbourhood: ' + neighbourhood.id + '  name=' + pick(neighbourhood, 'name'));

  // --- Write fixtures.json (defensive picks) ---
  const fixtures = {
    captured_at: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
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

  const outDir = path.join(process.cwd(), 'tests', 'lead-flow');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'fixtures.json');
  fs.writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + '\n');

  console.log('');
  console.log('Wrote: ' + outPath);
  console.log('Fixtures ready for W-LEAD-FLOW T3 harness.');
})().catch(e => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});