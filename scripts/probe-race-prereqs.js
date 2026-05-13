// scripts/probe-race-prereqs.js
// W-TERRITORY/T6-followup-A — pre-flight probe for the race-safety harness.
//
// We need ground truth on three things before writing the harness:
//   1. distribute_geo_to_children's body — does it catch unique_violation or
//      propagate? Tells us what the harness asserts on the losing connection.
//   2. Partial unique indexes on agent_property_access — what columns + what
//      WHERE filter? Tells us which racing INSERT pattern triggers a conflict.
//   3. Current state of agent_property_access — community-primary count,
//      total apa rows, candidate test scopes for the race. Tells us a clean
//      starting point.
//
// Read-only. No writes. No transactions. No side effects.
// USAGE: node scripts/probe-race-prereqs.js

const fs = require('fs');
const path = require('path');

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
  console.error('No DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL found in .env.local or process.env.');
  process.exit(1);
}

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('pg not installed. Run: npm install --save-dev pg'); process.exit(1); }

const banner = label => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  ' + label);
  console.log('═══════════════════════════════════════════════════════════════════════════');
};

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET statement_timeout = 0;');
  console.log('Connected.');

  // ─── 1. distribute_geo_to_children body ────────────────────────────────────
  banner('Function: distribute_geo_to_children (all variants)');
  const dgc = await client.query(`
    SELECT
      pg_get_functiondef(p.oid) AS def,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'distribute_geo_to_children'
    ORDER BY p.pronargs;
  `);
  if (dgc.rows.length === 0) {
    console.log('(not found)');
  } else {
    dgc.rows.forEach((r, i) => {
      if (dgc.rows.length > 1) console.log(`--- variant ${i + 1}: (${r.args}) ---`);
      console.log(r.def);
    });
  }

  // ─── 2. partial unique indexes on agent_property_access ───────────────────
  banner('agent_property_access — all indexes (focus on partial unique)');
  const idx = await client.query(`
    SELECT
      i.relname AS index_name,
      pg_get_indexdef(i.oid) AS index_def,
      ix.indisunique AS is_unique,
      ix.indpred IS NOT NULL AS is_partial
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'agent_property_access'
    ORDER BY ix.indisunique DESC, ix.indpred IS NOT NULL DESC, i.relname;
  `);
  console.table(idx.rows.map(r => ({
    index_name: r.index_name,
    is_unique: r.is_unique,
    is_partial: r.is_partial,
    index_def: r.index_def.length > 100 ? r.index_def.slice(0, 97) + '...' : r.index_def,
  })));
  console.log('');
  console.log('Full index definitions (untruncated):');
  for (const r of idx.rows) {
    console.log(`  [${r.index_name}]`);
    console.log(`    ${r.index_def}`);
  }

  // ─── 3. CHECK constraints on agent_property_access ─────────────────────────
  banner('agent_property_access — CHECK constraints');
  const checks = await client.query(`
    SELECT
      con.conname AS constraint_name,
      pg_get_constraintdef(con.oid) AS constraint_def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'agent_property_access' AND con.contype = 'c'
    ORDER BY con.conname;
  `);
  if (checks.rows.length === 0) {
    console.log('(none)');
  } else {
    for (const r of checks.rows) {
      console.log(`  [${r.constraint_name}]  ${r.constraint_def}`);
    }
  }

  // ─── 4. Current apa state for race-test target ─────────────────────────────
  banner('Current state — community primaries (top tenant + counts)');
  const stateOverall = await client.query(`
    SELECT
      tenant_id,
      scope,
      COUNT(*) AS rows,
      COUNT(*) FILTER (WHERE is_primary = true) AS primaries,
      COUNT(*) FILTER (WHERE is_active = true) AS active
    FROM agent_property_access
    GROUP BY tenant_id, scope
    ORDER BY tenant_id, scope;
  `);
  console.table(stateOverall.rows);

  // ─── 5. Candidate test munis (Whitby-area siblings, no apa yet) ────────────
  banner('Candidate test_muni for race (Whitby-area siblings with no existing apa)');
  // Whitby area = 03d4e133-d9f9-4a7e-ba9a-83e57269c1d4
  // tenant     = b16e1039-38ed-43d7-bbc5-dd02bb651bc9
  const candidates = await client.query(`
    SELECT
      m.id AS muni_id,
      m.name AS muni_name,
      (SELECT COUNT(*) FROM communities c WHERE c.municipality_id = m.id) AS community_count,
      (SELECT COUNT(*) FROM agent_property_access apa
        WHERE apa.scope = 'municipality' AND apa.municipality_id = m.id
          AND apa.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9') AS muni_apa_rows,
      (SELECT COUNT(*) FROM agent_property_access apa
        JOIN communities c ON c.id = apa.community_id
        WHERE apa.scope = 'community' AND c.municipality_id = m.id
          AND apa.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
          AND apa.is_primary = true) AS existing_community_primaries
    FROM municipalities m
    WHERE m.area_id = '03d4e133-d9f9-4a7e-ba9a-83e57269c1d4'
      AND m.id != '70103aef-1b32-4939-9ff8-264e859a5587'  -- exclude Whitby itself
    ORDER BY community_count DESC;
  `);
  console.table(candidates.rows);

  // ─── 6. Available agents in the tenant for the race ────────────────────────
  banner('Active agents in tenant (race needs at least 2 distinct candidates)');
  const agents = await client.query(`
    SELECT id, name
    FROM agents
    WHERE id IN (
      SELECT DISTINCT agent_id FROM agent_property_access
      WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    )
       OR id IN (
      'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'::uuid,  -- King Shah
      'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'::uuid,  -- Neo Smith
      'cf002201-9b11-4c0f-a1b3-65ed702c9976'::uuid   -- WALLiam default
    )
    ORDER BY name;
  `);
  console.table(agents.rows);

  await client.end();
  console.log('');
  console.log('Done.');
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