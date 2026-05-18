#!/usr/bin/env node
// scripts/wleadflow/run-S2-S3-S4-session.js
//
// W-LEAD-FLOW Surfaces 4 + 5 + 6: session-based lead routes.
//
//   Phase 1: probe chat_sessions schema, pick or insert a WALLiam session
//            rooted on the fixture building.
//   Phase 2: S3 -- POST /api/walliam/estimator/vip-request
//            captures vip_request_id for S4.
//   Phase 3: S4 -- POST /api/walliam/estimator/vip-questionnaire
//   Phase 4: S2 -- POST /api/walliam/charlie/vip-request
//   Phase 5: verify all 3 leads in DB + summary.
//
// No schema guesses: chat_sessions clone-from-template if any row exists for
// WALLiam; otherwise probe-and-minimal-insert. Aborts loudly on schema
// surprises so the failure tells us what to fix next.

const fs = require('fs');
const path = require('path');

// --- env load ---
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

function abort(msg) { console.error('ABORT: ' + msg); process.exit(1); }

(async () => {
  // ---- Load fixtures ----
  const fxPath = 'tests/lead-flow/fixtures.json';
  if (!fs.existsSync(fxPath)) abort('fixtures.json missing -- run setup-t1.js first');
  const fx = JSON.parse(fs.readFileSync(fxPath, 'utf8'));

  console.log('=== W-LEAD-FLOW Surfaces 4 + 5 + 6 (estimator + estimator Q + charlie VIP) ===');
  console.log('  tenant:   ' + fx.tenant.id + ' (' + fx.tenant.slug + ')');
  console.log('  building: ' + fx.building.id + ' (' + fx.building.name + ')');
  console.log('');

  // ========================================================================
  // Phase 1: chat_sessions probe + session-row preparation
  // ========================================================================
  console.log('--- Phase 1: chat_sessions setup ---');

  // Probe schema
  const { data: probe, error: probeErr } = await supabase.from('chat_sessions').select('*').limit(1);
  if (probeErr) abort('chat_sessions probe: ' + probeErr.message);
  const chatSessionsCols = probe && probe[0] ? Object.keys(probe[0]) : [];
  console.log('  chat_sessions columns (' + chatSessionsCols.length + '):');
  console.log('    ' + chatSessionsCols.join(', '));

  if (chatSessionsCols.length === 0) {
    abort('chat_sessions table appears empty; cannot template a clone. Schema unknown. ' +
          'Add a manual session via the Charlie init route in the dev server and re-run.');
  }

  // Create a real auth user. Both VIP request routes require
  // chat_sessions.user_id to reference a real auth.users row, and the
  // lead row's contact_email comes from auth.users (not the request body).
  const testUserEmail = 'wleadflow+sess+' + Date.now() + '@condoleads.ca';
  const { data: createdUser, error: createUserErr } = await supabase.auth.admin.createUser({
    email: testUserEmail,
    email_confirm: true,
    user_metadata: { source: 'wleadflow-harness' },
  });
  if (createUserErr || !createdUser || !createdUser.user || !createdUser.user.id) {
    abort('failed to create test auth user: ' + (createUserErr && createUserErr.message ? createUserErr.message : 'no user returned'));
  }
  const testUserId = createdUser.user.id;
  console.log('  Created test auth user: ' + testUserId + ' (' + testUserEmail + ')');

  // S2 (Charlie VIP) needs its own chat_sessions row. The unique partial index
  // idx_chat_sessions_user_tenant_source_unique on (user_id, tenant_id, source)
  // forbids two sessions for the same (auth user, tenant, source) trio.
  // S3/S4 session and S2 session share tenant_id + source='walliam', so they
  // must be owned by distinct auth users.
  const testUserEmailS2 = 'wleadflow+sessS2+' + Date.now() + '@condoleads.ca';
  const { data: createdUserS2, error: createUserErrS2 } = await supabase.auth.admin.createUser({
    email: testUserEmailS2,
    email_confirm: true,
    user_metadata: { source: 'wleadflow-harness' },
  });
  if (createUserErrS2 || !createdUserS2 || !createdUserS2.user || !createdUserS2.user.id) {
    abort('failed to create S2 test auth user: ' + (createUserErrS2 && createUserErrS2.message ? createUserErrS2.message : 'no user returned'));
  }
  const testUserIdS2 = createdUserS2.user.id;
  console.log('  Created S2 test auth user: ' + testUserIdS2 + ' (' + testUserEmailS2 + ')');

  // Try to find an existing WALLiam session as a clone template
  let template = null;
  if (chatSessionsCols.includes('tenant_id')) {
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('tenant_id', fx.tenant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    template = existing;
  }

  let sessionId;
  if (template) {
    console.log('  Found existing WALLiam session as template: ' + template.id);
    // Clone with new identity + set current_page_* fields to our building
    const clone = { ...template };
    // Strip auto-managed columns
    delete clone.id;
    if ('created_at' in clone) delete clone.created_at;
    if ('updated_at' in clone) delete clone.updated_at;
    if ('last_message_at' in clone) clone.last_message_at = null;
    if ('current_page_type' in clone) clone.current_page_type = 'building';
    if ('current_page_id' in clone)   clone.current_page_id   = fx.building.id;
    if ('current_page_slug' in clone) clone.current_page_slug = fx.building.slug;
    if ('message_count' in clone)     clone.message_count = 0;
    if ('user_id' in clone)           clone.user_id = testUserId;  // real auth user (required by VIP routes)
    if ('session_token' in clone)     clone.session_token = require('crypto').randomUUID();  // fresh unique token (avoid UNIQUE collision on clone)

    const { data: inserted, error: insErr } = await supabase
      .from('chat_sessions')
      .insert(clone)
      .select()
      .single();
    if (insErr) abort('chat_sessions clone insert: ' + insErr.message);
    sessionId = inserted.id;
    console.log('  Cloned new session: ' + sessionId);
  } else {
    console.log('  No existing WALLiam session. Attempting minimal insert.');
    const minimal = {};
    if (chatSessionsCols.includes('tenant_id'))         minimal.tenant_id         = fx.tenant.id;
    if (chatSessionsCols.includes('current_page_type')) minimal.current_page_type = 'building';
    if (chatSessionsCols.includes('current_page_id'))   minimal.current_page_id   = fx.building.id;
    if (chatSessionsCols.includes('current_page_slug')) minimal.current_page_slug = fx.building.slug;

    const { data: inserted, error: insErr } = await supabase
      .from('chat_sessions')
      .insert(minimal)
      .select()
      .single();
    if (insErr) abort('chat_sessions minimal insert failed: ' + insErr.message + '\n' +
                      '  Tried payload: ' + JSON.stringify(minimal) + '\n' +
                      '  Available cols: ' + chatSessionsCols.join(', '));
    sessionId = inserted.id;
    console.log('  Inserted new session: ' + sessionId);
  }

  console.log('');

  // S2 (Charlie VIP) needs its own session. The Charlie route dedupes
  // on session_id when status=pending, and S3 just left such a vip_request
  // on the first session. A second session sidesteps the short-circuit.
  let sessionIdS2;
  {
    const cloneS2Source = template || { tenant_id: fx.tenant.id };
    const cloneS2 = { ...cloneS2Source };
    delete cloneS2.id;
    if ('created_at' in cloneS2)        delete cloneS2.created_at;
    if ('updated_at' in cloneS2)        delete cloneS2.updated_at;
    if ('last_message_at' in cloneS2)   cloneS2.last_message_at = null;
    if ('current_page_type' in cloneS2) cloneS2.current_page_type = 'building';
    if ('current_page_id' in cloneS2)   cloneS2.current_page_id   = fx.building.id;
    if ('current_page_slug' in cloneS2) cloneS2.current_page_slug = fx.building.slug;
    if ('message_count' in cloneS2)     cloneS2.message_count = 0;
    cloneS2.user_id       = testUserIdS2;  // distinct user -- unique index (user_id, tenant_id, source)
    cloneS2.session_token = require('crypto').randomUUID();
    const { data: insertedS2, error: insErrS2 } = await supabase
      .from('chat_sessions')
      .insert(cloneS2)
      .select()
      .single();
    if (insErrS2) abort('chat_sessions clone insert (S2): ' + insErrS2.message);
    sessionIdS2 = insertedS2.id;
    console.log('  Cloned second session for S2: ' + sessionIdS2);
  }

  // ========================================================================
  // Helpers
  // ========================================================================
  const results = [];
  async function fireAndVerify(scenarioId, surface, route, body, expectLeadOriginRoute, expectExtras) {
    console.log('====================================================================');
    console.log(scenarioId + ' -- ' + surface);
    console.log('====================================================================');
    console.log('  POST ' + DEV_URL + route);
    console.log('  body: ' + JSON.stringify(body));

    let response, status = 0, responseText = '';
    const t0 = Date.now();
    try {
      response = await fetch(DEV_URL + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Host': fx.tenant.domain, 'x-tenant-id': fx.tenant.id },
        body: JSON.stringify(body),
      });
      status = response.status;
      responseText = await response.text();
    } catch (e) {
      console.log('  HTTP FAIL: ' + e.message);
      results.push({ id: scenarioId, status: 'FAIL', reason: 'http: ' + e.message });
      return null;
    }
    const dt = Date.now() - t0;
    console.log('  response: ' + status + ' (' + dt + 'ms) ' + responseText.slice(0, 300));

    let resJson = null;
    try { resJson = JSON.parse(responseText); } catch {}

    if (status < 200 || status >= 300) {
      results.push({ id: scenarioId, status: 'FAIL', reason: 'HTTP ' + status, body: responseText.slice(0, 300) });
      console.log('');
      return null;
    }

    await new Promise(r => setTimeout(r, 2000));

    // Find the lead. Production routes don't return leadId, and lead.contact_email
    // comes from auth.users (not request body), so look up by
    // tenant_id + the test auth user + lead_origin_route + most recent.
    let lead = null;
    if (resJson && resJson.leadId) {
      const { data } = await supabase.from('leads').select('*').eq('id', resJson.leadId).maybeSingle();
      lead = data;
    }
    if (!lead) {
      const { data } = await supabase.from('leads').select('*')
        .eq('tenant_id', fx.tenant.id)
        .in('user_id', [testUserId, testUserIdS2])
        .eq('lead_origin_route', expectLeadOriginRoute)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lead = data;
    }

    if (!lead) {
      results.push({ id: scenarioId, status: 'FAIL', reason: '2xx but lead not found', resJson });
      console.log('  FAIL: response was 2xx but could not find a matching lead row');
      console.log('');
      return resJson;
    }

    console.log('  lead.id: ' + lead.id);
    const universal = {
      tenant_id:         lead.tenant_id === fx.tenant.id,
      lead_origin_route: lead.lead_origin_route === expectLeadOriginRoute,
      agent_id_resolved: lead.agent_id !== null && lead.agent_id !== undefined,
      status_set:        typeof lead.status === 'string' && lead.status.length > 0,
    };
    const extras = expectExtras ? expectExtras(lead) : {};
    const all = { ...universal, ...extras };
    const fails = Object.entries(all).filter(([_, v]) => !v).map(([k]) => k);

    for (const [k, v] of Object.entries(all)) {
      console.log('    [' + (v ? 'PASS' : 'FAIL') + '] ' + k);
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

  // ========================================================================
  // Phase 2: S3 -- Estimator VIP Request
  // ========================================================================
  const unixMs = Date.now();
  const s3Email = 'wleadflow+S3+' + unixMs + '@condoleads.ca';
  const s3Body = {
    sessionId:     sessionId,
    phone:         '555-555-0003',
    pageUrl:       '/' + fx.building.slug,
    buildingName:  fx.building.name,
    name:          'WLeadFlow S3 Test',  // route may use either name or fullName
    email:         s3Email,
    fullName:      'WLeadFlow S3 Test',
  };
  const s3Res = await fireAndVerify(
    'S3', 'Surface 4: Estimator VIP Request', '/api/walliam/estimator/vip-request',
    s3Body, 'estimator_vip_request',
    (lead) => ({ source_url_set: typeof lead.source_url === 'string' && lead.source_url.length > 0 }),
  );

  // Capture vip_request_id for S4
  let vipRequestId = null;
  if (s3Res) {
    vipRequestId = s3Res.requestId || s3Res.vipRequestId || s3Res.vip_request_id || s3Res.id;
    if (!vipRequestId && s3Res.data) {
      vipRequestId = s3Res.data.requestId || s3Res.data.id;
    }
  }
  if (!vipRequestId) {
    // fall back: query vip_requests for the lead just created
    const lastS3 = results.find(r => r.id === 'S3');
    if (lastS3 && lastS3.lead_id) {
      const { data: vrRow } = await supabase
        .from('vip_requests')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (vrRow) vipRequestId = vrRow.id;
    }
  }
  console.log('  Captured vip_request_id for S4: ' + (vipRequestId || '(none)'));
  console.log('');

  // ========================================================================
  // Phase 3: S4 -- Estimator Questionnaire
  // ========================================================================
  if (!vipRequestId) {
    console.log('SKIP S4 -- no vip_request_id available');
    results.push({ id: 'S4', status: 'SKIP', reason: 'no vip_request_id from S3' });
  } else {
    const s4Email = 'wleadflow+S4+' + Date.now() + '@condoleads.ca';
    const s4Body = {
      requestId:    vipRequestId,
      fullName:     'WLeadFlow S4 Test',
      email:        s4Email,
      budgetRange:  '$800K-$1.2M',
      timeline:     '3-6 months',
      buyerType:    'investor',
      requirements: 'Test questionnaire submission via S4 harness',
    };
    await fireAndVerify(
      'S4', 'Surface 5: Estimator Questionnaire', '/api/walliam/estimator/vip-questionnaire',
      s4Body, 'estimator_vip_request',  // questionnaire enriches the S3 lead in-place; lead_origin_route stays 'estimator_vip_request'
      (lead) => ({
        message_includes_questionnaire: typeof lead.message === 'string' && lead.message.indexOf('Questionnaire') !== -1,
      }),
    );
  }

  // ========================================================================
  // Phase 4: S2 -- Charlie VIP Request (independent surface)
  // ========================================================================
  // Charlie VIP needs a session that has a user_id (likely) and some chat history.
  // Try with the same anonymous session first; if the route rejects, we'll know
  // it needs more setup and we'll add a chat_messages insert next iteration.
  const s2Body = {
    sessionId: sessionIdS2,  // own session to avoid Charlie's session_id-based dedup
    planType:  'buyer',
    // some routes also accept these as fallbacks for anonymous sessions
    name:      'WLeadFlow S2 Test',
    email:     'wleadflow+S2+' + Date.now() + '@condoleads.ca',
    phone:     '555-555-0002',
  };
  await fireAndVerify(
    'S2', 'Surface 6: Charlie VIP Request', '/api/walliam/charlie/vip-request',
    s2Body, 'charlie_vip_request',
    null,
  );

  // ========================================================================
  // Phase 5: Summary
  // ========================================================================
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
  console.log('Inbox:        ' + fx.agents.king_shah.email);

  process.exit(failCount > 0 ? 2 : 0);
})().catch(e => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});