// scripts/apply-f-race-deadlock-fix.js
// W-TERRITORY/F-RACE-DEADLOCK + F-RACE-LATENCY — apply per-tenant advisory
// lock to serialize concurrent apa mutations.
//
// PROBLEM (surfaced by T6-followup-A race harness, 10/10 trials FAIL):
//   Two concurrent apa INSERTs on the same muni both fire handle_apa_insert
//   -> reroll_listings_at_geo, which UPDATEs every mls_listings row in scope.
//   The two transactions acquire row-exclusive locks on overlapping listing
//   sets -> Postgres deadlock detector aborts one. Even the winner takes
//   22-326 seconds due to lock contention. The system is correct (no
//   duplicates, exactly N primaries) but the UX is broken.
//
// SOLUTION:
//   Add a BEFORE trigger on agent_property_access that acquires a per-tenant
//   advisory lock at xact scope. All apa mutations within a tenant serialize.
//   Different tenants remain independent. Recursion guard (pg_trigger_depth>1)
//   ensures distribute_geo_to_children's child-scope inserts don't re-acquire.
//
// EFFECT:
//   - Concurrent admin assignments at same/overlapping scopes: no deadlock.
//     Second admin's request waits for first to commit, then proceeds.
//   - Predictable latency: ~5-15 seconds per assignment (vs unbounded today).
//   - Throughput: ~4-12 admin assignments per minute per tenant.
//
// IDEMPOTENT: CREATE OR REPLACE + DROP IF EXISTS pattern. Re-runnable.
// REVERSIBLE: rollback file dropped before apply.
//
// REQUIRES: pg installed, DATABASE_URL in .env.local.
// USAGE:    node scripts/apply-f-race-deadlock-fix.js

const fs = require('fs');
const path = require('path');

const SQL = `-- scripts/r-territory-f-race-deadlock-fix.sql
-- W-TERRITORY/F-RACE-DEADLOCK + F-RACE-LATENCY
--
-- Adds a per-tenant advisory lock acquired by a BEFORE trigger on
-- agent_property_access. The lock serializes concurrent apa mutations
-- within a single tenant, eliminating mls_listings deadlock and the
-- 22-326-second tail latencies observed in T6-followup-A.
--
-- The lock is xact-scoped (pg_advisory_xact_lock), so it is released
-- automatically at COMMIT or ROLLBACK. No leakage possible.
--
-- The trigger function uses COALESCE(NEW, OLD) so the same function
-- handles INSERT (NEW set, OLD null), UPDATE (both set), and DELETE
-- (NEW null, OLD set).
--
-- Recursion guard (pg_trigger_depth() > 1) ensures that apa rows
-- inserted by distribute_geo_to_children inside an existing trigger
-- chain do not attempt to re-acquire the same lock.

CREATE OR REPLACE FUNCTION public.apa_mutation_lock_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Don't lock if we're already inside a trigger chain
  -- (e.g., distribute_geo_to_children inserting child-scope rows)
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Per-tenant advisory lock. Same hash key for all apa mutations within
  -- this tenant; xact-scoped so it auto-releases at COMMIT or ROLLBACK.
  PERFORM pg_advisory_xact_lock(
    hashtext('apa_geo_mutation:' || COALESCE(NEW.tenant_id, OLD.tenant_id)::text)
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Three BEFORE triggers, one per DML operation. They fire BEFORE the
-- existing AFTER triggers (handle_apa_insert/update/delete), so the
-- lock is held by the time those run their distribute + reroll work.
DROP TRIGGER IF EXISTS apa_lock_before_insert ON public.agent_property_access;
CREATE TRIGGER apa_lock_before_insert
  BEFORE INSERT ON public.agent_property_access
  FOR EACH ROW EXECUTE FUNCTION public.apa_mutation_lock_trigger();

DROP TRIGGER IF EXISTS apa_lock_before_update ON public.agent_property_access;
CREATE TRIGGER apa_lock_before_update
  BEFORE UPDATE ON public.agent_property_access
  FOR EACH ROW EXECUTE FUNCTION public.apa_mutation_lock_trigger();

DROP TRIGGER IF EXISTS apa_lock_before_delete ON public.agent_property_access;
CREATE TRIGGER apa_lock_before_delete
  BEFORE DELETE ON public.agent_property_access
  FOR EACH ROW EXECUTE FUNCTION public.apa_mutation_lock_trigger();
`;

// ─── env load ────────────────────────────────────────────────────────────────
const envPath = path.resolve('.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
}
const connStr =
  env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
if (!connStr) {
  console.error('No DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL in .env.local or process.env.');
  process.exit(1);
}

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('pg not installed. Run: npm install --save-dev pg'); process.exit(1); }

const ts = (() => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
})();

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET statement_timeout = 0;');
  console.log('Connected. statement_timeout disabled for migration apply.');
  console.log('');

  // ─── Step 1: rollback snapshot ─────────────────────────────────────────────
  // For this fix, rollback = drop the new triggers + drop the new function.
  // No existing function/trigger is being replaced, so no body needs preserving.
  const rollbackPath = path.resolve(`scripts/r-territory-f-race-deadlock-rollback_${ts}.sql`);
  console.log('Step 1: writing rollback snapshot...');
  const rollbackSql = `-- Rollback for F-RACE-DEADLOCK fix
-- Captured: ${new Date().toISOString()}
-- To rollback: paste this into Supabase SQL editor or pipe through pg.

DROP TRIGGER IF EXISTS apa_lock_before_insert ON public.agent_property_access;
DROP TRIGGER IF EXISTS apa_lock_before_update ON public.agent_property_access;
DROP TRIGGER IF EXISTS apa_lock_before_delete ON public.agent_property_access;
DROP FUNCTION IF EXISTS public.apa_mutation_lock_trigger();
`;
  fs.writeFileSync(rollbackPath, rollbackSql, 'utf8');
  console.log(`  Saved: ${path.basename(rollbackPath)} (${fs.statSync(rollbackPath).size} bytes)`);
  console.log('');

  // ─── Step 2: archive forward SQL ───────────────────────────────────────────
  const sqlFile = path.resolve('scripts/r-territory-f-race-deadlock-fix.sql');
  fs.writeFileSync(sqlFile, SQL, 'utf8');
  console.log(`Step 2: SQL archived: ${path.basename(sqlFile)} (${fs.statSync(sqlFile).size} bytes)`);
  console.log('');

  // ─── Step 3: apply in transaction ──────────────────────────────────────────
  console.log('Step 3: applying inside transaction...');
  await client.query('BEGIN;');
  try {
    await client.query(SQL);
    await client.query('COMMIT;');
    console.log('  Committed.');
  } catch (e) {
    await client.query('ROLLBACK;').catch(() => {});
    console.error('  ROLLBACK due to error.');
    throw e;
  }
  console.log('');

  // ─── Step 4: verify ────────────────────────────────────────────────────────
  console.log('Step 4: verifying installation...');
  const checks = [];

  // Function exists with expected body marker
  const fn = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apa_mutation_lock_trigger';
  `);
  checks.push({
    label: 'function apa_mutation_lock_trigger exists',
    test: fn.rows.length === 1,
  });
  checks.push({
    label: 'function body contains pg_advisory_xact_lock',
    test: fn.rows[0]?.def?.includes('pg_advisory_xact_lock') || false,
  });
  checks.push({
    label: 'function body contains apa_geo_mutation lock key',
    test: fn.rows[0]?.def?.includes('apa_geo_mutation:') || false,
  });
  checks.push({
    label: 'function body contains pg_trigger_depth recursion guard',
    test: fn.rows[0]?.def?.includes('pg_trigger_depth() > 1') || false,
  });

  // Three BEFORE triggers exist on apa
  const triggers = await client.query(`
    SELECT tgname, tgtype
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'agent_property_access'
      AND tgname IN ('apa_lock_before_insert', 'apa_lock_before_update', 'apa_lock_before_delete')
    ORDER BY tgname;
  `);
  checks.push({
    label: 'all 3 BEFORE triggers attached to agent_property_access',
    test: triggers.rows.length === 3,
  });

  let allPass = true;
  for (const c of checks) {
    const status = c.test ? '  PASS' : '  FAIL';
    console.log(`${status}  ${c.label}`);
    if (!c.test) allPass = false;
  }

  if (!allPass) {
    console.error('');
    console.error('VERIFICATION FAILED. Rollback with:');
    console.error(`  Apply: ${rollbackPath}`);
    await client.end();
    process.exit(1);
  }

  await client.end();

  console.log('');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log('DONE. Per-tenant advisory lock live in production.');
  console.log('');
  console.log('Files:');
  console.log(`  Forward:  ${path.basename(sqlFile)}`);
  console.log(`  Rollback: ${path.basename(rollbackPath)}`);
  console.log('');
  console.log('NEXT: re-run the race harness. Expected: trials complete in seconds');
  console.log('(not minutes), no deadlocks, all PASS by consistency criteria.');
  console.log('Note: with serialization, race observation is no longer possible —');
  console.log('one transaction completes before the other starts its trigger work.');
  console.log('I will provide the harness acceptance-criteria patch in the next turn.');
  console.log('');
  console.log('  node scripts\\\\r-territory-t6-followup-race.js 5');
  console.log('  (5 trials should complete in 1-2 minutes total now, not 30+ minutes)');
  console.log('───────────────────────────────────────────────────────────────────────');
}

main().catch(e => {
  console.error('');
  console.error('ERROR:', e.message);
  if (e.detail)   console.error('  detail:  ', e.detail);
  if (e.hint)     console.error('  hint:    ', e.hint);
  if (e.where)    console.error('  where:   ', e.where);
  if (e.position) console.error('  position:', e.position);
  process.exit(1);
});