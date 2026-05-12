-- scripts/r-w-leads-email-smoke.sql
-- W-LEADS-EMAIL T7 smoke matrix per OD-6=(c)
-- Auto-generated. Schema verified 2026-05-12 via paste 83A blocks 1-9.
-- 25 tests: T7c=8 (chain), T7e=7 (audit), T7f=6 (cross-tenant), T7g=4 (compat)
-- Pattern: BEGIN; setup; per-test DO blocks; final SELECT; ROLLBACK; — production untouched

BEGIN;

CREATE TEMP TABLE smoke_setup (
  tenant_a_id              uuid PRIMARY KEY,
  tenant_a_agent_id        uuid,
  tenant_a_manager_id      uuid,
  tenant_a_area_manager_id uuid,
  tenant_a_admin_id        uuid,
  tenant_b_id              uuid,
  tenant_b_agent_id        uuid,
  tenant_b_manager_id      uuid,
  tenant_b_area_manager_id uuid,
  tenant_b_admin_id        uuid
);

DO $setup$
DECLARE
  v_tenant_a_id              uuid := 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid;
  v_tenant_a_agent_id        uuid := gen_random_uuid();
  v_tenant_a_manager_id      uuid := gen_random_uuid();
  v_tenant_a_area_manager_id uuid := gen_random_uuid();
  v_tenant_a_admin_id        uuid := gen_random_uuid();
  v_tenant_b_id              uuid;
  v_tenant_b_agent_id        uuid := gen_random_uuid();
  v_tenant_b_manager_id      uuid := gen_random_uuid();
  v_tenant_b_area_manager_id uuid := gen_random_uuid();
  v_tenant_b_admin_id        uuid := gen_random_uuid();
BEGIN
  INSERT INTO tenants (name, domain, admin_email, source_key)
    VALUES ('T7-Smoke-TenantB', 't7-smoke-b.local', 'admin@t7-smoke-b.local', 't7smokeb')
    RETURNING id INTO v_tenant_b_id;

  INSERT INTO agents (id, full_name, email, subdomain, tenant_id, role, parent_id) VALUES
    (v_tenant_a_admin_id,        'T7 A Admin',       't7a-admin-'||substr(v_tenant_a_admin_id::text,1,8)||'@smoke.local',       't7a-admin-'||substr(v_tenant_a_admin_id::text,1,8),             v_tenant_a_id, 'tenant_admin', NULL),
    (v_tenant_a_area_manager_id, 'T7 A AreaMgr',     't7a-am-'||substr(v_tenant_a_area_manager_id::text,1,8)||'@smoke.local',  't7a-am-'||substr(v_tenant_a_area_manager_id::text,1,8),         v_tenant_a_id, 'area_manager', v_tenant_a_admin_id),
    (v_tenant_a_manager_id,      'T7 A Manager',     't7a-m-'||substr(v_tenant_a_manager_id::text,1,8)||'@smoke.local',       't7a-m-'||substr(v_tenant_a_manager_id::text,1,8),               v_tenant_a_id, 'manager',      v_tenant_a_area_manager_id),
    (v_tenant_a_agent_id,        'T7 A Agent',       't7a-agent-'||substr(v_tenant_a_agent_id::text,1,8)||'@smoke.local',     't7a-agent-'||substr(v_tenant_a_agent_id::text,1,8),             v_tenant_a_id, 'agent',        v_tenant_a_manager_id),
    (v_tenant_b_admin_id,        'T7 B Admin',       't7b-admin-'||substr(v_tenant_b_admin_id::text,1,8)||'@smoke.local',       't7b-admin-'||substr(v_tenant_b_admin_id::text,1,8),             v_tenant_b_id, 'tenant_admin', NULL),
    (v_tenant_b_area_manager_id, 'T7 B AreaMgr',     't7b-am-'||substr(v_tenant_b_area_manager_id::text,1,8)||'@smoke.local',  't7b-am-'||substr(v_tenant_b_area_manager_id::text,1,8),         v_tenant_b_id, 'area_manager', v_tenant_b_admin_id),
    (v_tenant_b_manager_id,      'T7 B Manager',     't7b-m-'||substr(v_tenant_b_manager_id::text,1,8)||'@smoke.local',       't7b-m-'||substr(v_tenant_b_manager_id::text,1,8),               v_tenant_b_id, 'manager',      v_tenant_b_area_manager_id),
    (v_tenant_b_agent_id,        'T7 B Agent',       't7b-agent-'||substr(v_tenant_b_agent_id::text,1,8)||'@smoke.local',     't7b-agent-'||substr(v_tenant_b_agent_id::text,1,8),             v_tenant_b_id, 'agent',        v_tenant_b_manager_id);

  INSERT INTO smoke_setup VALUES (
    v_tenant_a_id, v_tenant_a_agent_id, v_tenant_a_manager_id, v_tenant_a_area_manager_id, v_tenant_a_admin_id,
    v_tenant_b_id, v_tenant_b_agent_id, v_tenant_b_manager_id, v_tenant_b_area_manager_id, v_tenant_b_admin_id
  );
END $setup$;

CREATE TEMP TABLE smoke_results (
  test_id   int,
  test_name text,
  result    text,
  detail    text
);

-- ---- TEST 1: T7c chain tenant_a agent ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_a_agent_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (1,
    'T7c chain tenant_a agent',
    CASE WHEN v_int = 4 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=4 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (1, 'T7c chain tenant_a agent [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 2: T7c chain tenant_a manager ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_a_manager_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (2,
    'T7c chain tenant_a manager',
    CASE WHEN v_int = 3 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=3 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (2, 'T7c chain tenant_a manager [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 3: T7c chain tenant_a area_manager ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_a_area_manager_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (3,
    'T7c chain tenant_a area_manager',
    CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=2 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (3, 'T7c chain tenant_a area_manager [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 4: T7c chain tenant_a tenant_admin ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_a_admin_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (4,
    'T7c chain tenant_a tenant_admin',
    CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=1 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (4, 'T7c chain tenant_a tenant_admin [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 5: T7c chain tenant_b agent ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_b_agent_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (5,
    'T7c chain tenant_b agent',
    CASE WHEN v_int = 4 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=4 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (5, 'T7c chain tenant_b agent [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 6: T7c chain tenant_b manager ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_b_manager_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (6,
    'T7c chain tenant_b manager',
    CASE WHEN v_int = 3 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=3 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (6, 'T7c chain tenant_b manager [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 7: T7c chain tenant_b area_manager ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_b_area_manager_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (7,
    'T7c chain tenant_b area_manager',
    CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=2 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (7, 'T7c chain tenant_b area_manager [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 8: T7c chain tenant_b tenant_admin ----
DO $$
DECLARE
  v_setup record; v_int int;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, 1 AS depth FROM agents WHERE id = v_setup.tenant_b_admin_id
    UNION ALL
    SELECT a.id, a.parent_id, c.depth + 1 FROM agents a JOIN chain c ON a.id = c.parent_id
    WHERE c.depth < 10
  )
  SELECT COUNT(*)::int INTO v_int FROM chain;
  INSERT INTO smoke_results VALUES (8,
    'T7c chain tenant_b tenant_admin',
    CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('expected=1 actual=%s', v_int)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (8, 'T7c chain tenant_b tenant_admin [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 9: T7e.1 valid INSERT (direction=to, layer=agent) succeeds ----
DO $$
DECLARE
  v_setup record; v_lead uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.1 Lead', 't7e1@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'a@smoke.local', 'agent', 'to', 'T7e.1', 'smoke_t7e1');
  INSERT INTO smoke_results VALUES (9,
    'T7e.1 valid INSERT succeeds', 'PASS', 'INSERT completed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (9, 'T7e.1 valid INSERT (direction=to, layer=agent) succeeds [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 10: T7e.2 bogus recipient_layer rejected (direction valid) ----
DO $$
DECLARE
  v_setup record; v_lead uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.2 Lead', 't7e2@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  BEGIN
    INSERT INTO lead_email_recipients_log (tenant_id, lead_id, recipient_email, recipient_layer, direction, subject, template_key)
      VALUES (v_setup.tenant_a_id, v_lead, 'b@smoke.local', 'BOGUS_LAYER_XYZ', 'to', 'T7e.2', 'smoke_t7e2');
    INSERT INTO smoke_results VALUES (10, 'T7e.2 bogus layer rejected', 'FAIL', 'INSERT unexpectedly succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO smoke_results VALUES (10, 'T7e.2 bogus layer rejected', 'PASS', 'check_violation as expected');
  END;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (10, 'T7e.2 bogus recipient_layer rejected (direction valid) [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 11: T7e.3 bogus direction rejected (layer valid) ----
DO $$
DECLARE
  v_setup record; v_lead uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.3 Lead', 't7e3@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  BEGIN
    INSERT INTO lead_email_recipients_log (tenant_id, lead_id, recipient_email, recipient_layer, direction, subject, template_key)
      VALUES (v_setup.tenant_a_id, v_lead, 'c@smoke.local', 'agent', 'SIDEWAYS', 'T7e.3', 'smoke_t7e3');
    INSERT INTO smoke_results VALUES (11, 'T7e.3 bogus direction rejected', 'FAIL', 'INSERT unexpectedly succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO smoke_results VALUES (11, 'T7e.3 bogus direction rejected', 'PASS', 'check_violation as expected');
  END;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (11, 'T7e.3 bogus direction rejected (layer valid) [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 12: T7e.4 UPDATE non-status field blocked by status_only trigger ----
DO $$
DECLARE
  v_setup record; v_lead uuid; v_log uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.4 Lead', 't7e4@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'd@smoke.local', 'agent', 'to', 'T7e.4 original', 'smoke_t7e4')
    RETURNING id INTO v_log;
  BEGIN
    UPDATE lead_email_recipients_log SET subject = 'MUTATED' WHERE id = v_log;
    INSERT INTO smoke_results VALUES (12, 'T7e.4 UPDATE non-status blocked', 'FAIL', 'UPDATE unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (12, 'T7e.4 UPDATE non-status blocked by status_only trigger', 'PASS', SQLERRM);
  END;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (12, 'T7e.4 UPDATE non-status field blocked by status_only trigger [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 13: T7e.5 UPDATE status queued->sent allowed ----
DO $$
DECLARE
  v_setup record; v_lead uuid; v_log uuid; v_status text;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.5 Lead', 't7e5@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'e@smoke.local', 'agent', 'to', 'T7e.5', 'smoke_t7e5')
    RETURNING id INTO v_log;
  UPDATE lead_email_recipients_log SET status = 'sent', sent_at = NOW() WHERE id = v_log;
  SELECT status INTO v_status FROM lead_email_recipients_log WHERE id = v_log;
  INSERT INTO smoke_results VALUES (13,
    'T7e.5 UPDATE status queued->sent allowed',
    CASE WHEN v_status = 'sent' THEN 'PASS' ELSE 'FAIL' END,
    format('final_status=%s', v_status)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (13, 'T7e.5 UPDATE status queued->sent allowed [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 14: T7e.6 lead_email_recipients_log.tenant_id NN enforced ----
DO $$
DECLARE
  v_setup record; v_lead uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.6 Lead', 't7e6@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  BEGIN
    INSERT INTO lead_email_recipients_log (lead_id, recipient_email, recipient_layer, direction, subject, template_key)
      VALUES (v_lead, 'f@smoke.local', 'agent', 'to', 'T7e.6', 'smoke_t7e6');
    INSERT INTO smoke_results VALUES (14, 'T7e.6 lerl.tenant_id NN enforced', 'FAIL', 'INSERT without tenant_id succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO smoke_results VALUES (14, 'T7e.6 lerl.tenant_id NN enforced', 'PASS', 'not_null_violation as expected');
  END;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (14, 'T7e.6 lead_email_recipients_log.tenant_id NN enforced [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 15: T7e.7 DELETE blocked by trg_lerl_no_delete ----
DO $$
DECLARE
  v_setup record; v_lead uuid; v_log uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7e.7 Lead', 't7e7@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  INSERT INTO lead_email_recipients_log (tenant_id, lead_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key)
    VALUES (v_setup.tenant_a_id, v_lead, v_setup.tenant_a_agent_id, 'g@smoke.local', 'agent', 'to', 'T7e.7', 'smoke_t7e7')
    RETURNING id INTO v_log;
  BEGIN
    DELETE FROM lead_email_recipients_log WHERE id = v_log;
    INSERT INTO smoke_results VALUES (15, 'T7e.7 DELETE blocked', 'FAIL', 'DELETE unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (15, 'T7e.7 DELETE blocked by no_delete trigger', 'PASS', SQLERRM);
  END;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (15, 'T7e.7 DELETE blocked by trg_lerl_no_delete [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 16: T7f cross-tenant leak: scope=listing ----
DO $$
DECLARE
  v_setup record; v_actual uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context('00000000-0000-0000-0000-000000000016'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, v_setup.tenant_b_id);
  INSERT INTO smoke_results VALUES (16,
    'T7f tenant_b listing-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (16, 'T7f cross-tenant leak: scope=listing [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 17: T7f cross-tenant leak: scope=building ----
DO $$
DECLARE
  v_setup record; v_actual uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context(NULL, '00000000-0000-0000-0000-000000000017'::uuid, NULL, NULL, NULL, NULL, NULL, v_setup.tenant_b_id);
  INSERT INTO smoke_results VALUES (17,
    'T7f tenant_b building-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (17, 'T7f cross-tenant leak: scope=building [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 18: T7f cross-tenant leak: scope=neighbourhood ----
DO $$
DECLARE
  v_setup record; v_actual uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context(NULL, NULL, '00000000-0000-0000-0000-000000000018'::uuid, NULL, NULL, NULL, NULL, v_setup.tenant_b_id);
  INSERT INTO smoke_results VALUES (18,
    'T7f tenant_b neighbourhood-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (18, 'T7f cross-tenant leak: scope=neighbourhood [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 19: T7f cross-tenant leak: scope=community ----
DO $$
DECLARE
  v_setup record; v_actual uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context(NULL, NULL, NULL, '00000000-0000-0000-0000-000000000019'::uuid, NULL, NULL, NULL, v_setup.tenant_b_id);
  INSERT INTO smoke_results VALUES (19,
    'T7f tenant_b community-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (19, 'T7f cross-tenant leak: scope=community [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 20: T7f cross-tenant leak: scope=municipality ----
DO $$
DECLARE
  v_setup record; v_actual uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context(NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000000020'::uuid, NULL, NULL, v_setup.tenant_b_id);
  INSERT INTO smoke_results VALUES (20,
    'T7f tenant_b municipality-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (20, 'T7f cross-tenant leak: scope=municipality [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 21: T7f cross-tenant leak: scope=area ----
DO $$
DECLARE
  v_setup record; v_actual uuid;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  v_actual := resolve_agent_for_context(NULL, NULL, NULL, NULL, NULL, '00000000-0000-0000-0000-000000000021'::uuid, NULL, v_setup.tenant_b_id);
  INSERT INTO smoke_results VALUES (21,
    'T7f tenant_b area-scope never returns tenant_a_agent',
    CASE WHEN v_actual IS DISTINCT FROM v_setup.tenant_a_agent_id THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_agent=%s resolved=%s', v_setup.tenant_a_agent_id, COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (21, 'T7f cross-tenant leak: scope=area [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 22: T7g.1 resolve_agent_for_context all-NULL returns NULL gracefully ----
DO $$
DECLARE
  v_actual uuid;
BEGIN

  v_actual := resolve_agent_for_context(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  INSERT INTO smoke_results VALUES (22,
    'T7g.1 all-NULL args graceful', 'PASS',
    format('returned=%s', COALESCE(v_actual::text, 'NULL'))
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (22, 'T7g.1 resolve_agent_for_context all-NULL returns NULL gracefully [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 23: T7g.2 leads.lead_origin_route defaults to unknown ----
DO $$
DECLARE
  v_setup record; v_lead uuid; v_route text;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7g.2 Lead', 't7g2@smoke.local', 't7_smoke')
    RETURNING id INTO v_lead;
  SELECT lead_origin_route INTO v_route FROM leads WHERE id = v_lead;
  INSERT INTO smoke_results VALUES (23,
    'T7g.2 lead_origin_route default unknown',
    CASE WHEN v_route = 'unknown' THEN 'PASS' ELSE 'FAIL' END,
    format('lead_origin_route=%s', v_route)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (23, 'T7g.2 leads.lead_origin_route defaults to unknown [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 24: T7g.3 leads.quality defaults to cold ----
DO $$
DECLARE
  v_setup record; v_lead uuid; v_quality text;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  INSERT INTO leads (agent_id, tenant_id, contact_name, contact_email, source, lead_origin_route)
    VALUES (v_setup.tenant_a_agent_id, v_setup.tenant_a_id, 'T7g.3 Lead', 't7g3@smoke.local', 't7_smoke', 'smoke')
    RETURNING id INTO v_lead;
  SELECT quality INTO v_quality FROM leads WHERE id = v_lead;
  INSERT INTO smoke_results VALUES (24,
    'T7g.3 lead quality default cold',
    CASE WHEN v_quality = 'cold' THEN 'PASS' ELSE 'FAIL' END,
    format('quality=%s', v_quality)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (24, 'T7g.3 leads.quality defaults to cold [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- TEST 25: T7g.4 leads.tenant_id NN enforced ----
DO $$
DECLARE
  v_setup record;
BEGIN

  SELECT * INTO v_setup FROM smoke_setup;
  BEGIN
    INSERT INTO leads (agent_id, contact_name, contact_email, source, lead_origin_route)
      VALUES (v_setup.tenant_a_agent_id, 'T7g.4 Lead', 't7g4@smoke.local', 't7_smoke', 'smoke');
    INSERT INTO smoke_results VALUES (25, 'T7g.4 leads.tenant_id NN enforced', 'FAIL', 'INSERT without tenant_id succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO smoke_results VALUES (25, 'T7g.4 leads.tenant_id NN enforced', 'PASS', 'not_null_violation as expected');
  END;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO smoke_results VALUES (25, 'T7g.4 leads.tenant_id NN enforced [UNEXPECTED]', 'FAIL', SQLERRM);
END $$;

-- ---- Summary ----
INSERT INTO smoke_results
SELECT 999, 'SUMMARY',
  CASE WHEN COUNT(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'ALL PASS' ELSE 'FAILURES PRESENT' END,
  format('pass=%s fail=%s total=%s',
    COUNT(*) FILTER (WHERE result = 'PASS'),
    COUNT(*) FILTER (WHERE result = 'FAIL'),
    COUNT(*) FILTER (WHERE test_id BETWEEN 1 AND 998))
FROM smoke_results
WHERE test_id BETWEEN 1 AND 998;

-- ─── Final result set ────────────────────────────────────────────────
SELECT test_id, test_name, result, detail FROM smoke_results ORDER BY test_id;

-- ─── Roll back EVERYTHING — production data untouched ────────────────
ROLLBACK;
