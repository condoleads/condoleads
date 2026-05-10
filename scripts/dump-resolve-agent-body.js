#!/usr/bin/env node
/**
 * dump-resolve-agent-body.js
 * One-shot: writes live resolve_agent_for_context body to recon/ + counts
 * tenant_id = p_tenant_id occurrences. >= 3 means P1/P2 fixes are in.
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

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
    const body = r.rows[0].body
    const out = path.resolve('recon', 'W-LEADS-EMAIL-T2G-FUNCTION-BODY.txt')
    fs.writeFileSync(out, body)
    console.log(`Wrote ${body.length} bytes to ${out}`)
    console.log('')

    const tenantFilterCount = (body.match(/tenant_id\s*=\s*p_tenant_id/g) || []).length
    console.log(`tenant_id = p_tenant_id occurrences: ${tenantFilterCount}`)
    console.log(`(pre-T2g baseline = 1 [P10 only]; post-T2g expected >= 3)`)
    console.log('')

    const lines = body.split(/\r?\n/)
    console.log('--- lines containing tenant_id = p_tenant_id ---')
    lines.forEach((line, i) => {
      if (/tenant_id\s*=\s*p_tenant_id/.test(line)) {
        console.log(`L${i + 1}: ${line.trim()}`)
      }
    })

    if (tenantFilterCount >= 3) {
      console.log('')
      console.log('=== P1/P2 FIXES PRESENT — T2g VERIFIED ===')
      process.exit(0)
    } else {
      console.log('')
      console.log('=== INSUFFICIENT TENANT FILTERS — INVESTIGATE BEFORE COMMIT ===')
      process.exit(1)
    }
  } finally {
    await c.end()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})