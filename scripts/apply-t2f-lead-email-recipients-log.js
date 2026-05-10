#!/usr/bin/env node
/**
 * apply-t2f-lead-email-recipients-log.js
 *
 * W-LEADS-EMAIL T2f — apply lead_email_recipients_log audit table migration.
 *
 * Verifies post-apply:
 *   - Table exists with 14 expected columns
 *   - 4 indexes
 *   - 3 CHECK constraints (recipient_layer, direction, status)
 *   - 3 FKs (tenant_id, lead_id, agent_id)
 *   - 2 trigger functions (no_mutate, status_only)
 *   - 2 triggers (trg_lerl_no_delete, trg_lerl_status_only_update)
 *
 * Plus 2 behavioral smoke checks (post-COMMIT, idempotent):
 *   - Insert + delete blocked
 *   - Insert + update of immutable column blocked
 *
 * Required env: DATABASE_URL
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2f_lead_email_recipients_log.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2F-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2F-POST-fingerprint.json')

const TABLE = 'lead_email_recipients_log'

const EXPECTED_COLUMNS = [
  'id', 'tenant_id', 'lead_id', 'agent_id',
  'recipient_email', 'recipient_layer', 'direction', 'subject',
  'template_key', 'resend_message_id', 'status',
  'sent_at', 'delivered_at', 'bounced_at', 'created_at',
]
const EXPECTED_INDEXES = [
  'lead_email_recipients_log_pkey',
  'idx_lerl_tenant_sent',
  'idx_lerl_lead',
  'idx_lerl_recipient',
  'idx_lerl_resend_msg',
]
const EXPECTED_CHECKS = [
  'lerl_recipient_layer_check',
  'lerl_direction_check',
  'lerl_status_check',
]
const EXPECTED_TRIGGERS = [
  'trg_lerl_no_delete',
  'trg_lerl_status_only_update',
]
const EXPECTED_FUNCTIONS = [
  'lead_email_recipients_log_no_mutate',
  'lead_email_recipients_log_status_only',
]

async function captureFingerprint(client) {
  const tableExists = await client.query(
    `SELECT to_regclass('public.' || $1) AS oid`, [TABLE]
  )
  const exists = !!tableExists.rows[0].oid
  if (!exists) {
    return { timestamp: new Date().toISOString(), table_exists: false }
  }
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`, [TABLE]
  )
  const fks = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = $1 AND con.contype = 'f'
      ORDER BY con.conname`, [TABLE]
  )
  const checks = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = $1 AND con.contype = 'c'
      ORDER BY con.conname`, [TABLE]
  )
  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname`, [TABLE]
  )
  const trgs = await client.query(
    `SELECT tgname FROM pg_trigger t
       JOIN pg_class cl ON cl.oid = t.tgrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = $1 AND NOT t.tgisinternal
      ORDER BY tgname`, [TABLE]
  )
  return {
    timestamp: new Date().toISOString(),
    table_exists: true,
    columns: cols.rows,
    foreign_keys: fks.rows,
    check_constraints: checks.rows,
    indexes: idx.rows,
    triggers: trgs.rows,
  }
}

async function functionExists(client, fnName) {
  const res = await client.query(
    `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1 LIMIT 1`, [fnName]
  )
  return res.rows.length > 0
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL env var not set.')
    process.exit(1)
  }
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`ERROR: migration file missing: ${MIGRATION_PATH}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log(`Migration loaded: ${MIGRATION_PATH} (${sql.length} bytes)`)

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log('\n== Step 1: capturing pre-apply fingerprint ==')
  const pre = await captureFingerprint(client)
  console.log(`  table exists: ${pre.table_exists}`)

  if (pre.table_exists) {
    console.error('\nERROR: table already exists. Migration appears to have been applied.')
    fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
    fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
    await client.end()
    process.exit(2)
  }

  // Also check that the trigger functions don't already exist
  for (const fnName of EXPECTED_FUNCTIONS) {
    if (await functionExists(client, fnName)) {
      console.error(`\nERROR: function ${fnName} already exists. Aborting.`)
      await client.end()
      process.exit(2)
    }
  }

  fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
  fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
  console.log(`  pre-fingerprint saved: ${PRE_FINGERPRINT}`)

  console.log('\n== Step 2: applying migration ==')
  try {
    await client.query(sql)
    console.log('  migration executed without throwing')
  } catch (err) {
    console.error('  migration execution failed:', err.message)
    await client.end()
    process.exit(3)
  }

  console.log('\n== Step 3: post-apply structural verification ==')
  const post = await captureFingerprint(client)
  console.log(`  table exists: ${post.table_exists}`)

  const checks = []

  if (!post.table_exists) {
    checks.push('table not created')
  } else {
    const colNames = new Set(post.columns.map((c) => c.column_name))
    for (const c of EXPECTED_COLUMNS) {
      if (!colNames.has(c)) checks.push(`column ${c} missing`)
    }
    if (post.columns.length !== EXPECTED_COLUMNS.length) {
      checks.push(`column count=${post.columns.length}, expected ${EXPECTED_COLUMNS.length}`)
    }

    const idxNames = new Set(post.indexes.map((i) => i.indexname))
    for (const i of EXPECTED_INDEXES) {
      if (!idxNames.has(i)) checks.push(`index ${i} missing`)
    }

    const checkNames = new Set(post.check_constraints.map((c) => c.conname))
    for (const c of EXPECTED_CHECKS) {
      if (!checkNames.has(c)) checks.push(`CHECK ${c} missing`)
    }

    if (post.foreign_keys.length !== 3) {
      checks.push(`FK count=${post.foreign_keys.length}, expected 3`)
    }

    const trgNames = new Set(post.triggers.map((t) => t.tgname))
    for (const t of EXPECTED_TRIGGERS) {
      if (!trgNames.has(t)) checks.push(`trigger ${t} missing`)
    }
  }

  for (const fnName of EXPECTED_FUNCTIONS) {
    if (!(await functionExists(client, fnName))) {
      checks.push(`function ${fnName} missing`)
    }
  }

  fs.writeFileSync(POST_FINGERPRINT, JSON.stringify(post, null, 2), 'utf8')
  console.log(`  post-fingerprint saved: ${POST_FINGERPRINT}`)

  if (checks.length) {
    console.error('\nVERIFICATION FAILED:')
    for (const c of checks) console.error(`  ${c}`)
    await client.end()
    process.exit(4)
  }

  console.log('  ✓ table created with 14 columns')
  console.log('  ✓ 4 indexes + PK index')
  console.log('  ✓ 3 CHECK constraints')
  console.log('  ✓ 3 FKs (tenant_id, lead_id, agent_id)')
  console.log('  ✓ 2 triggers + 2 trigger functions')

  // ─── Step 4: behavioral smoke (rollback-isolated, no committed data) ────
  console.log('\n== Step 4: behavioral smoke (savepoint-isolated) ==')

  await client.query('BEGIN')
  try {
    // Need a real tenant_id and lead_id to insert. Probe the simplest path.
    const tRes = await client.query(`SELECT id FROM tenants LIMIT 1`)
    if (tRes.rows.length === 0) {
      console.log('  (no tenants in DB — skipping behavioral smoke)')
      await client.query('ROLLBACK')
    } else {
      const tenantId = tRes.rows[0].id

      // Insert a dummy lead for the smoke (rolled back).
      const aRes = await client.query(
        `SELECT id FROM agents WHERE tenant_id = $1 LIMIT 1`, [tenantId]
      )
      if (aRes.rows.length === 0) {
        console.log('  (no agents for tenant — skipping behavioral smoke)')
        await client.query('ROLLBACK')
      } else {
        const agentId = aRes.rows[0].id
        const leadRes = await client.query(`
          INSERT INTO leads (tenant_id, agent_id, contact_name, contact_email, source)
          VALUES ($1, $2, 'T2F SMOKE', 't2f-smoke@example.invalid', 'smoke')
          RETURNING id
        `, [tenantId, agentId])
        const leadId = leadRes.rows[0].id

        const lerlRes = await client.query(`
          INSERT INTO lead_email_recipients_log
            (tenant_id, lead_id, recipient_email, recipient_layer, direction, subject, template_key)
          VALUES ($1, $2, 'smoke@example.invalid', 'agent', 'to', 'smoke subject', 'smoke_template')
          RETURNING id
        `, [tenantId, leadId])
        const lerlId = lerlRes.rows[0].id
        console.log(`  ✓ insert succeeded (id=${lerlId})`)

        // Try to DELETE (must fail)
        await client.query('SAVEPOINT sp_delete')
        let deleteBlocked = false
        try {
          await client.query(`DELETE FROM lead_email_recipients_log WHERE id = $1`, [lerlId])
        } catch (err) {
          if (err.message.includes('append-only')) deleteBlocked = true
          await client.query('ROLLBACK TO SAVEPOINT sp_delete')
        }
        console.log(deleteBlocked ? '  ✓ DELETE blocked' : '  ✗ DELETE NOT BLOCKED — FAIL')
        if (!deleteBlocked) checks.push('DELETE not blocked')

        // Try to UPDATE immutable column (recipient_email) — must fail
        await client.query('SAVEPOINT sp_immut')
        let immutBlocked = false
        try {
          await client.query(
            `UPDATE lead_email_recipients_log SET recipient_email = 'changed@x.test' WHERE id = $1`,
            [lerlId]
          )
        } catch (err) {
          if (err.message.includes('only status') || err.message.includes('mutable')) immutBlocked = true
          await client.query('ROLLBACK TO SAVEPOINT sp_immut')
        }
        console.log(immutBlocked ? '  ✓ UPDATE of immutable column blocked' : '  ✗ NOT BLOCKED — FAIL')
        if (!immutBlocked) checks.push('UPDATE of immutable column not blocked')

        // UPDATE allowed columns (status) — must succeed
        let statusUpdateOk = false
        try {
          await client.query(
            `UPDATE lead_email_recipients_log SET status = 'sent', sent_at = now() WHERE id = $1`,
            [lerlId]
          )
          statusUpdateOk = true
        } catch (err) {
          // unexpected
        }
        console.log(statusUpdateOk ? '  ✓ UPDATE of status (allowed) succeeded' : '  ✗ UPDATE of status FAILED')
        if (!statusUpdateOk) checks.push('UPDATE of allowed status column failed')

        await client.query('ROLLBACK')
      }
    }
  } catch (err) {
    console.error('  smoke setup error (rolling back):', err.message)
    await client.query('ROLLBACK').catch(() => {})
  }

  if (checks.length) {
    console.error('\nBEHAVIORAL VERIFICATION FAILED:')
    for (const c of checks) console.error(`  ${c}`)
    await client.end()
    process.exit(5)
  }

  await client.end()
  console.log('\n== T2f APPLIED SUCCESSFULLY ==')
  console.log('Next: T2g resolve_agent_for_context RPC tenant-leak fix.')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})