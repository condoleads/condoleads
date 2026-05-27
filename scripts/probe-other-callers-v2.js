// scripts/probe-other-callers-v2.js
// Two-pass approach: first list all public functions, then probe each one's
// body individually so a single broken function doesn't blow up the whole query.

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
    console.log('=== Pass 1: list all functions in public ===')
    const r1 = await client.query(`
      SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname <> 'resolve_agent_for_context'
        AND p.prokind = 'f'
      ORDER BY p.proname;
    `)
    console.log('  Total functions in public:', r1.rows.length)
    console.log('')

    console.log('=== Pass 2: probe each function body for reference to resolve_agent_for_context ===')
    const callers = []
    const broken = []
    for (const row of r1.rows) {
      try {
        const r2 = await client.query(`SELECT pg_get_functiondef($1::oid) AS body;`, [row.oid])
        const body = r2.rows[0].body
        if (body && body.indexOf('resolve_agent_for_context') !== -1) {
          callers.push({ proname: row.proname, args: row.args, oid: row.oid })
        }
      } catch (err) {
        broken.push({ proname: row.proname, args: row.args, oid: row.oid, error: err.message })
      }
    }

    console.log('  Callers found:', callers.length)
    if (callers.length > 0) {
      console.table(callers)
    }
    console.log('')

    console.log('  Functions where pg_get_functiondef errored:', broken.length)
    if (broken.length > 0) {
      console.table(broken)
    }
    console.log('')

    console.log('=== Pass 3: for each caller, find the lines that call resolve_agent_for_context ===')
    for (const c of callers) {
      const r3 = await client.query(`SELECT pg_get_functiondef($1::oid) AS body;`, [c.oid])
      const body = r3.rows[0].body
      const lines = body.split('\n')
      console.log('  ---')
      console.log('  function:', c.proname, '(' + c.args + ')')
      let inCall = false
      let depth = 0
      let callBuf = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.indexOf('resolve_agent_for_context') !== -1 || inCall) {
          if (!inCall) {
            inCall = true
            depth = 0
            callBuf = []
          }
          callBuf.push('    ' + line)
          for (const ch of line) {
            if (ch === '(') depth++
            else if (ch === ')') depth--
          }
          if (inCall && depth === 0 && callBuf.length > 1) {
            console.log(callBuf.join('\n'))
            console.log('')
            inCall = false
            callBuf = []
          }
        }
      }
      if (callBuf.length > 0) {
        console.log(callBuf.join('\n'))
        console.log('')
      }
    }

    console.log('=== PROBE COMPLETE ===')
  } catch (err) {
    console.error('ERROR:', err.message)
    console.error(err.stack)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()