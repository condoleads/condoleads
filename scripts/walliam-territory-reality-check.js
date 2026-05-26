// scripts/walliam-territory-reality-check.js
//
// Read-only inspection of WALLiam's current territory state.
// Answers: "What does the default distribution look like, given the
//          agents that exist on WALLiam right now?"
//
// All six queries are SELECT-only. No transaction, no writes, no rollback needed.
//
// Loads connection string from .env.local at runtime (no env vars required
// in the shell, no secrets in command history).
//
// Run from project root:
//   node scripts/walliam-territory-reality-check.js

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

// --- .env.local loader ---
// Minimal parser: KEY=VALUE per line, strips surrounding quotes, ignores
// blank lines and # comments. No interpolation, no multi-line values.
function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    return {}
  }
  const raw = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function pickConnectionString(envFile) {
  // Priority: real env > .env.local. Matches the existing script pattern.
  // We try DATABASE_URL first, then POSTGRES_URL.
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    envFile.DATABASE_URL ||
    envFile.POSTGRES_URL ||
    null
  )
}

// Fingerprint a connection string for verification without exposing it.
// Returns "host: <host>, db: <db>, user: <user-prefix>...<user-suffix>"
function fingerprintConnString(cs) {
  try {
    const u = new URL(cs)
    const host = u.hostname
    const db = u.pathname.replace(/^\//, '')
    const user = u.username
    const userFp = user.length > 6
      ? user.slice(0, 3) + '...' + user.slice(-2)
      : user
    return `host=${host} db=${db} user=${userFp}`
  } catch {
    return '(unparseable connection string)'
  }
}

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = pickConnectionString(envFile)
  if (!cs) {
    console.error('FAIL: No connection string found.')
    console.error('  Looked at: process.env.DATABASE_URL, process.env.POSTGRES_URL,')
    console.error('             .env.local DATABASE_URL, .env.local POSTGRES_URL')
    process.exit(1)
  }
  console.log('Connection string source verified.')
  console.log('Fingerprint:', fingerprintConnString(cs))
  console.log('')

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    console.log('=== WALLiam territory reality check ===')
    console.log('Tenant:', WALLIAM_TENANT_ID)
    console.log('')

    // ---------- Q1: Active agents on WALLiam ----------
    console.log('--- Q1: Active agents on WALLiam ---')
    const q1 = await client.query(
      `SELECT id, full_name, role, is_active, is_selling, parent_id
         FROM agents
        WHERE tenant_id = $1
        ORDER BY role DESC NULLS LAST, full_name`,
      [WALLIAM_TENANT_ID]
    )
    console.table(q1.rows)
    const activeSellingAgents = q1.rows.filter(r => r.is_active && r.is_selling)
    console.log(`Active selling agents: ${activeSellingAgents.length}`)
    console.log('')

    // ---------- Q2: Card count on agent_property_access ----------
    console.log('--- Q2: Cards on agent_property_access for WALLiam ---')
    const q2 = await client.query(
      `SELECT COUNT(*)::int AS card_count,
              COUNT(*) FILTER (WHERE is_active)::int AS active_cards,
              COUNT(*) FILTER (WHERE is_primary)::int AS primary_cards
         FROM agent_property_access
        WHERE tenant_id = $1`,
      [WALLIAM_TENANT_ID]
    )
    console.table(q2.rows)
    const cardCount = q2.rows[0].card_count
    console.log('')

    // ---------- Q3: Card breakdown by scope + agent (only if cards exist) ----------
    if (cardCount > 0) {
      console.log('--- Q3: Cards by scope + agent ---')
      const q3 = await client.query(
        `SELECT apa.scope,
                a.full_name AS agent,
                COUNT(*)::int AS cards,
                COUNT(*) FILTER (WHERE apa.is_active)::int AS active,
                COUNT(*) FILTER (WHERE apa.is_primary)::int AS primary_cards
           FROM agent_property_access apa
           JOIN agents a ON a.id = apa.agent_id
          WHERE apa.tenant_id = $1
          GROUP BY apa.scope, a.full_name
          ORDER BY apa.scope, a.full_name`,
        [WALLIAM_TENANT_ID]
      )
      console.table(q3.rows)
    } else {
      console.log('--- Q3: Skipped (no cards exist) ---')
      console.log('WALLiam is in COLD-START state — every listing resolves via tenant default.')
    }
    console.log('')

    // ---------- Q4: mls_listings.assigned_agent_id distribution ----------
    // Note: mls_listings has no tenant_id column. assigned_agent_id is the
    // resolver's cache. We count how many listings are currently routed to
    // each WALLiam agent (regardless of which listing — the cache is global
    // but only WALLiam's resolver writes WALLiam agent UUIDs into it).
    console.log('--- Q4: mls_listings cache distribution (assigned_agent_id) ---')
    const q4 = await client.query(
      `SELECT
         COALESCE(a.full_name, '(unassigned / NULL)') AS agent,
         COUNT(*)::int AS listings,
         ROUND(COUNT(*)::numeric * 100 / SUM(COUNT(*)) OVER (), 2) AS pct
       FROM mls_listings ml
       LEFT JOIN agents a ON a.id = ml.assigned_agent_id
       WHERE ml.available_in_vow = true
         AND (a.tenant_id = $1 OR ml.assigned_agent_id IS NULL)
       GROUP BY a.full_name
       ORDER BY listings DESC`,
      [WALLIAM_TENANT_ID]
    )
    console.table(q4.rows)
    console.log('')

    // ---------- Q5: Pick a sample listing and run the resolver ----------
    console.log('--- Q5: Resolver on a sample listing (no cache, fresh resolve) ---')
    const sampleRes = await client.query(
      `SELECT id, mls_number, building_id, community_id, municipality_id, area_id
         FROM mls_listings
        WHERE available_in_vow = true
        ORDER BY id
        LIMIT 1`
    )
    if (sampleRes.rows.length === 0) {
      console.log('No VOW listings available to sample.')
    } else {
      const sample = sampleRes.rows[0]
      console.log('Sample listing:', sample)
      try {
        const resolved = await client.query(
          `SELECT resolve_display_agent_for_context(
             p_listing_id      => $1::uuid,
             p_building_id     => $2::uuid,
             p_community_id    => $3::uuid,
             p_municipality_id => $4::uuid,
             p_area_id         => $5::uuid,
             p_user_id         => NULL,
             p_tenant_id       => $6::uuid
           ) AS resolved_agent_id`,
          [
            sample.id,
            sample.building_id,
            sample.community_id,
            sample.municipality_id,
            sample.area_id,
            WALLIAM_TENANT_ID,
          ]
        )
        const resolvedId = resolved.rows[0].resolved_agent_id
        if (resolvedId) {
          const agentRow = await client.query(
            `SELECT full_name, role FROM agents WHERE id = $1`,
            [resolvedId]
          )
          console.log('Resolver returned agent:', agentRow.rows[0] || resolvedId)
        } else {
          console.log('Resolver returned NULL — no agent matched, no default available.')
        }
      } catch (err) {
        console.log('Resolver call failed:', err.message)
        console.log('(Resolver signature may differ; not a data problem.)')
      }
    }
    console.log('')

    // ---------- Q6: Tenant default + assistant config ----------
    console.log('--- Q6: Tenant default_agent_id + config ---')
    const q6 = await client.query(
      `SELECT id, name, default_agent_id, assistant_name, plan_mode
         FROM tenants
        WHERE id = $1`,
      [WALLIAM_TENANT_ID]
    )
    console.table(q6.rows)
    if (q6.rows[0]?.default_agent_id) {
      const def = await client.query(
        `SELECT full_name, role FROM agents WHERE id = $1`,
        [q6.rows[0].default_agent_id]
      )
      console.log('Default agent resolves to:', def.rows[0])
    }
    console.log('')

    // ---------- Interpretation ----------
    console.log('=== Interpretation ===')
    if (cardCount === 0) {
      console.log('STATE: Case B (cold-start) per matrix.')
      console.log('  - WALLiam has', activeSellingAgents.length, 'active selling agent(s) and 0 cards.')
      console.log('  - All resolution falls to the tenant default branch.')
      console.log('  - Hash-RR distributes listings deterministically across agents.')
    } else {
      console.log('STATE: Case C (cards present) per matrix.')
      console.log('  - WALLiam has', cardCount, 'card(s).')
      console.log('  - Q3 shows the breakdown; Q4 shows what the cache currently holds.')
    }
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})