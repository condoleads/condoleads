// scripts/p5-2c-recon-step2.js
// W-TERRITORY-MASTER P5.2c step 2 recon.
// A) Probe buildings table for tenant-related columns and FKs.
// B) Show BuildingsView fetch calls (lines 80-300).
// C) List all /agents/* endpoints to find the picker BuildingsView uses.

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

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== A1: buildings table columns ===\n')
    const r1 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'buildings'
      ORDER BY ordinal_position;
    `)
    console.table(r1.rows)
    console.log('')
    console.log('  has tenant_id column?', r1.rows.some(r => r.column_name === 'tenant_id'))
    console.log('')

    console.log('=== A2: foreign keys on buildings ===\n')
    const r2 = await client.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'buildings';
    `)
    console.table(r2.rows)
    console.log('')

    console.log('=== A3: any tenant-named tables that reference buildings? ===\n')
    const r3 = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ILIKE '%tenant%'
      ORDER BY table_name;
    `)
    console.table(r3.rows)
    console.log('')

    console.log('=== A4: any table with tenant_id AND building_id columns? ===\n')
    const r4 = await client.query(`
      SELECT t.table_name,
             array_agg(c.column_name ORDER BY c.column_name) AS cols
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_name
      HAVING bool_or(c.column_name = 'tenant_id')
         AND bool_or(c.column_name = 'building_id');
    `)
    console.table(r4.rows)
    console.log('')

    console.log('=== A5: row count of buildings table ===\n')
    const r5 = await client.query(`SELECT COUNT(*)::int AS n FROM buildings;`)
    console.log('  total buildings:', r5.rows[0].n)
    console.log('')

  } catch (err) {
    console.error('DB ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }

  // File-system recon (no DB needed)
  console.log('=== B: BuildingsView.tsx fetch calls (lines 80-300) ===\n')
  const bvPath = 'components/admin-homes/cockpit/territory/BuildingsView.tsx'
  const bv = fs.readFileSync(bvPath, 'utf8').split(/\r?\n/)
  for (let i = 79; i < Math.min(300, bv.length); i++) {
    const line = bv[i]
    if (line.includes('fetch(') || line.includes('/api/') || /^\s*(const|async function|function|useEffect)/.test(line)) {
      console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + line)
    }
  }
  console.log('')

  console.log('=== C1: all /agents/* endpoints ===\n')
  function walkApiDir(dir) {
    const results = []
    if (!fs.existsSync(dir)) return results
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        results.push(...walkApiDir(full))
      } else if (ent.name === 'route.ts' || ent.name === 'route.tsx') {
        results.push(full)
      }
    }
    return results
  }
  const allRoutes = walkApiDir('app/api/admin-homes')
  const agentRoutes = allRoutes.filter(r => /\bagents?\b/i.test(r))
  for (const r of agentRoutes) {
    const buf = fs.readFileSync(r)
    console.log('  ' + r + '  (' + buf.length + ' bytes)')
  }
  console.log('')

  console.log('=== C2: specifically check known P5 agent-picker endpoints ===\n')
  const candidates = [
    'app/api/admin-homes/territory/agents-for-pinning/route.ts',
    'app/api/admin-homes/territory/agents/route.ts',
    'app/api/admin-homes/agents/list/route.ts',
    'app/api/admin-homes/agents/route.ts',
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log('  FOUND:', c)
      console.log('  --- contents ---')
      console.log(fs.readFileSync(c, 'utf8'))
      console.log('')
    } else {
      console.log('  not found:', c)
    }
  }

  console.log('=== RECON STEP 2 COMPLETE ===')
}

main()