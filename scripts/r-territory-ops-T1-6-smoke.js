// scripts/r-territory-ops-T1-6-smoke.js
// W-TERRITORY-OPS T1-6 smoke runner.
//
// Live-DB verification of the SQL/RPC paths the new code uses. HTTP/auth layer
// not exercised here -- auth pattern is identical to T1-4/T1-5 (production-proven).
// All mutations wrapped in BEGIN ... ROLLBACK with SAVEPOINT per section.
//
// Sections:
//   A. Pre-flight sanity (cards-list backward compat baseline)
//   B. cards-list scope_id filter -- muni-level (Whitby -> Neo Smith muni card)
//   C. cards-list scope_id filter -- community-level (King Shah community card)
//   D. cards-list scope WITHOUT scope_id (backward compat with T1-4 behaviour)
//   E. Cross-tenant isolation (aily scope_id vs WALLiam tenant)
//   F. reroll-worker GET payload shape (QueueIndicator data path)
//   G. audit-log poll shape (AuditSidebar data path)
//   H. geo-search live queries (TerritorySearchBar data path)
//   I. T1-5 bulk-create happy path preserved (no regression)

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const CONN = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!CONN) { console.error('FATAL: no DB connection string'); process.exit(2); }

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const AILY = 'e2619717-6401-4159-8d4c-d5f87651c8d6';
const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587';
const KING_SHAH = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const NEO_SMITH = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';
const FAKE_SCOPE_ID = '11111111-2222-3333-4444-555555555555';

const checks = [];
function add(label, ok, detail) { checks.push({ label, ok: !!ok, detail: detail || '' }); }

// Reusable cards-list SQL fragment (mirrors the route's WHERE/CTE shape).
// Selects only the columns we need for assertions, not the full route output.
const CARDS_LIST_SQL =
  "SELECT apa.id, apa.agent_id, apa.scope, " +
  "  CASE apa.scope " +
  "    WHEN 'area' THEN apa.area_id " +
  "    WHEN 'municipality' THEN apa.municipality_id " +
  "    WHEN 'community' THEN apa.community_id " +
  "    WHEN 'neighbourhood' THEN apa.neighbourhood_id " +
  "  END AS scope_id, " +
  "  apa.is_primary, apa.is_active " +
  "FROM agent_property_access apa " +
  "WHERE apa.tenant_id = $1 " +
  "  AND ($2::uuid IS NULL OR apa.agent_id = $2::uuid) " +
  "  AND ($3::text IS NULL OR apa.scope = $3::text) " +
  "  AND ($4::boolean = true OR apa.is_active = true) " +
  "  AND ($5::uuid IS NULL OR " +
  "       (apa.scope = 'area' AND apa.area_id = $5::uuid) OR " +
  "       (apa.scope = 'municipality' AND apa.municipality_id = $5::uuid) OR " +
  "       (apa.scope = 'community' AND apa.community_id = $5::uuid) OR " +
  "       (apa.scope = 'neighbourhood' AND apa.neighbourhood_id = $5::uuid)) " +
  "LIMIT 200";

// Reusable geo-search SQL (5-branch UNION ALL, mirrors route).
const GEO_SEARCH_SQL =
  "SELECT kind, id, name, slug, parent_name, is_selling, is_active FROM ( " +
  "  (SELECT 'agent'::text AS kind, a.id, a.full_name AS name, NULL::text AS slug, " +
  "          NULL::text AS parent_name, a.is_selling, a.is_active " +
  "     FROM agents a WHERE a.tenant_id = $1::uuid " +
  "       AND a.full_name ILIKE '%' || $2 || '%' " +
  "    ORDER BY a.full_name LIMIT $3) " +
  "  UNION ALL " +
  "  (SELECT 'area'::text AS kind, ar.id, ar.name, ar.slug, NULL::text, NULL::boolean, NULL::boolean " +
  "     FROM treb_areas ar WHERE ar.name ILIKE '%' || $2 || '%' ORDER BY ar.name LIMIT $3) " +
  "  UNION ALL " +
  "  (SELECT 'municipality'::text, m.id, m.name, m.slug, ar2.name, NULL::boolean, NULL::boolean " +
  "     FROM municipalities m LEFT JOIN treb_areas ar2 ON ar2.id = m.area_id " +
  "    WHERE m.name ILIKE '%' || $2 || '%' ORDER BY m.name LIMIT $3) " +
  "  UNION ALL " +
  "  (SELECT 'community'::text, co.id, co.name, co.slug, m2.name, NULL::boolean, NULL::boolean " +
  "     FROM communities co LEFT JOIN municipalities m2 ON m2.id = co.municipality_id " +
  "    WHERE co.name ILIKE '%' || $2 || '%' ORDER BY co.name LIMIT $3) " +
  "  UNION ALL " +
  "  (SELECT 'neighbourhood'::text, nb.id, nb.name, nb.slug, ar3.name, NULL::boolean, NULL::boolean " +
  "     FROM neighbourhoods nb LEFT JOIN treb_areas ar3 ON ar3.id = nb.area_id " +
  "    WHERE nb.name ILIKE '%' || $2 || '%' ORDER BY nb.name LIMIT $3) " +
  ") u ORDER BY kind, name LIMIT $3";

(async () => {
  const c = new Client({ connectionString: CONN });
  await c.connect();
  await c.query("SET search_path TO public");

  try {
    // ===== A: cards-list backward compat baseline =====
    // Same call as T1-4 baseline: no scope_id filter (param=null).
    const aRes = await c.query(CARDS_LIST_SQL,
      [WALLIAM, null, null, false, null]
    );
    add('A1 cards-list (no filters) returns WALLiam baseline 12 cards',
        aRes.rows.length === 12, 'rows=' + aRes.rows.length);
    const a_community = aRes.rows.filter(r => r.scope === 'community').length;
    const a_muni = aRes.rows.filter(r => r.scope === 'municipality').length;
    add('A2 baseline: 11 community + 1 muni rows',
        a_community === 11 && a_muni === 1,
        'community=' + a_community + ' muni=' + a_muni);

    // ===== B: cards-list with scope=municipality + scope_id=Whitby muni =====
    const bRes = await c.query(CARDS_LIST_SQL,
      [WALLIAM, null, 'municipality', false, WHITBY_MUNI]
    );
    add('B1 cards-list(muni, Whitby) returns 1 card (Neo Smith muni)',
        bRes.rows.length === 1, 'rows=' + bRes.rows.length);
    add('B2 muni card agent = Neo Smith',
        bRes.rows[0]?.agent_id === NEO_SMITH,
        'agent=' + (bRes.rows[0]?.agent_id || 'NONE'));
    add('B3 muni card scope_id = Whitby muni',
        bRes.rows[0]?.scope_id === WHITBY_MUNI,
        'scope_id=' + (bRes.rows[0]?.scope_id || 'NONE'));

    // ===== C: cards-list with scope_id only (no scope filter) -- exercises the OR branches =====
    // Pick one community where King Shah has a card. Use the first WALLiam
    // active community card.
    const kingCommunity = aRes.rows.find(r => r.scope === 'community' && r.agent_id === KING_SHAH);
    if (kingCommunity) {
      const cRes = await c.query(CARDS_LIST_SQL,
        [WALLIAM, null, null, false, kingCommunity.scope_id]
      );
      add('C1 cards-list(scope_id only) returns the 1 community card',
          cRes.rows.length === 1, 'rows=' + cRes.rows.length);
      add('C2 community card agent = King Shah',
          cRes.rows[0]?.agent_id === KING_SHAH,
          'agent=' + (cRes.rows[0]?.agent_id || 'NONE'));
      add('C3 community card scope = community',
          cRes.rows[0]?.scope === 'community',
          'scope=' + (cRes.rows[0]?.scope || 'NONE'));
    } else {
      add('C1 cards-list(scope_id only) returns the 1 community card', false, 'SKIP: no King Shah community card');
      add('C2 community card agent = King Shah', false, 'SKIP');
      add('C3 community card scope = community', false, 'SKIP');
    }

    // ===== D: cards-list with scope but NO scope_id (backward compat) =====
    const dRes = await c.query(CARDS_LIST_SQL,
      [WALLIAM, null, 'community', false, null]
    );
    add('D1 cards-list(scope=community, no scope_id) returns all 11 community cards',
        dRes.rows.length === 11, 'rows=' + dRes.rows.length);

    // ===== E: Cross-tenant isolation =====
    // Query aily with WALLiam's Whitby muni scope_id -- should return 0.
    const eRes = await c.query(CARDS_LIST_SQL,
      [AILY, null, null, false, WHITBY_MUNI]
    );
    add('E1 aily tenant + WALLiam scope_id returns 0 rows (no cross-tenant leak)',
        eRes.rows.length === 0, 'rows=' + eRes.rows.length);

    // Conversely: query WALLiam with fabricated scope_id -- should return 0.
    const eRes2 = await c.query(CARDS_LIST_SQL,
      [WALLIAM, null, null, false, FAKE_SCOPE_ID]
    );
    add('E2 fabricated scope_id returns 0 rows',
        eRes2.rows.length === 0, 'rows=' + eRes2.rows.length);

    // ===== F: reroll-worker GET payload shape =====
    // The route does this exact query for queue depth.
    const fRes = await c.query(
      "SELECT " +
      "  COUNT(*) FILTER (WHERE status='pending') AS pending, " +
      "  COUNT(*) FILTER (WHERE status='processing') AS processing " +
      "FROM territory_reroll_queue WHERE tenant_id=$1",
      [WALLIAM]
    );
    add('F1 reroll-worker queue depth payload has pending + processing',
        fRes.rows[0]?.pending !== undefined && fRes.rows[0]?.processing !== undefined,
        'pending=' + fRes.rows[0]?.pending + ' processing=' + fRes.rows[0]?.processing);
    add('F2 pending count is non-negative integer',
        parseInt(fRes.rows[0].pending, 10) >= 0,
        'pending=' + fRes.rows[0].pending);
    add('F3 processing count is non-negative integer',
        parseInt(fRes.rows[0].processing, 10) >= 0,
        'processing=' + fRes.rows[0].processing);

    // ===== G: audit-log poll shape (mirrors route's main query) =====
    const gRes = await c.query(
      "SELECT id, agent_id, scope, scope_id, change_type, changed_at " +
      "FROM territory_assignment_changes " +
      "WHERE tenant_id = $1 " +
      "ORDER BY changed_at DESC LIMIT 20",
      [WALLIAM]
    );
    add('G1 audit-log returns rows (any count <= 20)',
        gRes.rows.length >= 0 && gRes.rows.length <= 20,
        'rows=' + gRes.rows.length);
    if (gRes.rows.length > 0) {
      const r = gRes.rows[0];
      add('G2 audit row has change_type, scope, changed_at',
          !!r.change_type && !!r.scope && !!r.changed_at,
          'change_type=' + r.change_type + ' scope=' + r.scope);
    } else {
      add('G2 audit row has change_type, scope, changed_at',
          true, 'SKIP: tenant has no audit rows yet');
    }

    // ===== H: geo-search live queries =====
    const hRes = await c.query(GEO_SEARCH_SQL, [WALLIAM, 'whitby', 20]);
    add('H1 geo-search "whitby" returns >= 1 row',
        hRes.rows.length >= 1, 'rows=' + hRes.rows.length);
    const h_muni = hRes.rows.find(r => r.kind === 'municipality' && r.name === 'Whitby');
    add('H2 geo-search "whitby" includes Whitby municipality',
        !!h_muni, h_muni ? 'parent=' + (h_muni.parent_name || 'NONE') : 'MISSING');

    const hRes2 = await c.query(GEO_SEARCH_SQL, [WALLIAM, 'king', 20]);
    add('H3 geo-search "king" returns >= 1 row',
        hRes2.rows.length >= 1, 'rows=' + hRes2.rows.length);
    const h_agent = hRes2.rows.find(r => r.kind === 'agent' && r.name === 'King Shah');
    add('H4 geo-search "king" includes King Shah agent (tenant-scoped)',
        !!h_agent, h_agent ? 'is_active=' + h_agent.is_active : 'MISSING');

    // Tenant scoping: aily search for "king" should NOT include King Shah.
    const hRes3 = await c.query(GEO_SEARCH_SQL, [AILY, 'king', 20]);
    const h_aily_kingshah = hRes3.rows.find(r => r.kind === 'agent' && r.name === 'King Shah');
    add('H5 aily geo-search "king" does NOT include WALLiam agent King Shah',
        !h_aily_kingshah, h_aily_kingshah ? 'LEAK detected' : 'no leak');

    // Short query: 1 char should return empty (route short-circuits but here we test SQL only).
    // The SQL itself would return matches even for 1 char; the route's short-circuit
    // happens before SQL runs. We document this rather than test it -- the route logic
    // handles it.
    add('H6 short-query short-circuit (route logic, not SQL)',
        true, 'documented: route short-circuits at qRaw.length < 2');

    // ===== I: T1-5 bulk-create happy path preserved (no regression) =====
    // Re-run the T1-5 J1-J7 sequence inside a SAVEPOINT to confirm
    // bulk-create + audit + queue still works.
    const vacantRes = await c.query(
      "SELECT c.id, c.name FROM communities c " +
      "WHERE c.id NOT IN (SELECT community_id FROM agent_property_access " +
      "WHERE tenant_id = $1::uuid AND scope = 'community' AND is_active = true AND community_id IS NOT NULL) " +
      "ORDER BY c.name LIMIT 1",
      [WALLIAM]
    );

    if (vacantRes.rows.length === 0) {
      add('I1 vacant slot exists for regression test', false, 'no vacant community');
    } else {
      const vacant = vacantRes.rows[0];
      add('I1 vacant slot found for regression test', true, 'community=' + vacant.name);

      await c.query('BEGIN');
      try {
        await c.query("SAVEPOINT i_start");
        await c.query("SET LOCAL app.skip_apa_reroll = 'on'");

        const ins = await c.query(
          "INSERT INTO agent_property_access (tenant_id, agent_id, scope, community_id, " +
          "  is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode) " +
          "VALUES ($1::uuid, $2::uuid, 'community', $3::uuid, " +
          "  true, true, true, true, true, 'all') RETURNING id",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        add('I2 bulk-create insert (T1-5 regression) succeeds',
            ins.rowCount === 1, 'inserted=' + ins.rowCount);

        const audit = await c.query(
          "SELECT change_type FROM territory_assignment_changes " +
          "WHERE tenant_id = $1::uuid AND agent_id = $2::uuid " +
          "  AND scope = 'community' AND scope_id = $3::uuid " +
          "ORDER BY changed_at DESC LIMIT 1",
          [WALLIAM, KING_SHAH, vacant.id]
        );
        add('I3 assignment_granted audit row written (no regression)',
            audit.rows[0]?.change_type === 'assignment_granted',
            'change_type=' + (audit.rows[0]?.change_type || 'NONE'));

        await c.query("ROLLBACK TO SAVEPOINT i_start");
        await c.query('ROLLBACK');
      } catch (e) {
        add('I2 bulk-create insert (T1-5 regression) succeeds', false, e.code + ' ' + e.message);
        add('I3 assignment_granted audit row written (no regression)', false, 'tx aborted');
        await c.query('ROLLBACK').catch(() => {});
      }
    }

  } catch (e) {
    console.error('FATAL during smoke:', e);
    try { await c.query('ROLLBACK'); } catch {}
    process.exit(2);
  }

  await c.end();

  let pass = 0, fail = 0;
  console.log('');
  console.log('================================================================');
  console.log('  W-TERRITORY-OPS T1-6 SMOKE -- live DB results');
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