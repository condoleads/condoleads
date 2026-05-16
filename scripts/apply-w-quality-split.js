const fs = require('fs')
const path = require('path')

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
const connStr = envVars.DATABASE_URL || process.env.DATABASE_URL
if (!connStr) { console.error('FATAL: DATABASE_URL not found'); process.exit(1) }

const migPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260516_w_quality_split.sql')
if (!fs.existsSync(migPath)) { console.error('FATAL: migration .sql not found: ' + migPath); process.exit(2) }
const migSql = fs.readFileSync(migPath, 'utf8')
console.log('Migration file: ' + migPath + ' (' + migSql.length + ' bytes)')

const { Client } = require('pg')

async function hasTemperatureColumn(client) {
  const res = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='temperature'`)
  return res.rows.length > 0
}

async function columnsProbe(client, label) {
  console.log('\n--- ' + label + ' ---')
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads'
      AND column_name IN ('quality','temperature')
    ORDER BY column_name`)
  console.table(res.rows)
}

async function constraintProbe(client, label) {
  console.log('\n--- ' + label + ' ---')
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname IN ('leads_quality_check', 'leads_temperature_check')
    ORDER BY conname`)
  console.table(res.rows)
}

async function dataSnapshot(client, label, includeTemperature) {
  console.log('\n--- ' + label + ' ---')
  let q
  if (includeTemperature) {
    q = `SELECT COALESCE(quality, '(null)') AS quality,
                COALESCE(temperature, '(null)') AS temperature,
                COUNT(*) AS count
         FROM leads GROUP BY quality, temperature ORDER BY count DESC NULLS LAST`
  } else {
    q = `SELECT COALESCE(quality, '(null)') AS quality, COUNT(*) AS count
         FROM leads GROUP BY quality ORDER BY count DESC NULLS LAST`
  }
  const res = await client.query(q)
  console.table(res.rows)
}

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected.')

  const preApplied = await hasTemperatureColumn(client)
  console.log('Temperature column already present?  ' + (preApplied ? 'YES' : 'NO'))

  await columnsProbe(client, 'BEFORE: columns')
  await constraintProbe(client, 'BEFORE: constraints')
  await dataSnapshot(client, 'BEFORE: data distribution', preApplied)

  if (preApplied) {
    console.log('\nSkipping migration -- already applied. Running verification only.')
  } else {
    console.log('\n=========================================================')
    console.log('APPLYING MIGRATION (transactional)')
    console.log('=========================================================')
    try {
      await client.query(migSql)
      console.log('Migration applied + committed.')
    } catch (err) {
      console.error('MIGRATION FAILED: ' + err.message)
      console.error('Transaction rolled back atomically by Postgres. DB unchanged.')
      await client.end()
      process.exit(1)
    }
  }

  await columnsProbe(client, 'AFTER: columns')
  await constraintProbe(client, 'AFTER: constraints')
  await dataSnapshot(client, 'AFTER: data distribution', true)

  console.log('\n--- AFTER: expected-count verification ---')
  const expected = [
    { q: 'qualified',    t: 'hot',    expected: 140 },
    { q: 'unqualified',  t: '(null)', expected: 20  },
    { q: 'disqualified', t: '(null)', expected: 2   },
    { q: 'qualified',    t: 'cold',   expected: 1   },
  ]
  const after = await client.query(`
    SELECT COALESCE(quality, '(null)') AS quality,
           COALESCE(temperature, '(null)') AS temperature,
           COUNT(*) AS count
    FROM leads GROUP BY quality, temperature`)

  let allMatch = true
  for (const e of expected) {
    const row = after.rows.find(r => r.quality === e.q && r.temperature === e.t)
    const actual = row ? parseInt(row.count) : 0
    const ok = actual === e.expected
    if (!ok) allMatch = false
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  quality=' + e.q + ' temperature=' + e.t + '  expected=' + e.expected + ' actual=' + actual)
  }
  for (const r of after.rows) {
    const e = expected.find(x => x.q === r.quality && x.t === r.temperature)
    if (!e) {
      console.log('  WARN  unexpected combination: quality=' + r.quality + ' temperature=' + r.temperature + ' count=' + r.count)
      allMatch = false
    }
  }
  console.log('\n' + (allMatch ? 'ALL EXPECTED COUNTS MATCH.' : 'COUNT MISMATCH -- inspect above.'))

  await client.end()
}

main().catch(err => {
  console.error('FATAL: ' + err.message)
  process.exit(1)
})