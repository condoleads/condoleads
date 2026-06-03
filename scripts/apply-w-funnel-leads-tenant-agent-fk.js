// scripts/apply-w-funnel-leads-tenant-agent-fk.js
//
// W-FUNNEL Batch 2a apply runner.
//
// Adds:
//   - UNIQUE (id, tenant_id) on agents (prerequisite)
//   - 6 composite FK constraints on leads (one per agent-referencing column)
//     each (col, tenant_id) -> agents(id, tenant_id) MATCH SIMPLE
//
// Discipline (CLAUDE.md production-DB writes):
//   1. Pre-snapshot: capture pg_constraint state for agents + leads so we
//      have a rollback reference if anything is unexpected.
//   2. Open ONE explicit BEGIN. SQL file's own BEGIN/COMMIT pair becomes
//      a savepoint-like region we control. Wait -- actually since the SQL
//      uses BEGIN/COMMIT we must NOT wrap it in another transaction here;
//      psql-style migrations include the txn delimiters themselves. We
//      execute the file as-is and verify after.
//   3. In-tx verify: run a separate verification transaction that asserts
//      every constraint exists with the right definition + 0 violations
//      across all 6 columns. If anything is off, we ROLLBACK the verify
//      txn and raise -- the prior migration already COMMITted so we cannot
//      undo, but we surface the discrepancy loudly.
//   4. Post-COMMIT re-verify on a fresh connection (catches caching weirdness).
//
// Idempotency:
//   - Detects existing constraints by name; if any of the 7 already exist,
//     STOPS and reports rather than failing on duplicate constraint errors.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const NEW_CONSTRAINT_NAMES = [
  'agents_id_tenant_id_unique',
  'leads_agent_tenant_consistency',
  'leads_manager_tenant_consistency',
  'leads_area_manager_tenant_consistency',
  'leads_tenant_admin_tenant_consistency',
  'leads_claimed_by_tenant_consistency',
  'leads_override_agent_tenant_consistency',
]

const FK_TARGETS = [
  { col: 'agent_id',            constraint: 'leads_agent_tenant_consistency' },
  { col: 'manager_id',          constraint: 'leads_manager_tenant_consistency' },
  { col: 'area_manager_id',     constraint: 'leads_area_manager_tenant_consistency' },
  { col: 'tenant_admin_id',     constraint: 'leads_tenant_admin_tenant_consistency' },
  { col: 'claimed_by_agent_id', constraint: 'leads_claimed_by_tenant_consistency' },
  { col: 'override_agent_id',   constraint: 'leads_override_agent_tenant_consistency' },
]

const MIGRATION_FILE = path.resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260603_w_funnel_batch2_leads_tenant_agent_fk.sql'
)

function newClient () {
  return new Client({ connectionString: process.env.DATABASE_URL })
}

async function snapshotConstraints (c) {
  const r = await c.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE conrelid IN ('public.leads'::regclass, 'public.agents'::regclass)
      AND contype IN ('p','u','f','c')
    ORDER BY tbl, conname`)
  return r.rows
}

async function violationCount (c, col) {
  const r = await c.query(`
    SELECT COUNT(*) AS cnt
    FROM leads l
    JOIN agents a ON l.${col} = a.id
    WHERE l.${col} IS NOT NULL
      AND a.tenant_id IS DISTINCT FROM l.tenant_id`)
  return parseInt(r.rows[0].cnt, 10)
}

async function constraintExists (c, name) {
  const r = await c.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name])
  return r.rowCount > 0
}

async function readSql () {
  let s = fs.readFileSync(MIGRATION_FILE, 'utf8')
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1) // strip UTF-8 BOM if present
  return s
}

;(async () => {
  console.log('=== W-FUNNEL Batch 2a apply runner ===')
  console.log('Migration:', MIGRATION_FILE)
  const sql = await readSql()
  console.log('SQL bytes:', sql.length)

  // --- Step 1: Pre-snapshot ---
  console.log('\n=== Step 1: Pre-snapshot ===')
  const cSnap = newClient()
  await cSnap.connect()
  try {
    const before = await snapshotConstraints(cSnap)
    console.log(`  constraints on agents+leads before: ${before.length}`)
    fs.writeFileSync(
      path.resolve(__dirname, '..', 'scripts-output', 'batch2-pre-snapshot.json'),
      JSON.stringify(before, null, 2)
    )
    console.log('  pre-snapshot written: scripts-output/batch2-pre-snapshot.json')

    // Idempotency check -- abort if any of the 7 new constraints already exist
    const existing = []
    for (const n of NEW_CONSTRAINT_NAMES) {
      if (await constraintExists(cSnap, n)) existing.push(n)
    }
    if (existing.length > 0) {
      console.error(`\n  ABORT: ${existing.length} of the new constraints already exist:`)
      for (const n of existing) console.error(`    - ${n}`)
      console.error('  Migration appears to have been applied previously. STOP.')
      process.exit(2)
    }
    console.log('  idempotency: all 7 target constraint names absent -- safe to apply')

    // Re-run violation precheck inside this read-only step
    console.log('\n  Pre-apply violation precheck:')
    let totalViolations = 0
    for (const { col } of FK_TARGETS) {
      const cnt = await violationCount(cSnap, col)
      totalViolations += cnt
      console.log(`    ${col.padEnd(22)} : ${cnt}`)
    }
    if (totalViolations > 0) {
      console.error(`\n  ABORT: ${totalViolations} cross-tenant violations exist; cannot apply FK over violations`)
      process.exit(2)
    }
    console.log('  violations: 0 -- safe to apply')
  } finally {
    await cSnap.end()
  }

  // --- Step 2: Apply migration ---
  // The SQL file contains its own BEGIN/COMMIT. We submit it as-is.
  console.log('\n=== Step 2: Apply migration ===')
  const cApply = newClient()
  await cApply.connect()
  try {
    await cApply.query(sql)
    console.log('  migration COMMITted (per SQL file)')
  } finally {
    await cApply.end()
  }

  // --- Step 3: In-line verify (same process but fresh connection) ---
  console.log('\n=== Step 3: In-line verify ===')
  const cVerify = newClient()
  await cVerify.connect()
  try {
    // 3a: every named constraint must exist
    console.log('  3a: constraint presence')
    for (const n of NEW_CONSTRAINT_NAMES) {
      const exists = await constraintExists(cVerify, n)
      console.log(`    ${n.padEnd(45)} ${exists ? 'PRESENT' : 'MISSING **'}`)
      if (!exists) {
        console.error('    FAIL: constraint missing post-apply')
        process.exit(3)
      }
    }

    // 3b: composite FK defs reference agents(id, tenant_id)
    console.log('  3b: composite FK shape')
    for (const { col, constraint } of FK_TARGETS) {
      const r = await cVerify.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1`,
        [constraint]
      )
      const def = r.rows[0]?.def || ''
      const ok = def.includes(`(${col}, tenant_id)`) && def.includes('REFERENCES agents(id, tenant_id)')
      console.log(`    ${constraint.padEnd(45)} ${ok ? 'OK' : 'BAD'} :: ${def}`)
      if (!ok) {
        console.error('    FAIL: constraint definition mismatch')
        process.exit(3)
      }
    }

    // 3c: 0 violations remain (constraint should make further violations
    // impossible -- but verify current data is clean)
    console.log('  3c: post-apply violation recount')
    let totalViolations = 0
    for (const { col } of FK_TARGETS) {
      const cnt = await violationCount(cVerify, col)
      totalViolations += cnt
      console.log(`    ${col.padEnd(22)} : ${cnt}`)
    }
    if (totalViolations > 0) {
      console.error('    FAIL: violations exist post-apply -- impossible if FK applied; data corruption?')
      process.exit(3)
    }

    // 3d: original single-col FKs still present (we did not drop them)
    console.log('  3d: pre-existing FK constraints still present')
    for (const original of [
      'leads_agent_id_fkey',
      'leads_manager_id_fkey',
      'leads_area_manager_id_fkey',
      'leads_tenant_admin_id_fkey',
      'leads_claimed_by_agent_id_fkey',
      'leads_override_agent_id_fkey',
    ]) {
      const exists = await constraintExists(cVerify, original)
      console.log(`    ${original.padEnd(45)} ${exists ? 'PRESENT' : 'MISSING **'}`)
      if (!exists) {
        console.error('    WARN: pre-existing FK was dropped unexpectedly (should not happen)')
      }
    }
  } finally {
    await cVerify.end()
  }

  // --- Step 4: Post-COMMIT re-verify on fresh connection ---
  console.log('\n=== Step 4: Post-COMMIT re-verify (fresh connection) ===')
  const cFinal = newClient()
  await cFinal.connect()
  try {
    for (const n of NEW_CONSTRAINT_NAMES) {
      const exists = await constraintExists(cFinal, n)
      if (!exists) {
        console.error(`  FAIL: ${n} missing on fresh connection`)
        process.exit(4)
      }
    }
    console.log('  all 7 constraints visible on fresh connection')
  } finally {
    await cFinal.end()
  }

  console.log('\n=== Batch 2a SUCCESS ===')
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
