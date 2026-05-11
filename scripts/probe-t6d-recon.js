#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

(async () => {
  // ==========================================================================
  // 1. Route file LE re-verify (PowerShell check failed due to CWD mismatch)
  // ==========================================================================
  console.log('=== 1. Route file LE re-verify (Buffer-level scan) ===');
  const ROUTE = path.resolve('app/api/walliam/charlie/vip-request/route.ts');
  if (!fs.existsSync(ROUTE)) {
    console.error('FAIL: route file not found at ' + ROUTE);
    process.exit(1);
  }
  const buf = fs.readFileSync(ROUTE);
  let crlfCount = 0;
  let bareLfCount = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) { crlfCount++; i++; }
    else if (buf[i] === 10) { bareLfCount++; }
  }
  // Handle final byte edge case
  if (buf.length > 0 && buf[buf.length - 1] === 10 && (buf.length < 2 || buf[buf.length - 2] !== 13)) {
    bareLfCount++;
  }
  console.log('  Path:               ' + path.relative(process.cwd(), ROUTE));
  console.log('  Bytes:              ' + buf.length);
  console.log('  CRLF sequences:     ' + crlfCount);
  console.log('  Bare LF:            ' + bareLfCount);
  let le;
  if (crlfCount > 0 && bareLfCount === 0) le = 'CRLF';
  else if (bareLfCount > 0 && crlfCount === 0) le = 'LF';
  else if (crlfCount > 0 && bareLfCount > 0) le = 'MIXED (investigate)';
  else le = 'NONE (no line endings - 1-line file?)';
  console.log('  Line endings:       ' + le);
  console.log('');

  // ==========================================================================
  // 2. DB connection
  // ==========================================================================
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('FAIL: no DB URL in env. Tried DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, SUPABASE_DATABASE_URL.');
    console.error('Check .env.local for the correct env var name.');
    process.exit(1);
  }
  console.log('=== 2. DB connection ===');
  console.log('  Using env var: ' + (process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.POSTGRES_URL ? 'POSTGRES_URL' : process.env.SUPABASE_DB_URL ? 'SUPABASE_DB_URL' : 'SUPABASE_DATABASE_URL'));
  const { Client } = require('pg');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('  Connected OK.');
  console.log('');

  // ==========================================================================
  // 3. user_credit_overrides full schema (Bug #1 verification)
  // ==========================================================================
  console.log('=== 3. user_credit_overrides full column list (Bug #1 - need seller_plan_limit?) ===');
  const r1 = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'user_credit_overrides' " +
    "ORDER BY ordinal_position"
  );
  if (r1.rows.length === 0) {
    console.log('  TABLE NOT FOUND - user_credit_overrides does not exist in public schema');
  } else {
    console.log('  Column                                  Type                 Nullable Default');
    console.log('  --------------------------------------- -------------------- -------- -------');
    for (const row of r1.rows) {
      console.log('  ' + row.column_name.padEnd(40) + (row.data_type || '').padEnd(20) + ' ' + (row.is_nullable || '').padEnd(8) + ' ' + (row.column_default || 'NULL'));
    }
    const cols = r1.rows.map(r => r.column_name);
    console.log('');
    console.log('  Bug #1 key checks:');
    console.log('    buyer_plan_limit exists:  ' + cols.includes('buyer_plan_limit'));
    console.log('    seller_plan_limit exists: ' + cols.includes('seller_plan_limit'));
  }
  console.log('');

  // ==========================================================================
  // 4. tenants - credit-config + VIP columns (Bug #2 verification)
  // ==========================================================================
  console.log('=== 4. tenants credit-config + VIP columns (Bug #2 - plan_auto_approve_limit + variants) ===');
  const r2 = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'tenants' " +
    "AND (column_name LIKE '%_limit' OR column_name LIKE '%_attempts' OR column_name LIKE '%_hard_cap' " +
    "OR column_name LIKE '%_free_messages' OR column_name LIKE '%_free_attempts' " +
    "OR column_name LIKE 'vip_%' OR column_name LIKE 'plan_vip%' OR column_name LIKE 'seller_plan_%' " +
    "OR column_name LIKE 'estimator_vip%') " +
    "ORDER BY column_name"
  );
  console.log('  Column                                  Type                 Nullable Default');
  console.log('  --------------------------------------- -------------------- -------- -------');
  for (const row of r2.rows) {
    console.log('  ' + row.column_name.padEnd(40) + (row.data_type || '').padEnd(20) + ' ' + (row.is_nullable || '').padEnd(8) + ' ' + (row.column_default || 'NULL'));
  }
  console.log('');
  const tenantCols = r2.rows.map(r => r.column_name);
  console.log('  Bug #2 / scope key checks:');
  console.log('    ai_auto_approve_limit exists:         ' + tenantCols.includes('ai_auto_approve_limit'));
  console.log('    plan_auto_approve_limit exists:       ' + tenantCols.includes('plan_auto_approve_limit'));
  console.log('    plan_manual_approve_limit exists:     ' + tenantCols.includes('plan_manual_approve_limit'));
  console.log('    plan_hard_cap exists:                 ' + tenantCols.includes('plan_hard_cap'));
  console.log('    seller_plan_auto_approve_limit:       ' + tenantCols.includes('seller_plan_auto_approve_limit'));
  console.log('    seller_plan_manual_approve_limit:     ' + tenantCols.includes('seller_plan_manual_approve_limit'));
  console.log('    seller_plan_hard_cap:                 ' + tenantCols.includes('seller_plan_hard_cap'));
  console.log('    estimator_auto_approve_attempts:      ' + tenantCols.includes('estimator_auto_approve_attempts'));
  console.log('    vip_auto_approve (chat-side toggle):  ' + tenantCols.includes('vip_auto_approve'));
  console.log('    plan_vip_auto_approve:                ' + tenantCols.includes('plan_vip_auto_approve'));
  console.log('    estimator_vip_auto_approve:           ' + tenantCols.includes('estimator_vip_auto_approve'));
  console.log('');

  // ==========================================================================
  // 5. chat_sessions counter columns
  // ==========================================================================
  console.log('=== 5. chat_sessions counter columns (vip_messages_granted + buyer/seller_plans_used) ===');
  const r3 = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'chat_sessions' " +
    "AND (column_name LIKE '%_used' OR column_name LIKE '%_count' OR column_name LIKE '%_granted' " +
    "OR column_name LIKE 'vip_%' OR column_name LIKE '%_approvals_%') " +
    "ORDER BY column_name"
  );
  console.log('  Column                                  Type                 Nullable Default');
  console.log('  --------------------------------------- -------------------- -------- -------');
  for (const row of r3.rows) {
    console.log('  ' + row.column_name.padEnd(40) + (row.data_type || '').padEnd(20) + ' ' + (row.is_nullable || '').padEnd(8) + ' ' + (row.column_default || 'NULL'));
  }
  console.log('');

  // ==========================================================================
  // 6. vip_requests relevant columns + CHECK constraints
  // ==========================================================================
  console.log('=== 6. vip_requests relevant columns ===');
  const r4 = await client.query(
    "SELECT column_name, data_type, is_nullable " +
    "FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'vip_requests' " +
    "AND column_name IN ('status', 'request_type', 'approval_type', 'messages_granted', 'request_source', 'buyer_type', 'plan_type') " +
    "ORDER BY column_name"
  );
  console.log('  Column                Type                 Nullable');
  console.log('  --------------------- -------------------- --------');
  for (const row of r4.rows) {
    console.log('  ' + row.column_name.padEnd(21) + (row.data_type || '').padEnd(20) + ' ' + (row.is_nullable || ''));
  }
  console.log('');

  console.log('=== 7. vip_requests CHECK constraints on request_type ===');
  const r5 = await client.query(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS def " +
    "FROM pg_constraint con " +
    "JOIN pg_class cls ON cls.oid = con.conrelid " +
    "JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
    "WHERE cls.relname = 'vip_requests' AND ns.nspname = 'public' AND con.contype = 'c' " +
    "ORDER BY con.conname"
  );
  for (const row of r5.rows) {
    console.log('  ' + row.conname);
    console.log('    ' + row.def);
  }
  console.log('');

  await client.end();
  console.log('=== Probe complete ===');
})().catch(err => {
  console.error('FAIL:', err.message);
  console.error(err.stack);
  process.exit(1);
});