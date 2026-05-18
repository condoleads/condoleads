#!/usr/bin/env node
// scripts/wleadflow/run-S5-S6-S7-charlie.js
//
// W-LEAD-FLOW Phase 1 (T3-S5/S6/S7): Charlie chat lead surfaces.
//   S5 -- POST /api/charlie/lead          (intent='buyer')
//   S6 -- POST /api/charlie/appointment   (intent='buyer', with appointment_properties)
//   S7 -- POST /api/charlie/plan-email    (planType='seller' -> lead.intent='seller')
//
// All 3 share: validateSession({sessionId, userId, tenantId}), authEmail via
// supabase.auth.admin.getUserById(userId), lead_origin_route='charlie',
// source `${sourceKey}_charlie`. S7's response omits leadId; we disambiguate
// by intent='seller' in the user_id+origin fallback lookup.
//
// Pattern copied from run-S2-S3-S4-session.js (refactor candidate).

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

(function loadEnv() {
  const envPath = '.env.local';
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) {
      const [, key, val] = m;
      if (!process.env[key]) {
        process.env[key] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
})();

const DEV_URL = 'http://localhost:3000';
const DEV_TENANT_DOMAIN = process.env.DEV_TENANT_DOMAIN || 'walliam.ca';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from env / .env.local');
  process.exit(1);
}

const fxPath = path.join('tests', 'lead-flow', 'fixtures.json');
if (!fs.existsSync(fxPath)) {
  console.error('FATAL: fixtures not found at ' + fxPath);
  process.exit(1);
}
const fx = JSON.parse(fs.readFileSync(fxPath, 'utf8'));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function abort(msg) {
  console.error('ABORT: ' + msg);
  process.exit(1);
}

(async () => {
  console.log('=== W-LEAD-FLOW Surfaces 7+8+9 (Charlie chat: lead / appointment / plan-email) ===');
  console.log('  tenant:   ' + fx.tenant.id + ' (' + (fx.tenant.name || 'WALLiam') + ')');
  console.log('  building: ' + fx.building.id + ' (' + fx.building.name + ')');
  console.log('');

  console.log('--- Phase 1: chat_sessions setup ---');

  const { data: sessProbe } = await supabase.from('chat_sessions').select('*').limit(1).single();
  const sessCols = sessProbe ? Object.keys(sessProbe) : [];
  console.log('  chat_sessions columns (' + sessCols.length + '):');
  console.log('    ' + sessCols.join(', '));
  if (sessCols.length === 0) abort('chat_sessions empty; cannot template a clone');

  const testUserEmail = 'wleadflow+S5S6S7+' + Date.now() + '@condoleads.ca';
  const { data: createdUser, error: createUserErr } = await supabase.auth.admin.createUser({
    email: testUserEmail,
    email_confirm: true,
    user_metadata: { source: 'wleadflow-S5S6S7-harness' },
  });
  if (createUserErr || !createdUser || !createdUser.user || !createdUser.user.id) {
    abort('failed to create test auth user: ' + (createUserErr && createUserErr.message ? createUserErr.message : 'no user returned'));
  }
  const testUserId = createdUser.user.id;
  console.log('  Created test auth user: ' + testUserId + ' (' + testUserEmail + ')');

  let template = null;
  if (sessCols.includes('tenant_id')) {
    const { data } = await supabase.from('chat_sessions').select('*')
      .eq('tenant_id', fx.tenant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    template = data;
  }
  if (!template) abort('no template WALLiam session found');
  console.log('  Found existing WALLiam session as template: ' + template.id);

  const clone = Object.assign({}, template);
  delete clone.id;
  if ('created_at' in clone) delete clone.created_at;
  if ('updated_at' in clone) delete clone.updated_at;
  if ('last_message_at' in clone) clone.last_message_at = null;
  if ('current_page_type' in clone) clone.current_page_type = 'building';
  if ('current_page_id' in clone)   clone.current_page_id   = fx.building.id;
  if ('current_page_slug' in clone) clone.current_page_slug = fx.building.slug;
  if ('message_count' in clone)     clone.message_count = 0;
  if ('user_id' in clone)           clone.user_id = testUserId;
  if ('session_token' in clone)     clone.session_token = require('crypto').randomUUID();

  const { data: inserted, error: insErr } = await supabase.from('chat_sessions').insert(clone).select().single();
  if (insErr) abort('chat_sessions clone insert: ' + insErr.message);
  const sessionId = inserted.id;
  console.log('  Cloned new session: ' + sessionId);
  console.log('');

  const results = [];

  async function fireAndVerify(scenarioId, surfaceName, route, body, expectIntent, customChecksFn) {
    console.log('====================================================================');
    console.log(scenarioId + ' -- ' + surfaceName);
    console.log('====================================================================');

    const url = DEV_URL + route;
    console.log('  POST ' + url);
    console.log('  body: ' + JSON.stringify(body));

    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'host': DEV_TENANT_DOMAIN,
        'x-tenant-id': fx.tenant.id,
      },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - start;
    let resJson = null;
    try { resJson = await res.json(); } catch (e) { resJson = null; }
    console.log('  response: ' + res.status + ' (' + ms + 'ms) ' + JSON.stringify(resJson));

    if (!res.ok) {
      results.push({ id: scenarioId, status: 'FAIL', reason: 'non-2xx: ' + res.status, resJson });
      console.log('  FAIL: response not 2xx');
      console.log('');
      return resJson;
    }

    let lead = null;
    if (resJson && resJson.leadId) {
      const { data } = await supabase.from('leads').select('*').eq('id', resJson.leadId).maybeSingle();
      lead = data;
    }
    if (!lead) {
      const { data } = await supabase.from('leads').select('*')
        .eq('tenant_id', fx.tenant.id)
        .eq('user_id', testUserId)
        .eq('lead_origin_route', 'charlie')
        .eq('intent', expectIntent)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lead = data;
    }
    if (!lead) {
      results.push({ id: scenarioId, status: 'FAIL', reason: '2xx but lead not found', resJson });
      console.log('  FAIL: 2xx but lead not found');
      console.log('');
      return resJson;
    }

    console.log('  lead.id: ' + lead.id);
    const universal = {
      tenant_id:         lead.tenant_id === fx.tenant.id,
      lead_origin_route: lead.lead_origin_route === 'charlie',
      agent_id_resolved: lead.agent_id !== null && lead.agent_id !== undefined,
      status_set:        lead.status === 'new',
      user_id_set:       lead.user_id !== null,
      intent_correct:    lead.intent === expectIntent,
    };
    const custom = customChecksFn ? customChecksFn(lead) : {};
    const checks = Object.assign({}, universal, custom);

    const fails = [];
    for (const k of Object.keys(checks)) {
      const v = checks[k];
      console.log('    [' + (v ? 'PASS' : 'FAIL') + '] ' + k);
      if (!v) fails.push(k);
    }

    results.push({
      id: scenarioId,
      status: fails.length === 0 ? 'PASS' : 'FAIL',
      lead_id: lead.id,
      agent_id: lead.agent_id,
      assignment_source: lead.assignment_source,
      fails,
    });
    console.log('');
    return resJson;
  }

  // S5 -- Charlie Lead
  await fireAndVerify(
    'S5', 'Surface 7: Charlie Lead capture', '/api/charlie/lead',
    {
      sessionId,
      userId: testUserId,
      name: 'WLeadFlow S5 Test',
      phone: '555-555-0005',
      intent: 'buyer',
      buyerProfile: {},
      sellerProfile: null,
      listings: [],
      analytics: {},
      building_id: fx.building.id,
    },
    'buyer',
    (lead) => ({
      plan_data_object: lead.plan_data !== null && typeof lead.plan_data === 'object',
    }),
  );

  // S6 -- Charlie Appointment
  const apptDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString().split('T')[0];
  await fireAndVerify(
    'S6', 'Surface 8: Charlie Appointment booking', '/api/charlie/appointment',
    {
      sessionId,
      userId: testUserId,
      name: 'WLeadFlow S6 Test',
      email: 'wleadflow+S6+' + Date.now() + '@condoleads.ca',
      phone: '555-555-0006',
      intent: 'buyer',
      appointment_date: apptDate,
      appointment_time: '10:00:00',
      appointment_properties: [{ id: fx.building.id, name: fx.building.name }],
      geo_name: fx.building.name,
    },
    'buyer',
    (lead) => ({
      appointment_date_set: lead.appointment_date !== null,
      appointment_time_set: lead.appointment_time !== null,
    }),
  );

  // S7 -- Charlie Plan-Email (planType=seller => lead.intent=seller, disambiguates fallback lookup)
  await fireAndVerify(
    'S7', 'Surface 9: Charlie Plan-Email', '/api/charlie/plan-email',
    {
      sessionId,
      userId: testUserId,
      planType: 'seller',
      plan: { planType: 'seller', generatedAt: new Date().toISOString() },
      analytics: {},
      listings: [],
      geoContext: { geoName: fx.building.name },
      comparables: [],
      sellerEstimate: null,
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 0,
      blocks: [],
    },
    'seller',
    (lead) => ({
      plan_data_has_planType: lead.plan_data && typeof lead.plan_data === 'object' && lead.plan_data.planType === 'seller',
    }),
  );

  console.log('====================================================================');
  console.log('SUMMARY');
  console.log('====================================================================');
  let passCount = 0, failCount = 0, skipCount = 0;
  for (const r of results) {
    if (r.status === 'PASS') passCount++;
    else if (r.status === 'SKIP') skipCount++;
    else failCount++;
    const note = r.status === 'PASS'
      ? '  lead=' + r.lead_id + '  agent=' + r.agent_id + '  src=' + r.assignment_source
      : (r.status === 'SKIP' ? '  reason=' + r.reason : '  reason=' + (r.reason || ('fails: ' + (r.fails || []).join(','))));
    console.log('  ' + r.id.padEnd(6) + ' ' + r.status.padEnd(5) + note);
  }
  console.log('');
  console.log('  Total: ' + results.length + '  PASS: ' + passCount + '  FAIL: ' + failCount + '  SKIP: ' + skipCount);
  console.log('');
  console.log('Session used: ' + sessionId);
  console.log('Dashboard:    ' + DEV_URL + '/admin-homes/leads');

  process.exit(failCount > 0 ? 2 : 0);
})().catch(e => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});