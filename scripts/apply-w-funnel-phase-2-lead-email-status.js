#!/usr/bin/env node
/**
 * W-FUNNEL F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL Phase 2 apply-runner.
 *
 * Migration:  supabase/migrations/20260603_w_funnel_phase_2_lead_email_delivery_status.sql
 * Phase 1:    commit d5fd517 (response contract + clients)
 * Tracker:    docs/W-FUNNEL-VERIFICATION-TRACKER.md
 *
 * What it does:
 *   Adds a single `lead_email_delivery_status` text column to public.leads
 *   with NOT NULL DEFAULT 'pending' + a CHECK constraint enforcing the
 *   enum ('pending','sent','failed'). No backfill (decision locked in
 *   tracker -- 184 existing rows are test leads; landing on DEFAULT
 *   'pending' yields no dashboard noise because the badge fires only on
 *   'failed').
 *
 * HARD GATE notes:
 *   - Production-DB write HARD GATE: applies. Operator must approve before
 *     running this script. (User invocation = approval.)
 *   - Multi-tenant function review HARD GATE: does NOT apply. This is a
 *     schema change on a tenant-scoped table; no new/changed function
 *     resolves, routes, or writes tenant-scoped data. The column lives on
 *     leads (which already has tenant_id) but the migration does not alter
 *     routing logic.
 *
 * Pattern (mirrors apply-phase-lifecycle-landing-2.js):
 *   1. Validate DATABASE_URL (reject port 6543 transaction pooler).
 *   2. Read migration file (BOM-strip + ASCII sanity).
 *   3. Precondition checks (clean idempotency guard):
 *        - column lead_email_delivery_status does NOT already exist
 *        - constraint leads_lead_email_delivery_status_check does NOT exist
 *      If either present: report state + abort cleanly (assume prior partial
 *      apply or re-run; operator decides whether to drop manually first).
 *   4. Pre-snapshot: capture row count + the existing column list + the
 *      existing CHECK constraints. Saved to rollback-snapshots/ as a JSON
 *      file with timestamp.
 *   5. Open ONE transaction:
 *        - SET LOCAL statement_timeout = 0
 *        - Execute the migration body
 *        - Post-state verification (inside the same tx -- changes are
 *          visible to information_schema queries within the tx):
 *            a. column lead_email_delivery_status exists
 *            b. data_type = 'text'
 *            c. is_nullable = 'NO'
 *            d. column_default starts with 'pending'
 *            e. constraint leads_lead_email_delivery_status_check exists
 *            f. constraint definition matches the expected CHECK predicate
 *            g. row count UNCHANGED vs pre-snapshot
 *            h. sample read: SELECT lead_email_delivery_status FROM leads
 *               LIMIT 5 -- all rows return 'pending' (default applied)
 *        - COMMIT only if ALL checks pass; ROLLBACK on ANY mismatch.
 *   6. Post-COMMIT (outside tx, on fresh connection): re-verify column +
 *      constraint exist (catches the rare case where COMMIT silently
 *      didn't materialize).
 *
 * Usage:
 *   node scripts/apply-w-funnel-phase-2-lead-email-status.js
 *
 * Operator review:
 *   This runner + the migration SQL file must both be reviewed before
 *   invocation. The runner is idempotent: re-running after a successful
 *   apply aborts cleanly at the precondition check.
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260603_w_funnel_phase_2_lead_email_delivery_status.sql')
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots')

const TABLE = 'leads'
const COLUMN = 'lead_email_delivery_status'
const CONSTRAINT = 'leads_lead_email_delivery_status_check'

function fail (msg) { console.error('FATAL: ' + msg); process.exit(1) }
function isoTs () { return new Date().toISOString().replace(/[:.]/g, '-') }

// ---------------------------------------------------------------------------
// 1. Env validation
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) fail('DATABASE_URL not set in .env.local')

;(function classifyUrl (u) {
  const m = u.match(/:(\d+)\//)
  if (!m) { console.warn('WARN: could not parse port from DATABASE_URL; proceeding.'); return }
  const port = parseInt(m[1], 10)
  if (port === 6543) {
    fail('DATABASE_URL points at port 6543 (transaction pooler). ' +
         'This breaks SET LOCAL statement_timeout. Switch to session pooler (5432) or direct host.')
  }
  console.log(`env: DATABASE_URL port = ${port} (acceptable; not transaction-pooler).`)
})(DATABASE_URL)

// ---------------------------------------------------------------------------
// 2. Read migration (BOM-strip + ASCII sanity)
// ---------------------------------------------------------------------------
let migrationSql
try { migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8') }
catch (e) { fail('Could not read migration: ' + e.message) }
if (migrationSql.charCodeAt(0) === 0xFEFF) {
  migrationSql = migrationSql.slice(1)
  console.log('migration: stripped UTF-8 BOM.')
}
const nonAscii = migrationSql.match(/[^\x00-\x7F]/g)
if (nonAscii) {
  const unique = Array.from(new Set(nonAscii))
  console.warn('WARN: migration contains non-ASCII characters: ' + unique.join(' '))
}
console.log(`migration: ${migrationSql.length} bytes from ${path.relative(process.cwd(), MIGRATION_PATH)}.`)

// ---------------------------------------------------------------------------
// 3. + 4. Precondition + pre-snapshot
// ---------------------------------------------------------------------------
async function precheckAndSnapshot (client) {
  // Idempotency guard: column already present?
  const colExists = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [TABLE, COLUMN]
  )
  if (colExists.rowCount > 0) {
    console.log(`precheck: column ${TABLE}.${COLUMN} already exists -- aborting cleanly.`)
    console.log('  If you intended to re-run, drop the column + constraint manually first.')
    process.exit(2)
  }
  // Constraint already present (partial-apply leftover)?
  const conExists = await client.query(
    `SELECT 1 FROM pg_constraint
     WHERE conname = $1 AND conrelid = ($2 || '.' || $3)::regclass`,
    [CONSTRAINT, 'public', TABLE]
  )
  if (conExists.rowCount > 0) {
    console.log(`precheck: constraint ${CONSTRAINT} already exists (partial-apply state?) -- aborting cleanly.`)
    process.exit(2)
  }
  console.log('precheck: column + constraint absent -- safe to apply.')

  // Snapshot row count
  const cnt = (await client.query(`SELECT COUNT(*)::bigint AS n FROM public.${TABLE}`)).rows[0].n
  // Snapshot existing column list (for diff)
  const cols = (await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [TABLE]
  )).rows
  // Snapshot existing CHECK constraints (for diff)
  const constraints = (await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = ($1 || '.' || $2)::regclass AND contype='c'
     ORDER BY conname`,
    ['public', TABLE]
  )).rows

  const snapshot = {
    ts: new Date().toISOString(),
    migration_file: path.basename(MIGRATION_PATH),
    table: `public.${TABLE}`,
    row_count: cnt.toString(),
    columns_before: cols,
    check_constraints_before: constraints,
  }
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const snapPath = path.join(SNAPSHOT_DIR, `phase-2-lead-email-status-${isoTs()}.json`)
  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2))
  console.log(`snapshot: ${cols.length} columns, ${constraints.length} check constraints, row_count=${cnt} -> ${path.relative(process.cwd(), snapPath)}`)
  return { rowCount: cnt }
}

// ---------------------------------------------------------------------------
// 5. Transactional apply + post-verify (same tx)
// ---------------------------------------------------------------------------
async function applyAndVerify (client, preRowCount) {
  await client.query('BEGIN')
  let committed = false
  try {
    await client.query('SET LOCAL statement_timeout = 0')

    // Execute the migration body.
    await client.query(migrationSql)
    console.log('apply: migration body executed.')

    // ---- Post-state verification (in-tx) ----
    const col = (await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [TABLE, COLUMN]
    )).rows[0]

    if (!col) throw new Error('post-verify: column missing after ALTER')
    if (col.data_type !== 'text') throw new Error(`post-verify: data_type=${col.data_type}, expected text`)
    if (col.is_nullable !== 'NO') throw new Error(`post-verify: is_nullable=${col.is_nullable}, expected NO`)
    if (!/^'pending'/.test(col.column_default || '')) throw new Error(`post-verify: default=${col.column_default}, expected 'pending'`)
    console.log(`  ok: column type=text NOT NULL default=${col.column_default}`)

    const con = (await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = ($1 || '.' || $2)::regclass AND conname = $3`,
      ['public', TABLE, CONSTRAINT]
    )).rows[0]
    if (!con) throw new Error('post-verify: CHECK constraint missing after ALTER')
    if (!/'pending'.+'sent'.+'failed'/.test(con.def)) {
      throw new Error(`post-verify: constraint def unexpected: ${con.def}`)
    }
    console.log(`  ok: constraint ${CONSTRAINT}: ${con.def}`)

    const postCnt = (await client.query(`SELECT COUNT(*)::bigint AS n FROM public.${TABLE}`)).rows[0].n
    if (postCnt.toString() !== preRowCount.toString()) {
      throw new Error(`post-verify: row count changed pre=${preRowCount} post=${postCnt}`)
    }
    console.log(`  ok: row count unchanged at ${postCnt}`)

    // Sample read: every row readable + DEFAULT applied
    const sample = await client.query(
      `SELECT ${COLUMN} AS v FROM public.${TABLE} LIMIT 5`
    )
    const allPending = sample.rows.length === 0 || sample.rows.every(r => r.v === 'pending')
    if (!allPending) {
      throw new Error(`post-verify: sample read found non-pending values: ${JSON.stringify(sample.rows)}`)
    }
    console.log(`  ok: sample read (LIMIT 5) -- all rows = 'pending' (default applied)`)

    // All checks passed -> COMMIT.
    await client.query('COMMIT')
    committed = true
    console.log('COMMIT: migration applied + verified in-tx.')
  } catch (e) {
    if (!committed) {
      try { await client.query('ROLLBACK') } catch {}
      console.error('ROLLBACK: ' + e.message)
      process.exit(1)
    }
    throw e
  }
}

// ---------------------------------------------------------------------------
// 6. Post-COMMIT re-verify (fresh connection)
// ---------------------------------------------------------------------------
async function reverify (client) {
  const col = (await client.query(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [TABLE, COLUMN]
  )).rows[0]
  if (!col) fail('post-COMMIT re-verify: column missing!')
  const con = (await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = ($1 || '.' || $2)::regclass AND conname = $3`,
    ['public', TABLE, CONSTRAINT]
  )).rows[0]
  if (!con) fail('post-COMMIT re-verify: constraint missing!')
  console.log(`post-COMMIT re-verify (fresh conn):`)
  console.log(`  column: ${col.data_type}, nullable=${col.is_nullable}, default=${col.column_default}`)
  console.log(`  constraint: ${con.def}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
;(async () => {
  const apply = new Client({ connectionString: DATABASE_URL })
  await apply.connect()
  let pre
  try { pre = await precheckAndSnapshot(apply) }
  catch (e) { await apply.end(); fail('precheck: ' + e.message) }
  try { await applyAndVerify(apply, pre.rowCount) }
  catch (e) { await apply.end(); fail('apply: ' + e.message) }
  await apply.end()

  const verify = new Client({ connectionString: DATABASE_URL })
  await verify.connect()
  await reverify(verify)
  await verify.end()

  console.log('\nW-FUNNEL Phase 2 Commit A: COMPLETE.')
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
