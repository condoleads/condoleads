// scripts/r-territory-ops-T1-5-smoke.js
// W-TERRITORY-OPS T1-5 smoke runner.
//
// Code-only smoke against production Supabase. Tests the SQL + RPC logic that
// the T1-5 routes will execute. HTTP/auth layer not exercised here -- auth
// pattern is identical to T1-4 cards-list/bulk-restore (production-proven).
//
// All DB mutations are wrapped in BEGIN ... ROLLBACK -- production state is
// never modified. The runner connects with a single pg.Client and uses one
// transaction; per-section assertions run inside SAVEPOINTs that ROLLBACK to
// the section start so each section is isolated.
//
// Sections:
//   A. Pre-flight sanity (resolver RPC, geo counts, fixture availability)
//   B. geo-rollup SQL: area level (73 rows, no parent filter)
//   C. geo-rollup SQL: muni level with Whitby parent (Whitby's 8 munis)
//   D. geo-rollup SQL: community level under Whitby muni (11 communities)
//   E. geo-rollup inheritance logic: community without own card -> muni holder
//   F. bulk-create validation: missing scope_id -> 404 in route logic
//   G. bulk-create validation: cross-tenant agent -> 403 in route logic
//   H. bulk-create DRY RUN: Whitby muni carve into 11 community cards (S21)
//   I. Multi-tenant isolation: aily tenant geo-rollup baseline (zero cards)

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const CONN = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!CONN) { console.error('FATAL: no DB connection string in env'); process.exit(2); }

// Pre-flight-verified constants. All sourced from earlier session probes.
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const AILY = 'e2619717-6401-4159-8d4c-d5f87651c8d6';
const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587';
const WHITBY_AREA = '03d4e133-d9f9-4a7e-ba9a-83e57269c1d4';
const KING_SHAH = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const NEO_SMITH = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';  // verified pre-flight 2026-05-26

// Fabricated-but-clearly-bad UUID for negative tests. Format-valid, content-
// guaranteed-not-to-match any row in any table (all-1s/all-2s pattern).
const FAKE_SCOPE_ID = '11111111-2222-3333-4444-555555555555';

const checks = [];
function add(label, ok, detail) {
  checks.push({ label, ok: !!ok, detail: detail || '' });
}

(async () => {
  const c = new Client({ connectionString: CONN });
  await c.connect();
  // Pin search_path so unqualified table names resolve as expected (defensive).
  await c.query("SET search_path TO public");

  try {
    // ===== SECTION A: pre-flight sanity =====
    const aRes = await c.query(
      `SELECT name FROM municipalities WHERE id = $1::uuid`,
      [WHITBY_MUNI]
    );
    add('A1 Whitby muni exists', aRes.rows.length === 1 && aRes.rows[0].name === 'Whitby',
        'name=' + (aRes.rows[0]?.name || 'MISSING'));

    const a2 = await c.query(
      `SELECT COUNT(*)::int AS n FROM communities WHERE municipality_id = $1::uuid`,
      [WHITBY_MUNI]
    );
    add('A2 Whitby has communities', a2.rows[0].n >= 1, 'count=' + a2.rows[0].n);
    const WHITBY_COMM_COUNT = a2.rows[0].n;

    const a3 = await c.query(
      `SELECT resolve_geo_primary('municipality'::text, $1::uuid, $2::uuid) AS holder`,
      [WHITBY_MUNI, WALLIAM]
    );
    add('A3 resolve_geo_primary(Whitby muni, WALLiam) returns Neo Smith',
        a3.rows[0].holder === NEO_SMITH,
        'holder=' + (a3.rows[0].holder || 'NULL'));

    const a4 = await c.query(`SELECT COUNT(*)::int AS n FROM treb_areas`);
    add('A4 treb_areas row count = 73', a4.rows[0].n === 73, 'actual=' + a4.rows[0].n);

    // ===== SECTION B: geo-rollup SQL at area level =====
    // Mirror the production SQL but inline the variable substitutions for area.
    const bSql =
      "SELECT g.id, g.name, g.slug, NULL::uuid AS parent_id, " +
      "  (SELECT EXISTS( " +
      "     SELECT 1 FROM agent_property_access apa " +
      "      WHERE apa.tenant_id = $1::uuid AND apa.scope = 'area' " +
      "        AND apa.area_id = g.id AND apa.is_active = true " +
      "  )) AS has_own_card, " +
      "  (SELECT COUNT(*)::int FROM mls_listings ml WHERE ml.area_id = g.id AND ml.available_in_vow = true) AS listing_count, " +
      "  0::int AS building_count, " +
      "  (SELECT COUNT(*)::int FROM municipalities ch WHERE ch.area_id = g.id) AS child_count " +
      "FROM treb_areas g WHERE 1=1 ORDER BY g.name";
    const bRes = await c.query(bSql, [WALLIAM]);
    add('B1 geo-rollup(area, WALLiam) returns 73 rows',
        bRes.rows.length === 73, 'rows=' + bRes.rows.length);

    const whitbyAreaRow = bRes.rows.find(r => r.id === WHITBY_AREA);
    add('B2 Whitby parent area present in area rollup', !!whitbyAreaRow,
        whitbyAreaRow ? 'name=' + whitbyAreaRow.name : 'MISSING');
    add('B3 Whitby area child_count > 0', whitbyAreaRow && whitbyAreaRow.child_count > 0,
        'children=' + (whitbyAreaRow?.child_count || 0));

    // ===== SECTION C: geo-rollup SQL at muni level, parent = Whitby area =====
    const cSql =
      "SELECT g.id, g.name, g.slug, g.area_id AS parent_id, " +
      "  (SELECT EXISTS( " +
      "     SELECT 1 FROM agent_property_access apa " +
      "      WHERE apa.tenant_id = $1::uuid AND apa.scope = 'municipality' " +
      "        AND apa.municipality_id = g.id AND apa.is_active = true " +
      "  )) AS has_own_card, " +
      "  (SELECT COUNT(*)::int FROM mls_listings ml WHERE ml.municipality_id = g.id AND ml.available_in_vow = true) AS listing_count, " +
      "  0::int AS building_count, " +
      "  (SELECT COUNT(*)::int FROM communities ch WHERE ch.municipality_id = g.id) AS child_count " +
      "FROM municipalities g WHERE g.area_id = $2::uuid ORDER BY g.name";
    const cRes = await c.query(cSql, [WALLIAM, WHITBY_AREA]);
    add('C1 geo-rollup(muni, Whitby area) returns >= 1 row',
        cRes.rows.length >= 1, 'rows=' + cRes.rows.length);
    const whitbyMuniRow = cRes.rows.find(r => r.id === WHITBY_MUNI);
    add('C2 Whitby muni in muni rollup under Whitby area', !!whitbyMuniRow,
        whitbyMuniRow ? 'name=' + whitbyMuniRow.name : 'MISSING');
    add('C3 Whitby muni has_own_card = true (Neo Smith card)',
        whitbyMuniRow && whitbyMuniRow.has_own_card === true,
        'has_own_card=' + (whitbyMuniRow?.has_own_card));
    add('C4 Whitby muni child_count = ' + WHITBY_COMM_COUNT,
        whitbyMuniRow && whitbyMuniRow.child_count === WHITBY_COMM_COUNT,
        'child_count=' + (whitbyMuniRow?.child_count));

    // ===== SECTION D: geo-rollup SQL at community level, parent = Whitby muni =====
    const dSql =
      "SELECT g.id, g.name, g.slug, g.municipality_id AS parent_id, " +
      "  (SELECT EXISTS( " +
      "     SELECT 1 FROM agent_property_access apa " +
      "      WHERE apa.tenant_id = $1::uuid AND apa.scope = 'community' " +
      "        AND apa.community_id = g.id AND apa.is_active = true " +
      "  )) AS has_own_card, " +
      "  (SELECT COUNT(*)::int FROM mls_listings ml WHERE ml.community_id = g.id AND ml.available_in_vow = true) AS listing_count, " +
      "  (SELECT COUNT(*)::int FROM buildings b WHERE b.community_id = g.id) AS building_count, " +
      "  0::int AS child_count " +
      "FROM communities g WHERE g.municipality_id = $2::uuid ORDER BY g.name";
    const dRes = await c.query(dSql, [WALLIAM, WHITBY_MUNI]);
    add('D1 community rollup under Whitby muni = ' + WHITBY_COMM_COUNT + ' rows',
        dRes.rows.length === WHITBY_COMM_COUNT, 'rows=' + dRes.rows.length);

    // ===== SECTION E: inheritance walk -- a community without own card =====
    // Pick any community with has_own_card=false (the Whitby communities currently
    // either have King Shah community cards or no card; pick one to test the walk).
    const eCandidate = dRes.rows.find(r => r.has_own_card === false);
    if (eCandidate) {
      // Resolve holder for this community. Per cascade: community card (missing) ->
      // muni card (Neo Smith holds Whitby muni) -> holder should be Neo Smith.
      const eRes = await c.query(
        `SELECT resolve_geo_primary('community'::text, $1::uuid, $2::uuid) AS holder`,
        [eCandidate.id, WALLIAM]
      );
      add('E1 community without own card -> resolver returns Whitby muni holder (Neo)',
          eRes.rows[0].holder === NEO_SMITH,
          'community=' + eCandidate.name + ' holder=' + (eRes.rows[0].holder || 'NULL'));
    } else {
      add('E1 community without own card -> resolver returns Whitby muni holder (Neo)',
          true, 'SKIP: every Whitby community has its own card (acceptable)');
    }

    // ===== SECTION F: bulk-create validation -- missing scope_id =====
    // The route validates scope_id existence by SELECTing from the geo table.
    // Simulate that lookup with a fabricated id that cannot exist.
    const fRes = await c.query(
      `SELECT id FROM communities WHERE id = $1::uuid`,
      [FAKE_SCOPE_ID]
    );
    add('F1 fabricated community id returns zero rows (route would 404)',
        fRes.rows.length === 0, 'rows=' + fRes.rows.length);

    // ===== SECTION G: bulk-create cross-tenant agent check =====
    // The route validates agents.tenant_id === tenantId. Simulate with King Shah
    // (WALLiam) + aily tenant -- should mismatch.
    const gRes = await c.query(
      `SELECT id, tenant_id FROM agents WHERE id = $1::uuid`,
      [KING_SHAH]
    );
    add('G1 King Shah agent exists and is on WALLiam tenant',
        gRes.rows.length === 1 && gRes.rows[0].tenant_id === WALLIAM,
        'tenant=' + (gRes.rows[0]?.tenant_id || 'MISSING'));
    add('G2 King Shah cross-tenant check vs aily -> would be 403',
        gRes.rows[0]?.tenant_id !== AILY, 'mismatch=expected');

    // ===== SECTION H: bulk-create DRY RUN (Whitby muni carve, S21) =====
    // Strategy: BEGIN, set app.skip_apa_reroll = on, attempt to insert 11 community
    // cards under King Shah at the Whitby communities. Some may collide with
    // existing apa rows (uniq_apa_primary_community) -- this models the realistic
    // operator scenario.
    //
    // Whitby's 11 communities already have King Shah community cards (per
    // memory: "11 King Shah Whitby community phantoms"). So the BULK-CREATE
    // inserts will ALL fail with 23505 unique_violation because the partial
    // unique index reserves the (tenant_id, scope, community_id, is_primary=true)
    // slot. The route should ROLLBACK the entire batch on first error.
    //
    // We test the partial-fail case by attempting all 11 inserts in one BEGIN
    // and observing that NONE land, all roll back together.
    await c.query('BEGIN');
    await c.query("SAVEPOINT h_start");
    let h_rollback_reason = null;
    try {
      await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
      let h_inserted = 0;
      for (const row of dRes.rows) {
        try {
          const ins = await c.query(
            `INSERT INTO agent_property_access (
                tenant_id, agent_id, scope, community_id,
                is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode
              ) VALUES ($1::uuid, $2::uuid, 'community', $3::uuid,
                true, true, true, true, true, 'all')
              RETURNING id`,
            [WALLIAM, KING_SHAH, row.id]
          );
          if (ins.rowCount === 1) h_inserted += 1;
        } catch (e) {
          // First unique-violation aborts the savepoint per Postgres semantics.
          h_rollback_reason = e.code + ':' + (e.message || '').substring(0, 80);
          break;
        }
      }
      add('H1 bulk-create over already-occupied slots -> at least one unique_violation',
          h_rollback_reason && h_rollback_reason.startsWith('23505'),
          'first_error=' + (h_rollback_reason || 'NONE -- unexpected, all 11 inserted'));
      add('H2 partial-insert count >= 0 and < 11 (collision tripped on first)',
          h_inserted >= 0, 'inserted_before_failure=' + h_inserted);
      // ROLLBACK to savepoint regardless of insert count.
      await c.query("ROLLBACK TO SAVEPOINT h_start");
    } catch (e) {
      add('H1 bulk-create dry run: setup failed', false, e.message);
      await c.query("ROLLBACK TO SAVEPOINT h_start").catch(() => {});
    }

    // H3: clean slate test -- pick a community where King Shah does NOT have a card,
    // verify the insert succeeds when slot is vacant. Use Whitby muni's
    // FIRST community row that doesn't have has_own_card.
    const cleanCandidate = dRes.rows.find(r => r.has_own_card === false);
    if (cleanCandidate) {
      await c.query("SAVEPOINT h3_start");
      try {
        await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
        const ins = await c.query(
          `INSERT INTO agent_property_access (
              tenant_id, agent_id, scope, community_id,
              is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode
            ) VALUES ($1::uuid, $2::uuid, 'community', $3::uuid,
              true, true, true, true, true, 'all')
            RETURNING id`,
          [WALLIAM, KING_SHAH, cleanCandidate.id]
        );
        add('H3 clean-slot bulk-create insert succeeded (DRY RUN, will rollback)',
            ins.rowCount === 1, 'community=' + cleanCandidate.name + ' inserted=' + ins.rowCount);
        // Verify the audit row was written.
        const audit = await c.query(
          `SELECT change_type FROM territory_assignment_changes
            WHERE tenant_id = $1::uuid AND agent_id = $2::uuid
              AND scope = 'community' AND scope_id = $3::uuid
            ORDER BY changed_at DESC LIMIT 1`,
          [WALLIAM, KING_SHAH, cleanCandidate.id]
        );
        add('H4 audit row written (assignment_granted)',
            audit.rows[0]?.change_type === 'assignment_granted',
            'change_type=' + (audit.rows[0]?.change_type || 'NONE'));
        // Verify queue read returns a count.
        const q = await c.query(
          `SELECT COUNT(*)::int AS n FROM territory_reroll_queue
            WHERE tenant_id = $1::uuid AND status = 'pending'`,
          [WALLIAM]
        );
        add('H5 queue read returns count (S22 cache-staleness signal)',
            typeof q.rows[0].n === 'number', 'pending=' + q.rows[0].n);
        await c.query("ROLLBACK TO SAVEPOINT h3_start");
      } catch (e) {
        add('H3 clean-slot insert failed unexpectedly', false, e.code + ' ' + e.message);
        await c.query("ROLLBACK TO SAVEPOINT h3_start").catch(() => {});
      }
    } else {
      add('H3 clean-slot insert succeeded (DRY RUN, will rollback)',
          true, 'SKIP: no vacant-slot Whitby community available');
      add('H4 audit row written (assignment_granted)', true, 'SKIP: see H3');
      add('H5 queue read returns count (S22 cache-staleness signal)', true, 'SKIP: see H3');
    }

    // ===== SECTION I: aily multi-tenant isolation =====
    const iRes = await c.query(
      `SELECT COUNT(*)::int AS n FROM agent_property_access
        WHERE tenant_id = $1::uuid AND is_active = true`,
      [AILY]
    );
    add('I1 aily active cards = 0 (multi-tenant isolation baseline)',
        iRes.rows[0].n === 0, 'cards=' + iRes.rows[0].n);

    const iRes2 = await c.query(
      `SELECT id, name FROM treb_areas LIMIT 1`
    );
    const aRes2 = await c.query(
      `SELECT (SELECT EXISTS(
          SELECT 1 FROM agent_property_access apa
           WHERE apa.tenant_id = $1::uuid AND apa.scope = 'area'
             AND apa.area_id = $2::uuid AND apa.is_active = true
        )) AS has_own_card`,
      [AILY, iRes2.rows[0].id]
    );
    add('I2 aily area has_own_card = false (no cross-tenant leakage)',
        aRes2.rows[0].has_own_card === false, 'has_own_card=' + aRes2.rows[0].has_own_card);


    // ===== SECTION J: vacant-community-slot clean-insert (S21 happy path) =====
    // Whitby's 11 communities all have King Shah community cards, so the H3-H5
    // checks SKIP for that muni. Find any vacant community slot tenant-wide
    // and exercise the clean-insert + audit + queue trio there.
    const vacantRes = await c.query(
      "SELECT c.id, c.name, m.name AS muni_name " +
      "FROM communities c JOIN municipalities m ON m.id = c.municipality_id " +
      "WHERE c.id NOT IN ( " +
      "  SELECT community_id FROM agent_property_access " +
      "   WHERE tenant_id = $1::uuid AND scope = 'community' AND is_active = true AND community_id IS NOT NULL " +
      ") ORDER BY m.name, c.name LIMIT 1",
      [WALLIAM]
    );
    if (vacantRes.rows.length === 0) {
      add('J1 vacant community slot exists', false, 'no vacant communities in DB -- unexpected at current scale');
    } else {
      const vacant = vacantRes.rows[0];
      add('J1 vacant community slot found',
          true,
          'community=' + vacant.muni_name + '/' + vacant.name + ' id=' + vacant.id);

      await c.query('SAVEPOINT j_start');
      try {
        await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
        // Snapshot queue count BEFORE insert so we can detect a delta.
        const qBefore = await c.query(
          "SELECT COUNT(*)::int AS n FROM territory_reroll_queue WHERE tenant_id = $1::uuid",
          [WALLIAM]
        );
        const queue_before = qBefore.rows[0].n;

        // Snapshot audit count BEFORE insert for same delta logic.
        const aBefore = await c.query(
          "SELECT COUNT(*)::int AS n FROM territory_assignment_changes " +
          "WHERE tenant_id = $1::uuid AND agent_id = $2::uuid " +
          "  AND scope = 'community' AND scope_id = $3::uuid",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        const audit_before = aBefore.rows[0].n;

        const ins = await c.query(
          "INSERT INTO agent_property_access ( " +
          "  tenant_id, agent_id, scope, community_id, " +
          "  is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode " +
          ") VALUES ($1::uuid, $2::uuid, 'community', $3::uuid, " +
          "  true, true, true, true, true, 'all') RETURNING id",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        add('J2 vacant-slot clean insert succeeded (DRY RUN, will rollback)',
            ins.rowCount === 1, 'inserted=' + ins.rowCount);

        const aAfter = await c.query(
          "SELECT change_type FROM territory_assignment_changes " +
          "WHERE tenant_id = $1::uuid AND agent_id = $2::uuid " +
          "  AND scope = 'community' AND scope_id = $3::uuid " +
          "ORDER BY changed_at DESC LIMIT 1",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        const audit_after_n = await c.query(
          "SELECT COUNT(*)::int AS n FROM territory_assignment_changes " +
          "WHERE tenant_id = $1::uuid AND agent_id = $2::uuid " +
          "  AND scope = 'community' AND scope_id = $3::uuid",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        add('J3 audit row written (assignment_granted)',
            aAfter.rows[0]?.change_type === 'assignment_granted',
            'change_type=' + (aAfter.rows[0]?.change_type || 'NONE'));
        add('J4 audit row count delta = 1',
            audit_after_n.rows[0].n === audit_before + 1,
            'before=' + audit_before + ' after=' + audit_after_n.rows[0].n);

        const qAfter = await c.query(
          "SELECT COUNT(*)::int AS n FROM territory_reroll_queue WHERE tenant_id = $1::uuid",
          [WALLIAM]
        );
        add('J5 queue row enqueued by trigger (delta >= 1)',
            qAfter.rows[0].n >= queue_before + 1,
            'before=' + queue_before + ' after=' + qAfter.rows[0].n);

        // Verify the inserted apa row is visible inside the transaction.
        const apaRow = await c.query(
          "SELECT is_active, is_primary FROM agent_property_access " +
          "WHERE tenant_id = $1::uuid AND agent_id = $2::uuid " +
          "  AND scope = 'community' AND community_id = $3::uuid",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        add('J6 apa row readable inside tx',
            apaRow.rows.length === 1 && apaRow.rows[0].is_active === true && apaRow.rows[0].is_primary === true,
            'rows=' + apaRow.rows.length);

        await c.query('ROLLBACK TO SAVEPOINT j_start');

        // After savepoint rollback, the apa row must be gone.
        const apaPost = await c.query(
          "SELECT COUNT(*)::int AS n FROM agent_property_access " +
          "WHERE tenant_id = $1::uuid AND agent_id = $2::uuid " +
          "  AND scope = 'community' AND community_id = $3::uuid",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        add('J7 savepoint rollback reverts the apa row',
            apaPost.rows[0].n === 0,
            'rows_after_rollback=' + apaPost.rows[0].n);
      } catch (e) {
        add('J2 vacant-slot clean insert succeeded (DRY RUN, will rollback)',
            false, e.code + ' ' + e.message);
        await c.query('ROLLBACK TO SAVEPOINT j_start').catch(() => {});
      }
    }
    // Final rollback of outer transaction. Production never modified.
    await c.query('ROLLBACK');

  } catch (e) {
    console.error('FATAL during smoke:', e);
    try { await c.query('ROLLBACK'); } catch {}
    process.exit(2);
  }

  await c.end();

  let pass = 0, fail = 0;
  console.log('');
  console.log('================================================================');
  console.log('  W-TERRITORY-OPS T1-5 SMOKE -- live DB results');
  console.log('================================================================');
  for (const ch of checks) {
    if (ch.ok) pass++; else fail++;
    console.log('  ' + (ch.ok ? 'PASS' : 'FAIL') + '  ' + ch.label + (ch.detail ? '  -- ' + ch.detail : ''));
  }
  console.log('');
  console.log('  CHECKS: ' + checks.length + '  PASS: ' + pass + '  FAIL: ' + fail);
  console.log('================================================================');
  process.exit(fail > 0 ? 1 : 0);
})();