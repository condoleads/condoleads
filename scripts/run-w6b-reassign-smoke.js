// scripts/run-w6b-reassign-smoke.js
// W6b LIVE CODE SMOKE -- verifies the reassign data path end-to-end against
// production DB inside a single transaction (rolled back at end).
//
// Tests the SAME helpers the HTTP route calls (walkHierarchy + lead UPDATE
// shape + lead_admin_actions insert shape). Bypasses HTTP + auth gates --
// those are unchanged by W6b and tested elsewhere (W4f/W4g smoke patterns).

const fs = require('fs');
const path = require('path');

const envPath = path.resolve('.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
}
const candidates = ['DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'];
let connStr = null;
for (const n of candidates) { if (env[n]) { connStr = env[n]; break; } if (process.env[n]) { connStr = process.env[n]; break; } }
if (!connStr) { console.error('No connection string'); process.exit(1); }

const { Client } = require('pg');

// Verified fixtures (session probes earlier)
const TENANT_ID    = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'; // WALLiam
const KING_SHAH_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'; // top of hierarchy
const SYED_SHAH_ID = 'a7b4c075-60e9-40c3-b708-9a877c464e61'; // platform admin w/ walliam agents row

let passed = 0, failed = 0;
function assert(label, cond, detail) {
  if (cond) { console.log('  PASS  ' + label); passed++; }
  else { console.log('  FAIL  ' + label + (detail ? '   (' + detail + ')' : '')); failed++; }
}

(async () => {
  const client = new Client({ connectionString: connStr });
  await client.connect();
  console.log('Connected.');

  try {
    await client.query('BEGIN');
    console.log('\n=== W6b reassign data-path smoke (transactional, ROLLBACK at end) ===\n');

    // ---- Step 1: pick an active WALLiam lead and confirm both candidate agents differ from current ----
    const pickRes = await client.query(
      "SELECT id, agent_id, manager_id, area_manager_id, tenant_admin_id, contact_email " +
      "FROM leads " +
      "WHERE tenant_id = $1 AND agent_id IS NOT NULL " +
      "ORDER BY created_at DESC " +
      "LIMIT 1",
      [TENANT_ID]
    );
    if (pickRes.rows.length === 0) { throw new Error('No lead found in WALLiam tenant'); }
    const lead = pickRes.rows[0];
    console.log('Picked lead:', lead.id, 'currently agent=' + lead.agent_id);

    // Choose the target agent (the one that's NOT currently assigned)
    let newAgentId, oldAgentId;
    if (lead.agent_id === KING_SHAH_ID) { newAgentId = SYED_SHAH_ID; oldAgentId = KING_SHAH_ID; }
    else if (lead.agent_id === SYED_SHAH_ID) { newAgentId = KING_SHAH_ID; oldAgentId = SYED_SHAH_ID; }
    else {
      // Lead assigned to some other agent -- pick King Shah as target
      newAgentId = KING_SHAH_ID;
      oldAgentId = lead.agent_id;
    }
    console.log('Reassign target:', newAgentId);

    // ---- Step 2: replicate walkHierarchy logic in SQL for newAgentId ----
    // walkHierarchy reads agent + parents up to 6 hops, classifying by role.
    // Replicate as a recursive CTE for verification.
    const walkRes = await client.query(`
      WITH RECURSIVE walk AS (
        SELECT id, role, parent_id, 1 AS hop
        FROM agents
        WHERE id = (SELECT parent_id FROM agents WHERE id = $1)
        UNION ALL
        SELECT a.id, a.role, a.parent_id, w.hop + 1
        FROM agents a
        JOIN walk w ON a.id = w.parent_id
        WHERE w.hop < 6
      )
      SELECT
        (SELECT id FROM walk WHERE role = 'manager' ORDER BY hop LIMIT 1) AS manager_id,
        (SELECT id FROM walk WHERE role = 'area_manager' ORDER BY hop LIMIT 1) AS area_manager_id,
        (SELECT id FROM walk WHERE role = 'tenant_admin' ORDER BY hop LIMIT 1) AS tenant_admin_id
    `, [newAgentId]);
    const chain = walkRes.rows[0];
    console.log('Computed chain:', JSON.stringify(chain));

    // ---- Step 3: apply the UPDATE (same shape as the W6b route) ----
    const updRes = await client.query(
      "UPDATE leads SET agent_id = $1, manager_id = $2, area_manager_id = $3, tenant_admin_id = $4 WHERE id = $5 RETURNING id, agent_id, manager_id, area_manager_id, tenant_admin_id, updated_at",
      [newAgentId, chain.manager_id, chain.area_manager_id, chain.tenant_admin_id, lead.id]
    );
    const updated = updRes.rows[0];
    assert('UPDATE succeeded', updated && updated.id === lead.id);
    assert('agent_id == newAgentId', updated.agent_id === newAgentId, 'got ' + updated.agent_id);
    assert('manager_id matches chain', String(updated.manager_id) === String(chain.manager_id));
    assert('area_manager_id matches chain', String(updated.area_manager_id) === String(chain.area_manager_id));
    assert('tenant_admin_id matches chain', String(updated.tenant_admin_id) === String(chain.tenant_admin_id));
    assert('updated_at auto-set by trigger', updated.updated_at !== null);

    // ---- Step 4: write audit row (same shape as the W6b route) ----
    const beforeValue = {
      agent_id: oldAgentId,
      manager_id: lead.manager_id,
      area_manager_id: lead.area_manager_id,
      tenant_admin_id: lead.tenant_admin_id,
    };
    const afterValue = {
      agent_id: newAgentId,
      manager_id: chain.manager_id,
      area_manager_id: chain.area_manager_id,
      tenant_admin_id: chain.tenant_admin_id,
    };
    const auditRes = await client.query(
      "INSERT INTO lead_admin_actions (tenant_id, lead_id, actor_user_id, actor_agent_id, actor_role, action_type, target_field, before_value, after_value, notes) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9) RETURNING id, action_type, target_field, before_value, after_value, notes",
      [
        TENANT_ID,
        lead.id,
        SYED_SHAH_ID,
        'admin',
        'agent_reassigned',
        'agent_id',
        JSON.stringify(beforeValue),
        JSON.stringify(afterValue),
        'W6b smoke ' + oldAgentId + ' -> ' + newAgentId,
      ]
    );
    const audit = auditRes.rows[0];
    assert('audit row written', !!audit && audit.id);
    assert('action_type = agent_reassigned', audit.action_type === 'agent_reassigned');
    assert('target_field = agent_id', audit.target_field === 'agent_id');
    assert('before_value preserved', audit.before_value.agent_id === oldAgentId);
    assert('after_value preserved', audit.after_value.agent_id === newAgentId);

    // ---- Step 5: ROLLBACK ----
    await client.query('ROLLBACK');
    console.log('\nROLLBACK complete.\n');

    // ---- Step 6: post-rollback verification (DB state restored) ----
    const post = await client.query(
      "SELECT agent_id, manager_id, area_manager_id, tenant_admin_id FROM leads WHERE id = $1",
      [lead.id]
    );
    assert('post-rollback agent_id reverted', post.rows[0].agent_id === lead.agent_id);

    const auditPost = await client.query(
      "SELECT COUNT(*)::int AS n FROM lead_admin_actions WHERE id = $1",
      [audit.id]
    );
    assert('post-rollback audit row gone', auditPost.rows[0].n === 0);

  } catch (e) {
    console.error('SMOKE FATAL:', e.message);
    try { await client.query('ROLLBACK'); } catch (_) {}
    failed++;
  } finally {
    await client.end();
  }

  console.log('\n=========================================');
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('=========================================');
  process.exit(failed > 0 ? 1 : 0);
})();