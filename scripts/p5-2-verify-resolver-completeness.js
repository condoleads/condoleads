// scripts/p5-2-verify-resolver-completeness.js
// After P5.2 migration, the resolver body shrank from 6485 to 5527 bytes.
// Verify that all critical filters from P5 (ala.is_active) and P2 (no fallbacks)
// are still present, and the new P5.2 filter (agb.is_active) is also present.

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

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    const body = (await client.query(`
      SELECT pg_get_functiondef(
        'public.resolve_agent_for_context(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
      ) AS def;
    `)).rows[0].def

    console.log('=== Resolver body length:', body.length, 'bytes ===')
    console.log('')

    // Critical filters / branches that must all be present.
    const checks = [
      { name: 'P1 reads agent_listing_assignments',     pass: /agent_listing_assignments/.test(body) },
      { name: 'P1 filters ala.is_active = true (P5)',   pass: /ala\.is_active\s*=\s*true/.test(body) },
      { name: 'P2 reads agent_geo_buildings',           pass: /agent_geo_buildings/.test(body) },
      { name: 'P2 filters agb.is_active = true (P5.2)', pass: /agb\.is_active\s*=\s*true/.test(body) },
      { name: 'P3 neighbourhood branch',                pass: /pick_routing_agent_for_type\(\s*'neighbourhood'/.test(body) },
      { name: 'P4 community branch',                    pass: /pick_routing_agent_for_type\(\s*'community'/.test(body) },
      { name: 'P5 municipality branch',                 pass: /pick_routing_agent_for_type\(\s*'municipality'/.test(body) },
      { name: 'P6 area branch',                         pass: /pick_routing_agent_for_type\(\s*'area'/.test(body) },
      { name: 'page-level neighbourhood fallback',      pass: /pick_routing_agent\(\s*'neighbourhood'/.test(body) },
      { name: 'page-level community fallback',          pass: /pick_routing_agent\(\s*'community'/.test(body) },
      { name: 'page-level municipality fallback',       pass: /pick_routing_agent\(\s*'municipality'/.test(body) },
      { name: 'page-level area fallback',               pass: /pick_routing_agent\(\s*'area'/.test(body) },
      { name: 'tenant_property_access gate (T0-1)',     pass: /tenant_property_access/.test(body) },
      { name: 'property_type derivation present',       pass: /'Residential Condo & Other'/.test(body) },
      { name: 'returns NULL (no hash-RR fallback)',     pass: /^[\s\S]*RETURN NULL;\s*END;/.test(body) },
      { name: 'NO hash-RR / hashtext leftover',         pass: !/hashtext/.test(body) },
      { name: 'NO tenant_default routing leftover',     pass: !/'tenant_default'/.test(body) },
    ]

    let allPass = true
    for (const c of checks) {
      console.log(`${c.pass ? '✅' : '❌'} ${c.name}`)
      if (!c.pass) allPass = false
    }

    console.log('')
    if (allPass) {
      console.log('=== ALL CHECKS PASS — resolver is complete and correct ===')
    } else {
      console.log('=== ONE OR MORE CHECKS FAILED — resolver may be missing branches ===')
      console.log('')
      console.log('Full body for inspection:')
      console.log('--- BEGIN ---')
      console.log(body)
      console.log('--- END ---')
      process.exit(1)
    }
  } catch (err) {
    console.error('VERIFY ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()