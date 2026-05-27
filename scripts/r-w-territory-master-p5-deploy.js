// scripts/r-w-territory-master-p5-deploy.js
// W-TERRITORY-MASTER P5 deploy: applies the schema migration + resolver patch.
//
// Workflow:
//   1. Capture pre-state: ala columns, tac CHECK, resolver body.
//   2. Apply the migration SQL file inside a transaction.
//   3. Capture post-state.
//   4. Verify expected diffs (4 new ala columns, partial unique index,
//      'pin_reactivated' in CHECK, trigger exists, resolver has
//      `ala.is_active = true` in its P1 branch, ONE new line vs pre-state).
//   5. ROLLBACK on any mismatch. COMMIT otherwise.
//
// Run: node scripts/r-w-territory-master-p5-deploy.js

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found at', envPath)
    process.exit(1)
  }
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadDotEnvLocal()

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!conn) {
  console.error('ERROR: SUPABASE_DB_URL not set in .env.local')
  process.exit(1)
}

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260526_p5_listing_pin_lifecycle.sql'
)

if (!fs.existsSync(MIGRATION_PATH)) {
  console.error('ERROR: migration file not found at', MIGRATION_PATH)
  process.exit(1)
}

const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')

async function capture(client) {
  const out = {}

  out.ala_columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_listing_assignments'
    ORDER BY ordinal_position;
  `)).rows

  out.ala_constraints = (await client.query(`
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = 'public.agent_listing_assignments'::regclass
    ORDER BY conname;
  `)).rows

  out.ala_indexes = (await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'agent_listing_assignments'
    ORDER BY indexname;
  `)).rows

  out.tac_change_check = (await client.query(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'territory_assignment_changes_change_type_check';
  `)).rows[0]?.def

  out.pin_trigger_exists = (await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_listing_pin_change'
        AND tgrelid = 'public.agent_listing_assignments'::regclass
    ) AS exists;
  `)).rows[0].exists

  out.pin_trigger_fn_exists = (await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'handle_listing_pin_change'
    ) AS exists;
  `)).rows[0].exists

  out.resolver_body = (await client.query(`
    SELECT pg_get_functiondef(
      'public.resolve_agent_for_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
    ) AS def;
  `)).rows[0].def

  return out
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()

  let pre, post
  let didCommit = false

  try {
    console.log('=== PRE-STATE CAPTURE ===')
    pre = await capture(client)
    console.log(`ala columns: ${pre.ala_columns.length}`)
    console.log(`ala constraints: ${pre.ala_constraints.length}`)
    console.log(`ala indexes: ${pre.ala_indexes.length}`)
    console.log(`pin_trigger_exists: ${pre.pin_trigger_exists}`)
    console.log(`tac change CHECK includes 'pin_reactivated': ${pre.tac_change_check?.includes("'pin_reactivated'")}`)
    console.log(`resolver body length: ${pre.resolver_body.length}`)

    // Pre-state expectations (sanity gate)
    if (pre.ala_columns.length !== 5) {
      throw new Error(`Pre-state: expected 5 ala columns, got ${pre.ala_columns.length}. Migration may already have run.`)
    }
    if (pre.pin_trigger_exists) {
      throw new Error('Pre-state: trg_listing_pin_change already exists. Migration may already have run.')
    }
    if (pre.tac_change_check?.includes("'pin_reactivated'")) {
      throw new Error("Pre-state: 'pin_reactivated' already in CHECK. Migration may already have run.")
    }

    // P1-branch presence check on the existing resolver
    const preP1HasIsActive = /WHERE ala\.listing_id = p_listing_id[\s\S]{0,200}ala\.is_active = true/.test(pre.resolver_body)
    if (preP1HasIsActive) {
      throw new Error('Pre-state: resolver P1 branch already filters ala.is_active. Migration may already have run.')
    }

    console.log('Pre-state gates PASS.')
    console.log('')

    console.log('=== APPLYING MIGRATION ===')
    await client.query('BEGIN')
    // The migration file itself wraps in BEGIN/COMMIT, but we override here
    // so we can ROLLBACK on verification failure. Strip the outer transaction
    // markers from the file before executing.
    const sqlNoTx = migrationSql
      .replace(/^\s*BEGIN\s*;/im, '-- BEGIN stripped by deploy runner')
      .replace(/COMMIT\s*;\s*$/im, '-- COMMIT stripped by deploy runner')
    await client.query(sqlNoTx)
    console.log('Migration SQL applied (inside outer tx).')
    console.log('')

    console.log('=== POST-STATE CAPTURE ===')
    post = await capture(client)
    console.log(`ala columns: ${post.ala_columns.length}`)
    console.log(`ala constraints: ${post.ala_constraints.length}`)
    console.log(`ala indexes: ${post.ala_indexes.length}`)
    console.log(`pin_trigger_exists: ${post.pin_trigger_exists}`)
    console.log(`tac change CHECK includes 'pin_reactivated': ${post.tac_change_check?.includes("'pin_reactivated'")}`)
    console.log(`resolver body length: ${post.resolver_body.length}`)
    console.log('')

    console.log('=== VERIFICATION ===')
    const checks = []

    // 1. 4 new ala columns
    const newColNames = post.ala_columns.map(c => c.column_name).filter(n =>
      !pre.ala_columns.map(c => c.column_name).includes(n)
    )
    checks.push({
      name: '4 new ala columns added',
      pass: newColNames.length === 4 &&
        ['is_active', 'deactivated_at', 'deactivated_by', 'pin_reason'].every(n => newColNames.includes(n)),
      detail: newColNames.join(', ')
    })

    // 2. is_active NOT NULL with default true
    const isActiveCol = post.ala_columns.find(c => c.column_name === 'is_active')
    checks.push({
      name: 'is_active column NOT NULL with default true',
      pass: isActiveCol?.is_nullable === 'NO' && isActiveCol?.column_default === 'true',
      detail: `nullable=${isActiveCol?.is_nullable} default=${isActiveCol?.column_default}`
    })

    // 3. listing_id_key constraint dropped
    checks.push({
      name: 'agent_listing_assignments_listing_id_key dropped',
      pass: !post.ala_constraints.some(c => c.conname === 'agent_listing_assignments_listing_id_key'),
      detail: post.ala_constraints.map(c => c.conname).join(', ')
    })

    // 4. uq_ala_listing index dropped
    checks.push({
      name: 'uq_ala_listing index dropped',
      pass: !post.ala_indexes.some(i => i.indexname === 'uq_ala_listing'),
      detail: post.ala_indexes.map(i => i.indexname).join(', ')
    })

    // 5. uq_ala_listing_active partial unique index created
    checks.push({
      name: 'uq_ala_listing_active partial unique index exists',
      pass: post.ala_indexes.some(i => i.indexname === 'uq_ala_listing_active'),
      detail: post.ala_indexes.map(i => i.indexname).join(', ')
    })

    // 6. tac CHECK includes 'pin_reactivated'
    checks.push({
      name: "tac change_type CHECK includes 'pin_reactivated'",
      pass: post.tac_change_check?.includes("'pin_reactivated'") === true,
      detail: (post.tac_change_check || '').slice(0, 120) + '...'
    })

    // 7. tac CHECK retains all previous values
    const requiredValues = [
      'assignment_granted', 'assignment_revoked',
      'primary_set', 'primary_unset',
      'percentage_set', 'percentage_changed',
      'scope_widened', 'scope_narrowed',
      'pin_added', 'pin_removed', 'access_toggle_changed'
    ]
    const missingValues = requiredValues.filter(v => !post.tac_change_check?.includes(`'${v}'`))
    checks.push({
      name: 'tac CHECK retains all 11 previous values',
      pass: missingValues.length === 0,
      detail: missingValues.length ? `missing: ${missingValues.join(', ')}` : 'all present'
    })

    // 8. handle_listing_pin_change function exists
    checks.push({
      name: 'handle_listing_pin_change function exists',
      pass: post.pin_trigger_fn_exists === true,
      detail: ''
    })

    // 9. trg_listing_pin_change trigger exists
    checks.push({
      name: 'trg_listing_pin_change trigger exists',
      pass: post.pin_trigger_exists === true,
      detail: ''
    })

    // 10. Resolver P1 branch now filters ala.is_active = true
    const postP1HasIsActive = /WHERE ala\.listing_id = p_listing_id[\s\S]{0,200}ala\.is_active = true/.test(post.resolver_body)
    checks.push({
      name: 'resolver P1 branch filters ala.is_active = true',
      pass: postP1HasIsActive,
      detail: ''
    })

    // 11. Resolver diff is minimal: exactly one new line containing ala.is_active
    const preLines = pre.resolver_body.split('\n')
    const postLines = post.resolver_body.split('\n')
    const addedLines = postLines.filter(l => !preLines.includes(l))
    const removedLines = preLines.filter(l => !postLines.includes(l))
    const onlyExpectedAdds = addedLines.every(l =>
      l.includes('ala.is_active = true') || l.includes('P5: is_active filter')
    )
    checks.push({
      name: 'resolver diff is minimal (1 functional line + 1 comment line added)',
      pass: addedLines.length <= 2 && removedLines.length === 0 && onlyExpectedAdds,
      detail: `added=${addedLines.length} removed=${removedLines.length}`
    })

    // 12. ala_constraints retains the 4 non-dropped (pkey + 3 FKs)
    const expectedKept = [
      'agent_listing_assignments_pkey',
      'agent_listing_assignments_agent_id_fkey',
      'agent_listing_assignments_assigned_by_fkey',
      'agent_listing_assignments_listing_id_fkey'
    ]
    const missingKept = expectedKept.filter(c =>
      !post.ala_constraints.some(con => con.conname === c)
    )
    // P5 also adds a new FK for deactivated_by — count it but don't require it by name
    checks.push({
      name: 'ala retains pkey + 3 original FKs',
      pass: missingKept.length === 0,
      detail: missingKept.length ? `missing: ${missingKept.join(', ')}` : 'all present'
    })

    let allPass = true
    for (const c of checks) {
      const tag = c.pass ? '✅' : '❌'
      console.log(`${tag} ${c.name}${c.detail ? '  -- ' + c.detail : ''}`)
      if (!c.pass) allPass = false
    }
    console.log('')

    if (!allPass) {
      console.error('VERIFICATION FAILED. Rolling back.')
      await client.query('ROLLBACK')
      console.log('ROLLBACK complete. No changes persisted.')
      process.exit(1)
    }

    console.log(`All ${checks.length} verification checks PASS.`)
    console.log('Committing.')
    await client.query('COMMIT')
    didCommit = true
    console.log('COMMIT complete. Migration persisted.')
  } catch (err) {
    console.error('DEPLOY ERROR:', err.message)
    if (!didCommit) {
      try {
        await client.query('ROLLBACK')
        console.log('ROLLBACK complete on error.')
      } catch (_e) { /* swallow */ }
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()