-- scripts/r-territory-t6-smoke.sql
-- W-TERRITORY/T6 — autonomous behavior smoke matrix.
--
-- Single transaction with ROLLBACK at end. Production data UNTOUCHED.
-- Final SELECT returns one row per test with PASS/FAIL/SKIP and detail.
--
-- USAGE:
--   1. Open this file, copy entire contents.
--   2. Paste into Supabase SQL editor as ONE block.
--   3. Run. Final result table shows PASS/FAIL per test.
--   4. Re-runnable: idempotent because of ROLLBACK at end.
--
-- TESTS:
--   1. Cascade resolution — resolve_geo_primary returns expected agent
--   2. AFTER INSERT trigger creates community primaries (autonomous Event 1)
--   3. UPDATE on is_primary toggle is no-op (handle_apa_update early-return)
--   4. Recursion guard — area-level INSERT does NOT cascade to community level
--   5. AFTER DELETE trigger fires without crash
--   6. Audit trail — distribute_geo_to_children writes territory_assignment_changes
--
-- Each test is wrapped in DO/EXCEPTION so a failure in one doesn't abort the
-- outer transaction; subsequent tests still run. Final SELECT gives full picture.
--
-- DEFERRED (documented in W-TERRITORY-TRACKER v7):
--   - Race safety (concurrent inserts at same child scope): not feasibly
--     testable inside a single transaction. Requires two connections + dblink
--     or external harness. Tracked as T6-followup-A.
--   - MLS-sync boundary: this is a decision item (add INSERT trigger on
--     mls_listings vs accept on-demand fallback via resolver), not a test.
--     Tracked as T6-decision.
--   - Multi-level cascade (area, community, neighbourhood): Test 1 covers
--     muni level. Other levels require synthetic geo data setup. Tracked as
--     T6-followup-B.
--   - UPDATE is_active=false fires reroll: Test 3 covers is_primary toggle
--     no-op; the inverse path (is_active flip DOES fire reroll) is tracked
--     as T6-followup-C.

BEGIN;

-- ─── Setup: ephemeral state shared across tests ──────────────────────────────
CREATE TEMP TABLE t6_setup (
  tenant_id uuid PRIMARY KEY,
  king_shah_id uuid,
  whitby_muni_id uuid,
  whitby_area_id uuid,
  test_muni_id uuid,
  test_muni_communities int
);

INSERT INTO t6_setup (tenant_id, king_shah_id, whitby_muni_id) VALUES (
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid,
  'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'::uuid,
  '70103aef-1b32-4939-9ff8-264e859a5587'::uuid
);

UPDATE t6_setup SET whitby_area_id = (
  SELECT area_id FROM municipalities WHERE id = whitby_muni_id
);

-- Find a Whitby-area sibling muni (a) that has communities, (b) has no apa rows
-- yet, (c) has the most communities (best test coverage). NULL if none eligible.
UPDATE t6_setup SET test_muni_id = (
  SELECT m.id
  FROM municipalities m, t6_setup s
  WHERE m.area_id = s.whitby_area_id
    AND m.id != s.whitby_muni_id
    AND EXISTS (SELECT 1 FROM communities c WHERE c.municipality_id = m.id)
    AND NOT EXISTS (
      SELECT 1 FROM agent_property_access apa
      WHERE apa.scope = 'municipality'
        AND apa.municipality_id = m.id
        AND apa.tenant_id = s.tenant_id
    )
  ORDER BY (SELECT COUNT(*) FROM communities c WHERE c.municipality_id = m.id) DESC
  LIMIT 1
);

UPDATE t6_setup SET test_muni_communities = (
  SELECT COUNT(*) FROM communities
  WHERE municipality_id = (SELECT test_muni_id FROM t6_setup)
);

-- ─── Results table ───────────────────────────────────────────────────────────
CREATE TEMP TABLE t6_results (
  test_id int,
  test_name text,
  result text,
  detail text
);

INSERT INTO t6_results
SELECT 0, 'SETUP', 'INFO',
  format('tenant=%s king_shah=%s whitby_muni=%s whitby_area=%s test_muni=%s test_muni_communities=%s',
    tenant_id, king_shah_id, whitby_muni_id, whitby_area_id, test_muni_id, test_muni_communities)
FROM t6_setup;

-- ─── TEST 1: cascade resolution returns expected agent ───────────────────────
DO $$
DECLARE
  v_actual uuid;
  v_expected uuid;
  v_setup record;
BEGIN
  SELECT * INTO v_setup FROM t6_setup;
  v_actual := resolve_geo_primary('municipality', v_setup.whitby_muni_id, v_setup.tenant_id);
  v_expected := v_setup.king_shah_id;

  INSERT INTO t6_results VALUES (
    1,
    'resolve_geo_primary at Whitby returns King Shah',
    CASE WHEN v_actual = v_expected THEN 'PASS' ELSE 'FAIL' END,
    format('expected=%s actual=%s', v_expected, v_actual)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t6_results VALUES (1, 'resolve_geo_primary at Whitby', 'FAIL', SQLERRM);
END $$;

-- ─── TEST 2: AFTER INSERT trigger creates community primaries ────────────────
-- INSERT apa at municipality scope → handle_apa_insert fires →
-- distribute_geo_to_children('municipality', test_muni_id, 'community', agent)
-- inserts one is_primary=true row per child community.
DO $$
DECLARE
  v_setup record;
  v_primaries_before int;
  v_primaries_after int;
BEGIN
  SELECT * INTO v_setup FROM t6_setup;

  IF v_setup.test_muni_id IS NULL THEN
    INSERT INTO t6_results VALUES (
      2, 'AFTER INSERT trigger creates community primaries',
      'SKIP', 'no eligible test muni found in Whitby area'
    );
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_primaries_before
  FROM agent_property_access apa
  WHERE apa.scope = 'community'
    AND apa.is_primary = true
    AND apa.is_active = true
    AND apa.tenant_id = v_setup.tenant_id
    AND apa.community_id IN (
      SELECT id FROM communities WHERE municipality_id = v_setup.test_muni_id
    );

  -- INSERT apa at muni scope → trigger fires distribute_geo_to_children('municipality', ..., 'community', ...)
  INSERT INTO agent_property_access (
    tenant_id, agent_id, scope, municipality_id, is_primary, is_active
  ) VALUES (
    v_setup.tenant_id, v_setup.king_shah_id, 'municipality', v_setup.test_muni_id,
    false, true
  );

  SELECT COUNT(*) INTO v_primaries_after
  FROM agent_property_access apa
  WHERE apa.scope = 'community'
    AND apa.is_primary = true
    AND apa.is_active = true
    AND apa.tenant_id = v_setup.tenant_id
    AND apa.community_id IN (
      SELECT id FROM communities WHERE municipality_id = v_setup.test_muni_id
    );

  INSERT INTO t6_results VALUES (
    2,
    'AFTER INSERT trigger creates community primaries',
    CASE WHEN v_primaries_after - v_primaries_before = v_setup.test_muni_communities
         THEN 'PASS' ELSE 'FAIL' END,
    format('communities_in_test_muni=%s primaries_before=%s primaries_after=%s expected_delta=%s actual_delta=%s',
      v_setup.test_muni_communities, v_primaries_before, v_primaries_after,
      v_setup.test_muni_communities, v_primaries_after - v_primaries_before)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t6_results VALUES (2, 'AFTER INSERT trigger', 'FAIL', SQLERRM);
END $$;

-- ─── TEST 3: UPDATE on is_primary toggle is a no-op (early-return path) ──────
-- Toggling is_primary off then back on should NOT trigger any distribution or
-- reroll side effects. Verifies handle_apa_update's early-return path works.
DO $$
DECLARE
  v_setup record;
  v_apa_id uuid;
  v_audit_before int;
  v_audit_after int;
  v_apa_count_before int;
  v_apa_count_after int;
BEGIN
  SELECT * INTO v_setup FROM t6_setup;

  -- Pick any existing community-primary row (one created by Test 2 OR T3b-B prior smoke)
  SELECT id INTO v_apa_id FROM agent_property_access
  WHERE scope = 'community' AND is_primary = true AND is_active = true
    AND tenant_id = v_setup.tenant_id
  LIMIT 1;

  IF v_apa_id IS NULL THEN
    INSERT INTO t6_results VALUES (
      3, 'UPDATE on is_primary toggle is no-op',
      'SKIP', 'no community-primary apa row to test against'
    );
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_audit_before FROM territory_assignment_changes;
  SELECT COUNT(*) INTO v_apa_count_before FROM agent_property_access;

  -- Toggle off then on: only is_primary changes, nothing routing-affecting
  UPDATE agent_property_access SET is_primary = false WHERE id = v_apa_id;
  UPDATE agent_property_access SET is_primary = true  WHERE id = v_apa_id;

  SELECT COUNT(*) INTO v_audit_after FROM territory_assignment_changes;
  SELECT COUNT(*) INTO v_apa_count_after FROM agent_property_access;

  INSERT INTO t6_results VALUES (
    3,
    'UPDATE on is_primary toggle is no-op (no audit, no apa side effects)',
    CASE WHEN v_audit_after = v_audit_before AND v_apa_count_after = v_apa_count_before
         THEN 'PASS' ELSE 'FAIL' END,
    format('audit: before=%s after=%s | apa_count: before=%s after=%s',
      v_audit_before, v_audit_after, v_apa_count_before, v_apa_count_after)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t6_results VALUES (3, 'UPDATE is_primary toggle no-op', 'FAIL', SQLERRM);
END $$;

-- ─── TEST 4: Recursion guard — area INSERT does NOT cascade to community ─────
-- area-scope INSERT fires trigger at depth 1. Trigger calls distribute_geo_to_children
-- which inserts muni-scope apa rows. Those inserts fire trigger at depth 2.
-- At depth 2, the recursion guard returns early. So community-level distribution
-- does NOT cascade. Community primary count should be UNCHANGED.
DO $$
DECLARE
  v_setup record;
  v_community_before int;
  v_community_after int;
  v_muni_before int;
  v_muni_after int;
BEGIN
  SELECT * INTO v_setup FROM t6_setup;

  SELECT COUNT(*) INTO v_community_before
  FROM agent_property_access
  WHERE scope = 'community' AND is_primary = true AND is_active = true
    AND tenant_id = v_setup.tenant_id;

  SELECT COUNT(*) INTO v_muni_before
  FROM agent_property_access
  WHERE scope = 'municipality' AND is_primary = true AND is_active = true
    AND tenant_id = v_setup.tenant_id;

  -- INSERT apa at AREA scope → triggers area→muni and area→neighbourhood distribution
  -- but does NOT recursively cascade to community level (recursion guard).
  INSERT INTO agent_property_access (
    tenant_id, agent_id, scope, area_id, is_primary, is_active
  ) VALUES (
    v_setup.tenant_id, v_setup.king_shah_id, 'area', v_setup.whitby_area_id,
    false, true
  );

  SELECT COUNT(*) INTO v_community_after
  FROM agent_property_access
  WHERE scope = 'community' AND is_primary = true AND is_active = true
    AND tenant_id = v_setup.tenant_id;

  SELECT COUNT(*) INTO v_muni_after
  FROM agent_property_access
  WHERE scope = 'municipality' AND is_primary = true AND is_active = true
    AND tenant_id = v_setup.tenant_id;

  INSERT INTO t6_results VALUES (
    4,
    'Recursion guard: area INSERT does NOT cascade to community',
    CASE WHEN v_community_after = v_community_before THEN 'PASS' ELSE 'FAIL' END,
    format('community: before=%s after=%s (delta should be 0) | muni: before=%s after=%s (delta is expected, area→muni distribution at depth 1)',
      v_community_before, v_community_after, v_muni_before, v_muni_after)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t6_results VALUES (4, 'Recursion guard test', 'FAIL', SQLERRM);
END $$;

-- ─── TEST 5: AFTER DELETE trigger fires without crash ────────────────────────
-- DELETE the area-scope row inserted in Test 4. handle_apa_delete fires
-- reroll_listings_at_geo. Test passes if DELETE completes without exception.
DO $$
DECLARE
  v_setup record;
  v_id uuid;
BEGIN
  SELECT * INTO v_setup FROM t6_setup;

  SELECT id INTO v_id FROM agent_property_access
  WHERE scope = 'area'
    AND area_id = v_setup.whitby_area_id
    AND tenant_id = v_setup.tenant_id
    AND agent_id = v_setup.king_shah_id;

  IF v_id IS NULL THEN
    INSERT INTO t6_results VALUES (
      5, 'AFTER DELETE trigger fires without crash',
      'SKIP', 'no area-scope row to delete (Test 4 may have skipped or failed)'
    );
    RETURN;
  END IF;

  DELETE FROM agent_property_access WHERE id = v_id;

  INSERT INTO t6_results VALUES (
    5, 'AFTER DELETE trigger fires without crash',
    'PASS', 'delete completed; reroll_listings_at_geo ran without error'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t6_results VALUES (5, 'AFTER DELETE trigger', 'FAIL', SQLERRM);
END $$;

-- ─── TEST 6: Audit trail — distribute writes territory_assignment_changes ────
-- Test 2's INSERT triggered distribute_geo_to_children, which writes one audit
-- row per child community primary inserted. Count those rows.
DO $$
DECLARE
  v_setup record;
  v_audit_rows int;
BEGIN
  SELECT * INTO v_setup FROM t6_setup;

  IF v_setup.test_muni_id IS NULL THEN
    INSERT INTO t6_results VALUES (
      6, 'Audit trail: distribute writes territory_assignment_changes',
      'SKIP', 'Test 2 was skipped, no audit rows to verify'
    );
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_audit_rows
  FROM territory_assignment_changes
  WHERE scope = 'community'
    AND tenant_id = v_setup.tenant_id
    AND change_type = 'primary_set'
    AND scope_id IN (
      SELECT id FROM communities WHERE municipality_id = v_setup.test_muni_id
    );

  INSERT INTO t6_results VALUES (
    6,
    'Audit trail: distribute_geo_to_children writes territory_assignment_changes',
    CASE WHEN v_audit_rows = v_setup.test_muni_communities
         THEN 'PASS' ELSE 'FAIL' END,
    format('expected_audit_rows=%s actual=%s',
      v_setup.test_muni_communities, v_audit_rows)
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t6_results VALUES (6, 'Audit trail', 'FAIL', SQLERRM);
END $$;

-- ─── Summary row ─────────────────────────────────────────────────────────────
INSERT INTO t6_results
SELECT 99, 'SUMMARY',
  CASE WHEN COUNT(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'ALL PASS' ELSE 'FAILURES PRESENT' END,
  format('pass=%s fail=%s skip=%s total=%s',
    COUNT(*) FILTER (WHERE result = 'PASS'),
    COUNT(*) FILTER (WHERE result = 'FAIL'),
    COUNT(*) FILTER (WHERE result = 'SKIP'),
    COUNT(*) FILTER (WHERE test_id BETWEEN 1 AND 6))
FROM t6_results
WHERE test_id BETWEEN 1 AND 6;

-- ─── Final result set (this is what Supabase displays) ───────────────────────
SELECT test_id, test_name, result, detail
FROM t6_results
ORDER BY test_id;

-- ─── Roll back EVERYTHING — production data untouched ────────────────────────
ROLLBACK;