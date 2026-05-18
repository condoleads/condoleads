#!/usr/bin/env node
// scripts/wleadflow/run-S1-variants.js
//
// W-LEAD-FLOW Surfaces 2 + 3 via the same /api/walliam/contact route.
// 5 scenarios, each a real HTTP POST creating a real lead:
//
//   S1-List : Listing page  -> listing_id (+ geo chain from listing)
//   S1-Area : Area page     -> area_id only
//   S1-Muni : Municipality  -> area_id + municipality_id
//   S1-Comm : Community     -> area + muni + community
//   S1-Nbhd : Neighbourhood -> area + neighbourhood
//
// Prerequisite: `npm run dev` running on localhost:3000.

const fs = require('fs');
const path = require('path');

// --- Env load ---
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
  console.error('ABORT: missing supabase env');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEV_URL = 'http://localhost:3000';
const ROUTE   = '/api/walliam/contact';

(async () => {
  const fxPath = 'tests/lead-flow/fixtures.json';
  if (!fs.existsSync(fxPath)) {
    console.error('ABORT: fixtures.json missing');
    process.exit(1);
  }
  const fx = JSON.parse(fs.readFileSync(fxPath, 'utf8'));

  // ---- Scenario definitions ----
  // Each scenario sends what the page in question would actually populate.
  const scenarios = [
    {
      id: 'S1-List',
      surface: 'Surface 2: Listing page',
      body: {
        building_id:      null,
        listing_id:       fx.listing.id,
        community_id:     fx.listing.community_id,
        municipality_id:  fx.listing.municipality_id,
        area_id:          fx.listing.area_id,
        neighbourhood_id: null,
        geo_name:         fx.listing.address,
      },
      assert: (lead) => ({
        listing_id:      lead.listing_id      === fx.listing.id,
        area_id:         lead.area_id         === fx.listing.area_id,
        municipality_id: lead.municipality_id === fx.listing.municipality_id,
        community_id:    lead.community_id    === fx.listing.community_id,
      }),
    },
    {
      id: 'S1-Area',
      surface: 'Surface 3a: Area page',
      body: {
        building_id:      null,
        listing_id:       null,
        community_id:     null,
        municipality_id:  null,
        area_id:          fx.geo.area.id,
        neighbourhood_id: null,
        geo_name:         fx.geo.area.name,
      },
      assert: (lead) => ({
        area_id: lead.area_id === fx.geo.area.id,
      }),
    },
    {
      id: 'S1-Muni',
      surface: 'Surface 3b: Municipality page',
      body: {
        building_id:      null,
        listing_id:       null,
        community_id:     null,
        municipality_id:  fx.geo.municipality.id,
        area_id:          fx.geo.area.id,
        neighbourhood_id: null,
        geo_name:         fx.geo.municipality.name + ', ' + fx.geo.area.name,
      },
      assert: (lead) => ({
        area_id:         lead.area_id         === fx.geo.area.id,
        municipality_id: lead.municipality_id === fx.geo.municipality.id,
      }),
    },
    {
      id: 'S1-Comm',
      surface: 'Surface 3c: Community page',
      body: {
        building_id:      null,
        listing_id:       null,
        community_id:     fx.geo.community.id,
        municipality_id:  fx.geo.municipality.id,
        area_id:          fx.geo.area.id,
        neighbourhood_id: null,
        geo_name:         fx.geo.community.name + ', ' + fx.geo.municipality.name,
      },
      assert: (lead) => ({
        area_id:         lead.area_id         === fx.geo.area.id,
        municipality_id: lead.municipality_id === fx.geo.municipality.id,
        community_id:    lead.community_id    === fx.geo.community.id,
      }),
    },
    {
      id: 'S1-Nbhd',
      surface: 'Surface 3d: Neighbourhood page',
      body: {
        building_id:      null,
        listing_id:       null,
        community_id:     null,
        municipality_id:  null,
        // neighbourhoods link to area only (verified by schema probe)
        area_id:          fx.geo.neighbourhood.area_id || fx.geo.area.id,
        neighbourhood_id: fx.geo.neighbourhood.id,
        geo_name:         fx.geo.neighbourhood.name,
      },
      assert: (lead) => ({
        neighbourhood_id: lead.neighbourhood_id === fx.geo.neighbourhood.id,
      }),
    },
  ];

  const results = [];

  for (const sc of scenarios) {
    console.log('====================================================================');
    console.log('Running ' + sc.id + ' -- ' + sc.surface);
    console.log('====================================================================');

    const unixMs = Date.now();
    const testEmail = 'wleadflow+' + sc.id + '+' + unixMs + '@condoleads.ca';

    const body = {
      name:    'WLeadFlow ' + sc.id + ' Test',
      email:   testEmail,
      phone:   '555-555-0001',
      message: sc.surface + ' test (' + new Date().toISOString() + ')',
      source:  'walliam_contact_form',
      tenant_id: fx.tenant.id,
      ...sc.body,
    };

    console.log('  POST ' + DEV_URL + ROUTE);
    console.log('  geo_name=' + body.geo_name);
    console.log('  building_id=' + body.building_id);
    console.log('  listing_id=' + body.listing_id);
    console.log('  area_id=' + body.area_id);
    console.log('  municipality_id=' + body.municipality_id);
    console.log('  community_id=' + body.community_id);
    console.log('  neighbourhood_id=' + body.neighbourhood_id);

    const t0 = Date.now();
    let response, status = 0, responseText = '';
    try {
      response = await fetch(DEV_URL + ROUTE, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Host': fx.tenant.domain },
        body:    JSON.stringify(body),
      });
      status = response.status;
      responseText = await response.text();
    } catch (e) {
      console.log('  HTTP FAIL: ' + e.message);
      results.push({ id: sc.id, status: 'FAIL', reason: 'http: ' + e.message });
      continue;
    }
    const dt = Date.now() - t0;
    console.log('  response: ' + status + ' (' + dt + 'ms) ' + responseText.slice(0, 200));

    if (status < 200 || status >= 300) {
      results.push({ id: sc.id, status: 'FAIL', reason: 'HTTP ' + status, body: responseText.slice(0, 300) });
      console.log('');
      continue;
    }

    // Wait for resolver / activity / email
    await new Promise(r => setTimeout(r, 2000));

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('contact_email', testEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.log('  DB query FAIL: ' + error.message);
      results.push({ id: sc.id, status: 'FAIL', reason: 'db: ' + error.message });
      continue;
    }
    if (!lead) {
      console.log('  NO LEAD ROW found for ' + testEmail);
      results.push({ id: sc.id, status: 'FAIL', reason: '2xx but lead row absent' });
      continue;
    }

    // Core asserts (universal)
    const universal = {
      tenant_id:         lead.tenant_id === fx.tenant.id,
      lead_origin_route: lead.lead_origin_route === 'contact_form',
      contact_email:     lead.contact_email === testEmail,
      agent_id_resolved: lead.agent_id !== null && lead.agent_id !== undefined,
      status_set:        typeof lead.status === 'string' && lead.status.length > 0,
    };
    // Scenario-specific FK asserts
    const fkAsserts = sc.assert(lead);

    const allAsserts = { ...universal, ...fkAsserts };
    const fails = Object.entries(allAsserts).filter(([_, v]) => !v).map(([k]) => k);

    console.log('  lead.id: ' + lead.id);
    for (const [k, v] of Object.entries(allAsserts)) {
      console.log('    [' + (v ? 'PASS' : 'FAIL') + '] ' + k);
    }

    results.push({
      id: sc.id,
      status: fails.length === 0 ? 'PASS' : 'FAIL',
      lead_id: lead.id,
      agent_id: lead.agent_id,
      assignment_source: lead.assignment_source,
      fails,
    });

    console.log('');
  }

  // ---- Summary ----
  console.log('====================================================================');
  console.log('SUMMARY');
  console.log('====================================================================');
  let passCount = 0, failCount = 0;
  for (const r of results) {
    if (r.status === 'PASS') passCount++;
    else failCount++;
    const note = r.status === 'PASS'
      ? '  lead=' + r.lead_id + '  agent=' + r.agent_id + '  src=' + r.assignment_source
      : '  reason=' + (r.reason || ('fails: ' + (r.fails || []).join(',')));
    console.log('  ' + r.id.padEnd(10) + ' ' + r.status.padEnd(5) + note);
  }
  console.log('');
  console.log('  Total: ' + results.length + '  PASS: ' + passCount + '  FAIL: ' + failCount);
  console.log('');
  console.log('Dashboard: ' + DEV_URL + '/admin-homes/leads');
  console.log('Inbox:     ' + fx.agents.king_shah.email);
  console.log('');
  console.log('Manual verification (per lead):');
  console.log('  1. Lead appears in /admin-homes/leads top-down');
  console.log('  2. Source pill renders "Contact"');
  console.log('  3. Geo context chain renders the right entity name below the pill');
  console.log('  4. Workbench opens cleanly on row click');
  console.log('  5. King Shah inbox received notification with right context');

  process.exit(failCount > 0 ? 2 : 0);
})().catch(e => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});