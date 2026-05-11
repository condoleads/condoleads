#!/usr/bin/env node
/**
 * verify-t6d-auto-approve-channel.js (v2)
 *
 * v2 fix: probes chat_sessions schema for NOT NULL no-default columns BEFORE
 * building the INSERT, so missing required-column errors surface upfront
 * rather than mid-test. Adds session_token (UUID), id (UUID) explicitly.
 *
 * If the probe reveals an unknown required column not handled by this script,
 * it aborts with a clear message before mutating tenant config.
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const TEST_AGENT = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const BASE_URL = 'http://localhost:3000';

// Columns we know how to populate in the INSERT
const HANDLED_COLUMNS = new Set([
  'id', 'session_token', 'user_id', 'tenant_id', 'source', 'agent_id',
]);

(async () => {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl || !supabaseUrl || !serviceKey) {
    console.error('FAIL: missing env vars.');
    process.exit(1);
  }

  const pg = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('=== T6d synthetic auto-approve channel-write verify (v2) ===');
  console.log('');

  // 0. Probe chat_sessions NOT NULL no-default columns
  console.log('--- Step 0: Probe chat_sessions required columns ---');
  const reqRes = await pg.query(
    "SELECT column_name, data_type FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'chat_sessions' " +
    "AND is_nullable = 'NO' AND column_default IS NULL " +
    "ORDER BY ordinal_position"
  );
  console.log('  Required (NOT NULL, no default) columns:');
  const required = reqRes.rows.map(r => r.column_name);
  for (const row of reqRes.rows) {
    const status = HANDLED_COLUMNS.has(row.column_name) ? '+ handled' : 'X UNHANDLED';
    console.log('    ' + row.column_name.padEnd(30) + row.data_type.padEnd(20) + status);
  }
  const unhandled = required.filter(c => !HANDLED_COLUMNS.has(c));
  if (unhandled.length > 0) {
    console.error('');
    console.error('FAIL: chat_sessions has NOT NULL no-default column(s) this script does not populate:');
    console.error('  ' + unhandled.join(', '));
    console.error('Add handling for these columns and re-run. Aborting before any tenant-config mutation.');
    await pg.end();
    process.exit(1);
  }
  console.log('  All required columns are handled by this script.');
  console.log('');

  // 1. Capture original config
  console.log('--- Step 1: Capture original WALLiam tenant config ---');
  const origRes = await pg.query(
    'SELECT plan_vip_auto_approve, plan_auto_approve_limit, seller_plan_auto_approve_limit, plan_hard_cap, seller_plan_hard_cap FROM tenants WHERE id = $1',
    [WALLIAM_TENANT]
  );
  if (origRes.rows.length === 0) {
    console.error('FAIL: WALLiam tenant row not found.');
    await pg.end();
    process.exit(1);
  }
  const orig = origRes.rows[0];
  console.log('  plan_vip_auto_approve=' + orig.plan_vip_auto_approve + '  plan_auto=' + orig.plan_auto_approve_limit + '  seller_plan_auto=' + orig.seller_plan_auto_approve_limit);
  console.log('  plan_hard_cap=' + orig.plan_hard_cap + '  seller_plan_hard_cap=' + orig.seller_plan_hard_cap);

  const fixtures = [];
  const results = { buyer: null, seller: null };

  try {
    // 2. Mutate config
    console.log('');
    console.log('--- Step 2: Mutate config ---');
    await pg.query(
      'UPDATE tenants SET plan_vip_auto_approve=true, plan_auto_approve_limit=2, seller_plan_auto_approve_limit=3, plan_hard_cap=10, seller_plan_hard_cap=10 WHERE id = $1',
      [WALLIAM_TENANT]
    );
    console.log('  test config: plan_vip=true plan_auto=2 seller_plan_auto=3 caps=10');

    // 3. Test each planType
    for (const planType of ['buyer', 'seller']) {
      console.log('');
      console.log('--- Step 3-' + planType + ': fixtures + POST + verify ---');

      const testEmail = 't6d-' + planType + '-' + Date.now() + '@example.com';

      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: 'TestPass123!Abc',
        email_confirm: true,
      });
      if (authErr) throw new Error('admin.createUser failed: ' + authErr.message);
      const userId = authData.user.id;
      fixtures.push({ kind: 'auth', id: userId });

      await pg.query(
        'INSERT INTO user_profiles (id, full_name, phone) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name',
        [userId, 'T6d Verify ' + planType, '00000000000']
      );
      fixtures.push({ kind: 'profile', id: userId });

      const sessionId = randomUUID();
      const sessionToken = randomUUID();
      await pg.query(
        "INSERT INTO chat_sessions (id, session_token, user_id, tenant_id, source, agent_id) " +
        "VALUES ($1, $2, $3, $4, 'walliam', $5)",
        [sessionId, sessionToken, userId, WALLIAM_TENANT, TEST_AGENT]
      );
      fixtures.push({ kind: 'session', id: sessionId, userId });

      console.log('  fixtures: auth=' + userId.slice(0, 8) + '... session=' + sessionId.slice(0, 8) + '... token=' + sessionToken.slice(0, 8) + '...');

      const res = await fetch(BASE_URL + '/api/walliam/charlie/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM_TENANT },
        body: JSON.stringify({ sessionId, planType }),
      });
      const body = await res.json().catch(() => ({}));
      console.log('  HTTP ' + res.status + '  status=' + body.status + '  granted=' + body.messagesGranted);

      if (res.status !== 200) {
        results[planType] = { ok: false, reason: 'HTTP ' + res.status, body };
        console.log('  X HTTP not 200');
        continue;
      }
      if (body.status !== 'approved') {
        results[planType] = { ok: false, reason: 'expected status=approved, got ' + body.status, body };
        console.log('  X status not approved - auto-approve did not fire');
        continue;
      }

      const ovRes = await pg.query(
        'SELECT ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, granted_by_tier, note FROM user_credit_overrides WHERE user_id = $1 AND tenant_id = $2',
        [userId, WALLIAM_TENANT]
      );
      if (ovRes.rows.length === 0) {
        results[planType] = { ok: false, reason: 'no override row' };
        console.log('  X no user_credit_overrides row');
        continue;
      }
      const ov = ovRes.rows[0];
      console.log('  override row:');
      console.log('    ai_chat_limit:     ' + ov.ai_chat_limit);
      console.log('    buyer_plan_limit:  ' + ov.buyer_plan_limit);
      console.log('    seller_plan_limit: ' + ov.seller_plan_limit);
      console.log('    estimator_limit:   ' + ov.estimator_limit);
      console.log('    granted_by_tier:   ' + ov.granted_by_tier);
      console.log('    note:              ' + ov.note);

      if (planType === 'buyer') {
        const channelOk = ov.buyer_plan_limit !== null && ov.seller_plan_limit === null && ov.ai_chat_limit === null && ov.estimator_limit === null;
        const grantOk = ov.buyer_plan_limit === 2;
        results.buyer = { ok: channelOk && grantOk, channelOk, grantOk };
        console.log('  ' + (channelOk ? '+' : 'X') + ' channel-correct: buyer wrote ONLY buyer_plan_limit');
        console.log('  ' + (grantOk    ? '+' : 'X') + ' grant-correct: buyer_plan_limit=' + ov.buyer_plan_limit + ' (expected 2)');
      } else {
        const channelOk = ov.seller_plan_limit !== null && ov.buyer_plan_limit === null && ov.ai_chat_limit === null && ov.estimator_limit === null;
        const grantOk = ov.seller_plan_limit === 3;
        results.seller = { ok: channelOk && grantOk, channelOk, grantOk };
        console.log('  ' + (channelOk ? '+' : 'X') + ' channel-correct: seller wrote ONLY seller_plan_limit');
        console.log('  ' + (grantOk    ? '+' : 'X') + ' grant-correct: seller_plan_limit=' + ov.seller_plan_limit + ' (expected 3)');
      }
    }

  } finally {
    // 4. Cleanup
    console.log('');
    console.log('--- Step 4: Cleanup ---');
    for (const f of fixtures.slice().reverse()) {
      try {
        if (f.kind === 'session') {
          await pg.query('DELETE FROM user_credit_overrides WHERE user_id = $1 AND tenant_id = $2', [f.userId, WALLIAM_TENANT]);
          await pg.query('DELETE FROM vip_requests WHERE session_id = $1', [f.id]);
          await pg.query('DELETE FROM lead_email_recipients_log WHERE lead_id IN (SELECT id FROM leads WHERE user_id = $1 AND tenant_id = $2)', [f.userId, WALLIAM_TENANT]);
          await pg.query('DELETE FROM leads WHERE user_id = $1 AND tenant_id = $2', [f.userId, WALLIAM_TENANT]);
          await pg.query('DELETE FROM chat_sessions WHERE id = $1', [f.id]);
        } else if (f.kind === 'profile') {
          await pg.query('DELETE FROM user_profiles WHERE id = $1', [f.id]);
        } else if (f.kind === 'auth') {
          await supabase.auth.admin.deleteUser(f.id);
        }
      } catch (e) {
        console.log('  cleanup warn (' + f.kind + '): ' + e.message);
      }
    }
    console.log('  cleaned up ' + fixtures.length + ' fixtures');

    // 5. Restore
    console.log('');
    console.log('--- Step 5: Restore tenant config ---');
    await pg.query(
      'UPDATE tenants SET plan_vip_auto_approve=$1, plan_auto_approve_limit=$2, seller_plan_auto_approve_limit=$3, plan_hard_cap=$4, seller_plan_hard_cap=$5 WHERE id = $6',
      [orig.plan_vip_auto_approve, orig.plan_auto_approve_limit, orig.seller_plan_auto_approve_limit, orig.plan_hard_cap, orig.seller_plan_hard_cap, WALLIAM_TENANT]
    );
    const verRes = await pg.query(
      'SELECT plan_vip_auto_approve, plan_auto_approve_limit, seller_plan_auto_approve_limit, plan_hard_cap, seller_plan_hard_cap FROM tenants WHERE id = $1',
      [WALLIAM_TENANT]
    );
    const v = verRes.rows[0];
    const restored =
      v.plan_vip_auto_approve === orig.plan_vip_auto_approve &&
      v.plan_auto_approve_limit === orig.plan_auto_approve_limit &&
      v.seller_plan_auto_approve_limit === orig.seller_plan_auto_approve_limit &&
      v.plan_hard_cap === orig.plan_hard_cap &&
      v.seller_plan_hard_cap === orig.seller_plan_hard_cap;
    console.log('  restoration: ' + (restored ? '+ OK' : 'X MISMATCH'));
    console.log('    plan_vip_auto_approve=' + v.plan_vip_auto_approve);
    console.log('    plan_auto_approve_limit=' + v.plan_auto_approve_limit);
    console.log('    seller_plan_auto_approve_limit=' + v.seller_plan_auto_approve_limit);
    console.log('    plan_hard_cap=' + v.plan_hard_cap);
    console.log('    seller_plan_hard_cap=' + v.seller_plan_hard_cap);
  }

  await pg.end();

  console.log('');
  console.log('=== Summary ===');
  const bp = results.buyer  ? (results.buyer.ok  ? '+ PASS' : 'X FAIL (' + (results.buyer.reason  || '') + ')') : 'X NOT RUN';
  const sp = results.seller ? (results.seller.ok ? '+ PASS' : 'X FAIL (' + (results.seller.reason || '') + ')') : 'X NOT RUN';
  console.log('  buyer  channel-aware write: ' + bp);
  console.log('  seller channel-aware write: ' + sp);
  const overall = results.buyer?.ok && results.seller?.ok;
  console.log('');
  console.log(overall ? '=== T6d-VERIFY GREEN ===' : '=== T6d-VERIFY FAILED ===');
  process.exit(overall ? 0 : 1);
})().catch(err => { console.error('FAIL:', err.message); console.error(err.stack); process.exit(1); });