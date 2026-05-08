// scripts/r-territory-t4a-1-smoke.js
//
// Code-test for the v13 migration (F-APA-PRIMARY-AUDIT-GAP fix) and the
// auto-reassign pattern T4a-1 relies on.
//
// All assertions run in a single transaction. ROLLBACK at the end means
// production data is never touched. Each test is isolated via SAVEPOINT
// + ROLLBACK TO SAVEPOINT so tests don't drift.
//
// Test matrix:
//   T1. is_primary off→on on active row → exactly 1 audit row, change_type='primary_set'
//   T2. is_primary on→off on active row → exactly 1 audit row, change_type='primary_unset'
//   T3. condo_access flip on active row → exactly 1 audit row, change_type='access_toggle_changed'
//   T4. buildings_mode change on active row → exactly 1 audit row, change_type='access_toggle_changed'
//   T5. Combined is_primary + condo_access in one UPDATE → exactly 2 audit rows
//       (primary_set/unset + access_toggle_changed)
//   T6. No-op UPDATE (same values) → 0 audit rows (early-return preserved)
//   T7. is_active flip true→false on active row → exactly 1 audit row, change_type='assignment_revoked'
//       (v11 routing-affecting path still works; verifies no regression)
//   T8. Inactive row is_primary flip → 0 audit rows (trigger early-skips inactive)
//   T9. Auto-reassign pattern: existing primary row + UPDATE simulating route's
//       auto-reassign for a different agent → existing row gets primary_unset
//
// Pre-req: F-APA-PRIMARY-AUDIT-GAP fix already applied to production (v13 migration).
// Without it, T1/T2/T3/T4/T5 will FAIL.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

const envPaths = ['.env', '.env.local', '.env.production'];
for (const p of envPaths) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL not found in env.');
  process.exit(1);
}

function makeAssertion(label) {
  return {
    label,
    pass: function (cond, detail) {
      this.passed = !!cond;
      this.detail = detail;
      return this.passed;
    },
    passed: null,
    detail: null
  };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let host = 'unknown';
  try { host = new URL(DATABASE_URL).host; } catch (e) {}
  console.log('Connected to: ' + host);

  await client.query('BEGIN');

  const results = [];

  try {
    await client.query("SET LOCAL statement_timeout = '60s'");

    // ===== Setup =====
    console.log('\n--- Setup ---');

    const setup = await client.query(
      "SELECT id, agent_id, tenant_id, scope, community_id, is_primary, condo_access, " +
      "buildings_mode, is_active " +
      "FROM agent_property_access " +
      "WHERE is_active = true AND scope = 'community' AND community_id IS NOT NULL " +
      "ORDER BY created_at DESC LIMIT 1"
    );
    if (!setup.rows.length) {
      throw new Error('No active community-scope apa row found for testing. Cannot run smoke.');
    }
    const row = setup.rows[0];
    console.log('Test target apa row:');
    console.log('  id:           ' + row.id);
    console.log('  agent_id:     ' + row.agent_id);
    console.log('  tenant_id:    ' + row.tenant_id);
    console.log('  scope:        ' + row.scope);
    console.log('  community_id: ' + row.community_id);
    console.log('  is_primary:   ' + row.is_primary);
    console.log('  condo_access: ' + row.condo_access);
    console.log('  is_active:    ' + row.is_active);

    // Helper: count audit rows for this row's (agent, scope, scope_id) since transaction start
    async function countNewAudits(client, scope, scopeId, agentId) {
      // Use the txid timing: audit rows inserted in THIS transaction
      // We compare against a SAVEPOINT-anchored baseline by counting after each test
      // and subtracting.
      const r = await client.query(
        "SELECT change_type, before_state->>'is_primary' AS before_primary, " +
        "after_state->>'is_primary' AS after_primary, " +
        "before_state->>'condo_access' AS before_condo, " +
        "after_state->>'condo_access' AS after_condo, " +
        "changed_at " +
        "FROM territory_assignment_changes " +
        "WHERE scope = $1 AND scope_id = $2 AND agent_id = $3 " +
        "ORDER BY changed_at DESC, ctid DESC LIMIT 20",
        [scope, scopeId, agentId]
      );
      return r.rows;
    }

    async function getBaselineAuditCount(client, scope, scopeId, agentId) {
      const r = await client.query(
        "SELECT count(*)::int AS n FROM territory_assignment_changes WHERE scope = $1 AND scope_id = $2 AND agent_id = $3",
        [scope, scopeId, agentId]
      );
      return r.rows[0].n;
    }

    const baseline = await getBaselineAuditCount(client, row.scope, row.community_id, row.agent_id);
    console.log('Baseline audit rows for this (agent, scope, scope_id): ' + baseline);

    // Test pattern: setup state inside a savepoint -> snapshot audit count ->
    // perform action -> count delta -> read latest N audit rows -> assert ->
    // rollback to savepoint so subsequent tests start from a clean baseline.

    async function snapshotAuditCount() {
      const r = await client.query("SELECT count(*)::int AS n FROM territory_assignment_changes");
      return r.rows[0].n;
    }

    async function readLatestAudits(client, n) {
      const r = await client.query(
        "SELECT change_type, agent_id, scope, scope_id, " +
        "before_state->>'is_primary' AS before_primary, " +
        "after_state->>'is_primary' AS after_primary, " +
        "before_state->>'condo_access' AS before_condo, " +
        "after_state->>'condo_access' AS after_condo " +
        "FROM territory_assignment_changes " +
        "ORDER BY changed_at DESC, ctid DESC LIMIT " + n
      );
      return r.rows;
    }

    async function isolatedTest(label, setup, action, assert) {
      const sp = 'sp_' + label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      await client.query('SAVEPOINT ' + sp);
      try {
        if (setup) await setup();
        const before = await snapshotAuditCount();
        await action();
        const after = await snapshotAuditCount();
        const delta = after - before;
        const latest = delta > 0 ? await readLatestAudits(client, delta) : [];
        const a = makeAssertion(label);
        const ok = assert(delta, latest);
        a.passed = ok.pass;
        a.detail = ok.detail;
        results.push(a);
        await client.query('ROLLBACK TO SAVEPOINT ' + sp);
      } catch (err) {
        const a = makeAssertion(label);
        a.passed = false;
        a.detail = 'EXCEPTION: ' + err.message;
        results.push(a);
        try { await client.query('ROLLBACK TO SAVEPOINT ' + sp); } catch (e) {}
      }
    }

    // ===== T1: is_primary off→on =====
    await isolatedTest(
      'T1: is_primary off->on -> primary_set audit',
      async function () {
        // Force is_primary=false as the starting state for this test
        await client.query('UPDATE agent_property_access SET is_primary = false WHERE id = $1', [row.id]);
      },
      async function () {
        await client.query('UPDATE agent_property_access SET is_primary = true WHERE id = $1', [row.id]);
      },
      function (delta, latest) {
        if (delta !== 1) return { pass: false, detail: 'expected delta=1, got delta=' + delta };
        if (latest[0].change_type !== 'primary_set') return { pass: false, detail: 'expected primary_set, got ' + latest[0].change_type };
        return { pass: true, detail: 'delta=1, change_type=primary_set' };
      }
    );

    // ===== T2: is_primary on→off =====
    await isolatedTest(
      'T2: is_primary on->off -> primary_unset audit',
      async function () {
        await client.query('UPDATE agent_property_access SET is_primary = true WHERE id = $1', [row.id]);
      },
      async function () {
        await client.query('UPDATE agent_property_access SET is_primary = false WHERE id = $1', [row.id]);
      },
      function (delta, latest) {
        if (delta !== 1) return { pass: false, detail: 'expected delta=1, got delta=' + delta };
        if (latest[0].change_type !== 'primary_unset') return { pass: false, detail: 'expected primary_unset, got ' + latest[0].change_type };
        return { pass: true, detail: 'delta=1, change_type=primary_unset' };
      }
    );

    // ===== T3: condo_access flip =====
    await isolatedTest(
      'T3: condo_access flip -> access_toggle_changed audit',
      null,
      async function () {
        await client.query('UPDATE agent_property_access SET condo_access = NOT condo_access WHERE id = $1', [row.id]);
      },
      function (delta, latest) {
        if (delta !== 1) return { pass: false, detail: 'expected delta=1, got delta=' + delta };
        if (latest[0].change_type !== 'access_toggle_changed') return { pass: false, detail: 'expected access_toggle_changed, got ' + latest[0].change_type };
        return { pass: true, detail: 'delta=1, change_type=access_toggle_changed' };
      }
    );

    // ===== T4: buildings_mode change =====
    await isolatedTest(
      'T4: buildings_mode change -> access_toggle_changed audit',
      async function () {
        // Force a known value first
        await client.query("UPDATE agent_property_access SET buildings_mode = 'all' WHERE id = $1", [row.id]);
      },
      async function () {
        await client.query("UPDATE agent_property_access SET buildings_mode = 'selected' WHERE id = $1", [row.id]);
      },
      function (delta, latest) {
        if (delta !== 1) return { pass: false, detail: 'expected delta=1, got delta=' + delta };
        if (latest[0].change_type !== 'access_toggle_changed') return { pass: false, detail: 'expected access_toggle_changed, got ' + latest[0].change_type };
        return { pass: true, detail: 'delta=1, change_type=access_toggle_changed' };
      }
    );

    // ===== T5: combined is_primary + condo_access =====
    await isolatedTest(
      'T5: combined is_primary + condo_access -> 2 audits',
      async function () {
        await client.query('UPDATE agent_property_access SET is_primary = false, condo_access = true WHERE id = $1', [row.id]);
      },
      async function () {
        await client.query('UPDATE agent_property_access SET is_primary = true, condo_access = false WHERE id = $1', [row.id]);
      },
      function (delta, latest) {
        if (delta !== 2) return { pass: false, detail: 'expected delta=2, got delta=' + delta };
        const types = latest.map(function (r) { return r.change_type; }).sort();
        const expected = ['access_toggle_changed', 'primary_set'];
        if (JSON.stringify(types) !== JSON.stringify(expected)) {
          return { pass: false, detail: 'expected types=' + JSON.stringify(expected) + ', got=' + JSON.stringify(types) };
        }
        return { pass: true, detail: 'delta=2, types=[access_toggle_changed, primary_set]' };
      }
    );

    // ===== T6: no-op UPDATE =====
    await isolatedTest(
      'T6: no-op UPDATE -> 0 audits (early-return preserved)',
      async function () {
        // Snapshot current row state, then UPDATE with same values
      },
      async function () {
        const cur = (await client.query('SELECT is_primary, condo_access, homes_access, buildings_access, buildings_mode FROM agent_property_access WHERE id = $1', [row.id])).rows[0];
        await client.query(
          'UPDATE agent_property_access SET is_primary = $1, condo_access = $2, homes_access = $3, buildings_access = $4, buildings_mode = $5 WHERE id = $6',
          [cur.is_primary, cur.condo_access, cur.homes_access, cur.buildings_access, cur.buildings_mode, row.id]
        );
      },
      function (delta, latest) {
        if (delta !== 0) return { pass: false, detail: 'expected delta=0, got delta=' + delta + ' (early-return failed)' };
        return { pass: true, detail: 'delta=0 (early-return preserved)' };
      }
    );

    // ===== T7: is_active flip true→false (v11 path) =====
    await isolatedTest(
      'T7: is_active true->false -> assignment_revoked (v11 path)',
      async function () {
        await client.query('UPDATE agent_property_access SET is_active = true WHERE id = $1', [row.id]);
      },
      async function () {
        await client.query('UPDATE agent_property_access SET is_active = false WHERE id = $1', [row.id]);
      },
      function (delta, latest) {
        if (delta !== 1) return { pass: false, detail: 'expected delta=1, got delta=' + delta };
        if (latest[0].change_type !== 'assignment_revoked') return { pass: false, detail: 'expected assignment_revoked, got ' + latest[0].change_type };
        return { pass: true, detail: 'delta=1, change_type=assignment_revoked (v11 preserved)' };
      }
    );

    // ===== T8: inactive row is_primary flip =====
    await isolatedTest(
      'T8: inactive row is_primary flip -> 0 audits (early-skip on inactive)',
      async function () {
        await client.query('UPDATE agent_property_access SET is_active = false, is_primary = false WHERE id = $1', [row.id]);
      },
      async function () {
        await client.query('UPDATE agent_property_access SET is_primary = true WHERE id = $1', [row.id]);
      },
      function (delta, latest) {
        if (delta !== 0) return { pass: false, detail: 'expected delta=0 (inactive row no audit), got delta=' + delta };
        return { pass: true, detail: 'delta=0 (inactive row correctly skipped)' };
      }
    );

    // ===== T9: auto-reassign pattern =====
    // Simulate the route's auto-reassign UPDATE: when a different agent (or no-op self)
    // claims primary at the same (scope, scope_id), the existing primary holder loses
    // is_primary. Verify primary_unset audit fires.
    await isolatedTest(
      'T9: auto-reassign UPDATE -> primary_unset on existing holder',
      async function () {
        // Set is_primary=true on the test row (the "existing holder" for this scope_id)
        await client.query('UPDATE agent_property_access SET is_primary = true, is_active = true WHERE id = $1', [row.id]);
      },
      async function () {
        // Simulate the route's auto-reassign UPDATE: unset primary for OTHER agents at same scope.
        // Since the test target IS the existing holder, we exclude its agent_id (mimicking the
        // route's .neq('agent_id', params.id) where params.id is a different agent).
        // To make this test mirror real auto-reassign behavior, treat the test row's agent
        // as the "displaced" one and use a different agent_id in the .neq filter.
        // Simplest: pick any other agent_id distinct from row.agent_id, run the UPDATE,
        // and expect the test row gets unset.
        const otherAgent = (await client.query(
          'SELECT id FROM agents WHERE id != $1 LIMIT 1',
          [row.agent_id]
        )).rows[0];
        if (!otherAgent) throw new Error('No other agent available for auto-reassign test');
        await client.query(
          "UPDATE agent_property_access SET is_primary = false " +
          "WHERE scope = $1 AND community_id = $2 AND is_active = true AND is_primary = true " +
          "AND tenant_id = $3 AND agent_id != $4",
          [row.scope, row.community_id, row.tenant_id, otherAgent.id]
        );
      },
      function (delta, latest) {
        if (delta < 1) return { pass: false, detail: 'expected delta>=1, got delta=' + delta };
        const hasPrimaryUnset = latest.some(function (r) { return r.change_type === 'primary_unset'; });
        if (!hasPrimaryUnset) return { pass: false, detail: 'expected at least one primary_unset audit, got types=' + latest.map(function (r) { return r.change_type; }).join(',') };
        return { pass: true, detail: 'delta=' + delta + ', includes primary_unset (auto-reassign verified)' };
      }
    );

  } finally {
    await client.query('ROLLBACK');
  }

  await client.end();

  // ===== Report =====
  console.log('\n=== Smoke results ===');
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const tag = r.passed ? 'PASS' : 'FAIL';
    console.log('  ' + tag + ': ' + r.label + ' — ' + (r.detail || ''));
    if (r.passed) pass++; else fail++;
  }
  console.log('\nTotal: pass=' + pass + ' fail=' + fail + ' total=' + results.length);
  console.log('\n(Production data ROLLED BACK — no rows committed.)');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(function (err) {
  console.error('UNEXPECTED FAIL: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});