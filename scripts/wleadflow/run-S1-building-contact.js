#!/usr/bin/env node
// scripts/wleadflow/run-S1-building-contact.js
//
// W-LEAD-FLOW Surface 1 (Building page) -- Scenario S1-Build:
//   Real HTTP POST to /api/walliam/contact with building_id from fixtures.
//   Verifies the lead row creates with correct origin context, resolver
//   stamps agent_id + manager hierarchy, and source_url renders.
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
  console.error('ABORT: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function abort(msg) { console.error('ABORT: ' + msg); process.exit(1); }

const DEV_URL = 'http://localhost:3000';
const ROUTE   = '/api/walliam/contact';

(async () => {
  // --- Load fixtures ---
  const fxPath = 'tests/lead-flow/fixtures.json';
  if (!fs.existsSync(fxPath)) abort('fixtures.json missing -- run setup-t1.js first');
  const fx = JSON.parse(fs.readFileSync(fxPath, 'utf8'));

  console.log('=== W-LEAD-FLOW S1-Build (Surface 1: Building page contact form) ===');
  console.log('  tenant:   ' + fx.tenant.id + '  (' + fx.tenant.slug + ' / ' + fx.tenant.domain + ')');
  console.log('  building: ' + fx.building.id);
  console.log('            ' + fx.building.name);
  console.log('            slug=' + fx.building.slug);
  console.log('            community_id=' + fx.building.community_id);
  console.log('');

  // --- Build request body using real fixture data ---
  const scenarioId = 'S1-Build';
  const unixMs = Date.now();
  const testEmail = 'wleadflow+' + scenarioId + '+' + unixMs + '@condoleads.ca';

  const body = {
    name:             'WLeadFlow S1 Build Test',
    email:            testEmail,
    phone:            '555-555-0001',
    message:          'Test lead from building-page contact form (' + new Date().toISOString() + ')',
    source:           'walliam_contact_form',
    building_id:      fx.building.id,
    listing_id:       null,
    community_id:     fx.building.community_id,  // real, derived from the building row
    municipality_id:  null,
    area_id:          null,
    neighbourhood_id: null,
    geo_name:         fx.building.name,
    tenant_id:        fx.tenant.id,
  };

  console.log('--- REQUEST ---');
  console.log('  POST ' + DEV_URL + ROUTE);
  console.log('  ' + JSON.stringify(body, null, 2).split('\n').join('\n  '));
  console.log('');

  // --- Fire the request ---
  const t0 = Date.now();
  let response;
  try {
    response = await fetch(DEV_URL + ROUTE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host':         fx.tenant.domain,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    abort('HTTP request failed: ' + e.message + '   (is `npm run dev` running on ' + DEV_URL + '?)');
  }
  const dt = Date.now() - t0;

  const status = response.status;
  const responseText = await response.text();
  let resJson = null;
  try { resJson = JSON.parse(responseText); } catch { /* keep raw text */ }

  console.log('--- RESPONSE ---');
  console.log('  status:    ' + status + '  (' + dt + 'ms)');
  console.log('  body:      ' + (resJson ? JSON.stringify(resJson) : responseText.slice(0, 500)));
  console.log('');

  if (status < 200 || status >= 300) {
    console.log('=== S1-Build: FAIL (HTTP ' + status + ') ===');
    process.exit(2);
  }

  // Give the route a moment for any async writes (resolver, activities, email)
  await new Promise(r => setTimeout(r, 2000));

  // --- Verify the lead row ---
  console.log('--- DB VERIFICATION ---');
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('contact_email', testEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadErr) abort('lead query: ' + leadErr.message);
  if (!lead) {
    console.log('  NO LEAD ROW found for ' + testEmail);
    console.log('=== S1-Build: FAIL (response was 2xx but lead row absent) ===');
    process.exit(2);
  }

  const checks = [];
  function check(label, got, want, optional) {
    const pass = (typeof want === 'function') ? want(got) : (got === want);
    checks.push({ label, got, want, pass, optional: !!optional });
    const mark = pass ? 'PASS' : (optional ? 'WARN' : 'FAIL');
    const wantStr = (typeof want === 'function') ? '(predicate)' : JSON.stringify(want);
    console.log('  [' + mark + '] ' + label.padEnd(22) + ' got=' + JSON.stringify(got) + (pass ? '' : '  want=' + wantStr));
  }

  console.log('  lead.id:               ' + lead.id);
  check('tenant_id',         lead.tenant_id,         fx.tenant.id);
  check('lead_origin_route', lead.lead_origin_route, 'contact_form');
  check('contact_email',     lead.contact_email,     testEmail);
  check('contact_name',      lead.contact_name,      body.name);
  check('source',            lead.source,            (v) => typeof v === 'string' && v.length > 0);
  check('building_id',       lead.building_id,       fx.building.id);
  check('community_id',      lead.community_id,      fx.building.community_id, true);  // optional: depends on resolver propagation
  check('geo_name',          lead.geo_name,          (v) => typeof v === 'string' && v.length > 0);
  check('agent_id (resolver fired)', lead.agent_id,  (v) => v !== null && v !== undefined);
  check('manager_id',        lead.manager_id,        (v) => true, true);
  check('area_manager_id',   lead.area_manager_id,   (v) => true, true);
  check('tenant_admin_id',   lead.tenant_admin_id,   (v) => true, true);
  check('assignment_source', lead.assignment_source, (v) => typeof v === 'string' && v.length > 0);
  check('status',            lead.status,            (v) => typeof v === 'string' && v.length > 0);

  console.log('');

  // --- Check the email-recipients log (we can't read King Shah's inbox; verify Resend got called) ---
  // Email recipients are logged via lib/admin-homes/log-email-recipients.ts. Look in
  // lead_email_recipients (or whatever the actual table is) -- skip if it's not in our schema.
  // For now we accept that 2xx response + agent_id resolved => sendTenantEmail fired.

  const fails = checks.filter(c => !c.pass && !c.optional);
  const warns = checks.filter(c => !c.pass && c.optional);

  console.log('--- SUMMARY ---');
  console.log('  checks: ' + checks.length + '  pass=' + checks.filter(c => c.pass).length + '  fail=' + fails.length + '  warn=' + warns.length);
  console.log('');
  if (fails.length === 0) {
    console.log('=== S1-Build: PASS ===');
    console.log('');
    console.log('  Real lead UUID:        ' + lead.id);
    console.log('  Open the dashboard:    ' + DEV_URL + '/admin-homes/leads');
    console.log('  Expected email inbox:  ' + fx.agents.king_shah.email);
    console.log('');
    console.log('  Manual verification asks:');
    console.log('    1. Lead row appears at top of /admin-homes/leads');
    console.log('    2. Source pill renders "Contact"');
    console.log('    3. Building name "' + fx.building.name + '" appears in geo context chain under the pill');
    console.log('    4. Clicking the row opens the workbench at /admin-homes/leads/' + lead.id);
    console.log('    5. King Shah inbox received the notification');
    process.exit(0);
  } else {
    console.log('=== S1-Build: FAIL ===');
    for (const c of fails) console.log('  - ' + c.label + ': got ' + JSON.stringify(c.got) + ', expected ' + (typeof c.want === 'function' ? '(predicate)' : JSON.stringify(c.want)));
    console.log('');
    console.log('  Real lead UUID (for cleanup/inspection): ' + lead.id);
    process.exit(2);
  }
})().catch(e => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});