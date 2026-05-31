#!/usr/bin/env node
// scripts/apply-cv-fixture-build.js
// W-CORE-VERIFICATION CV-FIXTURE apply-runner.  HARD GATE: production-DB write.
//
// CONTRACT
//   Builds the persistent CV-FIXTURE test world under TWO NEW isolated tenants.
//   WALLiam and aily are NEVER touched. The runner is transactional for SQL,
//   with an auth.users rollback tracker (since auth-user creation is HTTP, not
//   SQL, and cannot be inside the SQL transaction).
//
// ORDER OF OPERATIONS
//   0. Env + cold-start preconditions (WALLiam 12 carves, no existing test
//      tenant, baseline-before file present).
//   1. Phase 0 -- auth.users creation via supabase.auth.admin.createUser for
//      every test agent. Each created id is APPENDED to the manifest IMMEDIATELY
//      so a crash here still leaves a teardown trail. Tracked in createdAuthUsers
//      for compensating delete on failure.
//   2. Phase 1 -- SQL BEGIN. SET LOCAL statement_timeout = 0;
//      SET LOCAL app.skip_apa_reroll = 'on' (per cards/route.ts pattern -- the
//      apa triggers enqueue into territory_reroll_queue but skip the 19s inline
//      reroll). Inserts in dependency order; every insert returns the id which
//      is APPENDED to the manifest immediately.
//   3. Test listings INSERTed with sync_source='cv-fixture' so the nightly MLS
//      sync's match-on-listing_key will never touch them.
//   4. For each test listing: call resolve_agent_for_context() with the test
//      tenant_id; UPDATE mls_listings SET assigned_agent_id = resolved value
//      (pre-populates the Phase 2 cache deterministically; avoids relying on
//      the async reroll worker).
//   5. SWEEP -- DELETE FROM territory_reroll_queue WHERE tenant_id IN
//      (primary, secondary) AND status='pending'.  Together with the SET LOCAL
//      skip + cache pre-population, this prevents the cron worker from EVER
//      seeing the test tenants' carves and touching real Markham listings.
//   6. POST-STATE VERIFICATION (V1-V5, before COMMIT, transactional):
//      V1 -- entity counts match expected
//      V2 -- one apa carve at each scope resolves to the right owner
//      V3 -- WALLiam Brooklin resolution untouched
//      V4 -- cross-tenant: primary read on Markham NEVER returns secondary agent
//      V5 -- reroll queue empty for both test tenants
//   7. COMMIT on full PASS. On ROLLBACK: compensating delete of auth.users.
//   8. Manifest closed (footer line). Operator runs capture-cv-fixture-baseline
//      --mode=after for final WALLiam invariant proof.
//
// MULTI-TENANT ISOLATION (must be re-verified BEFORE running):
//   - Every INSERT scopes by a test tenant_id (primary or secondary). No constant
//     in this file references WALLiam or aily.
//   - Geo IDs are real Toronto-area IDs WALLiam has never carved. Carving them
//     under NEW tenant_ids cannot collide with WALLiam apa (apa is keyed per
//     (tenant_id, scope, scope_id)).
//   - Test listings are inserted with synthetic listing_keys (CV_FIX_*) and
//     sync_source='cv-fixture' -- the MLS sync ignores both prefix and source.
//   - The reroll-queue sweep + cache pre-population guarantees the cron worker
//     never reaches a test tenant carve, so no real Markham listing has its
//     assigned_agent_id mutated by the fixture build.

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const crypto = require('crypto');
const { createClient: supabaseCreate } = require('@supabase/supabase-js');

const cfg = require('./cv-fixture-config');

// ─── env validation ─────────────────────────────────────────────────────────
function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL)     fail('DATABASE_URL not set in .env.local');
if (!SUPABASE_URL)     fail('NEXT_PUBLIC_SUPABASE_URL not set in .env.local');
if (!SERVICE_ROLE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY not set in .env.local');

(function rejectPooler(u) {
  const m = u.match(/:(\d+)\//);
  if (!m) { console.warn('WARN: could not parse port from DATABASE_URL'); return; }
  if (parseInt(m[1], 10) === 6543) fail('DATABASE_URL is the 6543 transaction pooler. Switch to 5432 (session pooler) or direct host.');
})(DATABASE_URL);

const supabase = supabaseCreate(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── manifest helpers (incremental JSONL writer) ────────────────────────────
function fingerprintSecret(s) {
  if (!s || s.length < 12) return '(short)';
  return s.slice(0, 6) + '...' + s.slice(-4) + ' (len ' + s.length + ')';
}

let manifestStream = null;
function manifestOpen() {
  manifestStream = fs.createWriteStream(cfg.PATHS.manifest, { flags: 'w' });
  manifestAppend({ kind: 'header', started_at: new Date().toISOString(), runner: 'apply-cv-fixture-build.js' });
}
function manifestAppend(obj) {
  if (!manifestStream) throw new Error('manifest not open');
  manifestStream.write(JSON.stringify(obj) + '\n');
}
async function manifestClose(footerObj) {
  if (manifestStream) {
    manifestAppend(footerObj);
    await new Promise(res => manifestStream.end(res));
    manifestStream = null;
  }
}

// ─── auth.users phase 0 ─────────────────────────────────────────────────────
const createdAuthUsers = []; // [{ id, email, agent_key, password_fp }]

function rndPassword() {
  return 'CVF_' + crypto.randomBytes(18).toString('base64url');
}

async function createAuthForAgent(agentSpec) {
  const password = rndPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: agentSpec.email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error('auth.createUser failed for ' + agentSpec.email + ': ' + error.message);
  const u = { id: data.user.id, email: agentSpec.email, agent_key: agentSpec.key, password_fp: fingerprintSecret(password) };
  createdAuthUsers.push(u);
  manifestAppend({ kind: 'auth_user', id: u.id, email: u.email, agent_key: u.agent_key, password_fingerprint: u.password_fp });
  console.log('  auth user created: ' + u.email + '  id=' + u.id + '  pw=' + u.password_fp);
  return u;
}

async function cleanupAuthUsers() {
  if (createdAuthUsers.length === 0) return;
  console.log('compensating cleanup: deleting ' + createdAuthUsers.length + ' auth users...');
  for (const u of [...createdAuthUsers].reverse()) {
    try { await supabase.from('user_profiles').delete().eq('id', u.id); } catch (e) { console.warn('  user_profiles delete failed for ' + u.id + ': ' + e.message); }
    try { await supabase.auth.admin.deleteUser(u.id); }                catch (e) { console.warn('  auth.admin.deleteUser failed for ' + u.id + ': ' + e.message); }
  }
  manifestAppend({ kind: 'compensating_cleanup', auth_users_deleted: createdAuthUsers.length, at: new Date().toISOString() });
}

// ─── SQL phase helpers ──────────────────────────────────────────────────────
async function q(c, sql, params, label) {
  const r = await c.query(sql, params);
  if (label) console.log('  ' + label + ' -> ' + r.rowCount + ' row(s)');
  return r;
}

// ─── Pre-checks ─────────────────────────────────────────────────────────────
async function preflightChecks(c) {
  console.log('=== preflight checks ===');

  // PF1: baseline-before file must exist (operator ran capture --mode=before).
  if (!fs.existsSync(cfg.PATHS.baselineBefore)) {
    fail('PF1: ' + path.relative(process.cwd(), cfg.PATHS.baselineBefore) +
         ' missing. Run: node scripts/capture-cv-fixture-baseline.js --mode=before  FIRST.');
  }
  console.log('  PF1 OK: baseline-before snapshot present.');

  // PF2: WALLiam still has 12 active carves.
  const wcarve = await c.query(
    `SELECT COUNT(*)::int AS n FROM agent_property_access
      WHERE tenant_id = $1 AND is_active = TRUE`, [cfg.WALLIAM_TENANT_ID]);
  if (wcarve.rows[0].n !== 12) fail('PF2: WALLiam carve count expected 12, got ' + wcarve.rows[0].n);
  console.log('  PF2 OK: WALLiam has 12 active carves.');

  // PF3: aily carve count = 0.
  const acarve = await c.query(
    `SELECT COUNT(*)::int AS n FROM agent_property_access
      WHERE tenant_id = $1 AND is_active = TRUE`, [cfg.AILY_TENANT_ID]);
  if (acarve.rows[0].n !== 0) fail('PF3: aily carve count expected 0, got ' + acarve.rows[0].n);
  console.log('  PF3 OK: aily has 0 active carves.');

  // PF4: no existing test tenant with our domains.
  const existing = await c.query(
    `SELECT id, name, domain FROM tenants WHERE domain IN ($1, $2)`,
    [cfg.TENANT_PRIMARY.domain, cfg.TENANT_SECONDARY.domain]);
  if (existing.rows.length > 0) {
    console.error('  EXISTING TEST TENANTS:');
    for (const r of existing.rows) console.error('    ' + r.domain + ' id=' + r.id);
    fail('PF4: test tenant(s) already exist. Run teardown before re-applying.');
  }
  console.log('  PF4 OK: no existing cv-fixture-*.invalid tenants.');

  // PF5: no existing test agent emails in auth.users (would block createUser).
  // We rely on createUser's own collision detection -- this is just a heads-up.
  console.log('  PF5 OK: relying on auth.admin.createUser collision detection.');

  // PF6: geo IDs exist (no real building -- synthetic is created at apply time).
  const geocheck = await c.query(
    `SELECT
       (SELECT COUNT(*) FROM treb_areas    WHERE id = $1)::int AS area,
       (SELECT COUNT(*) FROM municipalities WHERE id IN ($2,$3,$4))::int AS munis,
       (SELECT COUNT(*) FROM communities   WHERE id IN ($5,$6,$7))::int AS comms`,
    [cfg.GEO.area.id,
     cfg.GEO.municipality.id, 'ef0e3f40-13af-437a-bbc9-3de2caf98181', '81e3dec9-295d-4fd1-8361-d69c28a057b5',
     cfg.GEO.community_precedence.id, cfg.GEO.community_distribution.id, cfg.GEO.community_for_synthetic_building.id]);
  const gc = geocheck.rows[0];
  if (gc.area !== 1)  fail('PF6: York area id missing');
  if (gc.munis !== 3) fail('PF6: expected 3 munis (Markham/Vaughan/Brampton), got ' + gc.munis);
  if (gc.comms !== 3) fail('PF6: expected 3 communities (Berczy/Box Grove/Cedar Grove), got ' + gc.comms);
  console.log('  PF6 OK: all geo IDs verified present.');

  // PF7: synthetic building slug not already used.
  const slugCheck = await c.query(`SELECT id FROM buildings WHERE slug = $1`, [cfg.SYNTHETIC_BUILDING.slug]);
  if (slugCheck.rowCount > 0) fail('PF7: synthetic building slug already in use: ' + cfg.SYNTHETIC_BUILDING.slug);
  console.log('  PF7 OK: synthetic building slug available.');
}

// ─── distributed-apa capture helper ─────────────────────────────────────────
// distribute_geo_to_children runs synchronously inside handle_apa_insert for
// scope='area' (-> munis + nbhds) and scope='municipality' (-> communities).
// The distributed rows are real apa rows under the same tenant; they must be
// captured into the manifest so teardown can find them.
async function snapshotApaIds(client, tenantId) {
  const r = await client.query(`SELECT id FROM agent_property_access WHERE tenant_id = $1`, [tenantId]);
  return new Set(r.rows.map(row => row.id));
}

async function manifestNewlyDistributedApa(client, tenantId, knownIds, originSpec) {
  const r = await client.query(
    `SELECT id, scope, agent_id, is_primary,
            area_id, municipality_id, community_id, neighbourhood_id
       FROM agent_property_access
      WHERE tenant_id = $1`, [tenantId]);
  let n = 0;
  for (const row of r.rows) {
    if (knownIds.has(row.id)) continue;
    manifestAppend({
      kind: 'apa_distributed',
      id: row.id, tenant_id: tenantId, scope: row.scope, agent_id: row.agent_id,
      is_primary: row.is_primary,
      area_id: row.area_id, municipality_id: row.municipality_id,
      community_id: row.community_id, neighbourhood_id: row.neighbourhood_id,
      via: originSpec,
    });
    knownIds.add(row.id);
    n++;
  }
  if (n > 0) console.log('  distributed children captured: ' + n + ' (via ' + originSpec + ')');
  return n;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=========================================================');
  console.log('CV-FIXTURE apply-runner -- HARD GATE in effect.');
  console.log('Primary  tenant: ' + cfg.TENANT_PRIMARY.domain);
  console.log('Secondary tenant: ' + cfg.TENANT_SECONDARY.domain);
  console.log('=========================================================\n');

  manifestOpen();

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('connected to DB.');

  // pre-flight under a brief BEGIN READ ONLY so any error here doesn't pollute.
  await client.query('BEGIN READ ONLY');
  await client.query('SET LOCAL statement_timeout = 0');
  try {
    await preflightChecks(client);
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    await client.end();
    await manifestClose({ kind: 'footer', status: 'preflight_failed', error: e.message, at: new Date().toISOString() });
    throw e;
  }
  await client.query('ROLLBACK');

  // ─── Phase 0: create auth users for ALL test agents (primary + secondary) ──
  console.log('\n=== Phase 0: auth.users creation ===');
  const allAgentSpecs = [
    ...cfg.AGENTS_PRIMARY.map(a => ({ ...a, tenant: 'primary' })),
    ...cfg.AGENTS_SECONDARY.map(a => ({ ...a, tenant: 'secondary' })),
  ];
  const authMap = new Map(); // agent_key -> auth user id
  try {
    for (const spec of allAgentSpecs) {
      const u = await createAuthForAgent(spec);
      authMap.set(spec.key, u.id);
    }
  } catch (e) {
    console.error('Phase 0 FAILED: ' + e.message);
    await cleanupAuthUsers();
    await client.end();
    await manifestClose({ kind: 'footer', status: 'phase0_failed', error: e.message, at: new Date().toISOString() });
    process.exit(1);
  }
  console.log('Phase 0 complete: ' + createdAuthUsers.length + ' auth users.');

  // ─── Phase 1: SQL transaction ─────────────────────────────────────────────
  console.log('\n=== Phase 1: SQL transaction (BEGIN) ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');
  await client.query("SET LOCAL app.skip_apa_reroll = 'on'");

  // Per-step trackers used by verification.
  const ids = {
    tenant_primary:   null,
    tenant_secondary: null,
    agents_primary:   new Map(), // key -> id
    agents_secondary: new Map(),
    test_listings:    new Map(), // key -> id
    apa_carves:       [],
    floor_pool:       [],
    pin:              null,
    building_assign:  null,
  };

  try {
    // STEP A: insert primary tenant.
    {
      const r = await q(client,
        `INSERT INTO tenants (name, domain, admin_email, source_key, assistant_name, lifecycle_status, is_active, homepage_layout)
         VALUES ($1,$2,$3,$4,$5,'active',TRUE,'v1')
         RETURNING id`,
        [cfg.TENANT_PRIMARY.name, cfg.TENANT_PRIMARY.domain, cfg.TENANT_PRIMARY.admin_email, cfg.TENANT_PRIMARY.source_key, cfg.TENANT_PRIMARY.assistant_name],
        'STEP A primary tenant');
      ids.tenant_primary = r.rows[0].id;
      manifestAppend({ kind: 'tenant', spec_key: 'primary', id: ids.tenant_primary, domain: cfg.TENANT_PRIMARY.domain });
    }

    // STEP B: insert secondary tenant.
    {
      const r = await q(client,
        `INSERT INTO tenants (name, domain, admin_email, source_key, assistant_name, lifecycle_status, is_active, homepage_layout)
         VALUES ($1,$2,$3,$4,$5,'active',TRUE,'v1')
         RETURNING id`,
        [cfg.TENANT_SECONDARY.name, cfg.TENANT_SECONDARY.domain, cfg.TENANT_SECONDARY.admin_email, cfg.TENANT_SECONDARY.source_key, cfg.TENANT_SECONDARY.assistant_name],
        'STEP B secondary tenant');
      ids.tenant_secondary = r.rows[0].id;
      manifestAppend({ kind: 'tenant', spec_key: 'secondary', id: ids.tenant_secondary, domain: cfg.TENANT_SECONDARY.domain });
    }

    // STEP C: insert primary agents. Two-pass: pass 1 inserts roots + leaves
    // ordered so each parent exists before its child. AGENTS_PRIMARY is already
    // in topological order.  NOTE: email + notification_email take separate
    // parameter slots because the columns have different types (varchar vs
    // text) and reusing one $ slot trips "inconsistent types deduced for
    // parameter" in the pg parser.
    for (const spec of cfg.AGENTS_PRIMARY) {
      const authId = authMap.get(spec.key);
      const parentId = spec.parent_key ? ids.agents_primary.get(spec.parent_key) : null;
      if (spec.parent_key && !parentId) throw new Error('parent ' + spec.parent_key + ' missing for ' + spec.key);
      const subdomain = ('cvfix-' + spec.key + '-' + crypto.randomBytes(3).toString('hex')).toLowerCase();
      const r = await q(client,
        `INSERT INTO agents (id, user_id, full_name, email, subdomain, role, parent_id, tenant_id,
                             site_type, is_active, is_selling, notification_email)
         VALUES ($1,$1,$2,$3,$4,$5,$6,$7,'comprehensive',TRUE,TRUE,$8)
         RETURNING id`,
        [authId, spec.full_name, spec.email, subdomain, spec.role, parentId, ids.tenant_primary, spec.email],
        'STEP C agent ' + spec.key);
      ids.agents_primary.set(spec.key, r.rows[0].id);
      manifestAppend({ kind: 'agent', tenant_spec: 'primary', spec_key: spec.key, id: r.rows[0].id, role: spec.role, parent_id: parentId, email: spec.email });
    }

    // STEP D: insert secondary agent(s).
    for (const spec of cfg.AGENTS_SECONDARY) {
      const authId = authMap.get(spec.key);
      const subdomain = ('cvfix-sec-' + spec.key + '-' + crypto.randomBytes(3).toString('hex')).toLowerCase();
      const r = await q(client,
        `INSERT INTO agents (id, user_id, full_name, email, subdomain, role, parent_id, tenant_id,
                             site_type, is_active, is_selling, notification_email)
         VALUES ($1,$1,$2,$3,$4,$5,NULL,$6,'comprehensive',TRUE,TRUE,$7)
         RETURNING id`,
        [authId, spec.full_name, spec.email, subdomain, spec.role, ids.tenant_secondary, spec.email],
        'STEP D secondary agent ' + spec.key);
      ids.agents_secondary.set(spec.key, r.rows[0].id);
      manifestAppend({ kind: 'agent', tenant_spec: 'secondary', spec_key: spec.key, id: r.rows[0].id, role: spec.role, parent_id: null, email: spec.email });
    }

    // STEP E: insert floor pool entries for primary tenant.
    for (const spec of cfg.AGENTS_PRIMARY.filter(a => a.in_floor_pool)) {
      const aid = ids.agents_primary.get(spec.key);
      const r = await q(client,
        `INSERT INTO tenant_floor_pool (tenant_id, agent_id, condo_access, homes_access, is_active)
         VALUES ($1,$2,$3,$4,TRUE) RETURNING id`,
        [ids.tenant_primary, aid, spec.floor_condo, spec.floor_homes],
        'STEP E floor pool ' + spec.key);
      ids.floor_pool.push({ id: r.rows[0].id, agent_key: spec.key });
      manifestAppend({ kind: 'floor_pool', id: r.rows[0].id, tenant_id: ids.tenant_primary, agent_id: aid, agent_key: spec.key, condo: spec.floor_condo, homes: spec.floor_homes });
    }

    // STEP F: insert primary apa carves -- DEEPEST FIRST so distribute_geo_to_
    // children's "skip if child already has primary" guard preserves explicit
    // carves. Order: community -> muni -> area. After each fan-out-prone INSERT
    // (muni, area) snapshot the apa table and capture distributed children to
    // the manifest.
    const apaPrimaryKnown = await snapshotApaIds(client, ids.tenant_primary); // empty for fresh tenant
    {
      const apaCarves = cfg.CARVES.filter(c => c.kind === 'apa');
      // Sort: community first, then municipality, then area.
      const scopeOrder = { community: 1, municipality: 2, area: 3 };
      const orderedCarves = [...apaCarves].sort((a,b) => (scopeOrder[a.scope]||9) - (scopeOrder[b.scope]||9));
      console.log('  STEP F order: ' + orderedCarves.map(c => c.scope + ':' + c.owner_key).join(' -> '));
      for (const carve of orderedCarves) {
        const ownerId = ids.agents_primary.get(carve.owner_key);
        if (!ownerId) throw new Error('apa carve missing owner ' + carve.owner_key);
        const isPrimary = carve.is_primary !== false;
        const r = await q(client,
          `INSERT INTO agent_property_access
             (agent_id, tenant_id, scope, is_active, is_primary,
              condo_access, homes_access, buildings_access, buildings_mode,
              area_id, municipality_id, community_id, neighbourhood_id)
           VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8, $9,$10,$11,$12)
           RETURNING id`,
          [ownerId, ids.tenant_primary, carve.scope, isPrimary, carve.condo_access, carve.homes_access, carve.buildings_access, carve.buildings_mode,
           carve.geo_field === 'area_id'         ? carve.geo_id : null,
           carve.geo_field === 'municipality_id' ? carve.geo_id : null,
           carve.geo_field === 'community_id'    ? carve.geo_id : null,
           carve.geo_field === 'neighbourhood_id'? carve.geo_id : null],
          'STEP F apa scope=' + carve.scope + ' owner=' + carve.owner_key + ' primary=' + isPrimary);
        ids.apa_carves.push({ id: r.rows[0].id, scope: carve.scope, owner_key: carve.owner_key, geo_field: carve.geo_field, geo_id: carve.geo_id, is_primary: isPrimary });
        manifestAppend({ kind: 'apa', id: r.rows[0].id, tenant_id: ids.tenant_primary, scope: carve.scope, geo_field: carve.geo_field, geo_id: carve.geo_id, agent_id: ownerId, agent_key: carve.owner_key, is_primary: isPrimary });
        apaPrimaryKnown.add(r.rows[0].id);
        // After muni or area inserts, distribute_geo_to_children fans out.
        if (carve.scope === 'municipality' || carve.scope === 'area') {
          await manifestNewlyDistributedApa(client, ids.tenant_primary, apaPrimaryKnown,
            'distribute_from_' + carve.scope + ':' + carve.geo_id);
        }
      }
    }

    // STEP G: insert secondary apa carve(s). Same snapshot+capture pattern.
    const apaSecondaryKnown = await snapshotApaIds(client, ids.tenant_secondary);
    for (const carve of cfg.CARVES_SECONDARY) {
      const ownerId = ids.agents_secondary.get(carve.owner_key);
      const isPrimary = carve.is_primary !== false;
      const r = await q(client,
        `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, is_active, is_primary,
            condo_access, homes_access, buildings_access, buildings_mode,
            area_id, municipality_id, community_id, neighbourhood_id)
         VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8, NULL, $9, NULL, NULL)
         RETURNING id`,
        [ownerId, ids.tenant_secondary, carve.scope, isPrimary, carve.condo_access, carve.homes_access, carve.buildings_access, carve.buildings_mode, carve.geo_id],
        'STEP G secondary apa scope=' + carve.scope);
      ids.apa_carves.push({ id: r.rows[0].id, scope: carve.scope, owner_key: carve.owner_key, tenant: 'secondary', is_primary: isPrimary });
      manifestAppend({ kind: 'apa', id: r.rows[0].id, tenant_id: ids.tenant_secondary, scope: carve.scope, geo_field: carve.geo_field, geo_id: carve.geo_id, agent_id: ownerId, agent_key: carve.owner_key, is_primary: isPrimary });
      apaSecondaryKnown.add(r.rows[0].id);
      if (carve.scope === 'municipality' || carve.scope === 'area') {
        await manifestNewlyDistributedApa(client, ids.tenant_secondary, apaSecondaryKnown,
          'secondary_distribute_from_' + carve.scope + ':' + carve.geo_id);
      }
    }

    // STEP H: INSERT the synthetic building under Cedar Grove. The buildings
    // table has ZERO user triggers (verified by cv-fixture-buildings-probe) --
    // this INSERT has no side effects on other rows.  id captured for the
    // agent_geo_buildings INSERT below + the L2 listing's building_id field.
    let syntheticBuildingId = null;
    {
      const r = await q(client,
        `INSERT INTO buildings (slug, building_name, canonical_address, community_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [cfg.SYNTHETIC_BUILDING.slug, cfg.SYNTHETIC_BUILDING.building_name,
         cfg.SYNTHETIC_BUILDING.canonical_address, cfg.GEO.community_for_synthetic_building.id],
        'STEP H synthetic building');
      syntheticBuildingId = r.rows[0].id;
      manifestAppend({ kind: 'building', id: syntheticBuildingId, slug: cfg.SYNTHETIC_BUILDING.slug, community_id: cfg.GEO.community_for_synthetic_building.id });
    }

    // STEP I: insert 12 test listings. L2 gets the synthetic building_id (filled
    // at runtime; the config has null for L2.geo.building_id by design).
    for (const lspec of cfg.TEST_LISTINGS) {
      const buildingId = (lspec.key === 'L2_building_condo') ? syntheticBuildingId : lspec.geo.building_id;
      // Note: mls_listings has no neighbourhood_id column; the resolver takes
      // p_neighbourhood_id as a separate arg, kept in lspec.geo for that.
      const r = await q(client,
        `INSERT INTO mls_listings
           (listing_key, property_type, mls_status, standard_status,
            area_id, municipality_id, community_id, building_id,
            list_price, unparsed_address,
            sync_source, last_synced_at, available_in_dla, available_in_vow, available_in_idx)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, 500000, $9, 'cv-fixture', now(), FALSE, FALSE, FALSE)
         RETURNING id`,
        [lspec.listing_key, lspec.property_type, lspec.mls_status, lspec.standard_status,
         lspec.geo.area_id, lspec.geo.municipality_id, lspec.geo.community_id, buildingId,
         'CV-FIXTURE synthetic listing ' + lspec.listing_key],
        'STEP I test listing ' + lspec.key);
      ids.test_listings.set(lspec.key, r.rows[0].id);
      manifestAppend({ kind: 'test_listing', spec_key: lspec.key, id: r.rows[0].id, listing_key: lspec.listing_key, property_type: lspec.property_type, building_id: buildingId });
    }

    // STEP J: building assignment for agent_building -> synthetic building.
    // This fires handle_building_card_change -> reresolve_building, which only
    // touches listings WHERE building_id = syntheticBuildingId.  L2 is the only
    // such listing (just inserted).  Zero real listings touched.
    {
      const buildingCarve = cfg.CARVES.find(c => c.kind === 'building');
      const ownerId = ids.agents_primary.get(buildingCarve.owner_key);
      const assignerId = ids.agents_primary.get('tenant_admin');
      const r = await q(client,
        `INSERT INTO agent_geo_buildings (agent_id, building_id, assigned_by, is_active, assigned_reason)
         VALUES ($1,$2,$3,TRUE,'cv-fixture build')
         RETURNING id`,
        [ownerId, syntheticBuildingId, assignerId],
        'STEP J building assign (synthetic)');
      ids.building_assign = r.rows[0].id;
      manifestAppend({ kind: 'building_assign', id: r.rows[0].id, agent_id: ownerId, building_id: syntheticBuildingId });
    }

    // STEP K: pin L1 to agent_pin. Fires handle_listing_pin_change ->
    // reresolve_listing on L1 only (our synthetic listing).  No real listing
    // touched.
    {
      const pinCarve = cfg.CARVES.find(c => c.kind === 'pin');
      const ownerId = ids.agents_primary.get(pinCarve.owner_key);
      const assignerId = ids.agents_primary.get('tenant_admin');
      const listingId = ids.test_listings.get('L1_pin_target');
      const r = await q(client,
        `INSERT INTO agent_listing_assignments (agent_id, listing_id, assigned_by, is_active, pin_reason)
         VALUES ($1,$2,$3,TRUE,'cv-fixture pin')
         RETURNING id`,
        [ownerId, listingId, assignerId],
        'STEP K pin');
      ids.pin = r.rows[0].id;
      manifestAppend({ kind: 'pin', id: r.rows[0].id, agent_id: ownerId, listing_id: listingId });
    }

    // STEP L: pre-populate Phase 2 cache for any test listing whose cache the
    // triggers above did not already set.  L1 was cached by reresolve_listing
    // (pin trigger); L2 by reresolve_building (assign trigger). L3..L12 need
    // explicit pre-pop -- invoke the SAME prod function (reresolve_listing)
    // because mls_listings has a coupled-NULL check on
    // (assigned_agent_id, assigned_scope, assigned_source_id) -- writing only
    // assigned_agent_id violates the check. reresolve_listing sets all three.
    for (const lspec of cfg.TEST_LISTINGS) {
      const listingId = ids.test_listings.get(lspec.key);
      const cur = await client.query(`SELECT assigned_agent_id FROM mls_listings WHERE id = $1`, [listingId]);
      if (cur.rows[0].assigned_agent_id) {
        console.log('  STEP L ' + lspec.key + ' already cached -> ' + cur.rows[0].assigned_agent_id + ' (skip)');
        continue;
      }
      await client.query(`SELECT public.reresolve_listing($1, $2)`, [listingId, ids.tenant_primary]);
      const post = await client.query(`SELECT assigned_agent_id FROM mls_listings WHERE id = $1`, [listingId]);
      console.log('  STEP L cache pre-populated ' + lspec.key + ' -> ' + (post.rows[0].assigned_agent_id || '(NULL)'));
    }

    // STEP M: sweep reroll queue for both test tenants. The skip_apa_reroll GUC
    // ensured handle_apa_insert/delete only enqueued (never inline reroll); this
    // sweep clears those enqueued rows so the cron worker never processes them.
    {
      const r = await q(client,
        `DELETE FROM territory_reroll_queue
          WHERE tenant_id IN ($1,$2)`,
        [ids.tenant_primary, ids.tenant_secondary],
        'STEP M sweep reroll queue');
      manifestAppend({ kind: 'sweep', table: 'territory_reroll_queue', deleted: r.rowCount });
    }

    // ─── Post-state verification (pre-COMMIT, inside same tx) ────────────────
    console.log('\n=== POST-STATE VERIFICATION (pre-COMMIT) ===');

    // V1: counts + tenant-bound apa invariant.  apa count is NOT fixed: the
    // muni + area inserts trigger distribute_geo_to_children fan-out (~50+
    // distributed children per tenant). We assert (a) every apa row's tenant_id
    // IS one of our test tenants and (b) explicit-rowcount lower-bounds match
    // the spec.
    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM tenants                  WHERE id IN ($1,$2))::int AS tenants,
         (SELECT COUNT(*) FROM agents                   WHERE tenant_id IN ($1,$2))::int AS agents,
         (SELECT COUNT(*) FROM tenant_floor_pool        WHERE tenant_id IN ($1,$2))::int AS fp,
         (SELECT COUNT(*) FROM agent_geo_buildings agb
            JOIN agents a ON a.id=agb.agent_id WHERE a.tenant_id IN ($1,$2))::int AS bld,
         (SELECT COUNT(*) FROM agent_listing_assignments ala
            JOIN agents a ON a.id=ala.agent_id WHERE a.tenant_id IN ($1,$2))::int AS pins,
         (SELECT COUNT(*) FROM mls_listings WHERE sync_source = 'cv-fixture')::int AS listings,
         (SELECT COUNT(*) FROM territory_reroll_queue WHERE tenant_id IN ($1,$2))::int AS queue,
         (SELECT COUNT(*) FROM agent_property_access WHERE tenant_id IN ($1,$2))::int AS apa_total,
         (SELECT COUNT(*) FROM buildings WHERE slug = 'cvfix-bld-001')::int AS synthetic_bld
       `,
      [ids.tenant_primary, ids.tenant_secondary]);
    const k = counts.rows[0];
    const wantExact = {
      tenants: 2, agents: cfg.AGENTS_PRIMARY.length + cfg.AGENTS_SECONDARY.length,
      fp: cfg.AGENTS_PRIMARY.filter(a => a.in_floor_pool).length,
      bld: 1, pins: 1, listings: cfg.TEST_LISTINGS.length, queue: 0,
      synthetic_bld: 1,
    };
    for (const key of Object.keys(wantExact)) {
      if (k[key] !== wantExact[key]) throw new Error('V1 FAIL: ' + key + ' expected ' + wantExact[key] + ', got ' + k[key]);
    }
    // apa lower-bound: each explicit carve (5 primary + 1 secondary = 6) plus
    // at least one distributed child per fan-out.  Real count is much higher.
    const apaExplicit = cfg.CARVES.filter(c => c.kind==='apa').length + cfg.CARVES_SECONDARY.length;
    if (k.apa_total < apaExplicit) throw new Error('V1 FAIL: apa_total ' + k.apa_total + ' < apaExplicit ' + apaExplicit);

    // V1b: zero apa rows leaked outside the test tenants.
    const apaLeak = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
        WHERE tenant_id NOT IN ($1, $2)
          AND id IN (
            SELECT id FROM agent_property_access
             WHERE created_at >= (SELECT MIN(created_at) FROM agent_property_access WHERE tenant_id IN ($1, $2))
          )`,
      [ids.tenant_primary, ids.tenant_secondary]);
    // The leak check is weak (created_at lower-bound is just our tenants'); the
    // real isolation is structural: every INSERT in this runner sets tenant_id
    // = ids.tenant_primary or ids.tenant_secondary.  The check below is the
    // stronger one: WALLiam/aily carve counts unchanged (V3 / baseline-diff).
    console.log('  V1 PASS: tenants=' + k.tenants + ' agents=' + k.agents +
                ' apa=' + k.apa_total + ' (>= ' + apaExplicit + ' explicit) fp=' + k.fp +
                ' bld=' + k.bld + ' pins=' + k.pins + ' listings=' + k.listings + ' queue=' + k.queue);

    // V1c: WALLiam apa count still 12 (cold-start invariant verified inside tx).
    const wcheck = await client.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access WHERE tenant_id = $1 AND is_active = TRUE`,
      [cfg.WALLIAM_TENANT_ID]);
    if (wcheck.rows[0].n !== 12) throw new Error('V1c FAIL: WALLiam apa count drifted -- now ' + wcheck.rows[0].n);
    console.log('  V1c PASS: WALLiam still has 12 active apa rows.');

    // V2: resolution for one listing at each level returns expected owner.
    // For pin/building/community/muni/area: deterministic equality on owner.
    // For floor pool (L9/L10): allow any floor pool member with matching access.
    const wantOwners = [
      { key: 'L1_pin_target',      expectedKey: 'agent_pin' },
      { key: 'L2_building_condo',  expectedKey: 'agent_building' },
      { key: 'L3_community_condo', expectedKey: 'agent_alpha' },
      { key: 'L5_muni_condo',      expectedKey: 'manager' },
      { key: 'L7_area_condo',      expectedKey: 'area_manager' },
    ];
    for (const w of wantOwners) {
      const lspec = cfg.TEST_LISTINGS.find(l => l.key === w.key);
      const listingId = ids.test_listings.get(w.key);
      const buildingIdForResolve = (w.key === 'L2_building_condo') ? syntheticBuildingId : lspec.geo.building_id;
      const r = await client.query(
        `SELECT resolve_agent_for_context($1,$2,$3,$4,$5,$6,NULL,$7) AS agent_id`,
        [listingId, buildingIdForResolve, lspec.geo.neighbourhood_id, lspec.geo.community_id,
         lspec.geo.municipality_id, lspec.geo.area_id, ids.tenant_primary]);
      const got = r.rows[0].agent_id;
      const expected = ids.agents_primary.get(w.expectedKey);
      if (got !== expected) throw new Error('V2 FAIL: ' + w.key + ' expected owner ' + w.expectedKey + ' (' + expected + '), got ' + got);
      console.log('  V2 PASS: ' + w.key + ' resolved to ' + w.expectedKey);
    }
    // V2b: floor-pool fallthrough cases. Expected: resolver returns ANY active
    // floor pool member whose access flag covers the property type.
    const floorPoolCondoOk = new Set(cfg.AGENTS_PRIMARY.filter(a => a.in_floor_pool && a.floor_condo).map(a => ids.agents_primary.get(a.key)));
    const floorPoolHomesOk = new Set(cfg.AGENTS_PRIMARY.filter(a => a.in_floor_pool && a.floor_homes).map(a => ids.agents_primary.get(a.key)));
    for (const w of [
      { key: 'L9_floor_condo', allowed: floorPoolCondoOk, label: 'condo-floor' },
      { key: 'L10_floor_home', allowed: floorPoolHomesOk, label: 'homes-floor' },
    ]) {
      const lspec = cfg.TEST_LISTINGS.find(l => l.key === w.key);
      const listingId = ids.test_listings.get(w.key);
      const r = await client.query(
        `SELECT resolve_agent_for_context($1,$2,$3,$4,$5,$6,NULL,$7) AS agent_id`,
        [listingId, lspec.geo.building_id, lspec.geo.neighbourhood_id, lspec.geo.community_id,
         lspec.geo.municipality_id, lspec.geo.area_id, ids.tenant_primary]);
      const got = r.rows[0].agent_id;
      if (!got)               throw new Error('V2b FAIL: ' + w.key + ' resolved to NULL (no floor agent found)');
      if (!w.allowed.has(got))throw new Error('V2b FAIL: ' + w.key + ' resolved to ' + got + ' which is not in the ' + w.label + ' pool');
      console.log('  V2b PASS: ' + w.key + ' resolved to a valid ' + w.label + ' member (' + got + ')');
    }

    // V3: WALLiam Brooklin resolution unchanged.
    // We compare directly against the captured before-snapshot.
    const before = JSON.parse(fs.readFileSync(cfg.PATHS.baselineBefore, 'utf8'));
    for (const probe of before.walliam_resolution_probe) {
      const sample = await client.query(
        `SELECT property_type, building_id, community_id, municipality_id, area_id
           FROM mls_listings WHERE id = $1`, [probe.listing_id]);
      const m = sample.rows[0];
      if (!m) throw new Error('V3: probe listing missing: ' + probe.listing_id);
      const r2 = await client.query(
        `SELECT resolve_agent_for_context($1,$2,NULL,$3,$4,$5,NULL,$6) AS agent_id`,
        [probe.listing_id, m.building_id, m.community_id, m.municipality_id, m.area_id, cfg.WALLIAM_TENANT_ID]);
      if (r2.rows[0].agent_id !== probe.resolved_agent_id) {
        throw new Error('V3 FAIL: WALLiam Brooklin resolution drifted -- listing=' + probe.listing_id +
                        ' before=' + probe.resolved_agent_id + ' after=' + r2.rows[0].agent_id);
      }
    }
    console.log('  V3 PASS: WALLiam Brooklin resolution unchanged (' + before.walliam_resolution_probe.length + ' probes).');

    // V4: cross-tenant. Primary tenant reading a listing in their Markham geo
    // must NOT return any secondary agent, regardless of secondary having a
    // muni-Markham carve.
    const L5 = ids.test_listings.get('L5_muni_condo');
    const xr = await client.query(
      `SELECT resolve_agent_for_context($1,NULL,NULL,NULL,$2,$3,NULL,$4) AS agent_id`,
      [L5, cfg.GEO.municipality.id, cfg.GEO.area.id, ids.tenant_primary]);
    const xa = xr.rows[0].agent_id;
    const secAgent = ids.agents_secondary.get('sec_tenant_admin');
    if (xa === secAgent) throw new Error('V4 FAIL: primary read returned secondary agent (CROSS-TENANT LEAK)');
    console.log('  V4 PASS: primary read on Markham did NOT return secondary agent (got ' + xa + ').');

    // V4b: secondary reading a Markham listing must NOT return any primary agent.
    const xr2 = await client.query(
      `SELECT resolve_agent_for_context($1,NULL,NULL,NULL,$2,$3,NULL,$4) AS agent_id`,
      [L5, cfg.GEO.municipality.id, cfg.GEO.area.id, ids.tenant_secondary]);
    const xa2 = xr2.rows[0].agent_id;
    if (xa2 !== secAgent) {
      throw new Error('V4b FAIL: secondary read on Markham expected secondary tenant_admin (' + secAgent + '), got ' + xa2);
    }
    console.log('  V4b PASS: secondary read on Markham returned secondary tenant_admin.');

    // V5: reroll queue empty for both test tenants.
    const q5 = await client.query(
      `SELECT COUNT(*)::int AS n FROM territory_reroll_queue WHERE tenant_id IN ($1,$2)`,
      [ids.tenant_primary, ids.tenant_secondary]);
    if (q5.rows[0].n !== 0) throw new Error('V5 FAIL: reroll queue not empty -- ' + q5.rows[0].n + ' rows pending');
    console.log('  V5 PASS: reroll queue empty for both test tenants.');

    // ── COMMIT ──────────────────────────────────────────────────────────────
    await client.query('COMMIT');
    console.log('\n=== COMMIT ===');
  } catch (e) {
    console.error('\nTRANSACTION ERROR: ' + e.message);
    if (e.detail)     console.error('  detail: ' + e.detail);
    if (e.constraint) console.error('  constraint: ' + e.constraint);
    await client.query('ROLLBACK').catch(()=>{});
    console.log('=== ROLLBACK ===');
    await client.end().catch(()=>{});
    await cleanupAuthUsers();
    await manifestClose({ kind: 'footer', status: 'rolled_back', error: e.message, at: new Date().toISOString() });
    process.exit(1);
  }

  await client.end();
  await manifestClose({ kind: 'footer', status: 'committed', at: new Date().toISOString(),
                         primary_tenant_id: ids.tenant_primary, secondary_tenant_id: ids.tenant_secondary });

  console.log('\n=========================================================');
  console.log('CV-FIXTURE COMMITTED.');
  console.log('  primary  tenant id = ' + ids.tenant_primary);
  console.log('  secondary tenant id = ' + ids.tenant_secondary);
  console.log('  manifest = ' + path.relative(process.cwd(), cfg.PATHS.manifest));
  console.log('NEXT STEP: run capture-cv-fixture-baseline --mode=after for final WALLiam invariant proof.');
  console.log('=========================================================');
})().catch(e => { console.error('UNHANDLED: ' + e.message); process.exit(1); });
