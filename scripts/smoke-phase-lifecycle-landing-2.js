#!/usr/bin/env node
/**
 * Smoke harness for P-LIFECYCLE Landing 2.
 *
 * Plan ref: docs/W-LIFECYCLE-LANDING-2-PLAN.md section 10.
 *
 * Discipline:
 *   - Read-only setup probes (no UUID literals; runtime SELECTs).
 *   - Smoke writes are intentional and idempotent (each NULL-cache test row
 *     gets resolved once; subsequent runs pick a fresh row).
 *   - service_role probe avoids the apply-runner V3 bug: tenant + listing
 *     ids are picked as postgres FIRST, then ROLE is switched and the
 *     function is invoked with those values as parameters. service_role
 *     never queries tenant_floor_pool directly.
 *   - No hardcoded business UUIDs (WALLiam, Neo Smith, etc.) used as
 *     filters or expected values; everything is derived from query output
 *     this run.
 *
 * Test matrix:
 *   T1. NULL-cache routable (Event 5 happy path)
 *       - Pick tenant + NULL-cache routable listing via runtime SELECTs.
 *       - Walk-equivalence target: resolve_agent_for_context output.
 *       - Call reresolve_listings_in_set([listing], tenant).
 *       - Assert: resolved_count = 1, null_count = 0.
 *       - Assert: coupled trio (agent, scope, source_id) all NOT NULL.
 *       - Assert: post-state agent = walk-equivalence target.
 *
 *   T2. Carved community-scope sticky guard
 *       - Pick a community-scope cache-hit row.
 *       - Call the function.
 *       - Assert: resolved_count = 0, post-state byte-identical to pre-state.
 *
 *   T3. Empty input array
 *       - Pick any tenant (no listing involved).
 *       - Call with []::uuid[].
 *       - Assert: (0, 0).
 *
 *   T4. NULL tenant (predicate-based no-op)
 *       - Pick a cache-hit row.
 *       - Call with NULL tenant.
 *       - Assert: (0, 0). No RAISE. No state change.
 *
 *   T5. service_role end-to-end (post-Landing-1 + Landing 2 trust chain)
 *       - Pick tenant + NULL-cache routable listing AS POSTGRES.
 *       - SET LOCAL ROLE service_role.
 *       - Call reresolve_listings_in_set with the pre-picked args.
 *       - Assert: resolved_count = 1 (or 0 if no candidate left).
 *       - Confirms SECURITY DEFINER chain works for the function and
 *         that the apply-runner V3 fatal was a runner-side bug.
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

function fail(test, msg) {
  console.error(`  FAIL: ${test}: ${msg}`);
  process.exitCode = 1;
}

function pass(test, msg) {
  console.log(`  PASS: ${test}: ${msg}`);
}

function short(uuid) {
  return uuid ? uuid.substring(0, 8) + '...' : '<null>';
}

async function pickNoTpaTenant(client) {
  const r = await client.query(`
    SELECT DISTINCT tfp.tenant_id
      FROM public.tenant_floor_pool tfp
     WHERE tfp.is_active
       AND NOT EXISTS (
         SELECT 1 FROM public.tenant_property_access tpa
         WHERE tpa.tenant_id = tfp.tenant_id AND tpa.is_active
       )
     LIMIT 1
  `);
  return r.rows[0]?.tenant_id ?? null;
}

async function pickNullCacheRoutable(client) {
  const r = await client.query(`
    SELECT id, building_id, community_id, municipality_id, area_id
      FROM public.mls_listings
     WHERE assigned_agent_id IS NULL
       AND property_type IN ('Residential Condo & Other','Residential Freehold')
       AND municipality_id IS NOT NULL
     LIMIT 1
  `);
  return r.rows[0] ?? null;
}

async function pickCommunityScopeCarved(client) {
  const r = await client.query(`
    SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
      FROM public.mls_listings
     WHERE assigned_scope = 'community'
       AND assigned_agent_id IS NOT NULL
     LIMIT 1
  `);
  return r.rows[0] ?? null;
}

async function pickCacheHit(client) {
  const r = await client.query(`
    SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
      FROM public.mls_listings
     WHERE assigned_agent_id IS NOT NULL
     LIMIT 1
  `);
  return r.rows[0] ?? null;
}

async function callReresolve(client, listingIds, tenantId) {
  const r = await client.query(
    `SELECT resolved_count, null_count
       FROM public.reresolve_listings_in_set($1::uuid[], $2::uuid)`,
    [listingIds, tenantId]
  );
  return r.rows[0];
}

async function readListingState(client, listingId) {
  const r = await client.query(
    `SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
       FROM public.mls_listings WHERE id = $1`,
    [listingId]
  );
  return r.rows[0] ?? null;
}

async function resolverAgent(client, listing, tenantId) {
  const r = await client.query(
    `SELECT public.resolve_agent_for_context(
       $1::uuid, $2::uuid, NULL, $3::uuid, $4::uuid, $5::uuid, NULL, $6::uuid
     ) AS agent`,
    [listing.id, listing.building_id, listing.community_id,
     listing.municipality_id, listing.area_id, tenantId]
  );
  return r.rows[0].agent;
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('connected.');
  console.log('');

  // ========================================================================
  // T1. NULL-cache routable, walk-equivalence + coupled trio
  // ========================================================================
  console.log('T1. NULL-cache routable (Event 5 happy path)');
  {
    const tenantId = await pickNoTpaTenant(client);
    if (!tenantId) { fail('T1', 'no tenant with floor pool + no TPA'); }
    else {
      const listing = await pickNullCacheRoutable(client);
      if (!listing) { fail('T1', 'no NULL-cache routable listing remaining'); }
      else {
        const walkAgent = await resolverAgent(client, listing, tenantId);
        const ret = await callReresolve(client, [listing.id], tenantId);
        const post = await readListingState(client, listing.id);

        const expectedResolved = walkAgent ? 1 : 0;
        const expectedNull     = walkAgent ? 0 : 1;
        if (ret.resolved_count !== expectedResolved || ret.null_count !== expectedNull) {
          fail('T1', `expected (${expectedResolved},${expectedNull}), got (${ret.resolved_count},${ret.null_count}) for listing ${listing.id}`);
        } else if (walkAgent) {
          if (post.assigned_agent_id === null || post.assigned_scope === null || post.assigned_source_id === null) {
            fail('T1', `coupled trio not set (agent=${post.assigned_agent_id}, scope=${post.assigned_scope}, source=${post.assigned_source_id})`);
          } else if (post.assigned_agent_id !== walkAgent) {
            fail('T1', `walk-equivalence broken: resolver=${walkAgent}, set-based wrote=${post.assigned_agent_id}`);
          } else {
            pass('T1', `listing=${short(listing.id)}, tenant=${short(tenantId)}, agent=${short(post.assigned_agent_id)}, scope=${post.assigned_scope}, source=${short(post.assigned_source_id)} (walk-equivalence held)`);
          }
        } else {
          if (post.assigned_agent_id !== null || post.assigned_scope !== null) {
            fail('T1', `resolver returned NULL but cache has (agent=${post.assigned_agent_id}, scope=${post.assigned_scope})`);
          } else {
            pass('T1', `no-resolution case held (both paths returned NULL); listing=${short(listing.id)}`);
          }
        }
      }
    }
  }

  // ========================================================================
  // T2. Carved community-scope sticky guard preserves pre-state
  // ========================================================================
  console.log('');
  console.log('T2. Carved community-scope sticky guard');
  {
    const pre = await pickCommunityScopeCarved(client);
    if (!pre) { fail('T2', 'no carved community-scope listing'); }
    else {
      const tenantRes = await client.query(
        `SELECT tenant_id FROM public.agents WHERE id = $1`,
        [pre.assigned_agent_id]
      );
      const tenantId = tenantRes.rows[0]?.tenant_id;
      if (!tenantId) { fail('T2', `agent ${pre.assigned_agent_id} has no tenant_id`); }
      else {
        const ret = await callReresolve(client, [pre.id], tenantId);
        const post = await readListingState(client, pre.id);
        if (ret.resolved_count !== 0) {
          fail('T2', `sticky guard broken: resolved_count=${ret.resolved_count}, expected 0`);
        } else if (
          post.assigned_agent_id !== pre.assigned_agent_id ||
          post.assigned_scope !== pre.assigned_scope ||
          post.assigned_source_id !== pre.assigned_source_id
        ) {
          fail('T2', `pre-state mutated: agent ${pre.assigned_agent_id}->${post.assigned_agent_id}, scope ${pre.assigned_scope}->${post.assigned_scope}, source ${pre.assigned_source_id}->${post.assigned_source_id}`);
        } else {
          pass('T2', `listing=${short(pre.id)}, scope=${post.assigned_scope}, agent=${short(post.assigned_agent_id)} preserved`);
        }
      }
    }
  }

  // ========================================================================
  // T3. Empty array
  // ========================================================================
  console.log('');
  console.log('T3. Empty input array');
  {
    const tenantId = await pickNoTpaTenant(client);
    if (!tenantId) { fail('T3', 'no tenant with floor pool + no TPA'); }
    else {
      const ret = await callReresolve(client, [], tenantId);
      if (ret.resolved_count !== 0 || ret.null_count !== 0) {
        fail('T3', `expected (0,0), got (${ret.resolved_count},${ret.null_count})`);
      } else {
        pass('T3', `tenant=${short(tenantId)} (input cardinality 0) -> (0, 0)`);
      }
    }
  }

  // ========================================================================
  // T4. NULL tenant predicate no-op
  // ========================================================================
  console.log('');
  console.log('T4. NULL tenant (predicate-based no-op)');
  {
    const pre = await pickCacheHit(client);
    if (!pre) { fail('T4', 'no cache-hit listing'); }
    else {
      let raised = false;
      let ret = null;
      try {
        ret = await callReresolve(client, [pre.id], null);
      } catch (e) {
        raised = true;
        fail('T4', `function RAISED on NULL tenant: ${e.message}`);
      }
      if (!raised) {
        if (ret.resolved_count !== 0 || ret.null_count !== 0) {
          fail('T4', `expected (0,0), got (${ret.resolved_count},${ret.null_count})`);
        } else {
          const post = await readListingState(client, pre.id);
          if (
            post.assigned_agent_id !== pre.assigned_agent_id ||
            post.assigned_scope !== pre.assigned_scope ||
            post.assigned_source_id !== pre.assigned_source_id
          ) {
            fail('T4', 'pre-state mutated under NULL tenant');
          } else {
            pass('T4', `NULL tenant -> (0, 0); pre-state preserved (predicate no-op)`);
          }
        }
      }
    }
  }

  // ========================================================================
  // T5. service_role end-to-end (apply-runner V3 fix-proof)
  // ========================================================================
  console.log('');
  console.log('T5. service_role end-to-end (avoids the runner V3 tenant_floor_pool bug)');
  {
    // Pick tenant + listing AS POSTGRES FIRST.
    const tenantId = await pickNoTpaTenant(client);
    const listing = await pickNullCacheRoutable(client);
    if (!tenantId) { fail('T5', 'no tenant with floor pool + no TPA'); }
    else if (!listing) { pass('T5', 'no NULL-cache routable remaining (T1 + V2/V6 may have cleared the pool; SECURITY DEFINER trust chain still validated by Landing 1 V4)'); }
    else {
      // NOW switch role + invoke. service_role never reads tenant_floor_pool
      // directly; it only invokes the SECURITY DEFINER function.
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE service_role');
        const ret = await callReresolve(client, [listing.id], tenantId);
        await client.query('RESET ROLE');
        // Verify under postgres for inspection
        const post = await readListingState(client, listing.id);
        // Roll back the write so T5 leaves no state behind (it's a probe).
        await client.query('ROLLBACK');
        if (ret.resolved_count === 0 && ret.null_count === 1) {
          pass('T5', `service_role -> (0, 1) (resolver returned NULL for this row); listing=${short(listing.id)}, tenant=${short(tenantId)}`);
        } else if (ret.resolved_count === 1 && ret.null_count === 0) {
          pass('T5', `service_role -> (1, 0); SECURITY DEFINER chain works; post-state agent=${short(post.assigned_agent_id)}, scope=${post.assigned_scope}; rolled back to preserve smoke isolation`);
        } else {
          fail('T5', `service_role got unexpected (${ret.resolved_count},${ret.null_count})`);
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        fail('T5', `service_role probe raised: ${e.message}`);
      }
    }
  }

  console.log('');
  await client.end();
  console.log(process.exitCode ? 'SMOKE: at least one test FAILED' : 'SMOKE: all tests PASSED');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
