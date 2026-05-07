// scripts/r-territory-f-apa-neighbourhood-check-fix.js
//
// W-TERRITORY / F-APA-NEIGHBOURHOOD-CHECK migration (option a, v11).
//
// Adds 'neighbourhood' to the CHECK constraint on
// public.agent_property_access.scope. Decision was Shah's, 2026-05-07.
//
// Workflow (single transaction, verify-then-commit):
//   1. Connect to production (env-var fallback chain).
//   2. Probe pg_constraint for the actual CHECK constraint name on
//      public.agent_property_access matching the expected scope IN list
//      (filtered by 'all', 'area', 'municipality', 'community' literal
//      content). Hard-fail if zero or >1 matches.
//   3. Validate the discovered constraint name matches
//      ^[a-zA-Z_][a-zA-Z0-9_]*$ before interpolating into DDL — protects
//      against any pathological identifier that could break injection-safe
//      DDL composition.
//   4. Idempotency: if 'neighbourhood' is already in the discovered
//      constraint definition, log SKIP and exit 0 (no transaction opened).
//   5. Verify pre-state baseline: 'all', 'area', 'municipality',
//      'community' must all be present in the current definition. Hard-fail
//      if any is missing — that means the live schema diverged from what
//      was probed in the previous session and the migration is no longer
//      safe to apply blindly.
//   6. BEGIN; DROP CONSTRAINT [conname]; ADD CONSTRAINT [conname]
//      CHECK (scope IN (...all five values...));
//   7. Verify post-state: re-fetch constraint def, assert 'neighbourhood'
//      is now in it. ROLLBACK on any failure (including verification fail).
//   8. COMMIT.
//   9. Print summary and disconnect.
//
// Run: node scripts/r-territory-f-apa-neighbourhood-check-fix.js
//
// No CLI args. No flags. Idempotent re-run is safe.
//
// IMPORTANT: this is a DDL change against production. The transaction
// guarantees atomicity (all-or-nothing) but the change is permanent on
// COMMIT — there is no app-level undo step in this script. Reverse, if
// ever needed, is a similar script with neighbourhood removed from the
// IN list.

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
  // Don't print the password. Just show host and database name.
  try {
    const u = new URL(connStr);
    return `${u.hostname}${u.pathname}`;
  } catch (_) {
    return '(unparsable connection string)';
  }
}

const TABLE_SCHEMA = 'public';
const TABLE_NAME = 'agent_property_access';
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const EXPECTED_PRE_VALUES = ['all', 'area', 'municipality', 'community'];
const TARGET_VALUE = 'neighbourhood';
const TARGET_FULL_LIST = ['all', 'area', 'municipality', 'community', 'neighbourhood'];

async function main() {
  const conn = resolveConnString();
  if (!conn) {
    throw new Error(
      'No DB connection string found. Tried env vars: DATABASE_URL, SUPABASE_DB_URL, ' +
      'POSTGRES_URL, POSTGRES_URL_NON_POOLING (process.env and .env / .env.local).'
    );
  }
  console.log('Connecting to: ' + fingerprintHost(conn.value) + ' (source: ' + conn.source + ')');

  const client = new Client({ connectionString: conn.value, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // ---- Step 1+2: Probe constraint ----
    const probe = await client.query(
      `
      SELECT con.conname, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = $1
        AND cls.relname = $2
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%''all''%'
        AND pg_get_constraintdef(con.oid) LIKE '%''area''%'
        AND pg_get_constraintdef(con.oid) LIKE '%''municipality''%'
        AND pg_get_constraintdef(con.oid) LIKE '%''community''%'
      `,
      [TABLE_SCHEMA, TABLE_NAME]
    );

    if (probe.rows.length === 0) {
      throw new Error(
        'No CHECK constraint matching the expected scope IN list found on ' +
        TABLE_SCHEMA + '.' + TABLE_NAME + '. ' +
        'Either the constraint was renamed or the schema diverged from probe-race-prereqs.js findings.'
      );
    }
    if (probe.rows.length > 1) {
      throw new Error(
        'Multiple matching CHECK constraints found: ' +
        probe.rows.map(function (r) { return r.conname; }).join(', ') + '. ' +
        "Cannot pick one safely. Inspect manually with: " +
        "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint " +
        "WHERE conrelid = 'public.agent_property_access'::regclass AND contype = 'c';"
      );
    }

    const conname = probe.rows[0].conname;
    const currentDef = probe.rows[0].def;
    console.log('Discovered constraint: ' + conname);
    console.log('Current definition:   ' + currentDef);

    // ---- Step 3: Validate name ----
    if (!SAFE_IDENT.test(conname)) {
      throw new Error(
        'Discovered constraint name does not match safe-identifier pattern (' +
        SAFE_IDENT.source + '): ' + JSON.stringify(conname) + '. ' +
        'Refusing to interpolate into DDL.'
      );
    }

    // ---- Step 4: Idempotency check ----
    if (currentDef.indexOf("'" + TARGET_VALUE + "'") !== -1) {
      console.log('SKIP (idempotent): ' + TARGET_VALUE + ' already present in CHECK constraint. No action taken.');
      return;
    }

    // ---- Step 5: Verify pre-state baseline (strict set equality) ----
    //
    // Extract all single-quoted literals from the constraint def. Postgres
    // renders pg_get_constraintdef in a normalized form; the value literals
    // always appear as single-quoted strings (possibly with a ::text cast
    // appended, e.g. 'all'::text). We require the SET of extracted literals
    // to exactly equal the expected baseline — no extras (which would be
    // silently dropped on re-CREATE), no missing (which would mean the
    // schema diverged from what was probed last session). This is stricter
    // than the original "each expected value is present" check and closes
    // the gap where additional unknown values could be silently overwritten.
    const quoted = currentDef.match(/'[^']*'/g) || [];
    const liveValuesRaw = quoted.map(function (s) { return s.slice(1, -1); });
    const liveValues = Array.from(new Set(liveValuesRaw)).sort();
    const expectedSorted = EXPECTED_PRE_VALUES.slice().sort();
    const setsEqual =
      liveValues.length === expectedSorted.length &&
      liveValues.every(function (v, i) { return v === expectedSorted[i]; });
    if (!setsEqual) {
      throw new Error(
        'Pre-state baseline mismatch (strict set equality check failed).\n' +
        '  Live literals (deduped, sorted):     [' + liveValues.join(', ') + ']\n' +
        '  Expected literals (deduped, sorted): [' + expectedSorted.join(', ') + ']\n' +
        '  Constraint definition was:           ' + currentDef + '\n' +
        'Migration ABORTED to avoid silently dropping or adding constraint content. ' +
        'If the live state is intentionally different from the previous probe, ' +
        're-probe the constraint, update EXPECTED_PRE_VALUES, and re-run.'
      );
    }
    console.log(
      'Pre-state baseline verified (strict): live literal set exactly equals expected ' +
      '[' + EXPECTED_PRE_VALUES.join(', ') + '].'
    );

    // ---- Step 6: Apply migration in transaction ----
    const newCheckBody = TARGET_FULL_LIST
      .map(function (v) { return "'" + v + "'"; })
      .join(', ');
    const dropSql = 'ALTER TABLE ' + TABLE_SCHEMA + '.' + TABLE_NAME + ' DROP CONSTRAINT ' + conname;
    const addSql =
      'ALTER TABLE ' + TABLE_SCHEMA + '.' + TABLE_NAME +
      ' ADD CONSTRAINT ' + conname +
      ' CHECK (scope IN (' + newCheckBody + '))';

    console.log('\nMigration plan:');
    console.log('  ' + dropSql);
    console.log('  ' + addSql);
    console.log('');

    await client.query('BEGIN');
    try {
      await client.query(dropSql);
      await client.query(addSql);

      // ---- Step 7: Verify post-state ----
      const verify = await client.query(
        `
        SELECT pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con
        JOIN pg_class cls ON cls.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = $1 AND cls.relname = $2 AND con.conname = $3
        `,
        [TABLE_SCHEMA, TABLE_NAME, conname]
      );

      if (verify.rows.length !== 1) {
        throw new Error(
          'Post-migration verification failed: expected exactly 1 constraint named ' + conname +
          ', got ' + verify.rows.length + '.'
        );
      }
      const newDef = verify.rows[0].def;
      console.log('New definition:       ' + newDef);

      // ---- Step 7: Verify post-state (strict set equality) ----
      //
      // Same strict literal-set check as pre-state, but against the full
      // 5-value target list. Catches any unexpected divergence introduced
      // by the DDL itself (e.g., Postgres normalizing values in a way that
      // changes them).
      const newQuoted = newDef.match(/'[^']*'/g) || [];
      const newLiveRaw = newQuoted.map(function (s) { return s.slice(1, -1); });
      const newLive = Array.from(new Set(newLiveRaw)).sort();
      const targetSorted = TARGET_FULL_LIST.slice().sort();
      const newSetsEqual =
        newLive.length === targetSorted.length &&
        newLive.every(function (v, i) { return v === targetSorted[i]; });
      if (!newSetsEqual) {
        throw new Error(
          'Post-state verification failed (strict set equality check).\n' +
          '  New literals (deduped, sorted):    [' + newLive.join(', ') + ']\n' +
          '  Target literals (deduped, sorted): [' + targetSorted.join(', ') + ']\n' +
          '  New constraint definition:         ' + newDef + '\n' +
          'Rolling back.'
        );
      }

      await client.query('COMMIT');
      console.log('\nSUCCESS: F-APA-NEIGHBOURHOOD-CHECK migration applied and verified.');
      console.log('Constraint ' + conname + ' on ' + TABLE_SCHEMA + '.' + TABLE_NAME +
        ' now permits scope values: ' + TARGET_FULL_LIST.join(', ') + '.');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch(function (e) {
  console.error('FAIL: ' + (e && e.message ? e.message : String(e)));
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});