// scripts/apply-f-area-reroll-fix.js
// W-TERRITORY/F-AREA-REROLL-TIMEOUT — apply set-based reroll/distribute fix.
//
// What this does, in order:
//   1. Dumps current function definitions (rollback snapshot, timestamped)
//   2. Writes new SQL to scripts/r-territory-f-area-reroll-fix.sql (git history)
//   3. Applies CREATE OR REPLACE for both functions inside one transaction
//   4. Verifies new bodies via pg_get_functiondef + content checks
//   5. Reports clearly on PASS / FAIL with restore instructions if FAIL
//
// IDEMPOTENT: CREATE OR REPLACE means re-running this is safe.
// REVERSIBLE: rollback file is created BEFORE the apply.
//
// REQUIRES: pg installed (already shipped in v8), DATABASE_URL in .env.local.
// USAGE:    node scripts/apply-f-area-reroll-fix.js

const fs = require('fs');
const path = require('path');

// ─── The migration SQL (archived to disk + applied below) ────────────────────
const SQL = `-- scripts/r-territory-f-area-reroll-fix.sql
-- W-TERRITORY/F-AREA-REROLL-TIMEOUT — set-based reroll/distribute.
--
-- BEFORE: row-by-row loop in reroll_listings_at_geo + distribute_listings_at_geo.
-- For Whitby area (67,850 listings): 67,850 calls to pick_routing_agent (each
-- doing 2 internal SELECTs against agent_property_access) + 67,850 conditional
-- UPDATEs = ~200k SQL operations per call. Supabase statement_timeout cancels
-- mid-loop. Surfaced in T6 v8 Test 4.
--
-- AFTER: single set-based UPDATE per function. Routing set computed once in a
-- CTE; per-listing pick computed inline via hashtext modulo. Postgres plans
-- this as a hash join. Should complete in single-digit seconds even at 67k
-- rows.
--
-- Behavior preserved exactly:
--   - Same hash function: abs(hashtext(listing_id::text)) % routing_count
--   - Same scope filter: ('area', 'municipality', 'community')
--   - Same empty-routing handling (picks become NULL via NULLIF + LEFT JOIN)
--   - Same return value (count of rows actually changed)
--
-- Caller signature unchanged. Triggers in T3b-C call these unchanged.

CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    -- mls_listings has no neighbourhood_id; can't reroll at that level
    RETURN 0;
  END IF;

  -- Compute routing set size once. v_total = 0 -> all picks become NULL
  -- (matches old behavior where pick_routing_agent returned NULL).
  SELECT COUNT(*) INTO v_total
  FROM agent_property_access
  WHERE scope = p_scope
    AND is_active = true
    AND tenant_id = p_tenant_id
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id)
    );

  WITH routing AS (
    SELECT
      agent_id,
      (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
    FROM agent_property_access
    WHERE scope = p_scope
      AND is_active = true
      AND tenant_id = p_tenant_id
      AND (
        (p_scope = 'area' AND area_id = p_scope_id) OR
        (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
        (p_scope = 'community' AND community_id = p_scope_id)
      )
  ),
  picks AS (
    SELECT
      ml.id AS listing_id,
      r.agent_id AS new_pick
    FROM mls_listings ml
    LEFT JOIN routing r
      ON v_total > 0
      AND r.rn = (abs(hashtext(ml.id::text)) % NULLIF(v_total, 0))
    WHERE (
      (p_scope = 'area' AND ml.area_id = p_scope_id) OR
      (p_scope = 'municipality' AND ml.municipality_id = p_scope_id) OR
      (p_scope = 'community' AND ml.community_id = p_scope_id)
    )
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
      AND ml.assigned_agent_id IS DISTINCT FROM picks.new_pick
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;


CREATE OR REPLACE FUNCTION public.distribute_listings_at_geo(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM agent_property_access
  WHERE scope = p_scope
    AND is_active = true
    AND tenant_id = p_tenant_id
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id)
    );

  -- distribute only fills NULL rows. Empty routing set -> no-op.
  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  WITH routing AS (
    SELECT
      agent_id,
      (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
    FROM agent_property_access
    WHERE scope = p_scope
      AND is_active = true
      AND tenant_id = p_tenant_id
      AND (
        (p_scope = 'area' AND area_id = p_scope_id) OR
        (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
        (p_scope = 'community' AND community_id = p_scope_id)
      )
  ),
  picks AS (
    SELECT
      ml.id AS listing_id,
      r.agent_id AS new_pick
    FROM mls_listings ml
    JOIN routing r
      ON r.rn = (abs(hashtext(ml.id::text)) % v_total)
    WHERE ml.assigned_agent_id IS NULL
      AND (
        (p_scope = 'area' AND ml.area_id = p_scope_id) OR
        (p_scope = 'municipality' AND ml.municipality_id = p_scope_id) OR
        (p_scope = 'community' AND ml.community_id = p_scope_id)
      )
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;
`;

// ─── env load (same pattern as run-r-territory-t6-smoke.js) ──────────────────
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
  console.log(`Connected. statement_timeout disabled for migration apply.`);
  console.log('');

  // ─── Step 1: dump current function bodies as rollback snapshot ─────────────
  const rollbackPath = path.resolve(`scripts/r-territory-f-area-reroll-rollback_${ts}.sql`);
  console.log(`Step 1: capturing rollback snapshot of current function bodies...`);
  const oldReroll = await client.query(
    `SELECT pg_get_functiondef('public.reroll_listings_at_geo(text,uuid,uuid)'::regprocedure) AS def;`
  );
  const oldDistribute = await client.query(
    `SELECT pg_get_functiondef('public.distribute_listings_at_geo(text,uuid,uuid)'::regprocedure) AS def;`
  );
  const rollbackSql = [
    `-- Rollback snapshot for F-AREA-REROLL fix`,
    `-- Captured: ${new Date().toISOString()}`,
    `-- To rollback: paste this entire file into the Supabase SQL editor or pipe through pg.`,
    ``,
    oldReroll.rows[0].def + ';',
    ``,
    oldDistribute.rows[0].def + ';',
    ``,
  ].join('\n');
  fs.writeFileSync(rollbackPath, rollbackSql, 'utf8');
  console.log(`  Saved: ${path.basename(rollbackPath)} (${fs.statSync(rollbackPath).size} bytes)`);
  console.log('');

  // ─── Step 2: archive new SQL to disk for git history ───────────────────────
  const sqlFile = path.resolve('scripts/r-territory-f-area-reroll-fix.sql');
  fs.writeFileSync(sqlFile, SQL, 'utf8');
  console.log(`Step 2: SQL archived: ${path.basename(sqlFile)} (${fs.statSync(sqlFile).size} bytes)`);
  console.log('');

  // ─── Step 3: apply both function replacements in one transaction ───────────
  console.log(`Step 3: applying CREATE OR REPLACE x2 inside transaction...`);
  await client.query('BEGIN;');
  try {
    await client.query(SQL);
    await client.query('COMMIT;');
    console.log(`  Committed.`);
  } catch (e) {
    await client.query('ROLLBACK;').catch(() => {});
    console.error(`  ROLLBACK due to error.`);
    throw e;
  }
  console.log('');

  // ─── Step 4: verify new bodies are in place ────────────────────────────────
  console.log(`Step 4: verifying new function bodies...`);
  const checks = [
    { name: 'reroll_listings_at_geo',     mustContain: 'WITH routing AS' },
    { name: 'reroll_listings_at_geo',     mustContain: 'IS DISTINCT FROM picks.new_pick' },
    { name: 'reroll_listings_at_geo',     mustNotContain: 'FOR rec IN' },
    { name: 'distribute_listings_at_geo', mustContain: 'WITH routing AS' },
    { name: 'distribute_listings_at_geo', mustContain: 'JOIN routing r' },
    { name: 'distribute_listings_at_geo', mustNotContain: 'FOR v_listing_id IN' },
  ];

  let allPass = true;
  for (const c of checks) {
    const r = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1;
    `, [c.name]);
    const body = r.rows[0]?.def || '';
    if (c.mustContain) {
      const found = body.includes(c.mustContain);
      console.log(`  ${found ? 'PASS' : 'FAIL'}  ${c.name} contains "${c.mustContain}"`);
      if (!found) allPass = false;
    }
    if (c.mustNotContain) {
      const stillThere = body.includes(c.mustNotContain);
      console.log(`  ${!stillThere ? 'PASS' : 'FAIL'}  ${c.name} does NOT contain old marker "${c.mustNotContain}"`);
      if (stillThere) allPass = false;
    }
  }

  await client.end();

  if (!allPass) {
    console.error('');
    console.error('VERIFICATION FAILED — function bodies do not match expected new content.');
    console.error('Rollback by applying:');
    console.error(`  ${rollbackPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log('DONE. Set-based reroll + distribute live in production.');
  console.log('');
  console.log('Files:');
  console.log(`  Forward:  ${path.basename(sqlFile)}`);
  console.log(`  Rollback: ${path.basename(rollbackPath)}`);
  console.log('');
  console.log('NEXT: re-run the T6 smoke under realistic timeout to confirm fix.');
  console.log('  I will provide the smoke-runner edit + tracker v9 patch in the next turn.');
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