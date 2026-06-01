# F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK — RECON (P1 FIX 2 of 3)

**Date:** 2026-06-01
**Scope:** read-only recon answering the 5 design questions. No migration drafted.
**Live probe:** `scripts/cv-reroll-coupled-check-recon.js` → `cv-reroll-coupled-check-recon-output.txt`

---

## TL;DR

1. **Live DB body of `reroll_listings_at_geo` is set-based (hash-RR) — NOT the per-row-cursor body in `supabase/migrations/20260507_t3b_b_01_distribution_functions.sql`.** The live body was applied via a migration that was **never committed to git** (v22-lesson GIT DRIFT). The on-disk migration is stale; treat the **live body as ground truth**. Backfill of the missing migration should ride along with this fix (or be a separate commit).
2. **The half-NULL bug is real and fires on the live body, not the on-disk one.** The live body writes `assigned_agent_id` only — no `assigned_scope`/`assigned_source_id`. Empty routing set → agent=NULL while scope stays non-NULL → coupled CHECK violation.
3. **Tracker entry overstates "at-risk-row probe = 0".** Today's probe shows **2 rows at risk** (Commercial property type at municipality scope) — they would half-NULL on a next municipality-scope reroll. Latent for residential paths today; not for Commercial.
4. **`reresolve_listings_in_set` is NOT drop-in substitutable.** Its sticky guard (`assigned_scope < p_scope`) prevents re-pick AT THE SAME scope — wrong for reroll, where the whole point is to re-pick at the geo where the apa just changed.
5. **Recommended fix shape**: two-step "NULL the trio first, then delegate to reresolve_listings_in_set". Preserves the proven set-based cascade + the trio-atomic write, while restoring "force re-pick at this geo" semantics. Body preserves the `(text, uuid, uuid) RETURNS int` signature (callers untouched). Flip to `SECURITY DEFINER + locked search_path` for consistency with `reresolve_listings_in_set` and the `handle_apa_*` handlers.

---

## Q1 — Current body of `reroll_listings_at_geo` + half-NULL paths

**Live body** (71 lines, `pg_get_functiondef` 2026-06-01, raw at `cv-reroll-coupled-check-recon-output.txt` §1). Set-based hash-RR shape:

```sql
CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope text, p_scope_id uuid, p_tenant_id uuid
) RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN RETURN 0; END IF;
  IF p_scope NOT IN ('area','municipality','community') THEN RETURN 0; END IF;

  -- Compute routing set size once.
  SELECT COUNT(*) INTO v_total FROM agent_property_access
   WHERE scope=p_scope AND is_active=TRUE AND tenant_id=p_tenant_id
     AND ((p_scope='area'         AND area_id=p_scope_id)
       OR (p_scope='municipality' AND municipality_id=p_scope_id)
       OR (p_scope='community'    AND community_id=p_scope_id));

  WITH routing AS (
    SELECT agent_id, (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
      FROM agent_property_access
     WHERE scope=p_scope AND is_active=TRUE AND tenant_id=p_tenant_id
       AND (... scope-id match ...)
  ),
  picks AS (
    SELECT ml.id AS listing_id, r.agent_id AS new_pick
      FROM mls_listings ml
      LEFT JOIN routing r
        ON v_total > 0
       AND r.rn = (abs(hashtext(ml.id::text)) % NULLIF(v_total, 0))
     WHERE (... scope-id match ...)
  ),
  updated AS (
    UPDATE mls_listings ml
       SET assigned_agent_id = picks.new_pick      -- ONLY agent. Trio bug.
      FROM picks
     WHERE ml.id = picks.listing_id
       AND ml.assigned_agent_id IS DISTINCT FROM picks.new_pick
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;
```

**posture (live):** `prosecdef=false` (SECURITY INVOKER), `proconfig=null` (no search_path lock), `owner=postgres`.

**Columns written:** ONLY `assigned_agent_id`. `assigned_scope` and `assigned_source_id` are never touched.

**Half-NULL violation paths (3 of them):**

| # | Pre-state | New pick | Post-UPDATE | Constraint |
|---|---|---|---|---|
| (a) | `(agent=X, scope=community)` | `new_pick=NULL` (routing set emptied) | `(agent=NULL, scope=community)` | ❌ VIOLATES |
| (b) | `(agent=NULL, scope=NULL)` (NULL-cache hit) | `new_pick=Y` (apa exists) | `(agent=Y, scope=NULL)` | ❌ VIOLATES |
| (c) | `(agent=X, scope=building)` (firm building rule) | `new_pick=Y` (overrides via reroll) | `(agent=Y, scope=building)` | ✓ holds, but **wrong agent** — building scope says "agent=building's firm agent", which was X; the new community pick Y silently replaces it. Sticky-scope semantic violation, not a coupled-check violation. |

(Plus a non-bug: `(agent=X, scope=community)` → `(agent=Y, scope=community)` where Y is a new community pick — agent column updated, scope stays correct (community=community). This case is OK as far as the coupled CHECK; but the new body should still write `assigned_source_id` for audit completeness.)

**Other latent issues observed in the live body** (worth fixing in the same patch since we're rewriting the body anyway):

- **No property_type discriminator** — the routing CTE picks any active apa at the scope, regardless of `condo_access` / `homes_access`. A Whitby community apa with `condo_access=TRUE, homes_access=FALSE` would still get rolled onto a `Residential Freehold` listing. The matchers in `reresolve_listings_in_set` correctly split community×condo / community×home at L3/L4.
- **No sticky-scope preservation** — pin/building rows in the geo get rerolled to community/muni/area agents, overwriting their firm assignment.
- **Commercial listings** — neither `condo_access` nor `homes_access` covers `Residential Commercial`. Live probe found **2 such rows** at municipality scope where the next reroll would produce `new_pick=NULL` → half-NULL violation today. (See §9 of probe output.)
- **`territory_floor_pool` fallback** — the live body has no fallback when routing set is empty; just hands every row a NULL pick. `reresolve_listings_in_set`'s L9/L10 floor branch covers this cleanly.

---

## Q2 — Every caller of `reroll_listings_at_geo` (signature contract)

**Signature:** `public.reroll_listings_at_geo(p_scope text, p_scope_id uuid, p_tenant_id uuid) RETURNS integer` — confirmed live (`pronargs=3`, `result_type=integer`).

**Callers (live + grep across repo):**

1. **`handle_apa_insert()`** — inline branch when `app.skip_apa_reroll != 'on'`:
   ```
   PERFORM reroll_listings_at_geo(NEW.scope, v_scope_id, NEW.tenant_id);
   ```
   (return value ignored.) Migration: [supabase/migrations/20260524_w_cockpit_p_b_2_c2a_trigger_async.sql:57](supabase/migrations/20260524_w_cockpit_p_b_2_c2a_trigger_async.sql#L57). Now `SECURITY DEFINER` after `d2f0e69`.

2. **`handle_apa_update()`** — inline branch at NEW scope AND at OLD scope (2 PERFORMs):
   ```
   PERFORM reroll_listings_at_geo(NEW.scope, v_new_scope_id, NEW.tenant_id);  -- L170
   PERFORM reroll_listings_at_geo(OLD.scope, v_old_scope_id, OLD.tenant_id);  -- L187
   ```
   (return value ignored.) Now `SECURITY DEFINER` after `d2f0e69`.

3. **`handle_apa_delete()`** — inline branch at OLD scope:
   ```
   PERFORM reroll_listings_at_geo(OLD.scope, v_scope_id, OLD.tenant_id);
   ```
   (return value ignored.) Now `SECURITY DEFINER` after `d2f0e69`.

4. **`app/api/admin-homes/territory/reroll-worker/route.ts` POST handler** — async drain from `territory_reroll_queue`:
   ```
   const r = await c.query(
     'SELECT reroll_listings_at_geo($1::text, $2::uuid, $3::uuid) AS n',
     [job.scope, job.scope_id, tenantId]
   )
   rowsUpdated = r.rows[0].n
   ```
   (return value USED — `rowsUpdated` is stored on `territory_reroll_queue.rows_updated` and reported in the API response.) pg-direct as `postgres` (via `DATABASE_URL`), not service_role. Drained by `.github/workflows/reroll-worker.yml` cron every 5 min.

**Contract for a body-only fix:**
- Signature `(text, uuid, uuid) RETURNS integer` — MUST preserve.
- Return value semantics — the worker uses it as `rowsUpdated`; old body returned the count of rows whose `assigned_agent_id` actually changed. The new body should return the same metric (rows whose final agent differs from pre-state) so the queue audit trail stays meaningful.
- Trigger inline-branch callers ignore the return; no exposure there.

**Other call sites** (grep noise, not callers):
- `scripts/cv-territory-reroll-probe.js` (read-only probe — reads function def)
- `scripts/smoke-cv-territory.js` (CV-TERRITORY smoke — invokes the function as part of smoke)
- `scripts/cv-fixture-trigger-probe-2.js` (CV fixture probe)
- `supabase/migrations/rollback-snapshots/_f-apa-secdef-sweep_handlers_*.sql` (forensic snapshot, not active)

No SQL caller outside the 3 trigger handlers + the worker route.

---

## Q3 — `reresolve_listings_in_set` signature + how `reresolve_listing` delegates (the proven fix pattern)

**`reresolve_listings_in_set` (the set-based primitive):**
- Signature: `(p_listing_ids uuid[], p_tenant_id uuid) RETURNS TABLE(resolved_count integer, null_count integer)`
- Posture (live): `prosecdef=TRUE` (SECURITY DEFINER), `proconfig=['search_path=public, pg_temp']`, `owner=postgres`.
- Body: 10-level cascade (pin → building → community×condo → community×home → muni×condo → muni×home → area×condo → area×home → floor×condo → floor×home), each level a CTE+UPDATE that writes the coupled trio atomically. Sticky guard `(assigned_scope IS NULL OR scope_specificity(assigned_scope) < scope_specificity(<this-level>))` at every geo level. Property_type discriminator at every condo/home level.
- Migration: [supabase/migrations/20260530_phase_lifecycle_landing_2_reresolve_in_set.sql](supabase/migrations/20260530_phase_lifecycle_landing_2_reresolve_in_set.sql).

**`reresolve_listing` (the proven delegate-shim):**
- Body (live):
  ```sql
  IF p_listing_id IS NULL THEN RETURN NULL; END IF;
  PERFORM public.reresolve_listings_in_set(ARRAY[p_listing_id]::uuid[], p_tenant_id);
  SELECT assigned_agent_id INTO v_agent FROM public.mls_listings WHERE id = p_listing_id;
  RETURN v_agent;
  ```
- Posture: `SECURITY INVOKER` (default). The inner `PERFORM` crosses into the DEFINER chain.

**Can `reroll_listings_at_geo` delegate the same way?** **No — not directly.** The semantic differs:

| Function | Intent | Sticky guard? |
|---|---|---|
| `reresolve_listing(s_in_set)` | "These specific listings might be stale; re-walk if-and-only-if a more-specific rule now applies. Preserve current scope if equal-or-more-specific." | YES — `current < this-level` means same-level rules WIN over current cache. |
| `reroll_listings_at_geo(scope, id, tenant)` | "The apa at this geo just changed; FORCE re-pick for every listing in this geo." | NO — must re-pick even when current scope == p_scope. |

So a one-line `PERFORM reresolve_listings_in_set(collected_ids, tenant)` would leave listings already at the rerolled scope **untouched** (sticky blocks the re-write at L3/L4/L5/L6/L7/L8). Wrong semantics.

**The proven pattern adapts to "NULL the trio first, then delegate".** The sticky guard's first branch is `assigned_scope IS NULL`. If we transition the listings to NULL/NULL/NULL atomically before delegating, the cascade re-walks them as if they were fresh NULL-cache rows. Same trio-atomic property; preserves pin/building (they're not collected); restores the force-repick semantic.

---

## Q4 — SECURITY DEFINER + grant/role posture

**Current live posture:**

| Function | prosecdef | proconfig | owner | Notes |
|---|---|---|---|---|
| `reroll_listings_at_geo` | **false** (INVOKER) | `null` (no search_path lock) | postgres | Reachable from service_role via 2 paths (both safe today, see below) |
| `reresolve_listings_in_set` | true (DEFINER) | `search_path=public, pg_temp` | postgres | The pattern to mirror |
| `reresolve_listing` | false (INVOKER) | null | postgres | Body delegates to the DEFINER function (chain) |
| `handle_apa_insert/update/delete` | true (DEFINER) | `search_path=public, pg_temp` | postgres | Flipped 2026-05-30 by `d2f0e69` |
| `pick_routing_agent` | false (INVOKER) | null | postgres | Inner used by the old body (becomes unused after the fix) |

**Caller chain analysis — does `reroll_listings_at_geo` need DEFINER?**

- **Path A: trigger inline branch** (`handle_apa_*` → `PERFORM reroll_listings_at_geo`). The handlers are DEFINER as of `d2f0e69`. Per PostgreSQL semantics, when a DEFINER function calls an INVOKER function, the INVOKER function inherits the DEFINER's effective role for the duration of the outer body. So `reroll_listings_at_geo` runs as `postgres` here today (verified in `20260530_f_apa_secdef_sweep.sql` V5). Works.
- **Path B: worker route** (`app/api/admin-homes/territory/reroll-worker/route.ts` → `SELECT reroll_listings_at_geo(...)` via pg-direct `DATABASE_URL`). pg-direct connects as `postgres`. Works.

**`mls_listings` grants** (live probe §6): `service_role` has `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE` — full RWX. So even if a future caller switched to `supabase-js → service_role`, an INVOKER `reroll_listings_at_geo` would still have grants to mutate `mls_listings`. The INVOKER posture works under all 3 production roles today.

**`agent_property_access` grants** — not probed, but `reresolve_listings_in_set` reads it under DEFINER (postgres). If we delegate, the inner DEFINER chain handles it; no grant issue in the outer.

**Recommendation: flip to `SECURITY DEFINER + SET search_path = public, pg_temp`.** Reasons:
1. Consistency with the function it delegates to (`reresolve_listings_in_set`) and the callers that drive it (`handle_apa_*`).
2. Belt-and-suspenders against a future caller wiring (e.g., a server-side admin route via supabase-js → service_role) that might hit grant gaps on inner tables (`territory_floor_pool`, `tenant_floor_alerts` per the v27 lesson — those have grant walls).
3. Aligns with the standing rule in PART 6 v25 lesson: "Functions that perform writes to grant-restricted tables MUST run as SECURITY DEFINER if any caller chain reaches them under SET LOCAL ROLE service_role." The inner `reresolve_listings_in_set` writes `tenant_floor_alerts` (which is grant-restricted).

**Safety audit per Landing 1's v21 SECURITY-DEFINER rubric:**
- (1) Body has no `auth.uid()` / `current_user` / `session_user` / `current_setting` / dynamic SQL — ✅ confirmed (the new body would use `p_tenant_id` parameter only, no role-derived data).
- (2) Every caller auditable — ✅ 3 trigger handlers (DB-internal, derive tenant from trigger context) + 1 worker route (validates tenant via session OR cron-token + UUID-shape check in `resolveTenantId`).
- (3) Caller chain validates `p_tenant_id` — ✅ all 4 callers source it from request-context or trigger-context, not from raw user input.
- (4) `search_path` locked — will set in the migration.

---

## Q5 — Smoke design (BEGIN/ROLLBACK exercising the half-NULL row)

**Fixture target** (live probe §11): WALLiam community-scope carves. Smallest viable target with non-trivial community-scoped count = **Blue Grass Meadows** (`community_id=691943e2-b892-44b3-a437-e8d2e5b53119`, 1228 listings at scope=community).

For wall-clock economy on smoke, **smaller is better** — I'll pick the smallest WALLiam community carve with at least 1 community-scoped listing, runtime-SELECTed (Rule Zero: no hardcoded UUIDs).

**Smoke harness shape (5 assertions, all BEGIN/ROLLBACK):**

```
BEGIN;
SAVEPOINT s;

-- T1: live function shape check.
--   prosecdef=TRUE, proconfig has 'search_path=public, pg_temp', signature unchanged.
SELECT prosecdef, proconfig, pg_get_function_arguments(oid), pg_get_function_result(oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='reroll_listings_at_geo';

-- T2: STICKY PRESERVATION -- pinned listings untouched by reroll.
--   Setup: SELECT a listing in a WALLiam community geo; if it doesn't have a pin,
--   INSERT a synthetic agent_listing_assignments row inside this tx pinning it
--   to an arbitrary WALLiam agent. Capture (pre_agent, pre_scope='pin', pre_source).
--   Action: PERFORM reroll_listings_at_geo('community', that_community_id, walliam_tenant)
--   Assert: post-state of the pinned listing == pre-state. Pin survives.

-- T3: HALF-NULL EMPTY-POOL CASE (the core bug).
--   Setup: SELECT a WALLiam community with N community-scoped condo listings.
--   Action 1: UPDATE all apa rows for that community to is_active=FALSE inside tx
--             (rolls back). This empties the routing set for that geo+condo.
--   Action 2: PERFORM reroll_listings_at_geo('community', that_community_id, walliam_tenant)
--   Assert A: ZERO half-NULL rows post-call:
--     SELECT COUNT(*) FROM mls_listings
--      WHERE community_id = that_community_id
--        AND ((assigned_agent_id IS NULL) <> (assigned_scope IS NULL))
--     -- expected 0
--   Assert B: The previously-community-scoped condo listings either:
--     (i) fell to municipality / area / floor scope cleanly (trio coherent), OR
--     (ii) went NULL/NULL/NULL atomically.
--     No row may be half-NULL.

-- T4: WALK-EQUIVALENCE -- post-reroll agents match what
--     reresolve_listings_in_set would have produced on those same listings.
--   Same setup as T3.
--   For each post-reroll listing in the geo, capture (final_agent, final_scope).
--   Then ROLLBACK to a savepoint before the reroll, re-NULL the trio manually,
--   and call reresolve_listings_in_set(those_listing_ids, walliam_tenant).
--   Assert: same final (agent, scope) for every listing -- proves the new
--   reroll body is walk-equivalent to NULL-then-delegate.
--   (This may be combined with T3 if savepoint nesting gets noisy.)

-- T5: RETURN-VALUE CONTRACT -- the worker depends on this.
--   Same setup as T3. Capture pre-state agents into a temp table.
--   Call: SELECT reroll_listings_at_geo('community', that_community_id, walliam_tenant) AS n.
--   Assert: n equals the COUNT of rows whose assigned_agent_id actually changed
--   (compared against the temp table). Matches OLD function semantic.

ROLLBACK TO s;
ROLLBACK;
```

All in one transaction with savepoint isolation. No production state survives. Smoke uses runtime-SELECTed WALLiam community + WALLiam agent (no hardcoded UUIDs).

**Test scale concern (v25 smoke-T6 lesson)**: even Blue Grass Meadows is 1228 listings; reroll is wall-clock heavy under the proposed body (NULL-then-cascade-walk = 11 UPDATEs over ~1.2K rows). The Landing 2 smoke harness benchmarked this at ~30s for 10K rows; 1.2K should be sub-second. Smoke harness uses pg-direct `Client` with `.on('error', ...)` handler attached (per v25 lesson). `SET statement_timeout=0` not required at this scale.

---

## At-risk-row count today (correction to tracker entry)

Tracker entry (PART 5 line 477) says "Currently latent (at-risk-row probe = 0)." **Today's live probe (§9) shows:**

| scope | property_type | at_risk_count |
|---|---|---|
| municipality | Commercial | 2 |

Two Commercial municipality-scoped rows exist where the apa for `(municipality, Commercial)` no longer matches a current active apa with appropriate property-access flags. These rows would half-NULL on the next municipality reroll. Not zero. The tracker entry's "latent" qualifier should be updated when this finding is closed.

---

## Recommended fix design (for review BEFORE migration draft)

```sql
ALTER FUNCTION public.reroll_listings_at_geo(text, uuid, uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope text, p_scope_id uuid, p_tenant_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_listing_ids uuid[];
  v_pre_agents  jsonb;
  v_changed     int := 0;
BEGIN
  -- Input-shape guards only (NULL tenant handled by predicate no-op in delegate).
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN RETURN 0; END IF;
  IF p_scope NOT IN ('area','municipality','community') THEN RETURN 0; END IF;

  -- Collect listings in this geo whose current scope is at-or-below p_scope.
  -- Excludes pin (specificity=6) and building (5) -- firm assignments are never
  -- overridden by a geo reroll. Includes NULL-cache rows.
  SELECT array_agg(ml.id)
    INTO v_listing_ids
    FROM public.mls_listings ml
   WHERE ((p_scope='community'    AND ml.community_id    = p_scope_id)
       OR (p_scope='municipality' AND ml.municipality_id = p_scope_id)
       OR (p_scope='area'         AND ml.area_id         = p_scope_id))
     AND (ml.assigned_scope IS NULL
          OR public.scope_specificity(ml.assigned_scope)
             <= public.scope_specificity(p_scope));

  IF v_listing_ids IS NULL OR cardinality(v_listing_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- Capture pre-state agents for the return-value diff.
  SELECT jsonb_object_agg(id::text, COALESCE(assigned_agent_id::text, 'null'))
    INTO v_pre_agents
    FROM public.mls_listings WHERE id = ANY(v_listing_ids);

  -- TRIO-ATOMIC RESET: NULL all three columns in one UPDATE. Coupled CHECK
  -- holds because (NULL, NULL, NULL) satisfies the both-NULL branch.
  UPDATE public.mls_listings
     SET assigned_agent_id  = NULL,
         assigned_scope     = NULL,
         assigned_source_id = NULL
   WHERE id = ANY(v_listing_ids);

  -- Re-walk the cascade. Writes the coupled trio atomically per UPDATE.
  -- reresolve_listings_in_set is SECURITY DEFINER + locked search_path;
  -- handles tenant scoping + property_type discriminator + sticky guards
  -- + floor-pool fallback + empty-pool alerts.
  PERFORM public.reresolve_listings_in_set(v_listing_ids, p_tenant_id);

  -- Return: count of rows whose final agent differs from pre-state.
  SELECT COUNT(*)::int INTO v_changed
    FROM public.mls_listings ml
   WHERE ml.id = ANY(v_listing_ids)
     AND COALESCE(ml.assigned_agent_id::text, 'null')
         IS DISTINCT FROM (v_pre_agents ->> (ml.id::text));

  RETURN v_changed;
END;
$function$;
```

**Properties:**
- ✅ Signature unchanged — callers untouched.
- ✅ Coupled CHECK holds at every intermediate state (NULL/NULL/NULL or non-NULL/non-NULL/non-NULL).
- ✅ Pin / building rows preserved (excluded from `v_listing_ids`).
- ✅ Property_type discriminator inherited from `reresolve_listings_in_set` (no longer assigns condo agent to home listing).
- ✅ Floor-pool fallback inherited (Commercial listings fall through to floor → NULL/NULL/NULL atomically).
- ✅ SECURITY DEFINER + locked search_path — consistent with siblings.
- ✅ Return value matches old semantic (rows whose final agent changed).
- ⚠️ Walk-equivalence with the OLD body: NOT bit-identical. The OLD body's hash-RR pick ordered by `apa.id`; the new path's L3/L4/L5/L6/L7/L8 also order by `apa.id` (per L150 of `reresolve_listings_in_set` migration), so picks should match for `N>1` apa cases. For `N=1` cases both produce the same single agent. **Test T4 above proves this.**

---

## Git-drift housekeeping (out-of-scope but flagged)

The live body of `reroll_listings_at_geo` (set-based hash-RR) was applied to production without committing the migration .sql file to git. The on-disk `supabase/migrations/20260507_t3b_b_01_distribution_functions.sql` still has the original per-row-cursor body. This is the exact v22 lesson scenario ("commit applied migrations in the same session that applies them").

**Resolution shape:** the P1 FIX 2 migration's "CREATE OR REPLACE" replaces the live body with the new trio-atomic body, AND the migration .sql is committed in the same flow. The on-disk-vs-live divergence is then closed atomically (no need to backfill the intermediate set-based shape — it was never the right body).

---

**End of recon. NO migration drafted yet. Awaiting review of this synthesis + the raw probe at `cv-reroll-coupled-check-recon-output.txt`.**
