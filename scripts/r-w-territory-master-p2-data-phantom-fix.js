// scripts/r-w-territory-master-p2-data-phantom-fix.js
//
// P2-data: flip condo_access + homes_access to true on King Shah's 11 phantom
// community cards (and any other phantom card on WALLiam).
//
// Phantom signature: tenant_id=WALLiam AND is_active=true AND condo_access=false
// AND homes_access=false AND buildings_access=false. These cards exist but route
// nothing because no listing's property_type unlocks them.
//
// Run: node scripts/r-w-territory-master-p2-data-phantom-fix.js

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

const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // === 1. Pre-flight: identify phantom cards ===
    console.log('=== Pre-flight: identify phantom cards on WALLiam ===')
    const pre = await client.query(
      `SELECT
         apa.id,
         apa.scope,
         a.full_name AS agent,
         CASE apa.scope
           WHEN 'area'         THEN ta.name
           WHEN 'municipality' THEN m.name
           WHEN 'community'    THEN co.name
           WHEN 'neighbourhood' THEN n.name
         END AS geo_name,
         apa.condo_access,
         apa.homes_access,
         apa.buildings_access
       FROM agent_property_access apa
       JOIN agents a ON a.id = apa.agent_id
       LEFT JOIN treb_areas ta     ON apa.scope = 'area'         AND ta.id = apa.area_id
       LEFT JOIN municipalities m  ON apa.scope = 'municipality' AND m.id = apa.municipality_id
       LEFT JOIN communities co    ON apa.scope = 'community'    AND co.id = apa.community_id
       LEFT JOIN neighbourhoods n  ON apa.scope = 'neighbourhood' AND n.id = apa.neighbourhood_id
       WHERE apa.tenant_id = $1
         AND apa.is_active = true
         AND apa.condo_access = false
         AND apa.homes_access = false
       ORDER BY a.full_name, apa.scope`,
      [WALLIAM_TENANT]
    )
    console.log(`Phantom cards found: ${pre.rows.length}`)
    console.table(pre.rows)
    console.log('')

    if (pre.rows.length === 0) {
      console.log('No phantom cards. Nothing to fix. Exiting clean.')
      return
    }

    // === 2. Apply fix in transaction ===
    console.log('=== Applying fix (condo_access=true, homes_access=true) ===')
    await client.query('BEGIN')

    const upd = await client.query(
      `UPDATE agent_property_access
          SET condo_access = true,
              homes_access = true,
              updated_at   = now()
        WHERE tenant_id = $1
          AND is_active = true
          AND condo_access = false
          AND homes_access = false
        RETURNING id, scope, agent_id`,
      [WALLIAM_TENANT]
    )
    console.log(`Updated rows: ${upd.rows.length}`)

    if (upd.rows.length !== pre.rows.length) {
      console.error(`MISMATCH: pre-state ${pre.rows.length} vs updated ${upd.rows.length}. Rolling back.`)
      await client.query('ROLLBACK')
      process.exit(1)
    }

    // === 3. Verify in-tx ===
    const verify = await client.query(
      `SELECT COUNT(*)::int AS still_phantom
         FROM agent_property_access
        WHERE tenant_id = $1
          AND is_active = true
          AND condo_access = false
          AND homes_access = false`,
      [WALLIAM_TENANT]
    )
    if (verify.rows[0].still_phantom !== 0) {
      console.error(`VERIFY FAIL: ${verify.rows[0].still_phantom} phantom cards remain. Rolling back.`)
      await client.query('ROLLBACK')
      process.exit(1)
    }
    console.log('Verify: 0 phantom cards remain.')

    await client.query('COMMIT')
    console.log('')
    console.log('=== PASS: phantom cards fixed ===')

    // === 4. Smoke: resolve a King Shah community listing now resolves correctly ===
    console.log('')
    console.log('=== Post-fix smoke ===')
    const sample = await client.query(
      `SELECT ml.id, ml.community_id, ml.municipality_id, ml.area_id, ml.property_type
         FROM mls_listings ml
         JOIN agent_property_access apa
           ON apa.community_id = ml.community_id
          AND apa.scope = 'community'
          AND apa.tenant_id = $1
          AND apa.agent_id = $2
          AND apa.is_active = true
          AND apa.condo_access = true
        WHERE ml.available_in_vow = true
          AND ml.property_type = 'Residential Condo & Other'
        LIMIT 1`,
      [WALLIAM_TENANT, 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe']
    )
    if (sample.rows[0]) {
      const s = sample.rows[0]
      const resolved = await client.query(
        `SELECT resolve_agent_for_context(
           p_listing_id      => $1::uuid,
           p_community_id    => $2::uuid,
           p_municipality_id => $3::uuid,
           p_area_id         => $4::uuid,
           p_tenant_id       => $5::uuid
         ) AS aid`,
        [s.id, s.community_id, s.municipality_id, s.area_id, WALLIAM_TENANT]
      )
      const aid = resolved.rows[0]?.aid
      if (aid === 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe') {
        console.log('  PASS: King Shah community condo listing now resolves to King Shah')
      } else {
        console.log('  WARN: expected King Shah, got', aid)
      }
    } else {
      console.log('  (no condo sample in King Shah communities — verify by cache reroll)')
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })