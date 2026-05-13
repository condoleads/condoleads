// scripts/probe-active-connections.js
// Diagnostic probe: shows what's currently happening on the Postgres backend.
// Run from a SECOND terminal while the race harness (or any other long-running
// operation) is in progress. Read-only. No locks. No writes.
//
// Reveals:
//   1. All non-idle backend connections + what each is doing
//   2. Lock waits (blocked-by-whom, for-how-long)
//
// USAGE: node scripts/probe-active-connections.js

const fs = require('fs');
const path = require('path');

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
if (!connStr) { console.error('No connection string'); process.exit(1); }

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('pg not installed'); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET statement_timeout = 0;');

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Active backend connections (non-idle, excluding this probe)');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  const active = await client.query(`
    SELECT
      pid,
      state,
      COALESCE(wait_event_type || '/' || wait_event, '(running)') AS waiting_on,
      EXTRACT(EPOCH FROM (now() - xact_start))::int AS xact_age_sec,
      EXTRACT(EPOCH FROM (now() - query_start))::int AS query_age_sec,
      query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state != 'idle'
      AND pid != pg_backend_pid()
    ORDER BY xact_start NULLS LAST;
  `);

  if (active.rows.length === 0) {
    console.log('(no active connections — harness may have completed, be between trials, or be idle in transaction)');
  } else {
    for (const row of active.rows) {
      console.log('');
      console.log(`pid ${row.pid}  state=${row.state}  waiting=${row.waiting_on}  xact_age=${row.xact_age_sec}s  query_age=${row.query_age_sec}s`);
      console.log(`  query: ${(row.query || '').slice(0, 300)}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Lock waits (blocked-blocking pairs)');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  const locks = await client.query(`
    SELECT
      blocked.pid AS blocked_pid,
      blocked.query AS blocked_query,
      blocking.pid AS blocking_pid,
      blocking.query AS blocking_query,
      blocked.wait_event_type || '/' || blocked.wait_event AS blocked_on,
      EXTRACT(EPOCH FROM (now() - blocked.query_start))::int AS blocked_for_sec
    FROM pg_stat_activity blocked
    JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
    WHERE blocked.datname = current_database();
  `);
  if (locks.rows.length === 0) {
    console.log('(no lock waits — nothing is blocking anything else right now)');
  } else {
    for (const row of locks.rows) {
      console.log('');
      console.log(`pid ${row.blocked_pid} BLOCKED BY pid ${row.blocking_pid} for ${row.blocked_for_sec}s  (waiting on ${row.blocked_on})`);
      console.log(`  blocked query:  ${(row.blocked_query || '').slice(0, 200)}`);
      console.log(`  blocking query: ${(row.blocking_query || '').slice(0, 200)}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Advisory locks held');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  const advisory = await client.query(`
    SELECT
      pid,
      classid,
      objid,
      mode,
      granted
    FROM pg_locks
    WHERE locktype = 'advisory'
    ORDER BY pid;
  `);
  if (advisory.rows.length === 0) {
    console.log('(no advisory locks held)');
  } else {
    console.table(advisory.rows);
  }

  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });