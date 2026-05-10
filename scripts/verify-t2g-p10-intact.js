#!/usr/bin/env node
/**
 * verify-t2g-p10-intact.js
 *
 * Read-only DB probe: confirms the resolve_agent_for_context function body
 * contains all four T2g markers (P1, P2, P8 fixes + P10 preserved tier).
 * Uses flexible /\s+/ regex tolerant of any whitespace pg_get_functiondef
 * emits.
 *
 * Exit 0 = all markers present (T2g correctly applied).
 * Exit 1 = any marker missing (T2g broken or rolled back).
 */

const { Client } = require('pg')

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    const r = await c.query(`
      SELECT pg_get_functiondef(p.oid) AS body
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'resolve_agent_for_context'
    `)
    if (r.rows.length === 0) {
      console.error('FAIL: resolve_agent_for_context not found')
      process.exit(1)
    }
    const body = r.rows[0].body
    const lines = body.split(/\r?\n/)
    console.log(`Function body: ${body.length} bytes, ${lines.length} lines`)
    console.log('')

    const checks = [
      {
        name: 'P10 preserved tier (any active agent fallback)',
        regex: /WHERE tenant_id = p_tenant_id AND is_active = true\s+ORDER BY created_at ASC LIMIT 1/,
      },
      {
        name: 'P1/P2 listing/building tenant filter',
        regex: /JOIN agents a ON a\.id = apa\.agent_id[\s\S]{0,200}WHERE[\s\S]{0,300}a\.tenant_id = p_tenant_id/,
      },
      {
        name: 'P8 user_profiles cross-tenant filter (via tenant_users)',
        regex: /tenant_users[\s\S]{0,400}assigned_agent_id/,
      },
    ]

    let allPass = true
    for (const chk of checks) {
      const pass = chk.regex.test(body)
      console.log(`${pass ? '✓' : '✗'} ${chk.name}`)
      if (!pass) allPass = false
    }

    console.log('')
    console.log('--- last 800 chars (P10 region) ---')
    console.log(body.slice(-800))
    console.log('')

    if (allPass) {
      console.log('=== ALL T2g MARKERS INTACT — DB STATE CORRECT ===')
      process.exit(0)
    } else {
      console.log('=== ONE OR MORE MARKERS MISSING — DB STATE INVALID ===')
      process.exit(1)
    }
  } finally {
    await c.end()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})