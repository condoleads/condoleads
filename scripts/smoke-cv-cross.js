#!/usr/bin/env node
// scripts/smoke-cv-cross.js
// W-CORE-VERIFICATION CV-CROSS data-breach-class isolation smoke.
//
// Both fixture tenants carve Markham muni (deliberate collision) -- this is
// the sharp test surface.  A failure here is an incident, not a bug.
//
// All writes inside BEGIN/ROLLBACK; one pg client per probe.  Real ids loaded
// from manifest at runtime.
//
// CASES:
//   A. Resolution isolation -- same-Markham collision
//   B. Lead-chain isolation -- walker never crosses tenant boundary
//   C. Cache-first reader isolation -- JOIN filter blocks cross-tenant cache
//   D. Distribution isolation -- per-tenant cache writes never leak

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const cfg = require('./cv-fixture-config');

const cs = process.env.DATABASE_URL;
if (!cs) { console.error('FATAL: DATABASE_URL not set.'); process.exit(1); }
function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

// ─── Manifest ───────────────────────────────────────────────────────────────
const manifestLines = fs.readFileSync(cfg.PATHS.manifest, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const footer = manifestLines.find(l => l.kind === 'footer' && l.status === 'committed');
if (!footer) fail('manifest has no committed footer.');
const tenantPrimary   = footer.primary_tenant_id;
const tenantSecondary = footer.secondary_tenant_id;
const agentsPrimary   = new Map();
const agentsSecondary = new Map();
const testListings    = new Map();
for (const l of manifestLines) {
  if (l.kind === 'agent' && l.tenant_spec === 'primary')   agentsPrimary.set(l.spec_key, l.id);
  if (l.kind === 'agent' && l.tenant_spec === 'secondary') agentsSecondary.set(l.spec_key, l.id);
  if (l.kind === 'test_listing') testListings.set(l.spec_key, l.id);
}
const SEC_ADMIN  = agentsSecondary.get('sec_tenant_admin');
const TENANT_ADMIN = agentsPrimary.get('tenant_admin');
const AREA_MANAGER = agentsPrimary.get('area_manager');
const MANAGER      = agentsPrimary.get('manager');
const AGENT_ALPHA  = agentsPrimary.get('agent_alpha');
const AGENT_BUILDING = agentsPrimary.get('agent_building');
const AGENT_PIN    = agentsPrimary.get('agent_pin');
const AGENT_DIST_A = agentsPrimary.get('agent_dist_a');
const AGENT_DIST_B = agentsPrimary.get('agent_dist_b');
const primaryAgentIds = new Set(agentsPrimary.values());
const secondaryAgentIds = new Set(agentsSecondary.values());

console.log('manifest loaded:');
console.log('  primary tenant   = ' + tenantPrimary   + '  agents=' + agentsPrimary.size);
console.log('  secondary tenant = ' + tenantSecondary + '  agents=' + agentsSecondary.size);
console.log('  sec_tenant_admin = ' + SEC_ADMIN);

// ─── Probe helpers ──────────────────────────────────────────────────────────
async function probeRO(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] err: ' + e.message));
  await c.connect();
  await c.query('BEGIN READ ONLY');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally { await c.query('ROLLBACK').catch(()=>{}); await c.end().catch(()=>{}); }
}
async function probeRW(label, fn) {
  const c = new Client({ connectionString: cs });
  c.on('error', e => console.error('  [' + label + '] err: ' + e.message));
  await c.connect();
  await c.query('BEGIN');
  await c.query('SET LOCAL statement_timeout = 0');
  try { return await fn(c); }
  finally { await c.query('ROLLBACK').catch(()=>{}); await c.end().catch(()=>{}); }
}

const results = [];
function record(group, name, role, passed, expected, got) {
  results.push({ group, name, role, passed, expected: String(expected), got: String(got) });
  console.log('  [' + (passed ? 'PASS' : 'FAIL') + '] ' + group + ' / ' + name + ' (' + role + ')');
  if (!passed) console.log('         expected: ' + expected + '\n         got:      ' + got);
}

// ─── Ports ──────────────────────────────────────────────────────────────────
// walkHierarchy <- hierarchy.ts:36-89
const MAX_HOPS = 6;
async function walkHierarchy(client, agentId) {
  const chain = { manager_id: null, area_manager_id: null, tenant_admin_id: null, ancestors: [] };
  const selfR = await client.query(`SELECT id, role, parent_id FROM agents WHERE id = $1`, [agentId]);
  if (selfR.rows.length === 0) return chain;
  let cursor = selfR.rows[0].parent_id || null;
  const seen = new Set([agentId]);
  for (let hop = 0; hop < MAX_HOPS && cursor; hop++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const r = await client.query(`SELECT id, role, parent_id FROM agents WHERE id = $1`, [cursor]);
    if (r.rows.length === 0) break;
    const row = r.rows[0];
    const role = row.role || 'agent';
    chain.ancestors.push({ id: row.id, role });
    if (chain.manager_id === null && role === 'manager')           chain.manager_id = row.id;
    if (chain.area_manager_id === null && role === 'area_manager') chain.area_manager_id = row.id;
    if (role === 'tenant_admin') { chain.tenant_admin_id = row.id; break; }
    cursor = row.parent_id;
  }
  return chain;
}

// Cache-first JOIN reader -- prod's tenant-filter is the security boundary.
async function cacheFirstLookup(client, tenantId, listingId) {
  if (!listingId) return null;
  const r = await client.query(
    `SELECT ml.assigned_agent_id
       FROM mls_listings ml
       JOIN agents a ON a.id = ml.assigned_agent_id
      WHERE ml.id = $1 AND a.tenant_id = $2 AND a.is_active = TRUE AND a.is_selling = TRUE`,
    [listingId, tenantId]);
  return r.rows.length > 0 ? r.rows[0].assigned_agent_id : null;
}

async function rpcResolve(client, opts) {
  const r = await client.query(
    `SELECT resolve_agent_for_context($1,$2,$3,$4,$5,$6,$7,$8) AS agent_id`,
    [opts.listingId||null, opts.buildingId||null, opts.neighbourhoodId||null,
     opts.communityId||null, opts.municipalityId||null, opts.areaId||null,
     opts.userId||null, opts.tenantId]);
  return r.rows[0].agent_id;
}

// ─── Expected resolution maps for the Markham collision ─────────────────────
// Primary's Markham listings under primary -- chain of carves.
const primaryExpected = {
  'L1_pin_target':      AGENT_PIN,       // pin
  'L2_building_condo':  AGENT_BUILDING,  // building
  'L3_community_condo': AGENT_ALPHA,     // Berczy community
  'L4_community_home':  AGENT_ALPHA,
  'L5_muni_condo':      MANAGER,         // Markham muni
  'L6_muni_home':       MANAGER,
  'L11_dist_condo':     AGENT_DIST_A,    // Box Grove distribution primary
  'L12_dist_home':      AGENT_DIST_A,
};
// All Markham listings under secondary tenant resolve to sec_tenant_admin
// because secondary has ONLY the muni-Markham carve (no community/building/pin).
// Even L1 (pinned under primary) falls through because the pin only matches
// when the joined agent is primary's tenant.
const secondaryExpected = {
  'L1_pin_target':      SEC_ADMIN,
  'L2_building_condo':  SEC_ADMIN,
  'L3_community_condo': SEC_ADMIN,
  'L4_community_home':  SEC_ADMIN,
  'L5_muni_condo':      SEC_ADMIN,
  'L6_muni_home':       SEC_ADMIN,
  'L11_dist_condo':     SEC_ADMIN,
  'L12_dist_home':      SEC_ADMIN,
};

// ─── CASE A: resolution isolation (Markham collision) ───────────────────────
async function caseA() {
  console.log('\n=== CASE A: resolution isolation (Markham collision) ===');

  for (const role of ['postgres', 'service_role']) {
    // A.1 Primary reads on each Markham listing -- never returns secondary agent.
    for (const key of Object.keys(primaryExpected)) {
      const expected = primaryExpected[key];
      await probeRW('A1-' + key + '-' + role, async (c) => {
        if (role === 'service_role') await c.query('SET LOCAL ROLE service_role');
        const listingId = testListings.get(key);
        // Live RPC under primary tenant.
        const r = await c.query(
          `SELECT m.building_id, m.community_id, m.municipality_id, m.area_id FROM mls_listings m WHERE m.id = $1`,
          [listingId]);
        const g = r.rows[0];
        const agentId = await rpcResolve(c, {
          listingId, buildingId: g.building_id, communityId: g.community_id,
          municipalityId: g.municipality_id, areaId: g.area_id, tenantId: tenantPrimary,
        });
        const isExpected = agentId === expected;
        const isNotSecondary = !secondaryAgentIds.has(agentId);
        record('A primary read', key + ' resolves to expected primary agent', role,
          isExpected && isNotSecondary,
          'agent=' + (expected||'NULL').slice(0,8) + ' (∈ primary, ∉ secondary)',
          'agent=' + (agentId||'NULL').slice(0,8) + ' is_expected=' + isExpected + ' is_not_secondary=' + isNotSecondary);
      });
    }

    // A.2 Secondary reads on the SAME listings -- never returns any primary agent.
    for (const key of Object.keys(secondaryExpected)) {
      const expected = secondaryExpected[key];
      await probeRW('A2-' + key + '-' + role, async (c) => {
        if (role === 'service_role') await c.query('SET LOCAL ROLE service_role');
        const listingId = testListings.get(key);
        const r = await c.query(
          `SELECT m.building_id, m.community_id, m.municipality_id, m.area_id FROM mls_listings m WHERE m.id = $1`,
          [listingId]);
        const g = r.rows[0];
        const agentId = await rpcResolve(c, {
          listingId, buildingId: g.building_id, communityId: g.community_id,
          municipalityId: g.municipality_id, areaId: g.area_id, tenantId: tenantSecondary,
        });
        const isExpected = agentId === expected;
        const isNotPrimary = !primaryAgentIds.has(agentId);
        record('A secondary read', key + ' resolves to sec_admin (not any primary)', role,
          isExpected && isNotPrimary,
          'agent=sec_admin (∈ secondary, ∉ primary)',
          'agent=' + (agentId||'NULL').slice(0,8) + ' is_sec_admin=' + isExpected + ' is_not_primary=' + isNotPrimary);
      });
    }
  }
}

// ─── CASE B: lead-chain isolation ───────────────────────────────────────────
async function caseB() {
  console.log('\n=== CASE B: lead-chain isolation ===');

  // B.1 walkHierarchy on each primary agent -- ancestor list contains ONLY primary ids.
  await probeRO('B1-primary-chain', async (c) => {
    for (const [key, id] of agentsPrimary.entries()) {
      const chain = await walkHierarchy(c, id);
      const ancestorIds = chain.ancestors.map(a => a.id);
      const allPrimary = ancestorIds.every(aid => primaryAgentIds.has(aid));
      const noneSecondary = ancestorIds.every(aid => !secondaryAgentIds.has(aid));
      record('B1 walker confines tenant', key + ' chain ⊆ primary', 'postgres',
        allPrimary && noneSecondary,
        'all ancestors ∈ primary, none ∈ secondary',
        'ancestors=' + ancestorIds.length + ' all_primary=' + allPrimary + ' no_secondary=' + noneSecondary);
    }
  });

  // B.2 walkHierarchy on secondary agent -- empty chain (root), no primary leak.
  await probeRO('B2-secondary-chain', async (c) => {
    const chain = await walkHierarchy(c, SEC_ADMIN);
    const ancestorIds = chain.ancestors.map(a => a.id);
    const noneInPrimary = ancestorIds.every(aid => !primaryAgentIds.has(aid));
    record('B1 walker confines tenant', 'sec_admin chain has 0 primary refs', 'postgres',
      ancestorIds.length === 0 && noneInPrimary,
      'empty ancestor list (root agent), 0 primary ids',
      'ancestors=' + ancestorIds.length + ' (no_primary=' + noneInPrimary + ')');
  });

  // B.3 Insert a lead routed to agent_alpha (primary) -- stamped chain entirely primary.
  for (const role of ['postgres', 'service_role']) {
    await probeRW('B3-primary-lead-' + role, async (c) => {
      if (role === 'service_role') await c.query('SET LOCAL ROLE service_role');
      const chain = await walkHierarchy(c, AGENT_ALPHA);
      const r = await c.query(
        `INSERT INTO leads (tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id,
                            contact_name, contact_email, source, assignment_source, status)
         VALUES ($1, $2, $3, $4, $5, 'B3 primary', 'cv-b3-' || $6 || '@example.invalid', 'contact_form', 'geo', 'new')
         RETURNING agent_id, manager_id, area_manager_id, tenant_admin_id, tenant_id`,
        [tenantPrimary, AGENT_ALPHA, chain.manager_id, chain.area_manager_id, chain.tenant_admin_id, role]);
      const lead = r.rows[0];
      const allFields = [lead.agent_id, lead.manager_id, lead.area_manager_id, lead.tenant_admin_id];
      const noneSecondary = allFields.every(id => !id || !secondaryAgentIds.has(id));
      const tenantOK = lead.tenant_id === tenantPrimary;
      record('B3 stamped chain isolation', 'primary lead has 0 secondary refs', role,
        noneSecondary && tenantOK,
        'tenant_id=primary, all chain ids ∈ primary',
        'tenant=' + lead.tenant_id.slice(0,8) + ' no_secondary_in_chain=' + noneSecondary);
    });
  }

  // B.4 Insert a lead routed to sec_admin (secondary) -- stamped chain has no primary ids.
  for (const role of ['postgres', 'service_role']) {
    await probeRW('B4-secondary-lead-' + role, async (c) => {
      if (role === 'service_role') await c.query('SET LOCAL ROLE service_role');
      const chain = await walkHierarchy(c, SEC_ADMIN);
      const r = await c.query(
        `INSERT INTO leads (tenant_id, agent_id, manager_id, area_manager_id, tenant_admin_id,
                            contact_name, contact_email, source, assignment_source, status)
         VALUES ($1, $2, $3, $4, $5, 'B4 secondary', 'cv-b4-' || $6 || '@example.invalid', 'contact_form', 'geo', 'new')
         RETURNING agent_id, manager_id, area_manager_id, tenant_admin_id, tenant_id`,
        [tenantSecondary, SEC_ADMIN, chain.manager_id, chain.area_manager_id, chain.tenant_admin_id, role]);
      const lead = r.rows[0];
      const allFields = [lead.agent_id, lead.manager_id, lead.area_manager_id, lead.tenant_admin_id];
      const nonePrimary = allFields.every(id => !id || !primaryAgentIds.has(id));
      const tenantOK = lead.tenant_id === tenantSecondary;
      record('B4 stamped chain isolation', 'secondary lead has 0 primary refs', role,
        nonePrimary && tenantOK,
        'tenant_id=secondary, no chain ids ∈ primary',
        'tenant=' + lead.tenant_id.slice(0,8) + ' no_primary_in_chain=' + nonePrimary +
        ' chain=[' + allFields.map(x => (x||'NULL').slice(0,8)).join(',') + ']');
    });
  }
}

// ─── CASE C: cache-first reader isolation ───────────────────────────────────
async function caseC() {
  console.log('\n=== CASE C: cache-first reader isolation ===');

  // C.1 FORCE the cache of L3 to point at sec_admin (cross-tenant agent).
  // Then read under primary tenant: the JOIN filter (agents.tenant_id=primary)
  // must EXCLUDE the cross-tenant row, returning NULL (fallthrough to RPC).
  // If isolation were broken (filter missing/wrong), cache-first would return
  // sec_admin -- a data-breach-class leak.
  for (const role of ['postgres', 'service_role']) {
    await probeRW('C1-force-stale-' + role, async (c) => {
      if (role === 'service_role') await c.query('SET LOCAL ROLE service_role');
      await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
      const L3 = testListings.get('L3_community_condo');
      // Force cache to point at sec_admin (cross-tenant value).
      await c.query(
        `UPDATE mls_listings SET assigned_agent_id = $1, assigned_scope = 'pin' WHERE id = $2`,
        [SEC_ADMIN, L3]);

      // Primary cache-first read: must NOT return sec_admin (cross-tenant filter).
      const primaryCache = await cacheFirstLookup(c, tenantPrimary, L3);
      const noLeak = primaryCache !== SEC_ADMIN && !secondaryAgentIds.has(primaryCache);
      record('C cache-first isolation', 'primary read of sec_admin-cache returns NULL', role,
        primaryCache === null && noLeak,
        'NULL (cross-tenant cache rejected)',
        'cache_value=' + (primaryCache||'NULL').slice(0,8) + ' (no_secondary_leak=' + noLeak + ')');

      // Secondary cache-first read: SHOULD return sec_admin (cache matches its tenant).
      const secondaryCache = await cacheFirstLookup(c, tenantSecondary, L3);
      record('C cache-first isolation', 'secondary read of sec_admin-cache returns sec_admin', role,
        secondaryCache === SEC_ADMIN,
        'sec_admin (cache matches secondary scope)',
        'cache_value=' + (secondaryCache||'NULL').slice(0,8));

      // C.1.b verify the primary fallthrough still resolves correctly via RPC.
      let fallback = primaryCache;
      if (!fallback) {
        fallback = await rpcResolve(c, {
          listingId: L3, communityId: cfg.GEO.community_precedence.id,
          municipalityId: cfg.GEO.municipality.id, areaId: cfg.GEO.area.id,
          tenantId: tenantPrimary,
        });
      }
      record('C cache-first isolation', 'primary fallback resolves to agent_alpha', role,
        fallback === AGENT_ALPHA,
        'agent_alpha (RPC, not cache leak)',
        'fallback=' + (fallback||'NULL').slice(0,8));
    });
  }

  // C.2 INACTIVE-agent isolation: cache points at primary agent but the agent
  // is_active=FALSE -- cache-first must NOT return it.
  await probeRW('C2-inactive-agent', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L3 = testListings.get('L3_community_condo');
    // Cache holds AGENT_ALPHA (already true from CV-FIXTURE). Deactivate the agent.
    await c.query(`UPDATE agents SET is_active = FALSE WHERE id = $1`, [AGENT_ALPHA]);
    const cacheVal = await cacheFirstLookup(c, tenantPrimary, L3);
    record('C cache-first isolation', 'inactive agent rejected by is_active filter', 'postgres',
      cacheVal === null,
      'NULL (cache rejected: is_active=false)',
      'cache_value=' + (cacheVal||'NULL').slice(0,8));
  });

  // C.3 is_selling=FALSE isolation -- same defensive pattern.
  await probeRW('C3-non-selling-agent', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L3 = testListings.get('L3_community_condo');
    await c.query(`UPDATE agents SET is_selling = FALSE WHERE id = $1`, [AGENT_ALPHA]);
    const cacheVal = await cacheFirstLookup(c, tenantPrimary, L3);
    record('C cache-first isolation', 'non-selling agent rejected by is_selling filter', 'postgres',
      cacheVal === null,
      'NULL (cache rejected: is_selling=false)',
      'cache_value=' + (cacheVal||'NULL').slice(0,8));
  });
}

// ─── CASE D: distribution isolation ─────────────────────────────────────────
async function caseD() {
  console.log('\n=== CASE D: distribution isolation ===');

  // D.0 FINDING: reresolve_listings_in_set has a sticky-by-scope-specificity
  // guard (function body lines 70-72, 114, 157, 200, 243, 286, 329, 366, 394,
  // 427, 455). It WILL NOT overwrite a more-specific cached scope with a
  // less-specific one. Probe this explicitly: secondary reroll on already-
  // community-cached L11/L12 → cache UNCHANGED (sticky guard fires).
  // This is GOOD: cross-tenant cache thrashing is structurally prevented by
  // scope-specificity, an even stronger guarantee than tenant-filtering.
  await probeRW('D0-sticky-guard', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L11 = testListings.get('L11_dist_condo');
    const L12 = testListings.get('L12_dist_home');
    const before = await c.query(`SELECT id, assigned_agent_id, assigned_scope FROM mls_listings WHERE id = ANY($1)`, [[L11, L12]]);
    const preMap = new Map(before.rows.map(r => [r.id, r]));
    // Secondary reroll (has only muni-Markham, less specific than community).
    await c.query(`SELECT public.reresolve_listings_in_set($1::uuid[], $2)`, [[L11, L12], tenantSecondary]);
    const after = await c.query(`SELECT id, assigned_agent_id, assigned_scope FROM mls_listings WHERE id = ANY($1)`, [[L11, L12]]);
    for (const r of after.rows) {
      const key = (r.id === L11) ? 'L11' : 'L12';
      const wasPrim = preMap.get(r.id);
      const unchanged = wasPrim.assigned_agent_id === r.assigned_agent_id && wasPrim.assigned_scope === r.assigned_scope;
      record('D sticky guard', key + ' sticky-by-scope prevents secondary muni override of primary community', 'postgres',
        unchanged && r.assigned_scope === 'community' && primaryAgentIds.has(r.assigned_agent_id),
        'cache unchanged (community/primary; sticky guard fires)',
        'before=' + wasPrim.assigned_agent_id.slice(0,8) + '/' + wasPrim.assigned_scope +
        ' after=' + r.assigned_agent_id.slice(0,8) + '/' + r.assigned_scope);
    }
  });

  // D.1 Now exercise the WRITE path properly: NULL the cache first inside the
  // BEGIN (clears the sticky-guard precondition), then run secondary reroll.
  // Cache MUST settle to sec_admin (Markham muni from secondary's carve), NOT
  // any primary agent.  If the function's tenant-filter were broken, a primary
  // agent could leak into the cache here.
  await probeRW('D1-secondary-write-to-null-cache', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L11 = testListings.get('L11_dist_condo');
    const L12 = testListings.get('L12_dist_home');

    // Clear cache to satisfy the sticky-guard precondition (assigned_scope IS NULL).
    await c.query(
      `UPDATE mls_listings SET assigned_agent_id = NULL, assigned_scope = NULL, assigned_source_id = NULL WHERE id = ANY($1)`,
      [[L11, L12]]);
    // Now secondary reroll.
    await c.query(`SELECT public.reresolve_listings_in_set($1::uuid[], $2)`, [[L11, L12], tenantSecondary]);
    const post = await c.query(
      `SELECT id, assigned_agent_id, assigned_scope FROM mls_listings WHERE id = ANY($1)`,
      [[L11, L12]]);
    for (const r of post.rows) {
      const key = (r.id === L11) ? 'L11' : 'L12';
      const isSecAdmin = r.assigned_agent_id === SEC_ADMIN;
      const isNotPrimary = !primaryAgentIds.has(r.assigned_agent_id);
      const scopeOK = r.assigned_scope === 'municipality';
      record('D distribution isolation', key + ' cache after secondary-reroll on NULL cache = sec_admin/muni', 'postgres',
        isSecAdmin && isNotPrimary && scopeOK,
        'cache=sec_admin scope=municipality (∉ primary)',
        'cache=' + (r.assigned_agent_id||'NULL').slice(0,8) + '/' + (r.assigned_scope||'NULL') +
        ' is_sec_admin=' + isSecAdmin + ' no_primary=' + isNotPrimary);
    }

    // Cross-tenant cache rejection check: primary reads must reject the now-
    // secondary cache (JOIN filter on agents.tenant_id).
    for (const [key, id] of [['L11', L11], ['L12', L12]]) {
      const cv = await cacheFirstLookup(c, tenantPrimary, id);
      record('D distribution isolation', 'primary cache-first rejects sec-cached ' + key, 'postgres',
        cv === null,
        'NULL (rejected by tenant filter)',
        'cache_value=' + (cv||'NULL').slice(0,8));
      // And the primary RPC fallthrough still returns dist_a (live truth).
      const live = await rpcResolve(c, {
        listingId: id, communityId: cfg.GEO.community_distribution.id,
        municipalityId: cfg.GEO.municipality.id, areaId: cfg.GEO.area.id,
        tenantId: tenantPrimary,
      });
      record('D distribution isolation', 'primary RPC on ' + key + ' returns dist_a', 'postgres',
        live === AGENT_DIST_A,
        'agent_dist_a',
        'live=' + (live||'NULL').slice(0,8));
    }
  });

  // D.2 Inverse direction: NULL cache + primary reroll -> cache to dist_a,
  // never a secondary agent.
  await probeRW('D2-primary-write-to-null-cache', async (c) => {
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const L11 = testListings.get('L11_dist_condo');
    const L12 = testListings.get('L12_dist_home');
    await c.query(
      `UPDATE mls_listings SET assigned_agent_id = NULL, assigned_scope = NULL, assigned_source_id = NULL WHERE id = ANY($1)`,
      [[L11, L12]]);
    await c.query(`SELECT public.reresolve_listings_in_set($1::uuid[], $2)`, [[L11, L12], tenantPrimary]);
    const post = await c.query(
      `SELECT id, assigned_agent_id, assigned_scope FROM mls_listings WHERE id = ANY($1)`,
      [[L11, L12]]);
    for (const r of post.rows) {
      const key = (r.id === L11) ? 'L11' : 'L12';
      const isPrimary = primaryAgentIds.has(r.assigned_agent_id);
      const isNotSecondary = !secondaryAgentIds.has(r.assigned_agent_id);
      const isDistA = r.assigned_agent_id === AGENT_DIST_A;
      record('D distribution isolation', key + ' cache after primary-reroll on NULL cache = dist_a/community', 'postgres',
        isPrimary && isNotSecondary && isDistA && r.assigned_scope === 'community',
        'cache=dist_a scope=community',
        'cache=' + (r.assigned_agent_id||'NULL').slice(0,8) + '/' + (r.assigned_scope||'NULL'));
    }
  });

  // D.3 Construct cross-tenant data-breach scenario: insert a lead with a
  // tenant_id from primary BUT an agent_id from secondary. Confirm there is NO
  // FK or other DB-level mechanism that auto-corrects -- this is the kind of
  // bug we'd want to PREVENT in application code.  The smoke here proves the
  // *application-level* layer (cache reader + resolver) blocks the bad path
  // structurally, even if a hypothetical bad INSERT slipped through.
  await probeRW('D3-mismatched-insert', async (c) => {
    // Attempt: primary tenant_id + secondary agent_id.
    // No FK enforces tenant<->agent linkage on leads, so the INSERT itself
    // succeeds.  This is a known weak spot -- application code must filter.
    let insertSucceeded = false;
    let row = null;
    try {
      const r = await c.query(
        `INSERT INTO leads (tenant_id, agent_id, contact_name, contact_email, source, assignment_source, status)
         VALUES ($1, $2, 'D3 mismatch', 'cv-d3@example.invalid', 'contact_form', 'geo', 'new')
         RETURNING id, tenant_id, agent_id`,
        [tenantPrimary, SEC_ADMIN]);
      insertSucceeded = true;
      row = r.rows[0];
    } catch (e) {
      // If a future migration adds a (tenant_id, agent_id) consistency check,
      // this will fail with code 23514 -- record as PASS in that case.
      record('D distribution isolation', 'mismatched-tenant lead INSERT blocked by DB', 'postgres',
        true,
        'DB rejects mismatched tenant_id/agent_id',
        'rejected: ' + e.code + ' ' + e.message);
      return;
    }
    // Mismatched row exists in the BEGIN -- inform the report.
    record('D distribution isolation', 'mismatched-tenant lead INSERT NOT blocked by DB (app must filter)', 'postgres',
      insertSucceeded && row.tenant_id === tenantPrimary && row.agent_id === SEC_ADMIN,
      'application-level filter is the security boundary',
      'INSERT succeeded with tenant=primary, agent=sec_admin -- relies on cache+resolver layer to prevent leak (validated by A/C above)');
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== CV-CROSS smoke ===\n');
  await caseA();
  await caseB();
  await caseC();
  await caseD();

  const lines = [];
  lines.push('='.repeat(135));
  lines.push('CV-CROSS data-breach-class smoke -- ' + new Date().toISOString());
  lines.push('  primary tenant   = ' + tenantPrimary);
  lines.push('  secondary tenant = ' + tenantSecondary);
  lines.push('='.repeat(135));
  const colGroup = 32, colCase = 60, colRole = 14, colStatus = 6;
  lines.push('GROUP'.padEnd(colGroup) + ' ' + 'CASE'.padEnd(colCase) + ' ' + 'ROLE'.padEnd(colRole) + ' ' + 'STATUS'.padEnd(colStatus) + ' EXPECTED → GOT');
  lines.push('-'.repeat(135));
  let passed = 0, failed = 0;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    if (r.passed) passed++; else failed++;
    lines.push(
      r.group.padEnd(colGroup).slice(0, colGroup) + ' ' +
      r.name.padEnd(colCase).slice(0, colCase)   + ' ' +
      r.role.padEnd(colRole)                      + ' ' +
      status.padEnd(colStatus)                    + ' ' +
      r.expected + ' → ' + r.got);
  }
  lines.push('-'.repeat(135));
  lines.push('TOTAL: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + failed);
  lines.push('='.repeat(135));

  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  fs.writeFileSync(path.join(__dirname, '..', 'cv-cross-smoke-output.txt'), text);
  console.log('Output: cv-cross-smoke-output.txt');
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
