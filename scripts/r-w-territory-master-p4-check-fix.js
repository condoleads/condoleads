// scripts/r-w-territory-master-p4-check-fix.js
//
// Extends leads_assignment_source_check to include 'claim'.
// Missed in the initial P4 migration (recon gap).
//
// Pre-flight: confirms current CHECK does NOT include 'claim'.
// Apply: DROP + re-ADD with 'claim' appended, single tx.
// Verify: new definition contains 'claim'.
//
// Run: node scripts/r-w-territory-master-p4-check-fix.js

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const out = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // Pre-flight
    console.log('=== Pre-flight ===')
    const pre = await client.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'leads' AND c.conname = 'leads_assignment_source_check'`
    )
    if (pre.rows.length === 0) {
      console.error('FAIL: leads_assignment_source_check not found')
      process.exit(1)
    }
    const preDef = pre.rows[0].def
    console.log('Current:', preDef)
    if (preDef.includes("'claim'")) {
      console.log('Already includes claim — nothing to do. Exiting clean.')
      return
    }
    console.log('')

    // Apply
    console.log('=== Applying ===')
    await client.query('BEGIN')
    await client.query(
      `ALTER TABLE leads DROP CONSTRAINT leads_assignment_source_check`
    )
    await client.query(
      `ALTER TABLE leads ADD CONSTRAINT leads_assignment_source_check
       CHECK (assignment_source = ANY (ARRAY[
         'geo'::text,
         'admin'::text,
         'manual'::text,
         'override'::text,
         'claim'::text
       ]))`
    )

    // Verify inside tx
    const post = await client.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'leads' AND c.conname = 'leads_assignment_source_check'`
    )
    const postDef = post.rows[0]?.def || ''
    console.log('Post:', postDef)

    if (!postDef.includes("'claim'")) {
      console.error('FAIL: post-state does not include claim — rolling back')
      await client.query('ROLLBACK')
      process.exit(1)
    }

    await client.query('COMMIT')
    console.log('')
    console.log('=== PASS: assignment_source CHECK extended with claim ===')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })