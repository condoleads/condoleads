// scripts/probe-apa-trigger-functions.js
//
// Read-only probe to gather everything needed to write the F-APA-UPDATE-AUDIT-GAP
// fix patch with no guessing. Captures:
//
//   1. handle_apa_insert / handle_apa_update / handle_apa_delete bodies
//   2. Triggers attached to agent_property_access (timing + event + action)
//   3. territory_assignment_changes columns (names, types, null, defaults)
//   4. territory_assignment_changes CHECK constraints (especially change_type allowed list)
//   5. Sample row from territory_assignment_changes (most recent)
//   6. Distinct change_type values currently in use + counts
//   7. distribute_geo_to_children body (reference — this is the only fn currently writing audit rows)
//
// No writes. No transactions opened. Safe to run anytime.

const { Client } = require('pg');
const fs = require('fs');

function loadEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function resolveConnString() {
  const fromFiles = Object.assign({}, loadEnvFile('.env'), loadEnvFile('.env.local'));
  const order = ['DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'];
  for (const key of order) {
    if (process.env[key]) return { value: process.env[key], source: 'process.env.' + key };
    if (fromFiles[key]) return { value: fromFiles[key], source: '.env*::' + key };
  }
  return null;
}

function fingerprintHost(connStr) {
  try {
    const u = new URL(connStr);
    return u.hostname + u.pathname;
  } catch (_) {
    return '(unparsable)';
  }
}

function hr(label) {
  console.log('\n' + '='.repeat(80));
  console.log(label);
  console.log('='.repeat(80));
}

async function main() {
  const conn = resolveConnString();
  if (!conn) throw new Error('No DB connection string in env.');
  console.log('Connecting to: ' + fingerprintHost(conn.value) + ' (source: ' + conn.source + ')');

  const c = new Client({ connectionString: conn.value, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    // ---- 1. handle_apa_* function bodies ----
    hr('1. handle_apa_* function bodies');
    const fns = await c.query(
      "SELECT p.proname, p.prosrc, " +
      "       pg_get_function_arguments(p.oid) AS args, " +
      "       pg_get_function_result(p.oid) AS result_type, " +
      "       p.provolatile, p.prosecdef " +
      "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'public' " +
      "  AND p.proname IN ('handle_apa_insert', 'handle_apa_update', 'handle_apa_delete') " +
      "ORDER BY p.proname"
    );
    if (fns.rows.length === 0) {
      console.log('  (no handle_apa_* functions found)');
    } else {
      for (const f of fns.rows) {
        console.log('\n--- ' + f.proname + '(' + f.args + ') RETURNS ' + f.result_type +
          ' [volatility=' + f.provolatile + ', security_definer=' + f.prosecdef + '] ---');
        console.log(f.prosrc);
      }
    }

    // ---- 2. Triggers attached to agent_property_access ----
    hr('2. Triggers on agent_property_access');
    const triggers = await c.query(
      "SELECT t.tgname, " +
      "       CASE t.tgtype::int & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing, " +
      "       CASE WHEN (t.tgtype::int & 4) <> 0 THEN 'INSERT' " +
      "            WHEN (t.tgtype::int & 8) <> 0 THEN 'DELETE' " +
      "            WHEN (t.tgtype::int & 16) <> 0 THEN 'UPDATE' " +
      "            WHEN (t.tgtype::int & 32) <> 0 THEN 'TRUNCATE' " +
      "            ELSE 'unknown' END AS event_kind, " +
      "       pg_get_triggerdef(t.oid) AS def " +
      "FROM pg_trigger t " +
      "JOIN pg_class c ON c.oid = t.tgrelid " +
      "JOIN pg_namespace n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = 'public' AND c.relname = 'agent_property_access' " +
      "  AND NOT t.tgisinternal " +
      "ORDER BY t.tgname"
    );
    if (triggers.rows.length === 0) {
      console.log('  (no user triggers)');
    } else {
      for (const t of triggers.rows) {
        console.log('  ' + t.tgname + ':');
        console.log('    ' + t.def);
      }
    }

    // ---- 3. territory_assignment_changes columns ----
    hr('3. territory_assignment_changes columns');
    const cols = await c.query(
      "SELECT column_name, data_type, udt_name, is_nullable, column_default, " +
      "       character_maximum_length " +
      "FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND table_name = 'territory_assignment_changes' " +
      "ORDER BY ordinal_position"
    );
    if (cols.rows.length === 0) {
      console.log('  (table not found)');
    } else {
      for (const col of cols.rows) {
        const type = col.data_type === 'USER-DEFINED' ? col.udt_name : col.data_type;
        const nn = col.is_nullable === 'NO' ? ' NOT NULL' : '';
        const def = col.column_default ? ' DEFAULT ' + col.column_default : '';
        const len = col.character_maximum_length ? '(' + col.character_maximum_length + ')' : '';
        console.log('  ' + col.column_name + ': ' + type + len + nn + def);
      }
    }

    // ---- 4. territory_assignment_changes CHECK constraints ----
    hr('4. territory_assignment_changes CHECK constraints');
    const checks = await c.query(
      "SELECT con.conname, pg_get_constraintdef(con.oid) AS def " +
      "FROM pg_constraint con " +
      "JOIN pg_class cls ON cls.oid = con.conrelid " +
      "JOIN pg_namespace ns ON ns.oid = cls.relnamespace " +
      "WHERE ns.nspname = 'public' AND cls.relname = 'territory_assignment_changes' " +
      "  AND con.contype = 'c' " +
      "ORDER BY con.conname"
    );
    if (checks.rows.length === 0) {
      console.log('  (no CHECK constraints)');
    } else {
      for (const ck of checks.rows) {
        console.log('  ' + ck.conname + ':');
        console.log('    ' + ck.def);
      }
    }

    // ---- 5. Most recent row from territory_assignment_changes ----
    hr('5. territory_assignment_changes most recent row');
    const sample = await c.query(
      "SELECT * FROM territory_assignment_changes ORDER BY created_at DESC NULLS LAST LIMIT 1"
    );
    if (sample.rows.length > 0) {
      console.log(JSON.stringify(sample.rows[0], null, 2));
    } else {
      console.log('  (table is empty)');
    }

    // ---- 6. Distinct change_type values + counts ----
    hr('6. Distinct change_type values currently in use');
    const types = await c.query(
      "SELECT change_type, COUNT(*)::int AS cnt " +
      "FROM territory_assignment_changes " +
      "GROUP BY change_type ORDER BY cnt DESC"
    );
    if (types.rows.length === 0) {
      console.log('  (no rows in audit table)');
    } else {
      for (const t of types.rows) {
        console.log('  ' + t.change_type + ': ' + t.cnt);
      }
    }

    // ---- 7. distribute_geo_to_children body (reference — only fn currently writing audit) ----
    hr('7. distribute_geo_to_children body (reference)');
    const dist = await c.query(
      "SELECT p.prosrc, " +
      "       pg_get_function_arguments(p.oid) AS args, " +
      "       pg_get_function_result(p.oid) AS result_type " +
      "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'public' AND p.proname = 'distribute_geo_to_children'"
    );
    if (dist.rows.length === 0) {
      console.log('  (function not found)');
    } else {
      for (const f of dist.rows) {
        console.log('--- distribute_geo_to_children(' + f.args + ') RETURNS ' + f.result_type + ' ---');
        console.log(f.prosrc);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Probe complete. No writes performed.');
    console.log('='.repeat(80));
  } finally {
    await c.end();
  }
}

main().catch(function (e) {
  console.error('FAIL: ' + (e && e.message ? e.message : String(e)));
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});