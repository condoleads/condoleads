// scripts/r-w-territory-master-p5-2-deploy.js
// W-TERRITORY-MASTER P5.2 deploy: building-tier lifecycle + audit + reroll + resolver patch.
//
// Pattern matches scripts/r-w-territory-master-p5-deploy.js:
//   - Capture pre-state
//   - Apply migration inside an outer transaction (strip the inner BEGIN/COMMIT)
//   - Capture post-state
//   - Verify expected diffs
//   - ROLLBACK on any mismatch, COMMIT otherwise

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found')
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

const MIGRATION_PATH = path.join(
  process.cwd(), 'supabase', 'migrations', '20260527_p5_2_building_lifecycle.sql'
)

if (!fs.existsSync(MIGRATION_PATH)) {
  console.error('ERROR: migration not found at', MIGRATION_PATH)
  process.exit(1)
}
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')

async function capture(client) {
  const out = {}

  out.agb_columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agent_geo_buildings'
    ORDER BY ordinal_position;
  `)).rows

  out.agb_constraints = (await client.query(`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid='public.agent_geo_buildings'::regclass
    ORDER BY conname;
  `)).rows

  out.agb_indexes = (await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='agent_geo_buildings'
    ORDER BY indexname;
  `)).rows

  out.tac_change_check = (await client.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname='territory_assignment_changes_change_type_check';
  `)).rows[0]?.def

  out.building_trigger_exists = (await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname='trg_building_card_change'
        AND tgrelid='public.agent_geo_buildings'::regclass
    ) AS exists;
  `)).rows[0].exists

  out.reresolve_building_exists = (await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='reresolve_building'
    ) AS exists;
  `)).rows[0].exists

  out.resolver_body = (await client.query(`
    SELECT pg_get_functiondef(
      'public.resolve_agent_for_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
    ) AS def;
  `)).rows[0].def

  out.agb_row_count = (await client.query(`SELECT count(*)::int AS n FROM agent_geo_buildings;`)).rows[0].n

  return out
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()

  let txStarted = false
  let didCommit = false

  try {
    console.log('=== PRE-STATE CAPTURE ===')
    const pre = await capture(client)
    console.log(`agb columns: ${pre.agb_columns.length}`)
    console.log(`agb constraints: ${pre.agb_constraints.length}`)
    console.log(`agb indexes: ${pre.agb_indexes.length}`)
    console.log(`agb existing rows: ${pre.agb_row_count}`)
    console.log(`trg_building_card_change exists: ${pre.building_trigger_exists}`)
    console.log(`reresolve_building exists: ${pre.reresolve_building_exists}`)
    console.log(`tac CHECK includes 'building_assigned': ${pre.tac_change_check?.includes("'building_assigned'")}`)
    console.log(`resolver body length: ${pre.resolver_body.length}`)

    if (pre.agb_columns.length !== 5) {
      throw new Error(`Pre-state: expected 5 agb columns, got ${pre.agb_columns.length}. Migration may already have run.`)
    }
    if (pre.building_trigger_exists) {
      throw new Error('Pre-state: trg_building_card_change already exists. Migration may already have run.')
    }
    if (pre.tac_change_check?.includes("'building_assigned'")) {
      throw new Error("Pre-state: 'building_assigned' already in CHECK. Migration may already have run.")
    }
    if (pre.reresolve_building_exists) {
      throw new Error('Pre-state: reresolve_building already exists. Migration may already have run.')
    }
    const preP2HasIsActive = /WHERE agb\.building_id = p_building_id[\s\S]{0,200}agb\.is_active = true/.test(pre.resolver_body)
    if (preP2HasIsActive) {
      throw new Error('Pre-state: resolver P2 branch already filters agb.is_active. Migration may already have run.')
    }
    console.log('Pre-state gates PASS.')
    console.log('')

    console.log('=== APPLYING MIGRATION ===')
    await client.query('BEGIN')
    txStarted = true
    const sqlNoTx = migrationSql
      .replace(/^\s*BEGIN\s*;/im, '-- BEGIN stripped by deploy runner')
      .replace(/COMMIT\s*;\s*$/im, '-- COMMIT stripped by deploy runner')
    await client.query(sqlNoTx)
    console.log('Migration SQL applied (inside outer tx).')

    console.log('')
    console.log('=== POST-STATE CAPTURE ===')
    const post = await capture(client)
    console.log(`agb columns: ${post.agb_columns.length}`)
    console.log(`agb constraints: ${post.agb_constraints.length}`)
    console.log(`agb indexes: ${post.agb_indexes.length}`)
    console.log(`agb rows still: ${post.agb_row_count}`)
    console.log(`trg_building_card_change exists: ${post.building_trigger_exists}`)
    console.log(`reresolve_building exists: ${post.reresolve_building_exists}`)
    console.log(`tac CHECK includes 'building_assigned': ${post.tac_change_check?.includes("'building_assigned'")}`)
    console.log(`resolver body length: ${post.resolver_body.length}`)
    console.log('')

    console.log('=== VERIFICATION ===')
    const checks = []

    const newColNames = post.agb_columns.map(c => c.column_name).filter(n =>
      !pre.agb_columns.map(c => c.column_name).includes(n)
    )
    checks.push({
      name: '4 new agb columns added',
      pass: newColNames.length === 4 &&
        ['is_active', 'deactivated_at', 'deactivated_by', 'assigned_reason'].every(n => newColNames.includes(n)),
      detail: newColNames.join(', ')
    })

    const isActiveCol = post.agb_columns.find(c => c.column_name === 'is_active')
    checks.push({
      name: 'is_active column NOT NULL with default true',
      pass: isActiveCol?.is_nullable === 'NO' && isActiveCol?.column_default === 'true',
      detail: `nullable=${isActiveCol?.is_nullable} default=${isActiveCol?.column_default}`
    })

    checks.push({
      name: 'agent_geo_buildings_building_id_key constraint dropped',
      pass: !post.agb_constraints.some(c => c.conname === 'agent_geo_buildings_building_id_key'),
      detail: post.agb_constraints.map(c => c.conname).join(', ')
    })

    checks.push({
      name: 'uq_agb_building_active partial unique index exists',
      pass: post.agb_indexes.some(i => i.indexname === 'uq_agb_building_active'),
      detail: post.agb_indexes.map(i => i.indexname).join(', ')
    })

    checks.push({
      name: "tac change_type CHECK includes 'building_assigned'",
      pass: post.tac_change_check?.includes("'building_assigned'") === true
    })
    checks.push({
      name: "tac change_type CHECK includes 'building_unassigned'",
      pass: post.tac_change_check?.includes("'building_unassigned'") === true
    })
    checks.push({
      name: "tac change_type CHECK includes 'building_reactivated'",
      pass: post.tac_change_check?.includes("'building_reactivated'") === true
    })

    const requiredOldValues = [
      'assignment_granted', 'assignment_revoked',
      'primary_set', 'primary_unset',
      'percentage_set', 'percentage_changed',
      'scope_widened', 'scope_narrowed',
      'pin_added', 'pin_removed', 'pin_reactivated',
      'access_toggle_changed'
    ]
    const missingValues = requiredOldValues.filter(v => !post.tac_change_check?.includes(`'${v}'`))
    checks.push({
      name: 'tac CHECK retains all 12 previous values',
      pass: missingValues.length === 0,
      detail: missingValues.length ? `missing: ${missingValues.join(', ')}` : 'all present'
    })

    checks.push({
      name: 'reresolve_building function exists',
      pass: post.reresolve_building_exists === true
    })
    checks.push({
      name: 'trg_building_card_change trigger exists',
      pass: post.building_trigger_exists === true
    })

    const postP2HasIsActive = /WHERE agb\.building_id = p_building_id[\s\S]{0,200}agb\.is_active = true/.test(post.resolver_body)
    checks.push({
      name: 'resolver P2 branch filters agb.is_active = true',
      pass: postP2HasIsActive
    })

    checks.push({
      name: 'agb row count unchanged (existing 9 cards preserved)',
      pass: post.agb_row_count === pre.agb_row_count,
      detail: `pre=${pre.agb_row_count} post=${post.agb_row_count}`
    })

    let allPass = true
    for (const c of checks) {
      console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.detail ? '  -- ' + c.detail : ''}`)
      if (!c.pass) allPass = false
    }
    console.log('')

    if (!allPass) {
      console.error('VERIFICATION FAILED. Rolling back.')
      await client.query('ROLLBACK')
      txStarted = false
      process.exit(1)
    }

    console.log(`All ${checks.length} verification checks PASS.`)
    console.log('Committing.')
    await client.query('COMMIT')
    didCommit = true
    txStarted = false
    console.log('COMMIT complete. Migration persisted.')
  } catch (err) {
    console.error('DEPLOY ERROR:', err.message)
    if (txStarted && !didCommit) {
      try { await client.query('ROLLBACK') } catch (_e) {}
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()