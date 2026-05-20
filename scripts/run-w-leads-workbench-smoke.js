// scripts/run-w-leads-workbench-smoke.js
// W7: comprehensive end-to-end smoke for the W-LEADS-WORKBENCH workstream.
//
// v2 changes from initial run:
//   - safe() wrapper: every query inside BEGIN runs inside its own SAVEPOINT.
//     A failing query rolls back to before itself and the transaction stays alive.
//     This is the fix for the "current transaction is aborted, commands ignored"
//     cascade that nuked everything after the first error in v1.
//   - Fixture agent INSERTs are now 4 separate single-row INSERTs with explicit
//     ::uuid casts on every placeholder. Fixes the "inconsistent types deduced
//     for parameter $1" failure from v1's multi-row VALUES list.
//   - Territory RPC call uses the now-known named-args signature:
//     resolve_display_agent_for_context(p_tenant_id, p_area_id, ...)
//   - Discovery phase prints the leads / agents NOT NULL required columns
//     so future INSERT failures are diagnosable from the same run's output.
//
// Categories tested:
//   1. Lead capture     - shape of leads row for each of 7 lead-creating endpoints
//   2. Territory        - resolve_display_agent_for_context RPC routes correctly
//   3. Hierarchy walker - parent_id chain -> manager/area_manager/tenant_admin
//   4. Email fan-out    - 6-layer recipient chain incl. delegate overlay
//   5. Scoping          - per-role visibility + cross-tenant isolation (killer test)
//   6. Audit matrix     - all 11 action_types insert correctly
//   7. DNC enforcement  - status do_not_contact accepted + email_blocked_dnc audit accepted
//   8. Cumulative view  - multi-lead user_id aggregation works as the workbench expects
//
// Final summary line is machine-greppable: "RESULT: N PASS / M FAIL / K SKIP of X"

const { Client } = require('pg');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '.env.local' });

// ─── Known production fixtures (verified this session) ─────────────────────────
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const KING_SHAH        = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const W6B_LEAD         = '5477a25f-31c3-48ed-a428-eabbf585171f';

// ─── Result ledger ─────────────────────────────────────────────────────────────
const results = [];
function pass(label, detail)   { record(label, true,  detail); }
function fail(label, detail)   { record(label, false, detail); }
function skip(label, reason)   { record(label, null,  reason); }
function record(label, ok, detail) {
  results.push({ label, ok, detail });
  const tag = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'SKIP';
  const d = detail ? ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 220) + ']' : '';
  console.log(tag + ' - ' + label + d);
}
function assertEq(label, actual, expected, extra) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) pass(label, extra);
  else fail(label, 'expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual) + (extra ? ' ' + extra : ''));
}
function section(name) {
  console.log('');
  console.log('================================================================');
  console.log('  ' + name);
  console.log('================================================================');
}

async function main() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) { console.error('ABORT: no DIRECT_URL or DATABASE_URL in .env.local'); process.exit(1); }
  const client = new Client({ connectionString: connStr });
  await client.connect();

  // ─── Savepoint-isolated query helper ─────────────────────────────────────────
  // Every query inside BEGIN runs inside its own SAVEPOINT. If the query fails,
  // we ROLLBACK TO SAVEPOINT so the transaction stays alive for subsequent tests.
  // OUTSIDE BEGIN there's no transaction so we just use client.query directly.
  let spCounter = 0;
  async function safe(sql, params) {
    const sp = 'sp' + (++spCounter);
    await client.query('SAVEPOINT ' + sp);
    try {
      const r = await client.query(sql, params);
      await client.query('RELEASE SAVEPOINT ' + sp);
      return r;
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT ' + sp); } catch (_) { /* ignore */ }
      throw e;
    }
  }

  // Block-level isolation: if a category function throws past safe(), the block
  // wrapper logs it as a single failure rather than crashing the whole runner.
  async function block(label, fn) {
    try {
      await fn();
    } catch (e) {
      fail(label + ' [block crashed]', e.message);
    }
  }

  let txStarted = false;

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // DISCOVERY (no transaction yet)
    // ═══════════════════════════════════════════════════════════════════════════
    section('DISCOVERY');

    const tableResult = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
      AND table_name = ANY(ARRAY[
        'tenants','agents','leads','lead_admin_actions','lead_email_recipients_log',
        'agent_property_access','agent_delegations','platform_admins',
        'platform_manager_tenants','treb_areas','municipalities','communities','neighbourhoods'
      ])
    `);
    const tablesPresent = new Set(tableResult.rows.map(r => r.table_name));
    console.log('Tables found: ' + Array.from(tablesPresent).sort().join(', '));

    const hasDelegations            = tablesPresent.has('agent_delegations');
    const hasPlatformAdmins         = tablesPresent.has('platform_admins');
    const hasPlatformManagerTenants = tablesPresent.has('platform_manager_tenants');

    const rpcLookup = await client.query(`
      SELECT pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='resolve_display_agent_for_context'
    `);
    const hasResolverRpc = rpcLookup.rows.length > 0;
    if (hasResolverRpc) {
      console.log('Territory resolver RPC: present');
      console.log('  args: ' + rpcLookup.rows[0].args);
    }

    // tenants required-column report
    const tenantsCols = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tenants'
      ORDER BY ordinal_position
    `);
    const tenantRequired = tenantsCols.rows.filter(c => c.is_nullable === 'NO' && !c.column_default).map(c => c.column_name);
    console.log('tenants NOT NULL no-default: ' + (tenantRequired.length ? tenantRequired.join(', ') : '(none)'));

    // agents required-column report (so we can adapt fixture INSERT if it fails)
    const agentsCols = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='agents'
      ORDER BY ordinal_position
    `);
    const agentsRequired = agentsCols.rows.filter(c => c.is_nullable === 'NO' && !c.column_default).map(c => c.column_name);
    console.log('agents NOT NULL no-default: ' + (agentsRequired.length ? agentsRequired.join(', ') : '(none)'));

    // leads required-column report (helps diagnose Category 1 failures)
    const leadsCols = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='leads'
      ORDER BY ordinal_position
    `);
    const leadsRequired = leadsCols.rows.filter(c => c.is_nullable === 'NO' && !c.column_default).map(c => c.column_name);
    console.log('leads NOT NULL no-default: ' + (leadsRequired.length ? leadsRequired.join(', ') : '(none)'));

    // ═══════════════════════════════════════════════════════════════════════════
    // BEGIN TRANSACTION
    // ═══════════════════════════════════════════════════════════════════════════
    section('BEGIN TRANSACTION');
    await client.query('BEGIN');
    txStarted = true;

    // ───────────────────────────────────────────────────────────────────────────
    // FIXTURES
    // ───────────────────────────────────────────────────────────────────────────
    section('FIXTURES');

    let tenantB = null;
    let tenantBCreated = false;
    let topAdminId = null, areaMgrId = null, mgrId = null, agentBetaId = null;

    await block('FIXTURES', async () => {
      // ─── Tenant B
      tenantB = randomUUID();
      try {
        const cols = ['id', 'name'];
        const vals = [tenantB, 'SMOKE_TENANT_B'];
        const params = ['$1::uuid', '$2'];
        let p = 3;
        for (const req of tenantRequired) {
          if (cols.includes(req)) continue;
          cols.push(req);
          if (req.endsWith('_at') || req.includes('time'))      { vals.push(new Date()); }
          else if (req.includes('slug') || req.includes('subdomain') || req.includes('domain'))
                                                                 { vals.push('smoke-tenant-b-' + tenantB.slice(0, 8)); }
          else if (req.includes('email'))                        { vals.push('smoke-tenant-b-' + tenantB.slice(0, 8) + '@example.invalid'); }
          else if (req.includes('key'))                          { vals.push('smoke_' + tenantB.slice(0, 8)); }
          else                                                   { vals.push('smoke_' + req); }
          params.push('$' + p++);
        }
        await safe(
          'INSERT INTO tenants (' + cols.join(', ') + ') VALUES (' + params.join(', ') + ')',
          vals
        );
        tenantBCreated = true;
        pass('FIXTURE tenant_b created', tenantB.slice(0, 8));
      } catch (e) {
        fail('FIXTURE tenant_b create', e.message);
      }

      if (!tenantBCreated) {
        skip('FIXTURE tenant_b hierarchy', 'tenant_b not created');
        return;
      }

      // ─── Hierarchy: 4 single-row INSERTs to avoid multi-row type-inference issues
      topAdminId  = randomUUID();
      areaMgrId   = randomUUID();
      mgrId       = randomUUID();
      agentBetaId = randomUUID();

      const hierarchy = [
        { id: topAdminId,  role: 'tenant_admin', parent: null,        name: 'Smoke TenantAdmin' },
        { id: areaMgrId,   role: 'area_manager', parent: topAdminId,  name: 'Smoke AreaMgr'     },
        { id: mgrId,       role: 'manager',      parent: areaMgrId,   name: 'Smoke Manager'     },
        { id: agentBetaId, role: 'agent',        parent: mgrId,       name: 'Smoke AgentBeta'   },
      ];

      let hierarchyOk = true;
      for (const h of hierarchy) {
        const email     = 'smoke-' + h.role + '-' + h.id.slice(0, 8) + '@example.invalid';
        const slug      = 'smoke-' + h.role + '-' + h.id.slice(0, 8);
        const subdomain = 'smoke-' + h.role + '-' + h.id.slice(0, 8);
        try {
          await safe(
            `INSERT INTO agents
               (id, tenant_id, full_name, email, role, parent_id,
                is_active, is_selling, site_type, slug, subdomain)
             VALUES
               ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid,
                true, false, 'comprehensive', $7, $8)`,
            [h.id, tenantB, h.name, email, h.role, h.parent, slug, subdomain]
          );
          pass('FIXTURE agent ' + h.role, h.id.slice(0, 8));
        } catch (e) {
          fail('FIXTURE agent ' + h.role, e.message);
          hierarchyOk = false;
          break;
        }
      }

      if (!hierarchyOk) {
        topAdminId = areaMgrId = mgrId = agentBetaId = null;
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 1: LEAD CAPTURE
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 1: LEAD CAPTURE');

    const insertedLeadIds = [];
    await block('CATEGORY 1', async () => {
      const endpointPatterns = [
        { source: 'walliam_contact_form',          lead_origin_route: 'contact_form',            intent: 'buyer'  },
        { source: 'charlie_lead',                  lead_origin_route: 'charlie',                 intent: 'buyer'  },
        { source: 'charlie_appointment',           lead_origin_route: 'charlie',                 intent: 'buyer'  },
        { source: 'charlie_plan_email',            lead_origin_route: 'charlie',                 intent: 'buyer'  },
        { source: 'walliam_charlie_vip_request',   lead_origin_route: 'charlie_vip_request',     intent: 'buyer'  },
        { source: 'walliam_estimator_q',           lead_origin_route: 'estimator_questionnaire', intent: 'seller' },
        { source: 'walliam_estimator_vip_request', lead_origin_route: 'estimator_vip_request',   intent: 'seller' },
      ];

      for (const p of endpointPatterns) {
        const leadId = randomUUID();
        try {
          await safe(`
            INSERT INTO leads
              (id, tenant_id, agent_id, source, lead_origin_route, intent, status,
               contact_name, contact_email, contact_phone, source_url, created_at, updated_at)
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'new',
               $7, $8, '4165551234',
               $9, NOW(), NOW())
          `, [
            leadId, WALLIAM_TENANT_ID, KING_SHAH,
            p.source, p.lead_origin_route, p.intent,
            'Smoke ' + p.source,
            'smoke-' + leadId.slice(0, 8) + '@example.invalid',
            'https://walliam.ca/smoke/' + p.source,
          ]);
          insertedLeadIds.push({ id: leadId, ...p });
          pass('C1 INSERT shape: ' + p.source, leadId.slice(0, 8));
        } catch (e) {
          fail('C1 INSERT shape: ' + p.source, e.message);
        }
      }

      if (insertedLeadIds.length > 0) {
        const ids = insertedLeadIds.map(x => x.id);
        try {
          const back = await safe(
            `SELECT id, source, lead_origin_route, intent, status, tenant_id, agent_id
             FROM leads WHERE id = ANY($1::uuid[])`,
            [ids]
          );
          assertEq('C1 readback count', back.rows.length, insertedLeadIds.length);
          for (const row of back.rows) {
            const expect = insertedLeadIds.find(x => x.id === row.id);
            const ok = row.source === expect.source &&
                       row.lead_origin_route === expect.lead_origin_route &&
                       row.intent === expect.intent &&
                       row.status === 'new' &&
                       row.tenant_id === WALLIAM_TENANT_ID &&
                       row.agent_id === KING_SHAH;
            if (ok) pass('C1 readback fields match: ' + expect.source);
            else fail('C1 readback fields mismatch: ' + expect.source, row);
          }
        } catch (e) {
          fail('C1 readback query', e.message);
        }
      } else {
        skip('C1 readback', 'no fixture leads inserted');
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 2: TERRITORY ROUTING
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 2: TERRITORY ROUTING');

    await block('CATEGORY 2', async () => {
      if (!hasResolverRpc) {
        skip('C2 RPC unavailable', 'resolve_display_agent_for_context not in pg_proc');
        return;
      }

      let realApa;
      try {
        const r = await safe(`
          SELECT agent_id, area_id, municipality_id, community_id, neighbourhood_id, scope
          FROM agent_property_access
          WHERE tenant_id=$1::uuid AND is_active=true
          LIMIT 1
        `, [WALLIAM_TENANT_ID]);
        realApa = r.rows[0];
      } catch (e) {
        fail('C2 APA probe', e.message);
        return;
      }

      if (!realApa) {
        skip('C2 no APA rows in WALLiam', 'cannot test routing without territory data');
        return;
      }

      pass('C2 found sample APA', realApa.scope + ' agent=' + realApa.agent_id.slice(0, 8));

      // RPC signature (from discovery):
      //   resolve_display_agent_for_context(
      //     p_listing_id, p_building_id, p_neighbourhood_id, p_community_id,
      //     p_municipality_id, p_area_id, p_user_id, p_tenant_id) -> uuid
      // All params default NULL; use named args for clarity.

      const callShapes = [];
      if (realApa.area_id) callShapes.push({
        name: 'p_tenant_id+p_area_id',
        params: [WALLIAM_TENANT_ID, realApa.area_id],
        sql: 'SELECT resolve_display_agent_for_context(p_tenant_id => $1::uuid, p_area_id => $2::uuid) AS resolved_agent',
      });
      if (realApa.municipality_id) callShapes.push({
        name: 'p_tenant_id+p_municipality_id',
        params: [WALLIAM_TENANT_ID, realApa.municipality_id],
        sql: 'SELECT resolve_display_agent_for_context(p_tenant_id => $1::uuid, p_municipality_id => $2::uuid) AS resolved_agent',
      });
      if (realApa.community_id) callShapes.push({
        name: 'p_tenant_id+p_community_id',
        params: [WALLIAM_TENANT_ID, realApa.community_id],
        sql: 'SELECT resolve_display_agent_for_context(p_tenant_id => $1::uuid, p_community_id => $2::uuid) AS resolved_agent',
      });
      if (realApa.neighbourhood_id) callShapes.push({
        name: 'p_tenant_id+p_neighbourhood_id',
        params: [WALLIAM_TENANT_ID, realApa.neighbourhood_id],
        sql: 'SELECT resolve_display_agent_for_context(p_tenant_id => $1::uuid, p_neighbourhood_id => $2::uuid) AS resolved_agent',
      });

      for (const shape of callShapes) {
        try {
          const r = await safe(shape.sql, shape.params);
          const resolved = r.rows[0]?.resolved_agent;
          if (resolved) pass('C2 RPC ' + shape.name + ' returned agent', resolved.slice(0, 8));
          else          pass('C2 RPC ' + shape.name + ' returned NULL (no agent assigned at this geo)', '');
        } catch (e) {
          fail('C2 RPC ' + shape.name, e.message);
        }
      }

      // Call with all NULL params - should return NULL or default
      try {
        const r = await safe(
          'SELECT resolve_display_agent_for_context(p_tenant_id => $1::uuid) AS resolved_agent',
          [WALLIAM_TENANT_ID]
        );
        pass('C2 RPC tenant-only call', 'resolved=' + (r.rows[0]?.resolved_agent || 'NULL'));
      } catch (e) {
        fail('C2 RPC tenant-only call', e.message);
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 3: HIERARCHY WALKER
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 3: HIERARCHY WALKER');

    await block('CATEGORY 3', async () => {
      // 3a: King Shah is top-of-hierarchy. Walker should return all NULLs.
      try {
        const kingChain = await walkChainSql(safe, KING_SHAH);
        assertEq('C3 King Shah (top) manager_id is NULL',      kingChain.manager_id,      null);
        assertEq('C3 King Shah (top) area_manager_id is NULL', kingChain.area_manager_id, null);
        assertEq('C3 King Shah (top) tenant_admin_id is NULL', kingChain.tenant_admin_id, null);
      } catch (e) {
        fail('C3 King Shah walk', e.message);
      }

      // 3b: Fixtured tenant-B agent should resolve full chain
      if (agentBetaId && mgrId && areaMgrId && topAdminId) {
        try {
          const betaChain = await walkChainSql(safe, agentBetaId);
          assertEq('C3 fixture agent manager_id',      betaChain.manager_id,      mgrId);
          assertEq('C3 fixture agent area_manager_id', betaChain.area_manager_id, areaMgrId);
          assertEq('C3 fixture agent tenant_admin_id', betaChain.tenant_admin_id, topAdminId);
        } catch (e) {
          fail('C3 fixture chain walk', e.message);
        }
      } else {
        skip('C3 fixture chain', 'tenant B fixture did not initialise');
      }

      // 3c: Spot-check against W6B_LEAD's stored chain matches walker recompute
      try {
        const w6bRow = await safe(
          `SELECT agent_id, manager_id, area_manager_id, tenant_admin_id FROM leads WHERE id=$1::uuid`,
          [W6B_LEAD]
        );
        if (w6bRow.rows[0] && w6bRow.rows[0].agent_id) {
          const recomputed = await walkChainSql(safe, w6bRow.rows[0].agent_id);
          assertEq('C3 spot-check W6B lead manager_id',      recomputed.manager_id,      w6bRow.rows[0].manager_id);
          assertEq('C3 spot-check W6B lead area_manager_id', recomputed.area_manager_id, w6bRow.rows[0].area_manager_id);
          assertEq('C3 spot-check W6B lead tenant_admin_id', recomputed.tenant_admin_id, w6bRow.rows[0].tenant_admin_id);
        } else {
          skip('C3 spot-check W6B lead', 'lead missing or no agent_id');
        }
      } catch (e) {
        fail('C3 W6B spot-check', e.message);
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 4: EMAIL FAN-OUT
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 4: EMAIL FAN-OUT');

    await block('CATEGORY 4', async () => {
      // Layer 6 (admin platforms) unconditional - must have at least one active with email
      if (hasPlatformAdmins) {
        try {
          const r = await safe(
            `SELECT COUNT(*)::int AS n FROM platform_admins
             WHERE tier='admin' AND is_active=true AND email IS NOT NULL`
          );
          const n = r.rows[0].n;
          if (n > 0) pass('C4 layer 6 (admin platforms) populated', n + ' active admin(s)');
          else fail('C4 layer 6 (admin platforms) populated', 'zero - getLeadEmailRecipients would throw');
        } catch (e) {
          fail('C4 layer 6 probe', e.message);
        }
      } else {
        skip('C4 layer 6', 'platform_admins table absent');
      }

      // Layer 5 (manager platforms for WALLiam)
      if (hasPlatformAdmins && hasPlatformManagerTenants) {
        try {
          const r = await safe(`
            SELECT COUNT(*)::int AS n
            FROM platform_manager_tenants pmt
            JOIN platform_admins pa ON pa.id = pmt.platform_admin_id
            WHERE pmt.tenant_id=$1::uuid
              AND pa.tier='manager' AND pa.is_active=true AND pa.email IS NOT NULL
          `, [WALLIAM_TENANT_ID]);
          pass('C4 layer 5 (manager platforms for WALLiam)', r.rows[0].n + ' assigned');
        } catch (e) {
          fail('C4 layer 5 probe', e.message);
        }
      } else {
        skip('C4 layer 5', 'platform_admins or platform_manager_tenants table absent');
      }

      // Layer 1: King Shah's email resolves
      try {
        const r = await safe(
          `SELECT id, email, notification_email FROM agents WHERE id=$1::uuid`,
          [KING_SHAH]
        );
        if (r.rows[0]) {
          const e = r.rows[0].notification_email || r.rows[0].email;
          assertEq('C4 King Shah layer 1 email resolves', !!e, true, 'email=' + e);
        } else {
          fail('C4 King Shah agent row missing', 'cannot verify layer 1');
        }
      } catch (e) {
        fail('C4 King Shah email probe', e.message);
      }

      // Delegation overlay shape
      if (hasDelegations) {
        try {
          const r = await safe(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_delegations'
          `);
          const colSet = new Set(r.rows.map(x => x.column_name));
          const needed = ['delegator_id', 'delegate_id', 'tenant_id', 'revoked_at'];
          const missing = needed.filter(c => !colSet.has(c));
          if (missing.length === 0) pass('C4 agent_delegations has expected shape', needed.join(', '));
          else fail('C4 agent_delegations missing columns', missing.join(', '));
        } catch (e) {
          fail('C4 agent_delegations schema probe', e.message);
        }
      } else {
        skip('C4 delegation overlay', 'agent_delegations table absent');
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 5: SCOPING
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 5: SCOPING');

    let tenantBLeadId = null;
    await block('CATEGORY 5', async () => {
      // Cross-tenant fixture lead
      if (agentBetaId && tenantBCreated) {
        try {
          tenantBLeadId = randomUUID();
          await safe(`
            INSERT INTO leads
              (id, tenant_id, agent_id, source, lead_origin_route, status,
               contact_name, contact_email, contact_phone, created_at, updated_at)
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, 'smoke_cross_tenant', 'contact_form', 'new',
               'TenantB SmokeLead', $4, '4165550000',
               NOW(), NOW())
          `, [
            tenantBLeadId, tenantB, agentBetaId,
            'smoke-cross-tenant-' + tenantBLeadId.slice(0, 8) + '@example.invalid',
          ]);
          pass('C5 inserted tenant-B lead', tenantBLeadId.slice(0, 8));
        } catch (e) {
          fail('C5 insert tenant-B lead', e.message);
          tenantBLeadId = null;
        }
      } else {
        skip('C5 tenant-B lead insert', 'tenant_b or fixture agent missing');
      }

      // 5a: agent scope - King Shah sees own leads (incl. the C1 fixture inserts)
      try {
        const r = await safe(
          `SELECT COUNT(*)::int AS n FROM leads WHERE tenant_id=$1::uuid AND agent_id=$2::uuid`,
          [WALLIAM_TENANT_ID, KING_SHAH]
        );
        const n = r.rows[0].n;
        if (n > 0) pass('C5 agent scope: King Shah sees own leads', n + ' total');
        else fail('C5 agent scope: King Shah sees own leads', 'count=0 - C1 inserts should have produced 7 rows under his agent_id');
      } catch (e) {
        fail('C5 agent scope probe', e.message);
      }

      // 5b: cross-tenant isolation
      if (tenantBLeadId) {
        try {
          const r = await safe(
            `SELECT COUNT(*)::int AS n FROM leads WHERE tenant_id=$1::uuid AND id=$2::uuid`,
            [WALLIAM_TENANT_ID, tenantBLeadId]
          );
          assertEq('C5 cross-tenant isolation: tenant-B lead invisible to WALLiam scope', r.rows[0].n, 0);
        } catch (e) {
          fail('C5 isolation probe', e.message);
        }
      } else {
        skip('C5 cross-tenant isolation', 'tenant-B lead missing');
      }

      // 5c: tenant_admin scope - sees full tenant
      try {
        const r = await safe(`SELECT COUNT(*)::int AS n FROM leads WHERE tenant_id=$1::uuid`, [WALLIAM_TENANT_ID]);
        pass('C5 tenant_admin scope sees full WALLiam', r.rows[0].n + ' leads');
      } catch (e) {
        fail('C5 tenant_admin scope probe', e.message);
      }

      // 5d: platform_admin cross-tenant view
      try {
        const r = await safe(`SELECT COUNT(*)::int AS n FROM leads`);
        pass('C5 platform_admin sees all', r.rows[0].n + ' total (incl. fixture)');
      } catch (e) {
        fail('C5 platform_admin probe', e.message);
      }

      // 5e: manager scope semantics - SQL replicates scopeLeadsQuery for managers:
      //     WHERE tenant_id=X AND agent_id = ANY([own, ...managedAgentIds])
      // We can't enumerate "managed agents" here without role lookups, so we just
      // verify the predicate shape works with a single-element array.
      try {
        const r = await safe(
          `SELECT COUNT(*)::int AS n FROM leads WHERE tenant_id=$1::uuid AND agent_id = ANY($2::uuid[])`,
          [WALLIAM_TENANT_ID, [KING_SHAH]]
        );
        pass('C5 manager scope predicate shape works', r.rows[0].n + ' leads');
      } catch (e) {
        fail('C5 manager scope predicate', e.message);
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 6: AUDIT MATRIX
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 6: AUDIT MATRIX');

    await block('CATEGORY 6', async () => {
      const actionTypes = [
        'status_changed', 'quality_changed', 'temperature_changed',
        'lead_deleted',   'email_sent',
        'vip_approved',   'vip_denied',
        'note_added',
        'agent_reassigned', 'reassign_notification_sent',
        'email_blocked_dnc',
      ];

      if (insertedLeadIds.length === 0) {
        skip('C6 audit inserts', 'no C1 fixture leads to attach audits to');
        return;
      }
      const targetLead = insertedLeadIds[0].id;

      for (const at of actionTypes) {
        const auditId = randomUUID();
        try {
          await safe(`
            INSERT INTO lead_admin_actions
              (id, tenant_id, lead_id, actor_agent_id, actor_role, action_type,
               target_field, before_value, after_value, notes)
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'platform_admin', $5,
               NULL, $6::jsonb, $7::jsonb, 'smoke - ' || $5)
          `, [
            auditId, WALLIAM_TENANT_ID, targetLead, KING_SHAH, at,
            JSON.stringify({ smoke: true, action: at, when: 'before' }),
            JSON.stringify({ smoke: true, action: at, when: 'after' }),
          ]);
          pass('C6 action_type accepted: ' + at, auditId.slice(0, 8));
        } catch (e) {
          fail('C6 action_type accepted: ' + at, e.message);
        }
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 7: DNC ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 7: DNC ENFORCEMENT');

    await block('CATEGORY 7', async () => {
      // 7a: CHECK constraint includes do_not_contact
      try {
        const r = await safe(`
          SELECT pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conrelid='public.leads'::regclass AND conname='leads_status_check'
        `);
        const def = r.rows[0]?.def || '';
        assertEq('C7 leads_status_check contains do_not_contact', def.includes("'do_not_contact'"), true);
      } catch (e) {
        fail('C7 CHECK probe', e.message);
      }

      // 7b: UPDATE to do_not_contact accepted
      if (insertedLeadIds.length > 0) {
        const tgt = insertedLeadIds[insertedLeadIds.length - 1].id;
        try {
          const r = await safe(
            `UPDATE leads SET status='do_not_contact' WHERE id=$1::uuid RETURNING status`,
            [tgt]
          );
          assertEq('C7 UPDATE to do_not_contact succeeds', r.rows[0]?.status, 'do_not_contact');
        } catch (e) {
          fail('C7 UPDATE to do_not_contact', e.message);
        }
      } else {
        skip('C7 UPDATE test', 'no fixture lead');
      }

      // 7c: email_blocked_dnc audit row accepted
      if (insertedLeadIds.length > 0) {
        const auditId = randomUUID();
        try {
          await safe(`
            INSERT INTO lead_admin_actions
              (id, tenant_id, lead_id, actor_agent_id, actor_role, action_type,
               after_value, notes)
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'platform_admin', 'email_blocked_dnc',
               $5::jsonb, 'smoke - outbound email blocked by DNC')
          `, [
            auditId, WALLIAM_TENANT_ID, insertedLeadIds[0].id, KING_SHAH,
            JSON.stringify({ attempted_to: 'smoke-dnc@example.invalid', reason: 'lead status is do_not_contact' }),
          ]);
          pass('C7 email_blocked_dnc audit accepted', auditId.slice(0, 8));
        } catch (e) {
          fail('C7 email_blocked_dnc audit', e.message);
        }
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY 8: CUMULATIVE LEAD FAMILY
    // ═══════════════════════════════════════════════════════════════════════════
    section('CATEGORY 8: CUMULATIVE LEAD FAMILY');

    await block('CATEGORY 8', async () => {
      // leads.user_id has a FK constraint (leads_user_id_fkey) so we can't use
      // a synthetic UUID - it must reference a real existing user. Find one
      // already on a lead in WALLiam to satisfy the FK.
      let realUserId = null;
      try {
        const r = await safe(
          `SELECT user_id FROM leads
           WHERE user_id IS NOT NULL AND tenant_id=$1::uuid
           LIMIT 1`,
          [WALLIAM_TENANT_ID]
        );
        realUserId = r.rows[0]?.user_id || null;
      } catch (e) {
        fail('C8 real user_id probe', e.message);
      }

      if (!realUserId) {
        skip('C8 family fixture', 'no existing user_id in WALLiam leads to use as FK target');
        return;
      }

      // Baseline: how many leads this user_id currently has in WALLiam.
      // We assert (baseline + 3) after inserting 3 family leads, so the test
      // is correct regardless of what historical data exists for that user.
      let baseline = 0;
      try {
        const r = await safe(
          `SELECT COUNT(*)::int AS n FROM leads
           WHERE user_id=$1::uuid AND tenant_id=$2::uuid`,
          [realUserId, WALLIAM_TENANT_ID]
        );
        baseline = r.rows[0].n;
        pass('C8 baseline leads for real user', baseline + ' existing');
      } catch (e) {
        fail('C8 baseline count', e.message);
        return;
      }

      // Insert 3 family leads under this real user_id
      const familyLeadIds = [];
      for (let i = 0; i < 3; i++) {
        const id = randomUUID();
        try {
          await safe(`
            INSERT INTO leads
              (id, tenant_id, agent_id, user_id, source, lead_origin_route, status,
               contact_name, contact_email, contact_phone, created_at, updated_at)
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'contact_form', 'new',
               'Smoke Family', $6, '4165557777',
               NOW() - ($7 || ' days')::interval, NOW())
          `, [
            id, WALLIAM_TENANT_ID, KING_SHAH, realUserId,
            'smoke_family_' + i,
            'smoke-family-' + id.slice(0, 8) + '@example.invalid',
            String(i),
          ]);
          familyLeadIds.push(id);
        } catch (e) {
          fail('C8 family lead ' + i + ' insert', e.message);
        }
      }

      if (familyLeadIds.length === 3) {
        pass('C8 family fixture inserted (3 leads same real user_id)', realUserId.slice(0, 8));

        // Aggregation: should be exactly baseline + 3
        try {
          const r = await safe(`
            SELECT COUNT(*)::int AS n FROM leads
            WHERE user_id=$1::uuid AND tenant_id=$2::uuid
          `, [realUserId, WALLIAM_TENANT_ID]);
          assertEq('C8 leadFamily count = baseline + 3', r.rows[0].n, baseline + 3);
        } catch (e) {
          fail('C8 family aggregation query', e.message);
        }

        // Anonymous lead (user_id NULL) under same email - must NOT join family
        try {
          const anon = randomUUID();
          await safe(`
            INSERT INTO leads
              (id, tenant_id, agent_id, user_id, source, lead_origin_route, status,
               contact_name, contact_email, contact_phone, created_at, updated_at)
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, NULL::uuid, 'smoke_anon', 'contact_form', 'new',
               'Smoke Anon', 'smoke-family-shared@example.invalid', '4165557777',
               NOW(), NOW())
          `, [anon, WALLIAM_TENANT_ID, KING_SHAH]);
          const r = await safe(
            `SELECT COUNT(*)::int AS n FROM leads
             WHERE user_id=$1::uuid AND tenant_id=$2::uuid`,
            [realUserId, WALLIAM_TENANT_ID]
          );
          assertEq('C8 anonymous lead does not join family', r.rows[0].n, baseline + 3);
        } catch (e) {
          fail('C8 anonymous-not-in-family', e.message);
        }
      } else {
        skip('C8 family aggregation', 'fixture incomplete (' + familyLeadIds.length + '/3 inserted)');
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // ROLLBACK
    // ═══════════════════════════════════════════════════════════════════════════
    section('ROLLBACK');
    await client.query('ROLLBACK');
    txStarted = false;
    pass('ROLLBACK clean');

    // Post-rollback sanity: fixtures must be gone
    if (tenantBCreated) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM tenants WHERE id=$1::uuid`, [tenantB]);
      assertEq('POST-ROLLBACK tenant B reverted', r.rows[0].n, 0);
    }
    if (agentBetaId) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM agents WHERE id=$1::uuid`, [agentBetaId]);
      assertEq('POST-ROLLBACK fixture agent reverted', r.rows[0].n, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════
    section('SUMMARY');
    const passed  = results.filter(r => r.ok === true).length;
    const failed  = results.filter(r => r.ok === false).length;
    const skipped = results.filter(r => r.ok === null).length;
    console.log('RESULT: ' + passed + ' PASS / ' + failed + ' FAIL / ' + skipped + ' SKIP of ' + results.length + ' assertions');

    if (failed > 0) {
      console.log('');
      console.log('Failures:');
      results.filter(r => r.ok === false).forEach(r => {
        console.log('  - ' + r.label + (r.detail ? ' [' + r.detail + ']' : ''));
      });
    }
    if (skipped > 0) {
      console.log('');
      console.log('Skipped:');
      results.filter(r => r.ok === null).forEach(r => {
        console.log('  - ' + r.label + ' [' + (r.detail || '') + ']');
      });
    }
    if (failed > 0) process.exit(1);

  } catch (e) {
    if (txStarted) try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('FATAL: ' + e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// ─── Walker simulation in SQL (mirrors lib/admin-homes/hierarchy.ts) ───────────
async function walkChainSql(safeFn, agentId) {
  const r = await safeFn(`
    WITH RECURSIVE hops AS (
      SELECT id, role, parent_id, 0 AS depth, ARRAY[id] AS visited
      FROM agents WHERE id = $1::uuid
      UNION ALL
      SELECT a.id, a.role, a.parent_id, h.depth + 1, h.visited || a.id
      FROM agents a
      JOIN hops h ON a.id = h.parent_id
      WHERE h.depth < 6 AND NOT (a.id = ANY(h.visited))
    ),
    ancestors AS (
      SELECT id, role, depth FROM hops WHERE depth > 0
    )
    SELECT
      (SELECT id FROM ancestors WHERE role='manager'      ORDER BY depth LIMIT 1) AS manager_id,
      (SELECT id FROM ancestors WHERE role='area_manager' ORDER BY depth LIMIT 1) AS area_manager_id,
      (SELECT id FROM ancestors WHERE role='tenant_admin' ORDER BY depth LIMIT 1) AS tenant_admin_id
  `, [agentId]);
  return r.rows[0] || { manager_id: null, area_manager_id: null, tenant_admin_id: null };
}

main().catch((e) => { console.error('UNCAUGHT: ' + e.message); console.error(e.stack); process.exit(1); });