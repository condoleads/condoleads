#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Probe for the two P5.3 smoke failures.
 *
 * Failure 1 (FAIL [34]): view has 1 non-ASCII char. Locate it (line + col +
 * codepoint + surrounding context).
 *
 * Failure 2 (FAIL [49]): King Shah community phantoms count=0 with the
 * documented `condo_access=false AND homes_access=false` predicate. Find out
 * what the ACTUAL apa state for King Shah at community scope looks like in
 * production this session, so the smoke's prediction can be updated to match
 * reality (or so we can report that data drifted since W-COCKPIT v14).
 *
 * Read-only. No writes anywhere.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// env load
const ENV_PATH = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(ENV_PATH)) {
  const raw = fs.readFileSync(ENV_PATH, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const CONN_STR = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!CONN_STR) {
  console.error('FATAL: DATABASE_URL or POSTGRES_URL not set')
  process.exit(1)
}

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const KING_SHAH_AGENT_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'

function findNonAscii(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const hits = []
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    for (let colIdx = 0; colIdx < line.length; colIdx++) {
      const code = line.charCodeAt(colIdx)
      if (code > 127) {
        hits.push({
          line: lineIdx + 1,
          col: colIdx + 1,
          code,
          codeHex: 'U+' + code.toString(16).toUpperCase().padStart(4, '0'),
          context: line.slice(Math.max(0, colIdx - 30), Math.min(line.length, colIdx + 30)),
        })
      }
    }
  }
  return hits
}

async function main() {
  // ===== Probe 1: locate the non-ASCII char in GeographyView =====
  console.log('===== Probe 1: non-ASCII chars in GeographyView.tsx =====')
  const viewPath = path.join(process.cwd(), 'components', 'admin-homes', 'cockpit', 'territory', 'GeographyView.tsx')
  const hits = findNonAscii(viewPath)
  console.log('  non-ASCII char count: ' + hits.length)
  for (const h of hits) {
    console.log('  - line ' + h.line + ', col ' + h.col + ': ' + h.codeHex + ' (charCode ' + h.code + ')')
    console.log('      context: "' + h.context + '"')
  }
  console.log('')

  // ===== Probe 2: King Shah's actual apa state at community scope =====
  console.log('===== Probe 2: King Shah apa rows at community scope (WALLiam) =====')
  const c = new Client({ connectionString: CONN_STR })
  await c.connect()
  try {
    // 2a — King Shah community rows in WALLiam, no flag filter, no is_active filter
    const allRes = await c.query(
      `SELECT id, community_id, is_primary, is_active,
              condo_access, homes_access, buildings_access,
              created_at
       FROM agent_property_access
       WHERE tenant_id = $1::uuid
         AND agent_id = $2::uuid
         AND scope = 'community'
       ORDER BY created_at DESC`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]
    )
    console.log('  total community rows for King Shah in WALLiam: ' + allRes.rows.length)
    for (const r of allRes.rows) {
      console.log(
        '    - id=' + r.id +
        ' community_id=' + r.community_id +
        ' is_primary=' + r.is_primary +
        ' is_active=' + r.is_active +
        ' condo=' + r.condo_access +
        ' homes=' + r.homes_access +
        ' bldg=' + r.buildings_access +
        ' created_at=' + r.created_at.toISOString()
      )
    }
    console.log('')

    // 2b — Aggregate: what flag-combos exist for King Shah at community scope?
    const aggRes = await c.query(
      `SELECT condo_access, homes_access, buildings_access, is_active, is_primary, COUNT(*)::int AS n
       FROM agent_property_access
       WHERE tenant_id = $1::uuid
         AND agent_id = $2::uuid
         AND scope = 'community'
       GROUP BY condo_access, homes_access, buildings_access, is_active, is_primary
       ORDER BY n DESC`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]
    )
    console.log('  flag-combos for King Shah community rows:')
    if (aggRes.rows.length === 0) {
      console.log('    (none)')
    } else {
      for (const r of aggRes.rows) {
        console.log(
          '    - is_primary=' + r.is_primary +
          ' is_active=' + r.is_active +
          ' condo=' + r.condo_access +
          ' homes=' + r.homes_access +
          ' bldg=' + r.buildings_access +
          ' COUNT=' + r.n
        )
      }
    }
    console.log('')

    // 2c — Full WALLiam apa inventory by agent + scope + flag profile
    const invRes = await c.query(
      `SELECT a.full_name, apa.scope, apa.is_primary, apa.is_active,
              apa.condo_access, apa.homes_access, apa.buildings_access,
              COUNT(*)::int AS n
       FROM agent_property_access apa
       JOIN agents a ON a.id = apa.agent_id
       WHERE apa.tenant_id = $1::uuid
       GROUP BY a.full_name, apa.scope, apa.is_primary, apa.is_active,
                apa.condo_access, apa.homes_access, apa.buildings_access
       ORDER BY a.full_name, apa.scope, apa.is_active DESC, n DESC`,
      [WALLIAM_TENANT_ID]
    )
    console.log('  full WALLiam apa inventory:')
    if (invRes.rows.length === 0) {
      console.log('    (no apa rows)')
    } else {
      for (const r of invRes.rows) {
        console.log(
          '    - ' + r.full_name +
          ' [' + r.scope + ']' +
          ' primary=' + r.is_primary +
          ' active=' + r.is_active +
          ' condo=' + r.condo_access +
          ' homes=' + r.homes_access +
          ' bldg=' + r.buildings_access +
          ' COUNT=' + r.n
        )
      }
    }
  } finally {
    await c.end()
  }

  console.log('')
  console.log('===== PROBE COMPLETE =====')
}

main().catch((err) => {
  console.error('PROBE FAILED:', err)
  process.exit(1)
})