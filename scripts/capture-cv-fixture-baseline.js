#!/usr/bin/env node
// scripts/capture-cv-fixture-baseline.js
// W-CORE-VERIFICATION CV-FIXTURE baseline capture + diff.
//
// MODES:
//   --mode=before  -- capture pre-build snapshot to cv-fixture-baseline-before.json.
//                     Read-only. BEGIN READ ONLY. Idempotent (overwrites file).
//   --mode=after   -- re-capture current state, diff vs the saved before snapshot,
//                     write cv-fixture-baseline-after.json + cv-fixture-baseline-diff.txt.
//                     Exits non-zero (HALT) on ANY unexpected WALLiam/aily mutation.
//
// WHAT WE CAPTURE (deliberately scoped -- WALLiam/aily invariants, not raw cache):
//   - WALLiam tenant row (selected columns, no secrets)
//   - WALLiam agents (id, role, parent_id, is_active, is_selling) -- the chain
//   - WALLiam agent_property_access rows (THE 12 carves) -- byte-identical invariant
//   - WALLiam tenant_floor_pool rows (3 entries) -- byte-identical invariant
//   - WALLiam agent_geo_buildings (active rows) -- byte-identical invariant
//   - WALLiam agent_listing_assignments (active pins) -- byte-identical invariant
//   - aily carve count = 0 invariant
//   - Sample resolution truth: resolve_agent_for_context() called under WALLiam
//     tenant_id for one Whitby (Brooklin) condo + one Whitby home -- must return
//     the same agent_id before and after.
//
// WHAT WE DO NOT CAPTURE (legitimate-to-change):
//   - mls_listings.assigned_agent_id values (the cache; reroll mutates this and
//     that's expected under apa-insert; instead we verify SEMANTIC resolution
//     via the resolve_agent_for_context probe above).
//   - lead rows (the fixture inserts none; safety guaranteed structurally).
//
// SECURITY:
//   - Tenant rows SELECTed via explicit column list (no SELECT *; tenants holds
//     anthropic_api_key + resend_api_key -- CLAUDE.md Secrets rule).
//
// PERMISSION GATE: this script is read-only and runs autonomously per CLAUDE.md
// (recon-style probe; BEGIN READ ONLY; ROLLBACK on exit).

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const cfg = require('./cv-fixture-config');

const argv = process.argv.slice(2);
const modeArg = argv.find(a => a.startsWith('--mode='));
const MODE = modeArg ? modeArg.split('=')[1] : null;
if (!MODE || !['before', 'after'].includes(MODE)) {
  console.error('Usage: node scripts/capture-cv-fixture-baseline.js --mode=before|after');
  process.exit(2);
}

const cs = process.env.DATABASE_URL;
if (!cs) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }

function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

async function readOnly(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] ' + e.message));
  await c.connect();
  await c.query('BEGIN READ ONLY');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end().catch(() => {});
  }
}

async function captureSnapshot() {
  return await readOnly('baseline', async (c) => {
    // 1. WALLiam tenant row (explicit cols, no secrets).
    const tenant = await c.query(
      `SELECT id, name, domain, source_key, lifecycle_status, is_active,
              homepage_layout, default_claim_quota, plan_mode, assistant_name
         FROM tenants
        WHERE domain = $1`, [cfg.WALLIAM_TENANT_DOMAIN]);
    if (tenant.rows.length !== 1) fail('WALLiam tenant not found by domain=' + cfg.WALLIAM_TENANT_DOMAIN);

    // 2. WALLiam agents (chain shape only, no creds).
    const agents = await c.query(
      `SELECT id, full_name, email, role, parent_id, is_active, is_selling, site_type, tenant_id
         FROM agents
        WHERE tenant_id = $1
        ORDER BY role, full_name`, [cfg.WALLIAM_TENANT_ID]);

    // 3. WALLiam agent_property_access carves -- the 12 (and any future adds).
    const apa = await c.query(
      `SELECT id, agent_id, tenant_id, scope, is_active, is_primary,
              condo_access, homes_access, buildings_access, buildings_mode,
              area_id, municipality_id, community_id, neighbourhood_id
         FROM agent_property_access
        WHERE tenant_id = $1
        ORDER BY scope, COALESCE(community_id::text, municipality_id::text, area_id::text, neighbourhood_id::text)`,
      [cfg.WALLIAM_TENANT_ID]);

    // 4. WALLiam floor pool.
    const fp = await c.query(
      `SELECT id, tenant_id, agent_id, condo_access, homes_access, is_active
         FROM tenant_floor_pool
        WHERE tenant_id = $1
        ORDER BY agent_id`, [cfg.WALLIAM_TENANT_ID]);

    // 5. WALLiam agent_geo_buildings (active).
    const agb = await c.query(
      `SELECT agb.id, agb.agent_id, agb.building_id, agb.is_active
         FROM agent_geo_buildings agb
         JOIN agents a ON a.id = agb.agent_id
        WHERE a.tenant_id = $1 AND agb.is_active = TRUE
        ORDER BY agb.id`, [cfg.WALLIAM_TENANT_ID]);

    // 6. WALLiam agent_listing_assignments (active pins).
    const ala = await c.query(
      `SELECT ala.id, ala.agent_id, ala.listing_id, ala.is_active
         FROM agent_listing_assignments ala
         JOIN agents a ON a.id = ala.agent_id
        WHERE a.tenant_id = $1 AND ala.is_active = TRUE
        ORDER BY ala.id`, [cfg.WALLIAM_TENANT_ID]);

    // 7. aily carve count invariant (= 0).
    const aily = await c.query(
      `SELECT COUNT(*)::int AS n_carves
         FROM agent_property_access
        WHERE tenant_id = $1 AND is_active = TRUE`, [cfg.AILY_TENANT_ID]);

    // 8. Sample resolution truth -- pick one Whitby Brooklin condo and one home.
    // Both should resolve to King Shah (Brooklin community carve owner) per the
    // 12 carves; if not, baseline has shifted under our feet -- HALT before
    // applying anything.
    // Note: mls_listings has no neighbourhood_id column; pass NULL for that arg.
    const wprobe = await c.query(
      `WITH brooklin AS (
         SELECT id, property_type, community_id, municipality_id, area_id, building_id
           FROM mls_listings
          WHERE community_id = (SELECT id FROM communities WHERE slug='brooklin' LIMIT 1)
            AND standard_status = 'Active'
            AND property_type IN ('Residential Condo & Other', 'Residential Freehold')
          ORDER BY property_type, id
          LIMIT 4
       )
       SELECT b.id AS listing_id, b.property_type,
              resolve_agent_for_context(
                b.id, b.building_id, NULL, b.community_id,
                b.municipality_id, b.area_id, NULL, $1
              ) AS resolved_agent_id
         FROM brooklin b`, [cfg.WALLIAM_TENANT_ID]);

    return {
      captured_at: new Date().toISOString(),
      mode: MODE,
      walliam_tenant:      tenant.rows[0],
      walliam_agents:      agents.rows,
      walliam_apa_carves:  apa.rows,
      walliam_floor_pool:  fp.rows,
      walliam_buildings:   agb.rows,
      walliam_pins:        ala.rows,
      aily_carve_count:    aily.rows[0].n_carves,
      walliam_resolution_probe: wprobe.rows,
      counts: {
        walliam_agents:      agents.rows.length,
        walliam_apa_carves:  apa.rows.length,
        walliam_floor_pool:  fp.rows.length,
        walliam_buildings:   agb.rows.length,
        walliam_pins:        ala.rows.length,
        walliam_resolution_probe: wprobe.rows.length,
      },
    };
  });
}

function canon(o) {
  // Deterministic JSON canonicalization for byte-level diff comparison.
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  const keys = Object.keys(o).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}

function diff(before, after) {
  const findings = [];

  // 0. Captured-at is allowed to differ; everything else must match.
  const tablesToCheck = [
    'walliam_tenant',
    'walliam_agents',
    'walliam_apa_carves',
    'walliam_floor_pool',
    'walliam_buildings',
    'walliam_pins',
    'walliam_resolution_probe',
  ];
  for (const t of tablesToCheck) {
    const b = canon(before[t]);
    const a = canon(after[t]);
    if (b !== a) {
      findings.push({
        kind:    'MISMATCH',
        table:   t,
        message: 'WALLiam ' + t + ' diverged between before and after',
        before:  before[t],
        after:   after[t],
      });
    }
  }

  // aily invariant: 0 carves before AND after.
  if (after.aily_carve_count !== 0) {
    findings.push({
      kind: 'AILY-CARVES-NONZERO',
      message: 'aily carve count expected 0, got ' + after.aily_carve_count,
    });
  }
  if (before.aily_carve_count !== 0) {
    findings.push({
      kind: 'AILY-BASELINE-ALREADY-NONZERO',
      message: 'aily had ' + before.aily_carve_count + ' carves BEFORE the build -- pre-existing state issue',
    });
  }

  return findings;
}

(async () => {
  console.log('=== capture-cv-fixture-baseline mode=' + MODE + ' ===');
  const snap = await captureSnapshot();
  console.log('counts:');
  for (const [k, v] of Object.entries(snap.counts)) console.log('  ' + k + ' = ' + v);
  console.log('aily_carve_count = ' + snap.aily_carve_count);
  console.log('resolution probe (Brooklin sample):');
  for (const r of snap.walliam_resolution_probe) {
    console.log('  ' + r.property_type.padEnd(28) + ' -> ' + r.resolved_agent_id);
  }

  if (MODE === 'before') {
    fs.writeFileSync(cfg.PATHS.baselineBefore, JSON.stringify(snap, null, 2));
    console.log('wrote ' + path.relative(process.cwd(), cfg.PATHS.baselineBefore));
    console.log('BEFORE snapshot captured. Ready for apply-runner.');
    process.exit(0);
  }

  // MODE = 'after'
  if (!fs.existsSync(cfg.PATHS.baselineBefore)) {
    fail('Cannot diff: ' + cfg.PATHS.baselineBefore + ' missing. Run --mode=before first.');
  }
  const before = JSON.parse(fs.readFileSync(cfg.PATHS.baselineBefore, 'utf8'));
  fs.writeFileSync(cfg.PATHS.baselineAfter, JSON.stringify(snap, null, 2));
  console.log('wrote ' + path.relative(process.cwd(), cfg.PATHS.baselineAfter));

  const findings = diff(before, snap);
  const lines = [];
  lines.push('=== baseline diff (after - before) ===');
  lines.push('before captured_at: ' + before.captured_at);
  lines.push('after  captured_at: ' + snap.captured_at);
  lines.push('');
  if (findings.length === 0) {
    lines.push('CLEAN -- no WALLiam/aily row diverged. (Test-tenant rows are not tracked here.)');
  } else {
    lines.push('HALT: ' + findings.length + ' divergence(s) detected:');
    for (const f of findings) {
      lines.push('  - ' + f.kind + ': ' + f.message);
      if (f.table) {
        lines.push('    before: ' + JSON.stringify(f.before));
        lines.push('    after:  ' + JSON.stringify(f.after));
      }
    }
  }
  const text = lines.join('\n') + '\n';
  fs.writeFileSync(cfg.PATHS.baselineDiff, text);
  console.log(text);

  if (findings.length > 0) {
    console.error('BASELINE-DIFF NOT CLEAN -- exiting non-zero (HALT).');
    process.exit(3);
  }
  console.log('BASELINE-DIFF CLEAN.');
  process.exit(0);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
