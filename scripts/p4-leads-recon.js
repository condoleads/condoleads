// scripts/p4-leads-recon.js
// Recon for P4: unowned-lead feed + claim system.
//
// Run: node scripts/p4-leads-recon.js > p4-recon-output.txt

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
    // === 1. leads table columns ===
    console.log('=== 1. leads columns ===')
    const leadsCols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads'
        ORDER BY ordinal_position`
    )
    console.table(leadsCols.rows)
    console.log('')

    // === 2. lead_email_log columns ===
    console.log('=== 2. lead_email_log columns ===')
    const lelCols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lead_email_log'
        ORDER BY ordinal_position`
    )
    console.table(lelCols.rows)
    console.log('')

    // === 3. WALLiam leads sample ===
    console.log('=== 3. WALLiam leads counts ===')
    const leadCounts = await client.query(
      `SELECT
         COUNT(*)::int AS total_leads,
         COUNT(*) FILTER (WHERE manager_id IS NOT NULL)::int AS with_manager,
         COUNT(*) FILTER (WHERE override_agent_id IS NOT NULL)::int AS with_override,
         COUNT(*) FILTER (WHERE status_axis = 'active')::int AS active,
         COUNT(*) FILTER (WHERE status_axis = 'closed')::int AS closed
       FROM leads
       WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'`
    )
    console.table(leadCounts.rows)
    console.log('')

    // === 4. Leads with assignment_source distribution ===
    console.log('=== 4. Leads by assignment_source ===')
    const srcDist = await client.query(
      `SELECT assignment_source, COUNT(*)::int AS n
         FROM leads
        WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
        GROUP BY assignment_source
        ORDER BY n DESC`
    )
    console.table(srcDist.rows)
    console.log('')

    // === 5. Per-agent lead counts on WALLiam ===
    console.log('=== 5. WALLiam per-agent lead distribution ===')
    const perAgent = await client.query(
      `SELECT
         COALESCE(a.full_name, '(no agent / unowned)') AS agent,
         COUNT(*)::int AS leads
       FROM leads l
       LEFT JOIN agents a ON a.id = l.override_agent_id
       WHERE l.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
       GROUP BY a.full_name
       ORDER BY leads DESC`
    )
    console.table(perAgent.rows)
    console.log('')

    // === 6. lead-related tables enumeration ===
    console.log('=== 6. All lead-* tables ===')
    const tables = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (table_name LIKE 'lead%' OR table_name LIKE '%_lead%')
        ORDER BY table_name`
    )
    console.table(tables.rows)
    console.log('')

    // === 7. agent_listing_assignments current data ===
    console.log('=== 7. agent_listing_assignments — current rows ===')
    const ala = await client.query(
      `SELECT COUNT(*)::int AS total_rows FROM agent_listing_assignments`
    )
    console.table(ala.rows)
    console.log('')

    // === 8. Agent hierarchy walk capability ===
    console.log('=== 8. agents parent_id chain on WALLiam ===')
    const hier = await client.query(
      `SELECT id, full_name, role, parent_id
         FROM agents
        WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
        ORDER BY parent_id NULLS FIRST, created_at`
    )
    console.table(hier.rows)
    console.log('')

    // === 9. Charlie/lead route inspection — code search for create-lead patterns ===
    console.log('=== 9. (manual) Files with lead INSERT logic ===')
    console.log('(file-system scan below)')
    const root = process.cwd()
    const skip = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel'])
    function walk(dir, list = []) {
      if (!fs.existsSync(dir)) return list
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full, list)
        else if (/\.(ts|tsx)$/.test(e.name)) list.push(full)
      }
      return list
    }
    const files = walk(root)
    const leadInsertHits = []
    for (const f of files) {
      let c
      try { c = fs.readFileSync(f, 'utf8') } catch { continue }
      // Look for files that INSERT into leads OR call resolve_agent_for_context
      if (
        (c.includes("from('leads')") || c.includes('.from("leads")')) &&
        (c.includes('.insert(') || c.includes('.upsert('))
      ) {
        leadInsertHits.push(f.replace(root + path.sep, ''))
      }
    }
    console.log('Files that insert/upsert into leads:')
    for (const f of leadInsertHits) console.log('  ' + f)
    console.log('')

    console.log('=== RECON COMPLETE ===')
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })