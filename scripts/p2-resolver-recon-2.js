// scripts/p2-resolver-recon-2.js
// Second recon pass for P2.
//   1. pick_routing_agent body
//   2. mls_listings.property_type distribution
//   3. Caller scan (file system, looks for resolve_*_for_context references)

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const raw = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
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

function walkDir(dir, fileList = []) {
  const skip = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel'])
  if (!fs.existsSync(dir)) return fileList
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, fileList)
    } else if (/\.(ts|tsx|js|jsx|sql)$/.test(entry.name)) {
      fileList.push(full)
    }
  }
  return fileList
}

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // === 1. pick_routing_agent body ===
    console.log('=== 1. pick_routing_agent function body ===')
    const fn = await client.query(
      `SELECT
         p.proname,
         pg_get_function_identity_arguments(p.oid) AS args,
         pg_get_functiondef(p.oid) AS def
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'pick_routing_agent'`
    )
    if (fn.rows.length === 0) {
      console.log('(not found — function may not exist)')
    } else {
      for (const r of fn.rows) {
        console.log(`--- ${r.proname}(${r.args}) ---`)
        console.log(r.def)
        console.log('')
      }
    }

    // === 2. mls_listings.property_type distribution ===
    console.log('=== 2. mls_listings.property_type values ===')
    const pt = await client.query(
      `SELECT property_type, COUNT(*)::int AS n
         FROM mls_listings
        WHERE available_in_vow = true
        GROUP BY property_type
        ORDER BY n DESC
        LIMIT 20`
    )
    console.table(pt.rows)
    console.log('')

    console.log('=== 2b. Cross-tab: building_id NULL vs property_type ===')
    const cross = await client.query(
      `SELECT
         property_type,
         COUNT(*) FILTER (WHERE building_id IS NOT NULL)::int AS with_building,
         COUNT(*) FILTER (WHERE building_id IS NULL)::int AS without_building
       FROM mls_listings
       WHERE available_in_vow = true
       GROUP BY property_type
       ORDER BY (COUNT(*) FILTER (WHERE building_id IS NOT NULL) +
                 COUNT(*) FILTER (WHERE building_id IS NULL)) DESC
       LIMIT 20`
    )
    console.table(cross.rows)
    console.log('')

    // === 3. Caller inventory ===
    console.log('=== 3. Code references to resolver functions ===')
    const allFiles = walkDir(process.cwd())
    const patterns = [
      'resolve_agent_for_context',
      'resolve_display_agent_for_context',
      'resolve_geo_primary',
      'pick_routing_agent',
    ]
    const hits = {}
    for (const p of patterns) hits[p] = []
    for (const file of allFiles) {
      let content
      try { content = fs.readFileSync(file, 'utf8') } catch { continue }
      for (const p of patterns) {
        if (content.includes(p)) {
          // Get the first line number containing the pattern
          const lines = content.split('\n')
          const lineNum = lines.findIndex(l => l.includes(p)) + 1
          hits[p].push({ file: file.replace(process.cwd() + path.sep, ''), line: lineNum })
        }
      }
    }
    for (const p of patterns) {
      console.log(`--- ${p} (${hits[p].length} files) ---`)
      for (const h of hits[p]) console.log(`  ${h.file}:${h.line}`)
      console.log('')
    }

    console.log('=== RECON 2 COMPLETE ===')
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })