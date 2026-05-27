// scripts/r-w-territory-master-p5-2b-deploy.js
// W-TERRITORY-MASTER P5.2b deploy runner.
// Pre-state: snapshot current reresolve_listing body, save to backups/.
// Apply migration in a single transaction.
// Post-state: verify the new body contains exactly the expected diff markers.
// On mismatch: ROLLBACK and report.
// On success: COMMIT and write proof artifact.

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
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
  console.error('FATAL: SUPABASE_DB_URL or DATABASE_URL not set in .env.local')
  process.exit(1)
}

const MIGRATION_PATH = path.join('supabase', 'migrations', '20260527_p5_2b_reresolve_listing_building_fix.sql')
const BACKUP_DIR = path.join('backups')

async function main() {
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error('FATAL: migration file not found at', MIGRATION_PATH)
    process.exit(1)
  }
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== Pre-state: probe current reresolve_listing body ===')
    const pre = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_listing';
    `)
    if (pre.rows.length === 0) {
      throw new Error('reresolve_listing not found in public schema')
    }
    const preBody = pre.rows[0].body
    console.log('  current body length:', preBody.length)

    // Sanity: current body should contain the bug markers we're fixing.
    const hasOldSelect = preBody.indexOf('SELECT area_id, municipality_id, community_id, assigned_agent_id') !== -1
    const hasOldNullPass = preBody.indexOf('NULL,                      -- p_building_id') !== -1
    console.log('  contains old SELECT (without building_id):', hasOldSelect)
    console.log('  contains old NULL p_building_id pass:     ', hasOldNullPass)
    if (!hasOldSelect || !hasOldNullPass) {
      throw new Error('Pre-state mismatch: current reresolve_listing body does not match expected pre-patch shape. Aborting.')
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(BACKUP_DIR, `reresolve_listing.before_p5_2b.${ts}.sql`)
    fs.writeFileSync(backupPath, preBody, 'utf8')
    console.log('  pre-state backed up to:', backupPath)
    console.log('')

    console.log('=== Apply migration in transaction ===')
    await client.query('BEGIN')

    await client.query(migrationSql)
    console.log('  migration applied')

    console.log('')
    console.log('=== Post-state: probe new reresolve_listing body ===')
    const post = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_listing';
    `)
    const postBody = post.rows[0].body
    console.log('  new body length:', postBody.length)

    const newHasNewSelect = postBody.indexOf('SELECT area_id, municipality_id, community_id, building_id, assigned_agent_id') !== -1
    const newHasBuildingPass = postBody.indexOf('v_listing.building_id') !== -1
    const newStillHasOldSelect = postBody.indexOf('SELECT area_id, municipality_id, community_id, assigned_agent_id') !== -1
    const newStillHasOldNullPass = postBody.indexOf('NULL,                      -- p_building_id') !== -1

    console.log('  contains new SELECT (with building_id):              ', newHasNewSelect)
    console.log('  contains v_listing.building_id resolver arg:         ', newHasBuildingPass)
    console.log('  still contains old SELECT (should be false):         ', newStillHasOldSelect)
    console.log('  still contains old NULL p_building_id (should false):', newStillHasOldNullPass)

    if (!newHasNewSelect || !newHasBuildingPass || newStillHasOldSelect || newStillHasOldNullPass) {
      throw new Error('Post-state mismatch: new reresolve_listing body is not the expected P5.2b shape. ROLLBACK.')
    }

    // Confirm signature unchanged (same arg list).
    const sig = await client.query(`
      SELECT pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_listing';
    `)
    console.log('  signature:', sig.rows[0].args)
    if (sig.rows[0].args !== 'p_listing_id uuid, p_tenant_id uuid') {
      throw new Error('Signature drift detected. ROLLBACK.')
    }

    await client.query('COMMIT')
    console.log('')
    console.log('=== COMMITTED ===')

    const postPath = path.join(BACKUP_DIR, `reresolve_listing.after_p5_2b.${ts}.sql`)
    fs.writeFileSync(postPath, postBody, 'utf8')
    console.log('  post-state archived to:', postPath)

    console.log('')
    console.log('=== DEPLOY COMPLETE ===')
  } catch (err) {
    console.error('ERROR:', err.message)
    try {
      await client.query('ROLLBACK')
      console.error('  ROLLBACK executed')
    } catch (e) {
      console.error('  ROLLBACK failed:', e.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()