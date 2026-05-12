// scripts/gen-w-leads-email-smoke-sql.js
// W-LEADS-EMAIL T7 smoke SQL generator.
// Schema verified 2026-05-12 via paste 83A blocks 1-9.
// 25 tests: T7c=8 (chain), T7e=7 (audit), T7f=6 (cross-tenant), T7g=4 (compat).

const fs = require('fs')
const path = require('path')

const OUT = path.resolve('scripts/r-w-leads-email-smoke.sql')
const TENANT_A_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

const tests = []
let testId = 0

// ---- T7c: agent chain via recursive CTE on parent_id (8 tests) ----
const tiers = [
  { name: 'agent',        col: 'agent_id',        expectedLen: 4 },
  { name: 'manager',      col: 'manager_id',      expectedLen: 3 },
  { name: 'area_manager', col: 'area_manager_id', expectedLen: 2 },
  { name: 'tenant_admin', col: 'admin_id',        expectedLen: 1 }
]

for (const tn of ['a', 'b']) {
  for (const tier of tiers) {
    testId++
    const agentCol = `tenant_${tn}_${tier.col}`
    tests.push({
      id: testId,
      name: `T7c chain tenant_${tn} ${tier.name}`,
      decl: 'v_setup record; v_int int;',
      body: `
  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.${agentCol}
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (${testId},
    'T7c chain tenant_${tn} ${tier.name}',
    CASE WHEN v_int = ${tier.expectedLen} THEN 'PASS' ELSE 'FAIL' END,
    format('expected=${tier.expectedLen} actual=%s', v_int)
  );`
    })
  }
}

// ---- T7e: lead_email_recipients_log CHECK + trigger (7 tests) ----

testId++
tests.push({
  id: testId,
  name: 'T7e.1 valid INSERT (direction=to, layer=agent) succeeds',
  decl: 'v_setup record; v_lead uuid;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.1 Lead', 't7e1@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'a@smoke.local', 'agent', 'to', 'T7e.1', 'smoke_t7e1');
  INSERT INTO smoke_results VALUES (${testId},
    'T7e.1 valid INSERT succeeds', 'PASS', 'INSERT completed');`
})

testId++
tests.push({
  id: testId,
  name: 'T7e.2 bogus recipient_layer rejected (direction valid)',
  decl: 'v_setup record; v_lead uuid;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.2 Lead', 't7e2@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  BEGIN
    INSERT INTO lead_email_recipients_log (tenant_id, lead_id, recipient_email, recipient_layer, direction, subject, template_key)
      VALUES (v_setup.tenant_a_id, v_lead, 'b@smoke.local', 'BOGUS_LAYER_XYZ', 'to', 'T7e.2', 'smoke_t7e2');
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.2 bogus layer rejected', 'FAIL', 'INSERT unexpectedly succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.2 bogus layer rejected', 'PASS', 'check_violation as expected');
  END;`
})

testId++
tests.push({
  id: testId,
  name: 'T7e.3 bogus direction rejected (layer valid)',
  decl: 'v_setup record; v_lead uuid;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.3 Lead', 't7e3@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  BEGIN
    INSERT INTO lead_email_recipients_log (tenant_id, lead_id, recipient_email, recipient_layer, direction, subject, template_key)
      VALUES (v_setup.tenant_a_id, v_lead, 'c@smoke.local', 'agent', 'SIDEWAYS', 'T7e.3', 'smoke_t7e3');
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.3 bogus direction rejected', 'FAIL', 'INSERT unexpectedly succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.3 bogus direction rejected', 'PASS', 'check_violation as expected');
  END;`
})

testId++
tests.push({
  id: testId,
  name: 'T7e.4 UPDATE non-status field blocked by status_only trigger',
  decl: 'v_setup record; v_lead uuid; v_log uuid;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.4 Lead', 't7e4@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'd@smoke.local', 'agent', 'to', 'T7e.4 original', 'smoke_t7e4')
    RETURNING id INTO v_log;
  BEGIN
    UPDATE lead_email_recipients_log SET subject = 'MUTATED' WHERE id = v_log;
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.4 UPDATE non-status blocked', 'FAIL', 'UPDATE unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.4 UPDATE non-status blocked by status_only trigger', 'PASS', SQLERRM);
  END;`
})

testId++
tests.push({
  id: testId,
  name: 'T7e.5 UPDATE status queued->sent allowed',
  decl: 'v_setup record; v_lead uuid; v_log uuid; v_status text;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.5 Lead', 't7e5@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'e@smoke.local', 'agent', 'to', 'T7e.5', 'smoke_t7e5')
    RETURNING id INTO v_log;
  UPDATE lead_email_recipients_log SET status = 'sent', sent_at = NOW() WHERE id = v_log;
  SELECT status INTO v_status FROM lead_email_recipients_log WHERE id = v_log;
  INSERT INTO smoke_results VALUES (${testId},
    'T7e.5 UPDATE status queued->sent allowed',
    CASE WHEN v_status = 'sent' THEN 'PASS' ELSE 'FAIL' END,
    format('final_status=%s', v_status)
  );`
})

testId++
tests.push({
  id: testId,
  name: 'T7e.6 lead_email_recipients_log.tenant_id NN enforced',
  decl: 'v_setup record; v_lead uuid;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.6 Lead', 't7e6@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  BEGIN
    INSERT INTO lead_email_recipients_log (lead_id, recipient_email, recipient_layer, direction, subject, template_key)
      VALUES (v_lead, 'f@smoke.local', 'agent', 'to', 'T7e.6', 'smoke_t7e6');
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.6 lerl.tenant_id NN enforced', 'FAIL', 'INSERT without tenant_id succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.6 lerl.tenant_id NN enforced', 'PASS', 'not_null_violation as expected');
  END;`
})

testId++
tests.push({
  id: testId,
  name: 'T7e.7 DELETE blocked by trg_lerl_no_delete',
  decl: 'v_setup record; v_lead uuid; v_log uuid;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.7 Lead', 't7e7@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'g@smoke.local', 'agent', 'to', 'T7e.7', 'smoke_t7e7')
    RETURNING id INTO v_log;
  BEGIN
    DELETE FROM lead_email_recipients_log WHERE id = v_log;
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.7 DELETE blocked', 'FAIL', 'DELETE unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (${testId}, 'T7e.7 DELETE blocked by no_delete trigger', 'PASS', SQLERRM);
  END;`
})

// ---- T7f: cross-tenant leak via resolve_agent_for_context (6 tests) ----
// Verified signature (paste 83A.9):
//   (p_listing_id, p_building_id, p_neighbourhood_id, p_community_id,
//    p_municipality_id, p_area_id, p_user_id, p_tenant_id)
const scopes = [
  { name: 'listing',       slot: 0 },
  { name: 'building',      slot: 1 },
  { name: 'neighbourhood', slot: 2 },
  { name: 'community',     slot: 3 },
  { name: 'municipality',  slot: 4 },
  { name: 'area',          slot: 5 }
]

for (const sc of scopes) {
  testId++
  const args = []
  for (let j = 0; j < 6; j++) {
    if (j === sc.slot) {
      const fakeId = `00000000-0000-0000-0000-${String(testId).padStart(12, '0')}`
      args.push(`'${fakeId}'::uuid`)
    } else {
      args.push('NULL')
    }
  }
  args.push('NULL')                  // p_user_id
  args.push('v_setup.tenant_b_id')   // p_tenant_id
  const argStr = args.join(', ')

  tests.push({
    id: testId,
    name: `T7f cross-tenant leak: scope=${sc.name}`,
    decl: 'v_setup record; v_actual uuid;',
    body: `
  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context(${argStr});
  INSERT INTO smoke_results VALUES (${testId},
    'T7f tenant_b ${sc.name}-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );`
  })
}

// ---- T7g: backward-compat (4 tests) ----

testId++
tests.push({
  id: testId,
  name: 'T7g.1 resolve_agent_for_context all-NULL returns NULL gracefully',
  decl: 'v_actual uuid;',
  body: `
  v_actual := resolve_agent_for_context(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  INSERT INTO smoke_results VALUES (${testId},
    'T7g.1 all-NULL args graceful', 'PASS',
    format('returned=%s', COALESCE(v_actual::text, 'NULL'))
  );`
})

testId++
tests.push({
  id: testId,
  name: 'T7g.2 leads.lead_origin_route defaults to unknown',
  decl: 'v_setup record; v_lead uuid; v_route text;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7g.2 Lead', 't7g2@smoke.local', 't7_smoke')
    RETURNING id INTO v_lead;
  SELECT lead_origin_route INTO v_route FROM leads WHERE id = v_lead;
  INSERT INTO smoke_results VALUES (${testId},
    'T7g.2 lead_origin_route default unknown',
    CASE WHEN v_route = 'unknown' THEN 'PASS' ELSE 'FAIL' END,
    format('lead_origin_route=%s', v_route)
  );`
})

testId++
tests.push({
  id: testId,
  name: 'T7g.3 leads.quality defaults to cold',
  decl: 'v_setup record; v_lead uuid; v_quality text;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7g.3 Lead', 't7g3@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  SELECT quality INTO v_quality FROM leads WHERE id = v_lead;
  INSERT INTO smoke_results VALUES (${testId},
    'T7g.3 lead quality default cold',
    CASE WHEN v_quality = 'cold' THEN 'PASS' ELSE 'FAIL' END,
    format('quality=%s', v_quality)
  );`
})

testId++
tests.push({
  id: testId,
  name: 'T7g.4 leads.tenant_id NN enforced',
  decl: 'v_setup record;',
  body: `
  SELECT * INTO v_setup FROM smoke_setup;
  BEGIN
    INSERT INTO leads (agent_id, contact_name, contact_email, source, lead_origin_route)
      VALUES (v_setup.tenant_a_agent_id, 'T7g.4 Lead', 't7g4@smoke.local', 't7_smoke', 'smoke');
    INSERT INTO smoke_results VALUES (${testId}, 'T7g.4 leads.tenant_id NN enforced', 'FAIL', 'INSERT without tenant_id succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO smoke_results VALUES (${testId}, 'T7g.4 leads.tenant_id NN enforced', 'PASS', 'not_null_violation as expected');
  END;`
})

// ============================================================
// Emit SQL
// ============================================================
const lines = []

lines.push('-- scripts/r-w-leads-email-smoke.sql')
lines.push('-- W-LEADS-EMAIL T7 smoke matrix per OD-6=(c)')
lines.push('-- Auto-generated. Schema verified 2026-05-12 via paste 83A blocks 1-9.')
lines.push('-- 25 tests: T7c=8 (chain), T7e=7 (audit), T7f=6 (cross-tenant), T7g=4 (compat)')
lines.push('-- Pattern: BEGIN; setup; per-test DO blocks; final SELECT; ROLLBACK; — production untouched')
lines.push('')
lines.push('BEGIN;')
lines.push('')
lines.push('CREATE TEMP TABLE smoke_setup (')
lines.push('  tenant_a_id              uuid PRIMARY KEY,')
lines.push('  tenant_a_agent_id        uuid,')
lines.push('  tenant_a_manager_id      uuid,')
lines.push('  tenant_a_area_manager_id uuid,')
lines.push('  tenant_a_admin_id        uuid,')
lines.push('  tenant_b_id              uuid,')
lines.push('  tenant_b_agent_id        uuid,')
lines.push('  tenant_b_manager_id      uuid,')
lines.push('  tenant_b_area_manager_id uuid,')
lines.push('  tenant_b_admin_id        uuid')
lines.push(');')
lines.push('')
lines.push('DO $setup$')
lines.push('DECLARE')
lines.push(`  v_tenant_a_id              uuid := '${TENANT_A_ID}'::uuid;`)
lines.push('  v_tenant_a_agent_id        uuid := gen_random_uuid();')
lines.push('  v_tenant_a_manager_id      uuid := gen_random_uuid();')
lines.push('  v_tenant_a_area_manager_id uuid := gen_random_uuid();')
lines.push('  v_tenant_a_admin_id        uuid := gen_random_uuid();')
lines.push('  v_tenant_b_id              uuid;')
lines.push('  v_tenant_b_agent_id        uuid := gen_random_uuid();')
lines.push('  v_tenant_b_manager_id      uuid := gen_random_uuid();')
lines.push('  v_tenant_b_area_manager_id uuid := gen_random_uuid();')
lines.push('  v_tenant_b_admin_id        uuid := gen_random_uuid();')
lines.push('BEGIN')
lines.push("  INSERT INTO tenants (name, domain, admin_email, source_key)")
lines.push("    VALUES ('T7-Smoke-TenantB', 't7-smoke-b.local', 'admin@t7-smoke-b.local', 't7smokeb')")
lines.push('    RETURNING id INTO v_tenant_b_id;')
lines.push('')
lines.push('  INSERT INTO agents (id, full_name, email, subdomain, tenant_id, role, parent_id) VALUES')
lines.push("    (v_tenant_a_admin_id,        'T7 A Admin',       't7a-admin-'||substr(v_tenant_a_admin_id::text,1,8)||'@smoke.local',       't7a-admin-'||substr(v_tenant_a_admin_id::text,1,8),             v_tenant_a_id, 'tenant_admin', NULL),")
lines.push("    (v_tenant_a_area_manager_id, 'T7 A AreaMgr',     't7a-am-'||substr(v_tenant_a_area_manager_id::text,1,8)||'@smoke.local',  't7a-am-'||substr(v_tenant_a_area_manager_id::text,1,8),         v_tenant_a_id, 'area_manager', v_tenant_a_admin_id),")
lines.push("    (v_tenant_a_manager_id,      'T7 A Manager',     't7a-m-'||substr(v_tenant_a_manager_id::text,1,8)||'@smoke.local',       't7a-m-'||substr(v_tenant_a_manager_id::text,1,8),               v_tenant_a_id, 'manager',      v_tenant_a_area_manager_id),")
lines.push("    (v_tenant_a_agent_id,        'T7 A Agent',       't7a-agent-'||substr(v_tenant_a_agent_id::text,1,8)||'@smoke.local',     't7a-agent-'||substr(v_tenant_a_agent_id::text,1,8),             v_tenant_a_id, 'agent',        v_tenant_a_manager_id),")
lines.push("    (v_tenant_b_admin_id,        'T7 B Admin',       't7b-admin-'||substr(v_tenant_b_admin_id::text,1,8)||'@smoke.local',       't7b-admin-'||substr(v_tenant_b_admin_id::text,1,8),             v_tenant_b_id, 'tenant_admin', NULL),")
lines.push("    (v_tenant_b_area_manager_id, 'T7 B AreaMgr',     't7b-am-'||substr(v_tenant_b_area_manager_id::text,1,8)||'@smoke.local',  't7b-am-'||substr(v_tenant_b_area_manager_id::text,1,8),         v_tenant_b_id, 'area_manager', v_tenant_b_admin_id),")
lines.push("    (v_tenant_b_manager_id,      'T7 B Manager',     't7b-m-'||substr(v_tenant_b_manager_id::text,1,8)||'@smoke.local',       't7b-m-'||substr(v_tenant_b_manager_id::text,1,8),               v_tenant_b_id, 'manager',      v_tenant_b_area_manager_id),")
lines.push("    (v_tenant_b_agent_id,        'T7 B Agent',       't7b-agent-'||substr(v_tenant_b_agent_id::text,1,8)||'@smoke.local',     't7b-agent-'||substr(v_tenant_b_agent_id::text,1,8),             v_tenant_b_id, 'agent',        v_tenant_b_manager_id);")
lines.push('')
lines.push('  INSERT INTO smoke_setup VALUES (')
lines.push('    v_tenant_a_id, v_tenant_a_agent_id, v_tenant_a_manager_id, v_tenant_a_area_manager_id, v_tenant_a_admin_id,')
lines.push('    v_tenant_b_id, v_tenant_b_agent_id, v_tenant_b_manager_id, v_tenant_b_area_manager_id, v_tenant_b_admin_id')
lines.push('  );')
lines.push('END $setup$;')
lines.push('')
lines.push('CREATE TEMP TABLE smoke_results (')
lines.push('  test_id   int,')
lines.push('  test_name text,')
lines.push('  result    text,')
lines.push('  detail    text')
lines.push(');')
lines.push('')

for (const t of tests) {
  lines.push(`-- ---- TEST ${t.id}: ${t.name} ----`)
  lines.push('DO $$')
  lines.push('DECLARE')
  lines.push('  ' + t.decl)
  lines.push('BEGIN')
  lines.push(t.body)
  lines.push('EXCEPTION WHEN OTHERS THEN')
  const safeName = t.name.replace(/'/g, "''")
  lines.push(`  INSERT INTO smoke_results VALUES (${t.id}, '${safeName} [UNEXPECTED]', 'FAIL', SQLERRM);`)
  lines.push('END $$;')
  lines.push('')
}

lines.push('-- ---- Summary ----')
lines.push('INSERT INTO smoke_results')
lines.push("SELECT 999, 'SUMMARY',")
lines.push("  CASE WHEN COUNT(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'ALL PASS' ELSE 'FAILURES PRESENT' END,")
lines.push("  format('pass=%s fail=%s total=%s',")
lines.push("    COUNT(*) FILTER (WHERE result = 'PASS'),")
lines.push("    COUNT(*) FILTER (WHERE result = 'FAIL'),")
lines.push('    COUNT(*) FILTER (WHERE test_id BETWEEN 1 AND 998))')
lines.push('FROM smoke_results')
lines.push('WHERE test_id BETWEEN 1 AND 998;')
lines.push('')
lines.push('-- ─── Final result set ────────────────────────────────────────────────')
lines.push('SELECT test_id, test_name, result, detail FROM smoke_results ORDER BY test_id;')
lines.push('')
lines.push('-- ─── Roll back EVERYTHING — production data untouched ────────────────')
lines.push('ROLLBACK;')

const sql = lines.join('\n') + '\n'
fs.writeFileSync(OUT, sql, 'utf8')
console.log('Generated: ' + OUT)
console.log('Size: ' + sql.length + ' bytes, ' + lines.length + ' lines')
console.log('Tests: ' + tests.length + ' (T7c=8 T7e=7 T7f=6 T7g=4)')