# W-LIFECYCLE Landing 2 — reresolve_listings_in_set (PLAN DOC)

**Status:** PLAN. Not coded, not applied. Reviewable artifact only.
**Option:** A (locked) — set-based primitive, single-tenant per call, no queue.
**Date:** 2026-05-29
**Pairs with:** `phase-lifecycle-landing-2-recon-output.txt`, `phase-lifecycle-landing-2-verify-output.txt`
**Frozen contracts respected:** `resolve_agent_for_context` signature + body (unchanged).

Read `CLAUDE.md` (repo root) and `docs/W-TERRITORY-MASTER-TRACKER.md` first.

---

## 0. Cold-start verification snapshot (2026-05-29)

DB matches the verify recon exactly. All numbers re-checked at plan-doc draft time:

```
provenance trio (non-NULL cache):
  floor          1,284,892 rows  (source -> tenant_floor_pool.id, 0 orphans)
  community         12,621 rows  (source -> agent_property_access.id, 0 orphans)
  municipality           2 rows  (source -> agent_property_access.id, 0 orphans)
  total non-NULL  1,297,515 rows

NULL-cache:
  total                970 rows
  routable (condo+home with muni_id):  141 rows  (101 condo + 40 home)

coupled invariant illegal rows:  0
pick_floor_agent: SECURITY DEFINER + search_path=public,pg_temp  (Landing 1 ✓)
```

git HEAD: `d1d7d4f` (v21 tracker), branch `main` ahead of origin by 2.

---

## 1. Goal + scope

Wire **Event 5** (new listing arrives → resolve at insert) and **Event 6**
(listing geography changes → re-resolve) of the v16 lifecycle into the
nightly sync + future ad-hoc geo-change paths.

In scope:
- New PG function `reresolve_listings_in_set(p_listing_ids uuid[], p_tenant_id uuid)`.
- TypeScript hooks in `lib/homes-sync/save.ts` + `lib/building-sync/save.ts`
  to call the function with the post-upsert id set per batch.
- Geo-diff utility for Event 6 (pre-upsert SELECT + 5-column diff).
- Migration package (up + down + runner) following the Phase 1 / Landing 1
  rhythm.
- Smoke harness — `npm run dev` local + a small SQL smoke on a known
  NULL-cache row.

Out of scope (deferred):
- Multi-tenant sync (Landing 2 hardcodes WALLiam tenant id at the SYNC
  call site — the PG function itself is parameterized).
- Queue/async resolution (Option B / C).
- F-NIGHTLY-SYNC-TIMEOUT-6H operational fix (separate ticket).
- Drop of the broken `reresolve_listing` (kept; body replaced to call
  the new function with a single-element array).
- Event 4 (agent deactivation) — Landing 3.
- Event 7 (periodic reconciliation) — Landing 3.

---

## 2. Function spec — `reresolve_listings_in_set`

### Signature

```sql
CREATE OR REPLACE FUNCTION public.reresolve_listings_in_set(
  p_listing_ids uuid[],
  p_tenant_id   uuid
) RETURNS TABLE (resolved_count int, null_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ ... $$;
```

- **Inputs:** an array of listing UUIDs + a tenant UUID. Every CTE inside
  the function filters by `p_tenant_id`. No tenant constants in the body.
- **Returns:** one row with two counts (resolved this call / still NULL
  after this call). Convenient for the sync to log per-batch.
- **SECURITY DEFINER** + locked search_path: same posture Landing 1 set
  on `pick_floor_agent`. The function reads `agent_property_access`,
  `tenant_floor_pool`, `agents`, `agent_listing_assignments`,
  `agent_geo_buildings`, and writes `mls_listings`. Running as definer
  (postgres) bypasses the grant gaps service_role has on
  `tenant_floor_pool` and similar.
- **Caller contract** (mirrors Landing 1 lesson): the caller passes a
  validated `p_tenant_id`. Document this in `COMMENT ON FUNCTION`.

### Cascade — order, predicate, and writes

10 set-based UPDATEs, each labeled by its `assigned_scope` literal,
all narrowed by `ml.id = ANY(p_listing_ids)`. Each writes the provenance
trio `(assigned_agent_id, assigned_scope, assigned_source_id)` atomically.
Order mirrors `resolve_agent_for_context`'s P-walk: most-specific first.
The function executes them in sequence inside the caller's transaction
context. Each later step is intrinsically idempotent on rows the earlier
step already pinned, because the sticky guard prevents re-overwriting a
more-specific scope.

| # | Scope label | Source | Target predicate (in addition to `ml.id = ANY(p_listing_ids)`) | Sticky guard |
|---|---|---|---|---|
| L1 | `'pin'` | `agent_listing_assignments.id` | `ala.listing_id = ml.id AND ala.is_active AND a.is_active AND a.is_selling AND a.tenant_id = p_tenant_id` | none (pin is top) |
| L2 | `'building'` | `agent_geo_buildings.id` | `ml.building_id IS NOT NULL AND agb.building_id = ml.building_id AND agb.is_active AND a.is_active AND a.is_selling AND a.tenant_id = p_tenant_id` | `assigned_scope IS NULL OR scope_specificity(assigned_scope) < scope_specificity('building')` |
| L3 | `'community'` (condo) | apa.id at scope=community | hash-RR over apa rows at community-scope with condo_access; `ml.community_id IS NOT NULL`; `ml.property_type = 'Residential Condo & Other'` | `... < scope_specificity('community')` |
| L4 | `'community'` (home) | apa.id at scope=community | hash-RR with homes_access; `ml.property_type = 'Residential Freehold'` | `... < scope_specificity('community')` |
| L5 | `'municipality'` (condo) | apa.id at scope=municipality | hash-RR; `ml.municipality_id IS NOT NULL`; condo | `... < scope_specificity('municipality')` |
| L6 | `'municipality'` (home) | apa.id at scope=municipality | hash-RR; home | `... < scope_specificity('municipality')` |
| L7 | `'area'` (condo) | apa.id at scope=area | hash-RR; `ml.area_id IS NOT NULL`; condo | `... < scope_specificity('area')` |
| L8 | `'area'` (home) | apa.id at scope=area | hash-RR; home | `... < scope_specificity('area')` |
| L9 | `'floor'` (condo) | tenant_floor_pool.id | hash-RR over tfp with condo_access; condo | `assigned_scope IS NULL` (floor only fills uncached) |
| L10 | `'floor'` (home) | tenant_floor_pool.id | hash-RR over tfp with homes_access; home | `assigned_scope IS NULL` |

### Hash-RR pattern at every distribute / floor level

Direct copy of the pattern from `distribute_listings_at_geo` and
`reroll_listings_at_floor`, generalized to multi-geo via `PARTITION BY`:

```
WITH eligible AS (
  SELECT apa.id                         AS source_id,
         apa.agent_id,
         apa.<geo>_id                   AS geo_id,
         (ROW_NUMBER() OVER (PARTITION BY apa.<geo>_id ORDER BY apa.id) - 1) AS rn,
         COUNT(*)        OVER (PARTITION BY apa.<geo>_id)                    AS total
  FROM   agent_property_access apa
  JOIN   agents a ON a.id = apa.agent_id
  WHERE  apa.scope = '<scope>'
    AND  apa.tenant_id = p_tenant_id
    AND  apa.is_active
    AND  (<condo_access vs homes_access per call>)
    AND  a.is_active AND a.is_selling
),
picks AS (
  SELECT ml.id        AS listing_id,
         e.source_id  AS new_source_id,
         e.agent_id   AS new_agent
  FROM   mls_listings ml
  JOIN   eligible e
    ON   e.geo_id = ml.<geo>_id
   AND   e.rn = (abs(hashtext(ml.id::text)) % e.total)
  WHERE  ml.id = ANY(p_listing_ids)
    AND  ml.property_type = '<Residential Condo & Other | Residential Freehold>'
    AND  ml.<geo>_id IS NOT NULL
    AND  (ml.assigned_scope IS NULL
          OR scope_specificity(ml.assigned_scope) < scope_specificity('<scope>'))
)
UPDATE mls_listings ml
   SET assigned_agent_id  = picks.new_agent,
       assigned_scope     = '<scope>',
       assigned_source_id = picks.new_source_id
  FROM picks
 WHERE ml.id = picks.listing_id;
```

Differences from `distribute_listings_at_geo`:

- `distribute_listings_at_geo` takes a SINGLE `(scope, scope_id)` and
  scans ONE bucket. `reresolve_listings_in_set` scans MANY buckets at
  once because the input is N listings spanning K communities/munis/areas.
  `PARTITION BY apa.<geo>_id` makes the hash-RR per-bucket without a
  loop.
- The target predicate replaces the single `ml.<geo>_id = p_scope_id` with
  `e.geo_id = ml.<geo>_id` plus `ml.id = ANY(p_listing_ids)`.
- Provenance and sticky guard are byte-identical to `distribute_listings_at_geo`.

### Floor level

Direct copy of `reroll_listings_at_floor`, narrowed by `ml.id = ANY(p_listing_ids)`.
**Behavioral note on `tenant_floor_alerts`:** `reroll_listings_at_floor`
writes ONE alert when the pool is empty (no per-listing alerts). Landing 2
matches that: at most 2 alerts per call (one per property type if either
pool is empty). The per-listing alert pattern in `pick_floor_agent` is
*not* used by Landing 2 because it would produce one alert per cache-miss
listing during a sync burst — noisy.

### Return shape

```
resolved_count := L1_count + L2_count + ... + L10_count;
SELECT COUNT(*) INTO null_count
  FROM mls_listings
 WHERE id = ANY(p_listing_ids) AND assigned_agent_id IS NULL;
RETURN NEXT;
```

`resolved_count + null_count` should equal `cardinality(p_listing_ids)`
when the input is all-distinct. Sync logs both: `resolved_count > 0`
means cache made progress; `null_count > 0` is normal for input with
incomplete geo or Commercial property type.

---

## 3. Resolving the OPEN GAP — P1, P2, P3

The verify recon flagged P1 (listing pin), P2 (building pin), and P3
(neighbourhood) as not-yet-covered in the cascade sketch. Final decisions:

### P1 listing pin — **INCLUDED (L1)**

The resolver's P1 branch is reachable from sync data: `agent_listing_assignments`
(ala) is a separate table keyed on `listing_id`. When sync inserts a listing
with a pre-existing ala row, that row pins the agent regardless of geo.

L1 in the cascade is the SET-based equivalent. JOIN ala on
`ala.listing_id = ANY(p_listing_ids)`. UPDATE writes `assigned_scope = 'pin'`,
`assigned_source_id = ala.id`.

No sticky guard needed — `'pin'` is the top of `scope_specificity` and
ALWAYS overrides any other scope.

### P2 building pin — **INCLUDED (L2)**

Reachable from sync data: `agent_geo_buildings` (agb) is keyed by
`building_id`, and the listing's `building_id` is on `mls_listings`.

L2 JOINs `agb` on `agb.building_id = ml.building_id` for ids in the set,
WHERE `ml.building_id IS NOT NULL`. UPDATE writes
`assigned_scope = 'building'`, `assigned_source_id = agb.id`.

Sticky guard: `scope_specificity(assigned_scope) < scope_specificity('building')`
(only overrides community/muni/area/floor; respects existing 'pin').

### P3 neighbourhood — **EXCLUDED BY DESIGN (documented)**

`mls_listings` has NO `neighbourhood_id` column (verified per
`CLAUDE.md` "Verified key IDs"; the existing resolver's P3 branch is
unreachable from listing-context callers — `resolve_agent_for_context`'s
P3 only fires when `p_neighbourhood_id IS NOT NULL`, which it never is
when called from `reresolve_listing` or the sync layer).

Landing 2 therefore omits a neighbourhood-scope cascade step. **No
walk-equivalence loss:** the existing single-row resolver also can't
reach P3 from listing context.

If a future change adds neighbourhood data to `mls_listings`, this
function gains an `L_NEIGHBOURHOOD` step between L2 and L3. Document
this as `F-NEIGHBOURHOOD-NOT-ON-MLS-LISTINGS` for clarity (pre-existing
schema fact, not a Landing 2 finding).

### Walk-equivalence statement (final)

> `reresolve_listings_in_set(p_listing_ids, p_tenant_id)` is
> walk-equivalent to looping `resolve_agent_for_context(listing_id,
> building_id, NULL, community_id, municipality_id, area_id, NULL,
> p_tenant_id)` over `p_listing_ids` and writing back the resolved
> agent + scope + source — **MODULO N=1 carves**, minus the page-level
> untyped fallback (`pick_routing_agent`) which is unreachable when
> `listing_id` is provided.

**Modulo N=1 carves** is the precise hedge: at carve levels
(community/municipality/area), this function uses hash-RR
(`distribute_listings_at_geo` pattern); `resolve_agent_for_context`'s
P4/P5/P6 branches use **primary-pick** via `pick_routing_agent_for_type`
(`is_primary = true LIMIT 1`). The two agree when N=1 at the matched
scope (one apa row -> both pick that row). They **diverge by design**
when N>1: hash-RR distributes by `hashtext(listing_id) % N`; primary-pick
returns the `is_primary` row. v16's locked design stores the hash-RR
pick in the cache (this function); the resolver's primary-pick is the
fallback for the N=1 case when there's no cache yet.

The page-level fallback exclusion is identical to `reresolve_listing`'s
behavior today and is correct semantically: per-listing resolution always
provides a listing_id, so the page-level fallback never fires anyway.

V2's walk-equivalence assertion in the migration is therefore meaningful
only when the picked tenant has N=1 at the matched scope. The V2 setup
filters to "tenant with active floor pool and no TPA rules" -- which in
production today resolves to a WALLiam-style tenant whose carves are all
N=1. Documented in the V2 comment block of the migration .sql.

---

## 4. Sticky-precedence guard — formula

Every level L (except `'pin'` and `'floor'`) uses:

```
WHERE (ml.assigned_scope IS NULL)
   OR (scope_specificity(ml.assigned_scope) < scope_specificity('<level-label>'))
```

- `'pin'` (L1): no guard — always overrides.
- `'floor'` (L9, L10): tighter guard — `ml.assigned_scope IS NULL`. Floor
  only fills uncached rows; never overwrites any carve.

This mirrors `distribute_listings_at_geo`'s guard exactly. Phase 1's
1,297,515-row backfill respected this guard and produced 0 violations of
the coupled invariant, verified in the cold-start above.

`scope_specificity()` (recon-confirmed function) maps:
`pin > building > community > municipality > area > floor`
(neighbourhood unused by the set-based cascade — see §3).

---

## 5. Atomicity + transactional model

The function runs inside the caller's transaction. The Node sync layer
will:

```
BEGIN;
  -- (existing upsert into mls_listings, in batches of 400)
  -- collect post-upsert ids:  [ml1, ml2, ..., ml400]
  SELECT * FROM reresolve_listings_in_set($1::uuid[], $2::uuid);
COMMIT;
```

All 10 sub-UPDATEs of the function execute within the same transaction.
A failure in L9 rolls back L1-L8 too. This matches the Phase 1 pattern
("revert + re-materialize commit together or roll back together").

The current sync's batch transaction shape is unchanged — Landing 2 adds
one RPC call per batch, not a separate transaction. F-NIGHTLY-SYNC-TIMEOUT-6H
risk: each batch's transaction holds locks slightly longer (one extra
sub-second RPC). Negligible at the projected <30 sec per batch cost.

---

## 6. Security model

- `SECURITY DEFINER` + `SET search_path = public, pg_temp` (Landing 1
  pattern).
- The function's body uses no `auth.uid()`, `current_user`, `session_user`,
  or `current_setting`. Purely parameter-driven. Same audit conditions as
  Landing 1 (Precondition 2): SECURITY DEFINER is surgical.
- Caller contract documented in `COMMENT ON FUNCTION`: "caller passes
  validated `p_tenant_id`". The TypeScript sync hook is the single
  production caller; it passes the WALLiam constant for now.
- Frozen contract preserved: `resolve_agent_for_context` SIGNATURE and
  BODY untouched. This function is a sibling, not a wrapper or override.

---

## 7. TypeScript sync layer hooks

### `lib/homes-sync/save.ts` — Event 5 + Event 6

After the existing `.upsert(...).select()` returns the upserted rows:

```typescript
const upserted = result.data;          // existing
const allIds = upserted.map(r => r.id);

// Event 5: brand-new rows (assigned_agent_id IS NULL post-upsert because
// the upsert payload doesn't touch the cache columns).
// Event 6: existing rows whose geo changed.
//
// To avoid re-resolving rows whose geo did NOT change, do a pre-upsert SELECT
// of (id, area_id, municipality_id, community_id, building_id) keyed by
// listing_key for the rows we're about to upsert. Diff after upsert and
// keep the ids whose geo moved.
//
// (Spec for the diff utility lives in §8 below.)

const idsToResolve = await collectIdsForResolve(supabase, batch, upserted);

if (idsToResolve.length > 0) {
  const { data, error } = await supabase.rpc('reresolve_listings_in_set', {
    p_listing_ids: idsToResolve,
    p_tenant_id:   WALLIAM_TENANT_ID    // hardcoded for Landing 2; see §1 scope
  });
  if (error) { /* log + continue; the cache stays NULL, readers fall through */ }
  else       { /* log resolved_count / null_count */ }
}
```

### `lib/building-sync/save.ts` — same pattern

Buildings rarely change `building_id` on existing listings (the existing
`trigger_protect_building_id` BEFORE UPDATE trigger blocks that). So
Event 6 is essentially Event 5 here: any newly-inserted listing's id
goes into the resolve call.

`backfillListingGeoIds` (`lib/building-sync/save.ts:1174-1181`) UPDATEs
`area_id`, `municipality_id`, `community_id` after building insert. THIS
is the place Event 6 can fire for existing listings. Capture the affected
listing ids from the UPDATE's `.select()`/RETURNING and pass them to
`reresolve_listings_in_set`.

### Tenant constant

Landing 2 introduces `WALLIAM_TENANT_ID` at the SYNC call site only
(probably as a constant in `scripts/lib/territory-constants.ts` or
similar). Other locations that need it can import from there. This makes
multi-tenant onboarding a "swap the constant for a lookup" change, not a
function-signature change. File `F-SYNC-SINGLE-TENANT-IMPLICIT` to track.

---

## 8. Geo-diff utility (Event 6)

```typescript
type GeoCols = {
  area_id:         string | null;
  municipality_id: string | null;
  community_id:    string | null;
  building_id:     string | null;
  // neighbourhood_id intentionally omitted (no column on mls_listings).
};

async function readPreviousGeo(
  supabase, listingKeys: string[]
): Promise<Map<string, GeoCols & { id: string }>> {
  const { data } = await supabase
    .from('mls_listings')
    .select('id, listing_key, area_id, municipality_id, community_id, building_id')
    .in('listing_key', listingKeys);
  // explicit column allow-list per CLAUDE.md
  return new Map(data.map(r => [r.listing_key, r]));
}

function geoChanged(a: GeoCols, b: GeoCols): boolean {
  return a.area_id         !== b.area_id
      || a.municipality_id !== b.municipality_id
      || a.community_id    !== b.community_id
      || a.building_id     !== b.building_id;
}
```

`collectIdsForResolve` is the composite:

1. Read pre-upsert geo for every `listing_key` in the batch.
2. After the upsert, for each upserted row:
   - if it didn't exist before (Event 5) → include
   - if it did, and geo changed (Event 6) → include
   - if it did, and geo unchanged → skip
3. Return the id list.

Cost: one extra SELECT per batch (indexed by listing_key). Cheap.

---

## 9. Migration package outline (NOT WRITTEN YET)

### Files

| Path | Purpose |
|---|---|
| `supabase/migrations/20260530_phase_lifecycle_landing_2_reresolve_in_set.sql` | Up: CREATE FUNCTION + COMMENT + V1..V5 in-tx asserts |
| `supabase/migrations/20260530_phase_lifecycle_landing_2_down.sql` | Down: DROP FUNCTION + restore old `reresolve_listing` body (if we patched it) |
| `scripts/apply-phase-lifecycle-landing-2.js` | Runner (Landing 1 pattern: BOM-strip, port-6543 reject, pre-snapshot, BEGIN, V-asserts, COMMIT, post-verify) |

### In-transaction asserts (Landing 1 V-style)

- **V1** — `pg_proc.prosecdef = true` and `proconfig` contains `search_path=public, pg_temp` for `reresolve_listings_in_set`.
- **V2** — Call `reresolve_listings_in_set('{NULL-cache-Whitby-condo-id}'::uuid[], WALLIAM)` and verify the returned `resolved_count = 1`, `null_count = 0`, AND verify the row's post-state is the coupled trio (agent + scope + source_id all set).
- **V3** — Call on a known carved listing (Brooklin condo `f8a24890-...`); verify `resolved_count = 0` (sticky guard held; community carve wasn't overwritten), the row's pre-state preserved.
- **V4** — Call with empty array + valid tenant → returns `(0, 0)`. Guard rail.
- **V5** — Call with valid array + NULL tenant → returns `(0, 0)`. Guard rail.

All inside one transaction; ROLLBACK on any V-fail.

### Down-migration

- DROP `reresolve_listings_in_set`.
- If we patched the old `reresolve_listing` to call the new function: restore its original body from the rollback snapshot.

---

## 10. Smoke harness — local + F-VERIFY-READONLY-HANG note

### `npm run dev` is NOT the right smoke for this function

Landing 2 has no user-facing route. The reader paths (Phase 2) are already
wired and don't change. The function fires inside the sync, which is a
cron-only path. So:

### Smoke harness — node script (not the runner)

`scripts/smoke-phase-lifecycle-landing-2.js`:

1. Pick a known NULL-cache routable listing id (`SELECT ... LIMIT 1` from
   condo+home + muni_id IS NOT NULL).
2. Call `reresolve_listings_in_set([that_id]::uuid[], WALLIAM_TENANT_ID)`.
3. Assert: returned `resolved_count = 1`, `null_count = 0`. Re-SELECT the
   row, verify the coupled trio.
4. Pick a known CARVED listing (`f8a24890-...`, scope='community').
   Call the function. Assert: returned `resolved_count = 0` (sticky held);
   re-SELECT confirms pre-state preserved.
5. Call with `[]::uuid[]`. Assert: `(0, 0)`.
6. Call with valid array + NULL tenant. Assert: `(0, 0)`.

Step 1's "pick" is the tricky one because:

### F-VERIFY-READONLY-HANG

The verify recon and the cold-start both reproduced a hang when a query
of the form

```
SELECT property_type, COUNT(*) FROM mls_listings
WHERE assigned_agent_id IS NULL
  AND property_type IN (...)
  AND municipality_id IS NOT NULL
GROUP BY property_type
```

is run as the SECOND query in the same Node `Client` connection. The first
query (provenance scope counts) returns in <2 sec; the second hangs
indefinitely. Closing the connection and reconnecting clears the hang.

Cause: not yet diagnosed. Hypothesis: planner picks a sequential scan
under some session state that's set by the first query; without an index
on `(assigned_agent_id, property_type, municipality_id)` or similar, the
sequential scan of 1.3M rows is what we're waiting on (note: the standalone
query DOES return in ~1 sec, suggesting the SECOND-query slowdown is from
plan-cache state, not raw scan time).

**Smoke-harness mitigation:** the harness opens ONE pg client per probe,
runs that probe, and closes. No multi-probe single-connection usage.

**Plan-doc filing:** F-VERIFY-READONLY-HANG (active, low-priority). Not a
Landing 2 blocker — Landing 2's UPDATEs run via the migration runner +
sync, not the verify harness. But worth knowing.

---

## 11. Acceptance criteria

After Landing 2 ships + one nightly sync runs:

- Total NULL-cache count drops from current 970 to ≤ 850 (or whatever
  Commercial + insufficient-geo floor remains; current routable subset
  is 141 — most should clear).
- 0 coupled-invariant violations (assert via the same query in cold-start
  §0).
- `pg_proc` shows `reresolve_listings_in_set.prosecdef = true` with
  locked search_path.
- `territory_floor_alerts` does NOT show a new row per cache-miss listing
  (the function's empty-pool behavior matches `reroll_listings_at_floor`,
  not `pick_floor_agent`).
- Sync GH Actions run shows the resolve RPC log lines per batch.
- `agent SET, scope NULL` count stays 0 (no row ever transitions through
  the illegal state).

---

## 12. Open decisions to lock with operator

1. **Patch `reresolve_listing` body to call `reresolve_listings_in_set`, OR drop it?**
   - Recommended: patch its body to call the new function with a one-element
     array. Preserves the symbol for any future ad-hoc single-row callers
     AND fixes F-RERESOLVE-COUPLED-CHECK. Body becomes ~5 lines.
   - Alternative: DROP it. Slightly cleaner but loses an entry point a
     future operator-tool might rely on.
2. **`tenant_floor_alerts` empty-pool behavior** — confirm matching `reroll_listings_at_floor`'s "one alert per call when pool empty" is the right semantic, not `pick_floor_agent`'s "one alert per listing." (Recommended: match `reroll_listings_at_floor`.)
3. **Geo-diff utility location** — new file `lib/utils/geo-diff.ts`, OR inline in `lib/homes-sync/save.ts` + `lib/building-sync/save.ts`? (Recommended: new file, importable from both.)
4. **`WALLIAM_TENANT_ID` constant location** — new file `scripts/lib/territory-constants.ts`, OR import from existing `scripts/smoke-recipients-helper.ts:34`? (Recommended: new file, since the smoke helper is a different concern.)
5. **Smoke-harness verbosity** — assert just the coupled trio, or also assert the picked agent matches `resolve_agent_for_context`'s output? (Recommended: both — the coupled trio is the safety invariant, the agent match is the walk-equivalence check.)
6. **Migration timestamp** — use `20260530_*` (next-day prefix) to keep ordering past Landing 1's `20260529_*`, or stick with `20260529_*`? (Recommended: `20260530_*` since this draft is being written near midnight UTC and Landing 2 will likely apply on the 30th.)

---

## 13. Items to land in tracker v22 (after Landing 2 ships)

- PART 3: add Landing 2 row with SHA + outcome.
- PART 5:
  - F-RERESOLVE-COUPLED-CHECK → RESOLVED 2026-05-30 (Landing 2) with V2 fix-proof.
  - F-RESOLVE-AT-INSERT-PRIORITY → RESOLVED 2026-05-30 (Landing 2) with next-morning NULL-cache delta.
  - F-SYNC-SINGLE-TENANT-IMPLICIT (new, NOT BLOCKING).
  - F-NIGHTLY-SYNC-TIMEOUT-6H (new, NOT BLOCKING, separate ticket).
  - F-VERIFY-READONLY-HANG (new, low-priority, harness-side mitigation in place).
  - F-NEIGHBOURHOOD-NOT-ON-MLS-LISTINGS (clarification, not bug).
- PART 4: add v22 condensed-history entry.
- PART 6: capture lesson(s) — likely "set-based vs loop when the inner walk is already set-based primitives" + "PARTITION BY for multi-bucket hash-RR".
- PART 7: tick checkbox once Landing 3 also closes.
- Path correction: PART 5 F-RESOLVE-AT-INSERT-PRIORITY currently cites `lib/homes-save.ts`; actual is `lib/homes-sync/save.ts`. Fix in same v22 commit.

---

## 14. NEXT STEPS

This is plan-only. Awaiting operator review.

When approved:
1. Draft the migration SQL (`20260530_phase_lifecycle_landing_2_reresolve_in_set.sql`)
   + down + apply-runner. Show for review.
2. Apply the migration via the runner (operator-approved, single
   transaction, in-tx asserts).
3. Smoke locally via the new harness script.
4. Wire the TypeScript hooks in `lib/homes-sync/save.ts` and
   `lib/building-sync/save.ts`. Local smoke against a dev-server sync
   path if available; otherwise small unit-shape check.
5. Commit the artifact set (migration + runner + down + hooks + smoke
   harness + geo-diff utility + tenant-constant file).
6. Update tracker to v22.
7. Wait for one nightly sync. Re-check acceptance criteria. Close
   F-RERESOLVE-COUPLED-CHECK + F-RESOLVE-AT-INSERT-PRIORITY.
