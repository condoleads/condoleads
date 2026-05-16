const fs = require('fs')
const path = require('path')

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
const envVars = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) {
      let val = m[2]
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      envVars[m[1]] = val
    }
  }
}

const candidates = ['DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL', 'DIRECT_URL', 'SUPABASE_POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']
let connStr = null, varName = null
for (const c of candidates) {
  if (envVars[c]) { connStr = envVars[c]; varName = c + ' (.env.local)'; break }
  if (process.env[c]) { connStr = process.env[c]; varName = c + ' (process.env)'; break }
}
if (!connStr) {
  console.error('FATAL: no postgres connection string found.')
  console.error('Looked for: ' + candidates.join(', '))
  console.error('Available .env.local keys:')
  Object.keys(envVars).forEach(k => console.error('  - ' + k))
  process.exit(1)
}

console.log('Using connection string from: ' + varName)
const masked = connStr.replace(/:([^:@]+)@/, ':***@')
console.log('Masked URL: ' + masked)

const { Client } = require('pg')

const queries = [
  {
    name: '1. leads.quality + leads.temperature column info',
    sql: `SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='leads'
            AND column_name IN ('quality','temperature')
          ORDER BY column_name`
  },
  {
    name: '2. CHECK constraints on public.leads',
    sql: `SELECT conname, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conrelid='public.leads'::regclass AND contype='c'
          ORDER BY conname`
  },
  {
    name: '3. Quality value distribution',
    sql: `SELECT COALESCE(quality, '(null)') AS quality, COUNT(*) AS count
          FROM leads
          GROUP BY quality
          ORDER BY count DESC`
  },
  {
    name: '4. Indexes referencing quality',
    sql: `SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname='public' AND tablename='leads'
            AND indexdef ILIKE '%quality%'`
  },
  {
    name: '5. Triggers on public.leads',
    sql: `SELECT trigger_name, event_manipulation, action_timing,
                 substring(action_statement for 200) AS action_excerpt
          FROM information_schema.triggers
          WHERE event_object_schema='public' AND event_object_table='leads'
          ORDER BY trigger_name`
  },
  {
    name: '6. RLS policies on public.leads',
    sql: `SELECT policyname, cmd,
                 substring(qual::text for 150) AS qual_excerpt,
                 substring(with_check::text for 150) AS check_excerpt
          FROM pg_policies
          WHERE schemaname='public' AND tablename='leads'
          ORDER BY policyname`
  },
  {
    name: '7. Quality distribution per top-10 tenant',
    sql: `SELECT tenant_id::text AS tenant_id, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE quality='qualified_hot')  AS qualified_hot,
            COUNT(*) FILTER (WHERE quality='qualified_cold') AS qualified_cold,
            COUNT(*) FILTER (WHERE quality='unqualified')    AS unqualified,
            COUNT(*) FILTER (WHERE quality='disqualified')   AS disqualified
          FROM leads
          GROUP BY tenant_id
          ORDER BY total DESC
          LIMIT 10`
  },
  {
    name: '8. lead_admin_actions current action_type counts',
    sql: `SELECT action_type, COUNT(*) AS count
          FROM lead_admin_actions
          GROUP BY action_type
          ORDER BY count DESC`
  },
  {
    name: '9. Any unexpected (non-canonical) quality values?',
    sql: `SELECT quality, COUNT(*) AS count
          FROM leads
          WHERE quality IS NOT NULL
            AND quality NOT IN ('qualified_hot','qualified_cold','unqualified','disqualified')
          GROUP BY quality
          ORDER BY count DESC`
  },
]

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  for (const q of queries) {
    console.log('\n=========================================================')
    console.log(q.name)
    console.log('=========================================================')
    try {
      const res = await client.query(q.sql)
      if (res.rows.length === 0) {
        console.log('  (no rows)')
      } else {
        console.table(res.rows)
      }
    } catch (err) {
      console.error('  ERROR: ' + err.message)
    }
  }
  await client.end()
}

main().catch(err => {
  console.error('FATAL: ' + err.message)
  process.exit(1)
})