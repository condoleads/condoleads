// scripts/apply-phase1-routing-set.js
//
// W-TERRITORY-MASTER Phase 1 apply-runner.
//
// Reads supabase/migrations/20260528_phase1_routing_set_and_revert.sql,
// captures snapshots + baseline BEFORE the transaction, then BEGIN -> SET
// LOCAL statement_timeout=0 -> execute SQL (with embedded V1-V8 ASSERTs)
// -> COMMIT or ROLLBACK on any failure. Post-COMMIT: smoke-diff vs baseline,
// GAP-6 read-path timing, prints rollback paths and the manual-action
// reminder for the compute downgrade.
//
// THIS SCRIPT WRITES TO PRODUCTION. Gated by `ask` in
// .claude/settings.local.json: scripts/apply-*.js requires per-invocation
// approval. The operator reviews this file plus the .sql file before
// allowing execution.
//
// CLAUDE.md compliance:
//   * Strips UTF-8 BOM defensively when reading the .sql (apply-runner pattern).
//   * Uses node-pg with explicit transaction control.
//   * Refuses to run unless DISABLE_STATEMENT_TIMEOUT=1 is set (large UPDATE).
//   * Refuses to run against a pooler URL (SET LOCAL would not stick).
//
// One-shot script. Do NOT re-run after a successful COMMIT (the revert+
// re-materialize already happened). To repeat, first run the down-migration.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Constants
// =============================================================================

const PROJECT_ROOT   = process.cwd();
const MIGRATION_PATH = path.join(PROJECT_ROOT, 'supabase', 'migrations', '20260528_phase1_routing_set_and_revert.sql');
const SNAPSHOT_DIR   = path.join(PROJECT_ROOT, 'supabase', 'migrations', 'rollback-snapshots');
const BASELINE_DIR   = path.join(PROJECT_ROOT, 'baselines');

// Timestamp formats:
//   TS:       human-readable for log lines / file names (ISO with - instead of : and .)
//   TS_TABLE: compact for Postgres identifiers (max 63 chars; we stay well under)
const TS = new Date().toISOString().replace(/[:.]/g, '-');           // e.g. 2026-05-28T17-30-00-000Z
const TS_TABLE = TS.replace(/[-Z]/g, '').replace('T', '_').substring(0, 15);  // e.g. 20260528_173000

// Verified key IDs (from CLAUDE.md / cold-start probe).
const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const AILY_TENANT    = 'e2619717-6401-4159-8d4c-d5f87651c8d6';
const WHITBY_MUNI    = '70103aef-1b32-4939-9ff8-264e859a5587';
const NEO_SMITH      = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';
const KING_SHAH      = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';

// =============================================================================
// Env validation
// =============================================================================

function validateEnv() {
  const errs = [];
  if (process.env.DISABLE_STATEMENT_TIMEOUT !== '1') {
    errs.push('DISABLE_STATEMENT_TIMEOUT must be set to "1". Phase 1 contains a ~1.29M-row UPDATE that will exceed the default pool timeout.');
  }
  const dburl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dburl) {
    errs.push('DATABASE_URL or SUPABASE_DB_URL must be set in .env.local.');
  } else {
    // Transaction-pooler (port 6543) rejection only.
    // Session pooler (port 5432) allocates one server connection per client
    // session for the session's duration, so SET LOCAL statement_timeout DOES
    // persist. Only transaction pooler resets server state between statements,
    // which is what breaks SET LOCAL. The "pooler" substring alone is not
    // disqualifying when the port is 5432.
    if (/:6543\b/.test(dburl)) {
      errs.push('DATABASE_URL appears to be a TRANSACTION pooler (port 6543) - SET LOCAL statement_timeout will not persist. Use the session pooler (port 5432) or a direct connection.');
    }
  }
  if (errs.length > 0) {
    console.error('ENV VALIDATION FAILED:');
    for (const e of errs) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('Env validation OK.');
}

// =============================================================================
// SQL file read + BOM strip
// =============================================================================

function readMigrationSQL() {
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error('Migration SQL not found at ' + MIGRATION_PATH);
    process.exit(1);
  }
  let sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1);   // BOM strip
  return sql;
}

// =============================================================================
// Pre-BEGIN: capture rollback snapshots
// =============================================================================

async function captureFunctionSnapshot(client, funcName) {
  const res = await client.query(
    `SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = $1
        AND p.prokind = 'f'
      ORDER BY p.oid`,
    [funcName]
  );
  if (res.rows.length === 0) {
    console.log('  (no existing ' + funcName + ' to snapshot — skipping)');
    return null;
  }
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const fname = '_phase1_' + funcName + '_' + TS + '.sql';
  const fpath = path.join(SNAPSHOT_DIR, fname);
  const header =
    '-- Rollback snapshot of public.' + funcName + ' captured at ' + TS + '\n' +
    '-- Restore by piping this file into psql against the same database.\n\n';
  const bodies = res.rows.map(r => '-- ' + r.sig + '\n' + r.def + ';\n').join('\n');
  fs.writeFileSync(fpath, header + bodies);
  return fpath;
}

async function captureCacheSnapshot(client) {
  // Snapshot pre-Phase-1 (id, assigned_agent_id) for every currently-filled row.
  // assigned_scope and assigned_source_id do not exist yet — they're added by
  // the up-migration in §2. The down-migration's optional hard-restore can
  // only restore assigned_agent_id.
  const tableName = 'mls_listings_assigned_snapshot_' + TS_TABLE;
  console.log('  Creating side table public.' + tableName + ' (this CTAS is the snapshot).');
  await client.query(
    'CREATE TABLE public.' + tableName + ' AS ' +
    'SELECT id, assigned_agent_id FROM public.mls_listings WHERE assigned_agent_id IS NOT NULL'
  );
  const cnt = await client.query('SELECT COUNT(*)::bigint AS n FROM public.' + tableName);
  console.log('  Side table populated: ' + cnt.rows[0].n + ' rows.');
  return tableName;
}

// =============================================================================
// Pre-BEGIN: baseline smoke capture
//
//   * 12 carves: for each, fetch up to 5 representative listings + their
//     currently-assigned agent_id.
//   * 2 commercials: full row state.
//   * Floor sample: 50 random condo/home listings OUTSIDE every carve.
// =============================================================================

async function captureBaseline(client) {
  const baseline = {
    timestamp: TS,
    twelve_carves: [],
    two_commercials: [],
    floor_sample: []
  };

  const carvesQ = await client.query(
    "SELECT 'municipality'::text AS scope, $1::uuid AS scope_id " +
    "UNION ALL " +
    "SELECT 'community', community_id " +
    "FROM public.agent_property_access " +
    "WHERE tenant_id = $2 AND scope = 'community' AND is_active = true AND community_id IS NOT NULL",
    [WHITBY_MUNI, WALLIAM_TENANT]
  );

  for (const c of carvesQ.rows) {
    const geoCol = c.scope === 'community' ? 'community_id' : 'municipality_id';
    const samplesQ = await client.query(
      'SELECT id, listing_key, assigned_agent_id FROM public.mls_listings ' +
      'WHERE ' + geoCol + ' = $1 AND assigned_agent_id IS NOT NULL ' +
      'AND property_type IN (\'Residential Condo & Other\',\'Residential Freehold\') ' +
      'LIMIT 5',
      [c.scope_id]
    );
    baseline.twelve_carves.push({ scope: c.scope, scope_id: c.scope_id, samples: samplesQ.rows });
  }

  const commQ = await client.query(
    'SELECT id, listing_key, assigned_agent_id, property_type, municipality_id, community_id ' +
    'FROM public.mls_listings WHERE property_type = $1 AND assigned_agent_id IS NOT NULL',
    ['Commercial']
  );
  baseline.two_commercials = commQ.rows;

  const floorQ = await client.query(
    'SELECT ml.id, ml.listing_key, ml.property_type, ml.community_id, ml.municipality_id, ml.area_id, ml.assigned_agent_id ' +
    'FROM public.mls_listings ml ' +
    "WHERE ml.assigned_agent_id IS NOT NULL " +
    "  AND ml.property_type IN ('Residential Condo & Other','Residential Freehold') " +
    "  AND ml.municipality_id <> $1 " +  // exclude Whitby (muni carve)
    "  AND NOT EXISTS ( " +              // exclude all 11 community carves
    "    SELECT 1 FROM public.agent_property_access apa " +
    "    WHERE apa.tenant_id = $2 " +
    "      AND apa.scope = 'community' AND apa.is_active = true " +
    "      AND apa.community_id IS NOT NULL " +
    "      AND apa.community_id = ml.community_id " +
    "  ) " +
    'ORDER BY random() LIMIT 50',
    [WHITBY_MUNI, WALLIAM_TENANT]
  );
  baseline.floor_sample = floorQ.rows;

  if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const bpath = path.join(BASELINE_DIR, 'phase1_baseline_' + TS + '.json');
  fs.writeFileSync(bpath, JSON.stringify(baseline, null, 2));
  return bpath;
}

// =============================================================================
// Post-COMMIT: smoke diff against baseline
// =============================================================================

async function postCommitVerification(client, baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const regressions = [];

  // Carves: every sample listing must (a) still route to the same agent,
  // (b) now have assigned_scope set to the carve's scope.
  for (const carve of baseline.twelve_carves) {
    for (const samp of carve.samples) {
      const r = await client.query(
        'SELECT assigned_agent_id, assigned_scope FROM public.mls_listings WHERE id = $1',
        [samp.id]
      );
      if (r.rows.length === 0) {
        regressions.push({ where: 'carve sample', listing_id: samp.id, issue: 'row missing post-apply' });
        continue;
      }
      const post = r.rows[0];
      if (post.assigned_agent_id !== samp.assigned_agent_id) {
        regressions.push({
          where: 'carve sample',
          listing_id: samp.id,
          issue: 'agent changed',
          before: samp.assigned_agent_id,
          after:  post.assigned_agent_id,
          scope:  carve.scope
        });
      }
      if (post.assigned_scope !== carve.scope) {
        regressions.push({
          where: 'carve sample',
          listing_id: samp.id,
          issue: 'wrong scope',
          expected: carve.scope,
          actual:   post.assigned_scope
        });
      }
    }
  }

  // Commercials: agent unchanged, scope='municipality', source_id non-null.
  for (const cm of baseline.two_commercials) {
    const r = await client.query(
      'SELECT assigned_agent_id, assigned_scope, assigned_source_id FROM public.mls_listings WHERE id = $1',
      [cm.id]
    );
    const post = r.rows[0];
    if (!post
        || post.assigned_agent_id !== cm.assigned_agent_id
        || post.assigned_scope !== 'municipality'
        || !post.assigned_source_id) {
      regressions.push({
        where: 'commercial pin',
        listing_id: cm.id,
        issue: 'pin not preserved',
        before: cm,
        after: post
      });
    }
  }

  // Floor sample: each must now be scope='floor'. Agent IS expected to be
  // identical (same hashtext, same pool, same row_number ordering).
  let floorAgentChanges = 0;
  for (const f of baseline.floor_sample) {
    const r = await client.query(
      'SELECT assigned_agent_id, assigned_scope FROM public.mls_listings WHERE id = $1',
      [f.id]
    );
    const post = r.rows[0];
    if (!post) {
      regressions.push({ where: 'floor sample', listing_id: f.id, issue: 'row missing' });
      continue;
    }
    if (post.assigned_scope !== 'floor') {
      regressions.push({
        where: 'floor sample',
        listing_id: f.id,
        issue: 'expected floor scope',
        actual: post.assigned_scope
      });
    }
    if (post.assigned_agent_id !== f.assigned_agent_id) floorAgentChanges++;
  }
  console.log('Floor-sample agent changes: ' + floorAgentChanges + '/' + baseline.floor_sample.length +
              ' (expected 0 — same hash + same pool).');

  if (regressions.length > 0) {
    console.error('POST-COMMIT REGRESSIONS DETECTED (' + regressions.length + '):');
    for (const r of regressions.slice(0, 20)) console.error('  ' + JSON.stringify(r));
    if (regressions.length > 20) console.error('  ... (' + (regressions.length - 20) + ' more)');
    return false;
  }
  return true;
}

// =============================================================================
// Post-COMMIT: GAP-6 read-path timing
// =============================================================================

async function readPathTiming(client) {
  const commQ = await client.query(
    'SELECT community_id FROM public.agent_property_access ' +
    "WHERE tenant_id = $1 AND scope = 'community' AND is_active = true AND community_id IS NOT NULL " +
    'ORDER BY community_id LIMIT 1',
    [WALLIAM_TENANT]
  );
  const commId = commQ.rows[0]?.community_id;
  if (!commId) {
    console.log('Read-path timing: no sample community found. Skipping.');
    return;
  }

  const t0 = process.hrtime.bigint();
  const r = await client.query(
    'SELECT ml.id, ml.assigned_agent_id, ml.assigned_scope ' +
    'FROM public.mls_listings ml ' +
    'WHERE ml.community_id = $1 ' +
    "  AND ml.property_type = 'Residential Condo & Other' " +
    'LIMIT 200',
    [commId]
  );
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('GAP-6 read-path timing: ' + elapsedMs.toFixed(2) + 'ms for ' + r.rows.length +
              ' condo rows in community ' + commId + '.');
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  validateEnv();
  const sql = readMigrationSQL();
  console.log('Read migration SQL: ' + MIGRATION_PATH + ' (' + sql.length + ' bytes)');

  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  });
  await client.connect();

  let distSnap = null, rerollSnap = null, cacheSnap = null, baselinePath = null;
  let committed = false;

  try {
    // ---- Pre-BEGIN: snapshots + baseline ----
    console.log('--- BEFORE BEGIN: snapshots + baseline ---');
    distSnap     = await captureFunctionSnapshot(client, 'distribute_listings_at_geo');
    rerollSnap   = await captureFunctionSnapshot(client, 'reroll_listings_at_floor');
    cacheSnap    = await captureCacheSnapshot(client);
    baselinePath = await captureBaseline(client);
    console.log('  distribute snapshot: ' + distSnap);
    console.log('  reroll snapshot:     ' + rerollSnap);
    console.log('  cache side table:    public.' + cacheSnap);
    console.log('  baseline JSON:       ' + baselinePath);

    // ---- BEGIN ----
    console.log('--- BEGIN TRANSACTION ---');
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 0');

    try {
      console.log('  Executing migration SQL (this is the long step)...');
      const tStart = Date.now();
      await client.query(sql);
      const tElapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      console.log('  Migration SQL + V1-V8 ASSERTs passed in ' + tElapsed + 's.');

      await client.query('COMMIT');
      committed = true;
      console.log('--- COMMIT successful ---');
    } catch (sqlErr) {
      console.error('  Migration FAILED: ' + sqlErr.message);
      try { await client.query('ROLLBACK'); } catch (rbErr) {}
      console.error('--- ROLLBACK done. No schema or data changes applied. ---');
      throw sqlErr;
    }

    // ---- Post-COMMIT smoke + timing ----
    console.log('--- POST-COMMIT: smoke diff + read-path timing ---');
    const smokeOk = await postCommitVerification(client, baselinePath);
    if (!smokeOk) {
      console.error('POST-COMMIT SMOKE DETECTED REGRESSIONS — operator must inspect before declaring success.');
      console.error('Consider the down-migration (supabase/migrations/20260528_phase1_down.sql).');
    } else {
      console.log('Post-commit smoke diff: clean.');
    }
    await readPathTiming(client);

  } finally {
    await client.end();
  }

  // ---- Final report ----
  console.log('');
  console.log('===========================================================');
  console.log(committed ? '=== PHASE 1 APPLY COMPLETE ===' : '=== PHASE 1 APPLY ROLLED BACK ===');
  console.log('===========================================================');
  console.log('Snapshot paths (needed by the down-migration):');
  console.log('  distribute_listings_at_geo: ' + distSnap);
  console.log('  reroll_listings_at_floor:   ' + rerollSnap);
  console.log('  mls_listings cache table:   public.' + cacheSnap);
  console.log('  baseline JSON:              ' + baselinePath);
  if (committed) {
    console.log('');
    console.log('MANUAL: downgrade Supabase compute Medium -> Micro now (operator dashboard).');
    console.log('        Not done programmatically — there is no API for it.');
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
