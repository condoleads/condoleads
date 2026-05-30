#!/usr/bin/env node
/**
 * F-apa-secdef-sweep apply-runner.
 *
 * Migration: supabase/migrations/20260530_f_apa_secdef_sweep.sql
 * Down:      supabase/migrations/20260530_f_apa_secdef_sweep_down.sql
 * Plan:      f-apa-triggers-secdef-recon-output.txt
 *
 * Pattern (mirrors Event 4 Step C secdef-fix runner):
 *   1. Validate DATABASE_URL (reject port 6543).
 *   2. Read migration, BOM-strip, ASCII-sanity.
 *   3. Precondition: all 3 handlers must currently be SECURITY INVOKER.
 *   4. Snapshot pre-state function bodies for all 3 (forensic; not used
 *      by the down-runner since the body never changes).
 *   5. Apply tx (SET LOCAL statement_timeout=0; execute migration body
 *      with V1-V6 in-tx asserts; COMMIT or ROLLBACK).
 *   6. Post-COMMIT V1: re-query prosecdef + proconfig for all 3.
 *   7. Post-COMMIT V2: LESSON pattern -- queue read under postgres, role
 *      switch confined to the APA INSERT that fires the trigger,
 *      RESET ROLE, post-state read under postgres. Asserts queue grew
 *      by 1. SAVEPOINT-equivalent via BEGIN/ROLLBACK in the runner.
 *
 * HARD GATES:
 *   - Production DB write (ALTER FUNCTION).
 *   - Multi-tenant trigger security model change (INVOKER -> DEFINER):
 *     tenant-isolation review documented in migration header. PASSED.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_f_apa_secdef_sweep.sql');
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots');

const FN_NAMES = ['handle_apa_insert', 'handle_apa_update', 'handle_apa_delete'];

function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }
function isoTs() { return new Date().toISOString().replace(/[:.]/g, '-'); }

// 1. Env validation
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail('DATABASE_URL not set in .env.local');
(function classifyUrl(u) {
  const m = u.match(/:(\d+)\//);
  if (!m) return;
  const port = parseInt(m[1], 10);
  if (port === 6543) fail('DATABASE_URL points at port 6543 (transaction pooler). Use 5432 (session pooler) or direct host.');
  console.log('env: DATABASE_URL port = ' + port + ' (acceptable).');
})(DATABASE_URL);

// 2. Read migration
let migrationSql;
try { migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8'); }
catch (e) { fail('Could not read migration: ' + e.message); }
if (migrationSql.charCodeAt(0) === 0xFEFF) {
  migrationSql = migrationSql.slice(1);
  console.log('migration: stripped UTF-8 BOM.');
}
const nonAscii = migrationSql.match(/[^\x00-\x7F]/g);
if (nonAscii) console.warn('WARN: non-ASCII chars: ' + Array.from(new Set(nonAscii)).join(' '));
console.log('migration: ' + migrationSql.length + ' bytes from ' + path.relative(process.cwd(), MIGRATION_PATH));

// 3. Precondition + 4. Snapshot
async function precheckAndSnapshot(client) {
  for (const fn of FN_NAMES) {
    const r = await client.query(
      "SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
      [fn]
    );
    if (r.rows.length !== 1) fail('Precondition FAIL: ' + fn + ' not found.');
    if (r.rows[0].prosecdef !== false) {
      fail('Precondition FAIL: ' + fn + '.prosecdef is already TRUE. Fix may already be applied; run down first or skip.');
    }
  }
  console.log('precondition OK: all 3 handlers are currently SECURITY INVOKER.');

  // Snapshot all 3 function definitions (forensic, not used on down).
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const ts = isoTs();
  const snapPath = path.join(SNAPSHOT_DIR, '_f-apa-secdef-sweep_handlers_' + ts + '.sql');
  const parts = ['-- F-apa-secdef-sweep snapshot of handle_apa_{insert,update,delete} pre-flip.',
                 '-- Captured: ' + new Date().toISOString(),
                 '-- Note: function BODIES are unchanged by the up migration; this snapshot',
                 '--       is forensic (audit/verify) only. The down migration is a one-line',
                 '--       ALTER FUNCTION ... SECURITY INVOKER; no body restore needed.',
                 ''];
  for (const fn of FN_NAMES) {
    const r = await client.query(
      "SELECT pg_get_functiondef(p.oid) AS def, prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
      [fn]
    );
    parts.push('-- ' + fn + ' (pre-flip): prosecdef=' + r.rows[0].prosecdef + ', proconfig=' + (r.rows[0].proconfig || '<none>'));
    parts.push(r.rows[0].def);
    parts.push('');
  }
  fs.writeFileSync(snapPath, parts.join('\n'));
  console.log('snapshot: wrote ' + path.relative(process.cwd(), snapPath));
}

// 5. Apply
async function applyMigration(client) {
  console.log('');
  console.log('=== BEGIN; ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');
  try {
    console.log('executing migration body...');
    client.on('notice', (n) => console.log('  NOTICE: ' + n.message));
    await client.query(migrationSql);
    console.log('migration body executed without raised exception.');
  } catch (e) {
    console.error('MIGRATION ERROR: ' + e.message);
    if (e.detail) console.error('  detail: ' + e.detail);
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('migration failed before COMMIT. No state changed.');
  }
  console.log('=== COMMIT; ===');
  await client.query('COMMIT');
}

// 6+7. Post-COMMIT verification
async function verifyPostCommit(client) {
  console.log('');
  console.log('=== post-COMMIT verification ===');

  // V1: prosecdef + proconfig for all 3.
  for (const fn of FN_NAMES) {
    const r = await client.query(
      "SELECT prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
      [fn]
    );
    if (!r.rows[0]) fail('post-COMMIT V1 FAIL: ' + fn + ' missing.');
    if (r.rows[0].prosecdef !== true) fail('post-COMMIT V1 FAIL: ' + fn + '.prosecdef not true.');
    const hasLocked = (r.rows[0].proconfig || []).some(x => x.toLowerCase().includes('search_path=public, pg_temp'));
    if (!hasLocked) fail('post-COMMIT V1 FAIL: ' + fn + '.proconfig missing locked search_path.');
    console.log('  post-COMMIT V1 ' + fn + ': secdef=true, locked search_path=public,pg_temp');
  }
  console.log('post-COMMIT V1 PASS.');

  // V2: LESSON pattern -- service_role APA INSERT, queue read under postgres.
  // Pick an aily agent + any community. Insert with skip_apa_reroll=on so
  // the trigger ENQUEUES (the actual permission-denied gap we fixed).
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL statement_timeout = 0');

    const pick = await client.query(`
      SELECT a.id, a.tenant_id FROM public.agents a
      JOIN public.tenants t ON t.id = a.tenant_id
      WHERE a.is_active=TRUE AND a.is_selling=TRUE AND a.tenant_id IS NOT NULL
        AND t.source_key = 'aily'
      LIMIT 1
    `);
    if (pick.rows.length === 0) {
      console.log('post-COMMIT V2 SKIP: no aily agent found.');
      await client.query('ROLLBACK');
      return;
    }
    const { id: agentId, tenant_id: tenantId } = pick.rows[0];
    const commPick = await client.query('SELECT id FROM public.communities LIMIT 1');
    if (commPick.rows.length === 0) {
      console.log('post-COMMIT V2 SKIP: no community in DB.');
      await client.query('ROLLBACK');
      return;
    }
    const communityId = commPick.rows[0].id;

    const preQ = (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='community' AND scope_id=$2 AND status='pending'",
      [tenantId, communityId]
    )).rows[0].n;

    // service_role: only the INSERT.
    await client.query("SET LOCAL app.skip_apa_reroll = 'on'");
    await client.query('SET LOCAL ROLE service_role');
    let insertErr = null;
    try {
      await client.query(`
        INSERT INTO public.agent_property_access
          (agent_id, tenant_id, scope, community_id, is_active, is_primary,
           condo_access, homes_access, buildings_access, buildings_mode)
        VALUES
          ($1, $2, 'community', $3, TRUE, FALSE, TRUE, TRUE, FALSE, 'manual')
      `, [agentId, tenantId, communityId]);
    } catch (e) {
      insertErr = e.message;
    }
    await client.query('RESET ROLE');

    if (insertErr) {
      await client.query('ROLLBACK');
      fail('post-COMMIT V2 FAIL: service_role APA INSERT raised "' + insertErr + '". DEFINER flip did NOT close the production-path bug.');
    }

    const postQ = (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='community' AND scope_id=$2 AND status='pending'",
      [tenantId, communityId]
    )).rows[0].n;

    if (postQ !== preQ + 1) {
      await client.query('ROLLBACK');
      fail('post-COMMIT V2 FAIL: service_role INSERT succeeded but queue did not grow by 1: ' + preQ + ' -> ' + postQ);
    }
    console.log('post-COMMIT V2 PASS: service_role INSERT on agent_property_access fired handle_apa_insert; queue grew by 1 (rolled back).');
    await client.query('ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail('post-COMMIT V2 FAIL: ' + e.message);
  }
}

// Main
(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('connected.');

  await precheckAndSnapshot(client);
  await applyMigration(client);
  await verifyPostCommit(client);

  await client.end();

  console.log('');
  console.log('=================================================');
  console.log('F-apa-secdef-sweep COMMITTED + verified.');
  console.log('handle_apa_insert/update/delete now SECURITY DEFINER + locked search_path.');
  console.log('F-EXISTING-HANDLE-APA-TRIGGERS-SAME-LATENT-RISK: CLOSED.');
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
