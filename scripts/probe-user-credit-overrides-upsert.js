#!/usr/bin/env node
/**
 * probe-user-credit-overrides-upsert.js
 *
 * Diagnoses the silent upsert failure in walliam/charlie/vip-request L288-L296.
 * Steps:
 *   1. List all constraints (PK / UNIQUE / FK / CHECK)
 *   2. List all indexes
 *   3. Attempt a direct upsert via supabase-js (same pattern as route) with full error capture
 *   4. Attempt a direct INSERT via raw pg (bypasses onConflict) to see if write works at all
 *   5. Cleanup
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const TEST_AGENT = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';

(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('=== 1. user_credit_overrides constraints ===');
  const constraintsRes = await pg.query(
    "SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS def " +
    "FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid " +
    "JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
    "WHERE cls.relname = 'user_credit_overrides' AND ns.nspname = 'public' " +
    "ORDER BY con.contype, con.conname"
  );
  const typeMap = { p: 'PRIMARY KEY', u: 'UNIQUE    ', f: 'FOREIGN KEY', c: 'CHECK     ', x: 'EXCLUSION ' };
  for (const row of constraintsRes.rows) {
    console.log('  [' + (typeMap[row.contype] || row.contype) + '] ' + row.conname);
    console.log('    ' + row.def);
  }
  console.log('');
  console.log('  Total constraints: ' + constraintsRes.rows.length);
  const uniqueOnUserTenant = constraintsRes.rows.some(r =>
    r.contype === 'u' && /user_id/.test(r.def) && /tenant_id/.test(r.def)
  );
  console.log('  UNIQUE on (user_id, tenant_id): ' + uniqueOnUserTenant);
  console.log('');

  console.log('=== 2. Indexes ===');
  const idxRes = await pg.query(
    "SELECT indexname, indexdef FROM pg_indexes " +
    "WHERE tablename = 'user_credit_overrides' AND schemaname = 'public' " +
    "ORDER BY indexname"
  );
  for (const row of idxRes.rows) {
    console.log('  ' + row.indexname);
    console.log('    ' + row.indexdef);
  }
  const uniqueIdxOnUserTenant = idxRes.rows.some(r =>
    /UNIQUE/i.test(r.indexdef) && /user_id/.test(r.indexdef) && /tenant_id/.test(r.indexdef)
  );
  console.log('');
  console.log('  UNIQUE INDEX on (user_id, tenant_id): ' + uniqueIdxOnUserTenant);
  console.log('');

  console.log('=== 3. Create test auth user ===');
  const testEmail = 't6d-probe-upsert-' + Date.now() + '@example.com';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: testEmail, password: 'TestPass123!Abc', email_confirm: true
  });
  if (authErr) { console.error('FAIL createUser: ' + authErr.message); process.exit(1); }
  const userId = authData.user.id;
  console.log('  auth user: ' + userId);
  console.log('');

  console.log('=== 4. Direct upsert via supabase-js (mirrors route pattern with onConflict) ===');
  try {
    const { data: upsertData, error: upsertErr } = await supabase
      .from('user_credit_overrides')
      .upsert({
        user_id: userId,
        tenant_id: WALLIAM_TENANT,
        granted_by_agent_id: TEST_AGENT,
        granted_by_tier: 'auto',
        note: 'T6d probe upsert',
        buyer_plan_limit: 2,
        granted_at: new Date().toISOString(),
      }, { onConflict: 'user_id,tenant_id' })
      .select();
    if (upsertErr) {
      console.log('  X upsert returned error in response:');
      console.log('    code:    ' + (upsertErr.code || '(none)'));
      console.log('    message: ' + upsertErr.message);
      console.log('    details: ' + (upsertErr.details || '(none)'));
      console.log('    hint:    ' + (upsertErr.hint || '(none)'));
    } else {
      console.log('  + upsert succeeded');
      console.log('    rows: ' + (upsertData ? upsertData.length : 0));
      if (upsertData && upsertData.length > 0) {
        console.log('    first row id: ' + upsertData[0].id);
      }
    }
  } catch (err) {
    console.log('  X upsert threw exception:');
    console.log('    ' + err.message);
  }
  console.log('');

  console.log('=== 5. Direct upsert WITHOUT onConflict (alternative path) ===');
  try {
    const { data: u2Data, error: u2Err } = await supabase
      .from('user_credit_overrides')
      .upsert({
        user_id: userId,
        tenant_id: WALLIAM_TENANT,
        granted_by_agent_id: TEST_AGENT,
        granted_by_tier: 'auto',
        note: 'T6d probe upsert no onConflict',
        buyer_plan_limit: 3,
        granted_at: new Date().toISOString(),
      })
      .select();
    if (u2Err) {
      console.log('  X upsert (no onConflict) error:');
      console.log('    code:    ' + (u2Err.code || '(none)'));
      console.log('    message: ' + u2Err.message);
      console.log('    details: ' + (u2Err.details || '(none)'));
    } else {
      console.log('  + upsert (no onConflict) succeeded');
      console.log('    rows: ' + (u2Data ? u2Data.length : 0));
    }
  } catch (err) {
    console.log('  X exception: ' + err.message);
  }
  console.log('');

  console.log('=== 6. Direct raw-pg INSERT (bypasses PostgREST/onConflict entirely) ===');
  try {
    const r = await pg.query(
      "INSERT INTO user_credit_overrides (user_id, tenant_id, granted_by_agent_id, granted_by_tier, note, seller_plan_limit, granted_at) " +
      "VALUES ($1, $2, $3, 'auto', 'T6d probe raw pg', 5, NOW()) RETURNING id",
      [userId, WALLIAM_TENANT, TEST_AGENT]
    );
    console.log('  + raw INSERT succeeded, id=' + r.rows[0].id);
  } catch (err) {
    console.log('  X raw INSERT failed:');
    console.log('    code:    ' + err.code);
    console.log('    message: ' + err.message);
    console.log('    detail:  ' + err.detail);
  }
  console.log('');

  console.log('=== 7. Read back all rows for this test user ===');
  const readRes = await pg.query(
    'SELECT id, granted_by_tier, note, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit FROM user_credit_overrides WHERE user_id = $1',
    [userId]
  );
  console.log('  ' + readRes.rows.length + ' row(s):');
  for (const row of readRes.rows) {
    console.log('    id=' + row.id.slice(0, 8) + '... tier=' + row.granted_by_tier + ' buyer=' + row.buyer_plan_limit + ' seller=' + row.seller_plan_limit + ' chat=' + row.ai_chat_limit + ' note="' + row.note + '"');
  }
  console.log('');

  console.log('=== 8. Cleanup ===');
  await pg.query('DELETE FROM user_credit_overrides WHERE user_id = $1', [userId]);
  await supabase.auth.admin.deleteUser(userId);
  console.log('  cleaned');

  await pg.end();
})().catch(err => { console.error('FAIL:', err.message); console.error(err.stack); process.exit(1); });