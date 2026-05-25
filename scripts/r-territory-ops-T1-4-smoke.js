#!/usr/bin/env node
/**
 * r-territory-ops-T1-4-smoke.js
 *
 * W-TERRITORY-OPS T1-4 -- smoke runner.
 *
 * Verifies the 6 code artifacts shipped by the Phase 3 apply runner:
 *   - app/api/admin-homes/territory/cards-list/route.ts        (new)
 *   - app/api/admin-homes/territory/cards/bulk-restore/route.ts (new)
 *   - components/admin-homes/cockpit/territory/CardsView.tsx   (new)
 *   - app/api/admin-homes/territory/audit-log/route.ts          (patched: scope/scope_id filters + bug fix)
 *   - components/admin-homes/cockpit/tabs/TerritoryTab.tsx     (patched: 4-way toggle + CardsView mount)
 *   - components/admin-homes/cockpit/territory/AgentsView.tsx  (patched: View cards button)
 *
 * Sections:
 *   1. Static checks on all 6 files (substantive markers beyond what the apply runner verified)
 *   2. Live cards-list against WALLiam (real production data, read-only)
 *   3. Live audit-log scope filter (read-only)
 *   4. Live multi-tenant isolation (aily empty tenant)
 *   5. Live DRY RUN under transaction with ROLLBACK (deactivate -> verify audit -> restore -> verify audit -> ROLLBACK)
 *   6. Bulk-restore tenant-safety negative paths (read-only)
 *
 * Every mutation is wrapped in BEGIN/ROLLBACK so production state stays exactly as it is.
 * Verified-from-session constants (every literal traces to deploy or recon output this session):
 *   WALLIAM_TENANT_ID = b16e1039-38ed-43d7-bbc5-dd02bb651bc9
 *   AILY_TENANT_ID    = e2619717-6401-4159-8d4c-d5f87651c8d6
 *   KING_SHAH_AGENT   = fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe
 *   SMOKE_CARD_ID     = 34fc6480-5d40-4d0f-8986-6a7387eb1e9a   (King Shah community card)
 *   SMOKE_COMMUNITY   = fa263f70-b603-49dd-be19-cbd289ac2023   (the card's community_id)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL env var required');
  process.exit(1);
}

const ROOT = process.cwd();
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const AILY_TENANT_ID    = 'e2619717-6401-4159-8d4c-d5f87651c8d6';
const KING_SHAH_AGENT   = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const SMOKE_CARD_ID     = '34fc6480-5d40-4d0f-8986-6a7387eb1e9a';
const SMOKE_COMMUNITY   = 'fa263f70-b603-49dd-be19-cbd289ac2023';

let checks = 0;
let pass = 0;
let fail = 0;
const failures = [];

function check(label, predicate, detail) {
  checks++;
  if (predicate) {
    pass++;
    console.log('  PASS  ' + label + (detail ? '  -- ' + detail : ''));
  } else {
    fail++;
    failures.push(label + (detail ? '  -- ' + detail : ''));
    console.log('  FAIL  ' + label + (detail ? '  -- ' + detail : ''));
  }
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

(async () => {
  console.log('[T1-4 SMOKE] starting');
  console.log('');

  // ============================================================================
  // Section 1: static checks (substantive markers beyond apply-runner verification)
  // ============================================================================
  console.log('========== Section 1: static checks ==========');

  // cards-list route
  const cl = readFile('app/api/admin-homes/territory/cards-list/route.ts');
  check('cards-list: GET handler exported', /export\s+async\s+function\s+GET/.test(cl));
  check('cards-list: uses pg Client (not Supabase JS builder)', /new Client\(/.test(cl));
  check('cards-list: clamps limit to 1..200', /Math\.min\(200/.test(cl));
  check('cards-list: validates agent_id UUID', /UUID_RE\.test\(agentIdParam\)/.test(cl));
  check('cards-list: validates scope against allowed list', /ALLOWED_SCOPES\.includes/.test(cl));
  check('cards-list: WHERE filters apa.tenant_id = $1', /apa\.tenant_id\s*=\s*\$1/.test(cl));
  check('cards-list: LATERAL/DISTINCT ON last_event', /DISTINCT ON \(tenant_id, agent_id, scope, scope_id\)/.test(cl));
  check('cards-list: LEFT JOIN agents cb for last_event_by_name', /LEFT JOIN agents cb ON cb\.id = le\.changed_by/.test(cl));
  check('cards-list: ILIKE percent wildcards in q filter', /ILIKE '%' \|\| \$5::text \|\| '%'/.test(cl));

  // bulk-restore route
  const br = readFile('app/api/admin-homes/territory/cards/bulk-restore/route.ts');
  check('bulk-restore: POST handler exported', /export\s+async\s+function\s+POST/.test(br));
  check('bulk-restore: validates card_ids non-empty array', /card_ids must be non-empty array/.test(br));
  check('bulk-restore: rejects already-active batch (409)', /all cards already active/.test(br));
  check('bulk-restore: BEGIN/COMMIT transaction', /BEGIN[\s\S]*COMMIT/.test(br));
  check('bulk-restore: ROLLBACK on error', /ROLLBACK/.test(br));

  // CardsView
  const cv = readFile('components/admin-homes/cockpit/territory/CardsView.tsx');
  check('CardsView: PAGE_SIZE = 50', /PAGE_SIZE = 50/.test(cv));
  check('CardsView: debounce search 300ms', /setTimeout.*?setSearchQDebounced.*?300/.test(cv));
  check('CardsView: passes scope_id to audit-log', /params\.set\('scope_id', panelCard\.scope_id\)/.test(cv));
  check('CardsView: groups selected cards by source agent for reassign', /bySource\s*=\s*new Map/.test(cv));
  check('CardsView: clearFilters resets all 4 filters', /setFilterAgent\(null\)[\s\S]*setFilterScope\(null\)[\s\S]*setIncludeInactive\(false\)[\s\S]*setSearchQ\(''\)/.test(cv));
  check('CardsView: renders Audit history heading', /Audit history/.test(cv));

  // audit-log patched
  const al = readFile('app/api/admin-homes/territory/audit-log/route.ts');
  check('audit-log: still has limit clamp 1..500', /Math\.min\(500/.test(al));
  check('audit-log: distinct_change_types still returned', /distinct_change_types/.test(al));
  check('audit-log: scope eq is conditional on filter present', /if \(filterScope\) q = q\.eq\('scope', filterScope\)/.test(al));

  // TerritoryTab patched
  const tt = readFile('components/admin-homes/cockpit/tabs/TerritoryTab.tsx');
  check('TerritoryTab: cardsAgentFilter state', /cardsAgentFilter/.test(tt));
  check('TerritoryTab: setView switches to cards on onViewCards', /setView\('cards'\)/.test(tt));
  check('TerritoryTab: TerritoryClient mount preserved (Detail branch)', /<TerritoryClient/.test(tt));

  // AgentsView patched
  const av = readFile('components/admin-homes/cockpit/territory/AgentsView.tsx');
  check('AgentsView: onViewCards optional prop typed', /onViewCards\?:\s*\(agentId:\s*string\)\s*=>\s*void/.test(av));
  check('AgentsView: View cards button calls onViewCards', /onViewCards\(r\.agent_id\)/.test(av));

  // ============================================================================
  // Section 2: live cards-list against WALLiam
  // ============================================================================
  console.log('');
  console.log('========== Section 2: live cards-list against WALLiam ==========');

  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();

  // Mirror the route's exact SQL with each filter combination.
  async function queryCardsList({ tenantId, agentId = null, scope = null, includeInactive = false, q = null, limit = 50, offset = 0 }) {
    const sql = `
      WITH base AS (
        SELECT
          apa.id, apa.agent_id, apa.scope,
          CASE apa.scope
            WHEN 'area' THEN apa.area_id
            WHEN 'municipality' THEN apa.municipality_id
            WHEN 'community' THEN apa.community_id
            WHEN 'neighbourhood' THEN apa.neighbourhood_id
          END AS scope_id,
          apa.is_active,
          a.full_name AS agent_name,
          COALESCE(ar.name, mu.name, co.name, nb.name) AS geo_name
        FROM agent_property_access apa
        JOIN agents a ON a.id = apa.agent_id
        LEFT JOIN treb_areas ar ON apa.scope = 'area' AND ar.id = apa.area_id
        LEFT JOIN municipalities mu ON apa.scope = 'municipality' AND mu.id = apa.municipality_id
        LEFT JOIN communities co ON apa.scope = 'community' AND co.id = apa.community_id
        LEFT JOIN neighbourhoods nb ON apa.scope = 'neighbourhood' AND nb.id = apa.neighbourhood_id
        WHERE apa.tenant_id = $1
          AND ($2::uuid IS NULL OR apa.agent_id = $2::uuid)
          AND ($3::text IS NULL OR apa.scope = $3::text)
          AND ($4::boolean = true OR apa.is_active = true)
      ),
      filtered AS (
        SELECT * FROM base
        WHERE ($5::text IS NULL OR agent_name ILIKE '%' || $5::text || '%' OR geo_name ILIKE '%' || $5::text || '%')
      ),
      total AS ( SELECT COUNT(*)::int AS n FROM filtered )
      SELECT f.*, (SELECT n FROM total) AS total_count
      FROM filtered f
      ORDER BY f.scope, f.geo_name, f.agent_name
      LIMIT $6 OFFSET $7
    `;
    const r = await c.query(sql, [tenantId, agentId, scope, includeInactive, q, limit, offset]);
    return { rows: r.rows, total: r.rows.length > 0 ? r.rows[0].total_count : 0 };
  }

  const r1 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID });
  check('cards-list WALLiam default (active only): 12 cards', r1.rows.length === 12, 'got=' + r1.rows.length);
  check('cards-list WALLiam default: total_count=12', r1.total === 12, 'total=' + r1.total);

  const r2 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, agentId: KING_SHAH_AGENT });
  check('cards-list WALLiam agent=King Shah: 11 cards', r2.rows.length === 11, 'got=' + r2.rows.length);

  const r3 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, scope: 'community' });
  check('cards-list WALLiam scope=community: 11 cards', r3.rows.length === 11, 'got=' + r3.rows.length);

  const r4 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, scope: 'municipality' });
  check('cards-list WALLiam scope=municipality: 1 card', r4.rows.length === 1, 'got=' + r4.rows.length);

  const r5 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, includeInactive: true });
  check('cards-list WALLiam include_inactive=true: 12 (no inactive yet)', r5.rows.length === 12, 'got=' + r5.rows.length);

  const r6 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, q: 'king' });
  check('cards-list WALLiam q=king: 11 cards (King Shah name match)', r6.rows.length === 11, 'got=' + r6.rows.length);

  const r7 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, limit: 5, offset: 0 });
  check('cards-list WALLiam paginated limit=5 offset=0: 5 rows', r7.rows.length === 5, 'got=' + r7.rows.length);
  check('cards-list WALLiam paginated total still 12', r7.total === 12, 'total=' + r7.total);

  const r8 = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, limit: 5, offset: 10 });
  check('cards-list WALLiam paginated offset=10: 2 rows', r8.rows.length === 2, 'got=' + r8.rows.length);

  // geo_name correctness checks
  const communityRows = r3.rows.filter(row => row.scope === 'community');
  check('cards-list geo_name resolved for all community cards', communityRows.every(row => row.geo_name !== null), 'null count=' + communityRows.filter(row => row.geo_name === null).length);
  const muniRows = r4.rows.filter(row => row.scope === 'municipality');
  check('cards-list geo_name resolved for municipality card', muniRows.every(row => row.geo_name !== null), 'null count=' + muniRows.filter(row => row.geo_name === null).length);

  // CASE expression: scope_id should match the right per-scope column
  const smokeCard = r2.rows.find(row => row.id === SMOKE_CARD_ID);
  check('smoke target card found in agent=King Shah results', smokeCard !== undefined);
  if (smokeCard) {
    check('smoke target card scope_id = community_id (CASE expression correct)', smokeCard.scope_id === SMOKE_COMMUNITY, 'scope_id=' + smokeCard.scope_id);
  }

  // ============================================================================
  // Section 3: live audit-log scope filter
  // ============================================================================
  console.log('');
  console.log('========== Section 3: live audit-log scope filter ==========');

  // Mirror audit-log's query with scope + scope_id filters
  const aHistory = await c.query(
    `SELECT id, tenant_id, agent_id, scope, scope_id, change_type, changed_at
     FROM territory_assignment_changes
     WHERE tenant_id = $1
       AND agent_id = $2
       AND scope = $3
       AND scope_id = $4
     ORDER BY changed_at DESC
     LIMIT 20`,
    [WALLIAM_TENANT_ID, KING_SHAH_AGENT, 'community', SMOKE_COMMUNITY]
  );
  check('audit-log scope/scope_id filter returns rows for smoke card slot', aHistory.rows.length > 0, 'rows=' + aHistory.rows.length);
  check('all returned audit rows match scope=community', aHistory.rows.every(row => row.scope === 'community'));
  check('all returned audit rows match scope_id=smoke community', aHistory.rows.every(row => row.scope_id === SMOKE_COMMUNITY));

  // ============================================================================
  // Section 4: live multi-tenant isolation
  // ============================================================================
  console.log('');
  console.log('========== Section 4: multi-tenant isolation ==========');

  const ailyCards = await queryCardsList({ tenantId: AILY_TENANT_ID });
  check('cards-list aily: 0 cards (matches Pre-flight Section 4)', ailyCards.rows.length === 0, 'got=' + ailyCards.rows.length);
  check('cards-list aily: total_count=0', ailyCards.total === 0, 'total=' + ailyCards.total);

  const ailyCardsInactive = await queryCardsList({ tenantId: AILY_TENANT_ID, includeInactive: true });
  check('cards-list aily include_inactive=true: 0 cards', ailyCardsInactive.rows.length === 0, 'got=' + ailyCardsInactive.rows.length);

  // audit-log isolation: aily querying with WALLiam's scope_id should return 0
  const crossTenant = await c.query(
    `SELECT COUNT(*)::int AS n FROM territory_assignment_changes
     WHERE tenant_id = $1 AND scope_id = $2`,
    [AILY_TENANT_ID, SMOKE_COMMUNITY]
  );
  check('audit-log aily + WALLiam scope_id: 0 rows (tenant isolation)', crossTenant.rows[0].n === 0, 'got=' + crossTenant.rows[0].n);

  // ============================================================================
  // Section 5: live DRY RUN deactivate -> restore -> ROLLBACK
  // ============================================================================
  console.log('');
  console.log('========== Section 5: DRY RUN deactivate->restore->ROLLBACK ==========');

  // Pre-tx baseline
  const baselineActiveQ = await c.query(
    'SELECT COUNT(*)::int AS n FROM agent_property_access WHERE tenant_id = $1 AND is_active = true',
    [WALLIAM_TENANT_ID]
  );
  const baselineActive = baselineActiveQ.rows[0].n;
  check('PRE-TX: WALLiam active card count baseline = 12', baselineActive === 12, 'got=' + baselineActive);

  await c.query('BEGIN');
  try {
    // Step 1: deactivate the smoke card (mimic bulk-deactivate route logic)
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'");
    const deact = await c.query(
      `UPDATE agent_property_access SET is_active = false, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND is_active = true
        RETURNING id`,
      [SMOKE_CARD_ID, WALLIAM_TENANT_ID]
    );
    check('IN-TX deactivate: 1 row affected', deact.rowCount === 1, 'rowCount=' + deact.rowCount);

    // Verify the deactivate audit row was written
    const auditAfterDeact = await c.query(
      `SELECT change_type FROM territory_assignment_changes
       WHERE tenant_id = $1 AND agent_id = $2 AND scope = $3 AND scope_id = $4
       ORDER BY changed_at DESC LIMIT 1`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT, 'community', SMOKE_COMMUNITY]
    );
    check('IN-TX deactivate: latest audit row exists', auditAfterDeact.rows.length === 1);
    check('IN-TX deactivate: latest change_type is assignment_revoked', auditAfterDeact.rows[0]?.change_type === 'assignment_revoked', 'got=' + (auditAfterDeact.rows[0]?.change_type || 'none'));

    // cards-list with default filter should now return 11
    const afterDeactDefault = await queryCardsList({ tenantId: WALLIAM_TENANT_ID });
    check('IN-TX cards-list default (active only): 11', afterDeactDefault.rows.length === 11, 'got=' + afterDeactDefault.rows.length);

    // cards-list with include_inactive=true should return 12
    const afterDeactAll = await queryCardsList({ tenantId: WALLIAM_TENANT_ID, includeInactive: true });
    check('IN-TX cards-list include_inactive=true: 12', afterDeactAll.rows.length === 12, 'got=' + afterDeactAll.rows.length);

    // Step 2: restore the smoke card (mimic bulk-restore route logic)
    const restore = await c.query(
      `UPDATE agent_property_access SET is_active = true, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND is_active = false
        RETURNING id`,
      [SMOKE_CARD_ID, WALLIAM_TENANT_ID]
    );
    check('IN-TX restore: 1 row affected', restore.rowCount === 1, 'rowCount=' + restore.rowCount);

    // Verify the restore audit row was written.
    // NOTE: now() is frozen across a single transaction (transaction_timestamp()), so both
    // deactivate and restore audit rows share changed_at -- 'latest by changed_at' is not
    // deterministic in this case. We assert by counting each change_type in the slot's audit
    // history snapshot relative to the IN-TX baseline.
    const auditCountsAfterRestore = await c.query(
      `SELECT change_type, COUNT(*)::int AS n
       FROM territory_assignment_changes
       WHERE tenant_id = $1 AND agent_id = $2 AND scope = $3 AND scope_id = $4
         AND changed_at >= (
           SELECT MIN(changed_at) FROM territory_assignment_changes
           WHERE tenant_id = $1 AND agent_id = $2 AND scope = $3 AND scope_id = $4
             AND changed_at >= now()
         )
       GROUP BY change_type`,
      [WALLIAM_TENANT_ID, KING_SHAH_AGENT, 'community', SMOKE_COMMUNITY]
    );
    const ctMap = Object.fromEntries(auditCountsAfterRestore.rows.map(r => [r.change_type, r.n]));
    check('IN-TX restore: assignment_revoked audited (from deactivate)', (ctMap.assignment_revoked || 0) >= 1, 'count=' + (ctMap.assignment_revoked || 0));
    check('IN-TX restore: assignment_granted audited (from restore)', (ctMap.assignment_granted || 0) >= 1, 'count=' + (ctMap.assignment_granted || 0));

    // cards-list default should return 12 again
    const afterRestoreDefault = await queryCardsList({ tenantId: WALLIAM_TENANT_ID });
    check('IN-TX cards-list default (after restore): 12', afterRestoreDefault.rows.length === 12, 'got=' + afterRestoreDefault.rows.length);
  } finally {
    await c.query('ROLLBACK');
    console.log('  -- ROLLBACK executed');
  }

  // Post-tx verification: production state unchanged
  const postTxActiveQ = await c.query(
    'SELECT COUNT(*)::int AS n FROM agent_property_access WHERE tenant_id = $1 AND is_active = true',
    [WALLIAM_TENANT_ID]
  );
  const postTxActive = postTxActiveQ.rows[0].n;
  check('POST-TX: WALLiam active card count UNCHANGED = 12', postTxActive === 12, 'got=' + postTxActive);

  const postTxCard = await c.query(
    'SELECT is_active FROM agent_property_access WHERE id = $1',
    [SMOKE_CARD_ID]
  );
  check('POST-TX: smoke card is_active still true', postTxCard.rows[0]?.is_active === true, 'got=' + postTxCard.rows[0]?.is_active);

  // ============================================================================
  // Section 6: bulk-restore tenant-safety negative paths (read-only)
  // ============================================================================
  console.log('');
  console.log('========== Section 6: bulk-restore negative paths (read-only) ==========');

  // Simulate the route's tenant-safety check: every card_id must belong to tenant.
  const allCards = await c.query(
    'SELECT id, tenant_id FROM agent_property_access WHERE id = ANY($1::uuid[])',
    [[SMOKE_CARD_ID, '00000000-0000-0000-0000-000000000000']]
  );
  check('bulk-restore: fabricated card_id missing from query result', allCards.rows.length === 1, 'rows=' + allCards.rows.length);
  check('bulk-restore: route would reject with "not found" (rows.length !== card_ids.length)',
    allCards.rows.length !== 2);

  // Cross-tenant: imagine an aily card_id passed with WALLiam tenant scope -- it would fail tenant_id mismatch.
  // We can't easily test this without an aily card existing, but we can verify the route's logic shape:
  const brBody = readFile('app/api/admin-homes/territory/cards/bulk-restore/route.ts');
  check('bulk-restore: route enforces r.tenant_id !== tenantId rejection',
    /rows\.some\(\(r:\s*any\)\s*=>\s*r\.tenant_id\s*!==\s*tenantId\)/.test(brBody));

  await c.end();

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('');
  console.log('================================================================');
  console.log('  CHECKS: ' + checks + '  PASS: ' + pass + '  FAIL: ' + fail);
  console.log('================================================================');
  if (fail > 0) {
    console.log('');
    console.log('Failures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
})().catch(e => {
  console.error('[T1-4 SMOKE] error:', e);
  process.exit(1);
});