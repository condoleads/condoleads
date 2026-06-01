# EVENT 7 — nightly reconcile — RECON (P-LIFECYCLE Landing 3, last event)

**Date:** 2026-06-01
**Scope:** read-only recon answering the 6 design questions. No build.
**Live probe:** `scripts/cv-event7-recon.js` → `cv-event7-recon-output.txt`

---

## TL;DR

1. **`reconcile_corrections` does NOT exist** — net-new table. Schema proposed at §Q1 (listing_id, tenant_id, old/new trio, reason, reconciled_at).
2. **Sync-delta signal is excellent.** `mls_listings.updated_at` (timestamp with time zone) is populated; ~17k rows in the last 24h (realistic nightly delta), ~84k in 7 days. Also `last_synced_at`, `last_modified_at`, `modification_timestamp` are available. **One index needed**: `(updated_at)` on mls_listings — currently no timestamp index, so a 24h-delta scan would seq-scan 1.3M rows. Net-new index goes in the same migration as the table.
3. **`sync_history` and `sync_logs` tables already exist** — secondary signals usable for cross-checking the delta probe.
4. **Reconcile CAN reuse `reresolve_listings_in_set`** via the same NULL-then-delegate pattern proven in P1 FIX 2 (`reroll_listings_at_geo`). One transaction per tenant: capture pre-state → NULL trio → delegate → diff pre vs post → INSERT into `reconcile_corrections` for mismatches → COMMIT.
5. **Cron infrastructure mirrors `reroll-worker.yml`** (proven pattern): separate `.github/workflows/reconcile.yml`, daily cron after the nightly-sync window (e.g., 09:00 UTC = 04:00 EST, ~2h after sync starts), Bearer cron-token auth, route at `/api/admin-homes/territory/reconcile`. Single-tenant per HTTP call (matches `reresolve_listings_in_set`'s `(uuid[], uuid)` shape); workflow iterates WALLIAM + AILY env vars like reroll-worker does.
6. **Threshold-alert surface**: `tenant_floor_alerts` is already wired into the P-DASHBOARD CORE-5 health route; add `alert_type='reconcile_threshold_exceeded'` rows when corrections > 50. Belt-and-suspenders: the workflow exits non-0 on threshold-exceed so GH Actions surfaces a failure notification too.

---

## Q1 — `reconcile_corrections` schema (net-new)

Probe §Q1: table NOT FOUND. Proposed schema:

```sql
CREATE TABLE public.reconcile_corrections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id),
  listing_id      uuid        NOT NULL REFERENCES public.mls_listings(id),
  old_agent_id    uuid,                            -- NULL if cache was unrouted
  old_scope       text,
  old_source_id   uuid,
  new_agent_id    uuid,                            -- NULL if no rule resolved
  new_scope       text,
  new_source_id   uuid,
  reason          text        NOT NULL,            -- 'sync_delta' | 'flagged' | 'rolling_sample'
  reconciled_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reconcile_corrections_tenant_time
  ON public.reconcile_corrections (tenant_id, reconciled_at DESC);
CREATE INDEX idx_reconcile_corrections_listing
  ON public.reconcile_corrections (listing_id);
```

Grants: `postgres` owner; `service_role` SELECT for dashboard read path. RLS off (audit table, written by the SECURITY DEFINER reconcile RPC; read by service_role).

Why `reason` text not enum: keeps the candidate set extensible (a future "operator-flagged" reason can be added without an enum migration).

Why no `corrected_by` column: this is a system-driven audit, not user-driven. The route's tenant-context + the timestamp identify the run.

---

## Q2 — Bounded scope: how do we identify candidate rows without scanning 1.28M?

**Three signal sources, combined in one CTE per run:**

### Q2.A — sync-delta (the primary signal, ~17k rows/night)

`mls_listings.updated_at` is populated and reliable. Probe §Q2d:
- Last 24h: **17,039 rows**
- Last 7d: **84,149 rows**

Query:
```sql
SELECT id FROM mls_listings
 WHERE updated_at > now() - interval '24 hours'
   AND building_id IS NOT NULL  -- and/or area/community present; same eligibility
                                 -- predicate as reresolve_listings_in_set inputs
```

**Index needed** (probe §Q2c: no timestamp index exists today on mls_listings):
```sql
CREATE INDEX idx_mls_listings_updated_at ON mls_listings (updated_at DESC);
```
Without this, a 24h-delta scan on 1.3M rows would seq-scan. With it, the scan is bounded by the matching row count (~17k). Index creation cost: ~30s on 1.3M rows; goes in the same migration as the table.

**Alternative signal (cross-check, not primary):** `last_synced_at` is also populated by the PropTx sync runner. Could use either; `updated_at` is the more general "row touched" signal and includes manual edits + trigger-induced mutations (Phase 2 reader cache updates write here too).

### Q2.B — flagged rows (defensive, expected ~0 today)

Two kinds of "flagged":

1. **Coupled-check violators**: rows where `(assigned_agent_id IS NULL) <> (assigned_scope IS NULL)`. After P1 FIX 2 these are impossible to create (constraint + atomic trio writes), but as defense-in-depth we still check. Expected count today: 0 (probe in P1 FIX 2 recon confirmed).
2. **NULL-cache rows in routed scope**: `assigned_agent_id IS NULL AND building_id IS NOT NULL` — listings that the resolve-at-insert hook (Event 5) failed to resolve. P-DASHBOARD GAP-D NULL-cache panel surfaces these.

Query:
```sql
SELECT id FROM mls_listings
 WHERE (assigned_agent_id IS NULL) <> (assigned_scope IS NULL)  -- half-NULL
    OR (assigned_agent_id IS NULL AND building_id IS NOT NULL)  -- routable but unrouted
```

### Q2.C — rolling sample (drift telemetry, ~1000 rows/night)

Catches drift in rows that haven't been touched recently. Two design options:

- **Random sample**: `ORDER BY random() LIMIT 1000` — simple but unfair coverage over time.
- **Oldest-reconciled**: requires a `last_reconciled_at` column on mls_listings (net-new). Fairer: every row gets touched within ~1300 nights.

**Recommendation**: random sample for v1 (no new column on mls_listings). If drift telemetry shows hot spots, switch to oldest-reconciled in v2.

Query:
```sql
SELECT id FROM mls_listings
TABLESAMPLE BERNOULLI (0.08)  -- 0.08% of 1.3M = ~1000 rows
 WHERE assigned_scope IS NOT NULL                  -- only routed rows
```

### Total candidate set per nightly run

~17k (delta) + ~0 (flagged today) + ~1000 (sample) = **~18k rows/night**. Walks atomically in well under a minute.

---

## Q3 — Reconcile logic: can it reuse `reresolve_listings_in_set` directly?

**Yes, via the NULL-then-delegate pattern (same as P1 FIX 2 `reroll_listings_at_geo`).** The sticky guard inside `reresolve_listings_in_set` PREVENTS direct re-pick at the same scope — for reconcile we WANT to force re-walk regardless of current scope (the whole point is "is the current cache still correct?"). NULL-ing the trio first defeats the sticky guard cleanly.

**Per-tenant transactional shape:**

```sql
BEGIN;

-- 1. Capture pre-state for the candidate set.
CREATE TEMP TABLE _e7_pre ON COMMIT DROP AS
SELECT id, assigned_agent_id, assigned_scope, assigned_source_id, _reason
  FROM mls_listings ml
  JOIN candidates c ON c.listing_id = ml.id;

-- 2. NULL the trio for the candidate set (atomic).
UPDATE mls_listings
   SET assigned_agent_id  = NULL,
       assigned_scope     = NULL,
       assigned_source_id = NULL
 WHERE id IN (SELECT id FROM _e7_pre);

-- 3. PERFORM the cascade walker. Writes the coupled trio atomically per level.
PERFORM reresolve_listings_in_set(
  (SELECT array_agg(id) FROM _e7_pre),
  p_tenant_id
);

-- 4. Log corrections: rows whose post-state differs from pre-state.
INSERT INTO reconcile_corrections
  (tenant_id, listing_id, old_agent_id, old_scope, old_source_id,
   new_agent_id, new_scope, new_source_id, reason, reconciled_at)
SELECT p_tenant_id,
       pre.id,
       pre.assigned_agent_id,  pre.assigned_scope,  pre.assigned_source_id,
       ml.assigned_agent_id,   ml.assigned_scope,   ml.assigned_source_id,
       pre._reason,
       now()
  FROM _e7_pre pre
  JOIN mls_listings ml ON ml.id = pre.id
 WHERE (pre.assigned_agent_id, pre.assigned_scope, pre.assigned_source_id)
       IS DISTINCT FROM
       (ml.assigned_agent_id,  ml.assigned_scope,  ml.assigned_source_id);

-- 5. Optional: threshold alert.
INSERT INTO tenant_floor_alerts (tenant_id, property_type, listing_id, alert_type)
SELECT p_tenant_id, 'system', NULL, 'reconcile_threshold_exceeded'
 WHERE (SELECT COUNT(*) FROM reconcile_corrections
         WHERE tenant_id = p_tenant_id
           AND reconciled_at > now() - interval '5 minutes') > 50;

COMMIT;
```

**Churn trade-off**: this UPDATEs every candidate row (NULL then re-pick), even rows that turn out unchanged. 17k UPDATEs/night is bounded and atomic. Trigger churn: the apa-trigger fires only on `agent_property_access` mutations; this mutates `mls_listings` directly, not apa, so no trigger cascade.

**Wrap as a SECURITY DEFINER function** (mirrors `reresolve_listings_in_set` + the new `reroll_listings_at_geo`):

```sql
CREATE OR REPLACE FUNCTION public.reconcile_tenant_cache(
  p_tenant_id     uuid,
  p_lookback_hours int DEFAULT 24,
  p_sample_pct     numeric DEFAULT 0.08,
  p_threshold      int DEFAULT 50
) RETURNS TABLE (corrections_count int, candidates_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  -- [implementation per the shape above]
$function$;
```

Single function call per tenant from the route. Returns counts; route returns them in JSON for the workflow to log + threshold-check.

---

## Q4 — Where does it RUN?

**Mirror `.github/workflows/reroll-worker.yml`** — proven cron pattern.

Proposed `.github/workflows/reconcile.yml`:

```yaml
name: Nightly Reconcile

on:
  schedule:
    - cron: '0 9 * * *'   # 09:00 UTC = 04:00 EST -- ~2h after nightly-sync starts at 07:00 UTC
  workflow_dispatch:
    inputs:
      lookback_hours: { default: 24 }
      threshold:      { default: 50 }

env:
  WORKER_BASE:        ${{ secrets.REROLL_WORKER_BASE_URL }}
  CRON_TOKEN:         ${{ secrets.RECONCILE_CRON_TOKEN }}   # NEW secret -- distinct from reroll
  WALLIAM_TENANT_ID:  b16e1039-38ed-43d7-bbc5-dd02bb651bc9
  AILY_TENANT_ID:     e2619717-6401-4159-8d4c-d5f87651c8d6

jobs:
  reconcile:
    runs-on: ubuntu-latest
    timeout-minutes: 30                  # 30min is generous for ~18k rows/tenant
    steps:
      - shell: bash
        run: |
          set -euo pipefail
          run_tenant() {
            local T="$1"
            local RES
            RES=$(curl -sS --fail \
              -X POST \
              -H "Authorization: Bearer ${CRON_TOKEN}" \
              -H "Content-Type: application/json" \
              "${WORKER_BASE}/api/admin-homes/territory/reconcile?tenant_id=${T}")
            echo "$RES"
            local CORR
            CORR=$(echo "$RES" | jq -r '.corrections // 0')
            if [ "$CORR" -gt 50 ]; then
              echo "ALERT: tenant=${T} corrections=${CORR} exceeds threshold (50)"
              exit 1                     # surfaces in GH Actions notification
            fi
          }
          run_tenant "${WALLIAM_TENANT_ID}"
          run_tenant "${AILY_TENANT_ID}"
```

**Route**: `app/api/admin-homes/territory/reconcile/route.ts` (POST). Mirrors `reroll-worker/route.ts`:
- Bearer token auth (new env var `RECONCILE_CRON_TOKEN`, distinct from `REROLL_WORKER_CRON_TOKEN` so revoking one doesn't break the other).
- Accepts `?tenant_id=<uuid>` query param.
- pg-direct via `DATABASE_URL` (as postgres) — same as the reroll worker.
- Calls `reconcile_tenant_cache($1::uuid)` once.
- Returns `{ ok, tenant_id, candidates, corrections, by_reason: { sync_delta, flagged, rolling_sample } }`.

**Why a separate workflow vs appending to nightly-sync.yml**: same rationale as reroll-worker.yml (line 11-14 of that file):
- nightly-sync.yml is subject to F-NIGHTLY-SYNC-TIMEOUT-6H — already hitting the 6h cap occasionally. Adding reconcile work would compound the timeout pressure.
- Reconcile needs nightly-sync to FINISH before it runs (so the sync-delta is fresh) — separate workflow can wait via cron offset (07:00 sync start → 09:00 reconcile = ~2h offset, plenty of margin).

---

## Q5 — Threshold-alert surface

**Primary**: `tenant_floor_alerts` table — already exists, already wired into P-DASHBOARD CORE-5 health route. Shape (probe §Q5):
```
{id, tenant_id, property_type, listing_id, alert_type, created_at, resolved_at}
```
New `alert_type` value: `'reconcile_threshold_exceeded'`. `property_type='system'` (out-of-band signal), `listing_id=NULL` (not row-specific). The dashboard's GAP-B floor-alerts surface already polls this table and renders it; operators see the alert in `/admin-homes/tenants/<id>/territory` health tab.

**Secondary**: workflow `exit 1` on threshold-exceed. GH Actions surfaces the failure via the configured notification channel (email/Slack — per current GH Actions setup).

**Threshold value**: 50 corrections/run (matches the tracker's stated default). Tunable via workflow input + function parameter.

**Rationale** (from tracker line 407 + Decision B line 85): "if it corrects many rows nightly, a trigger is missing." 50 is a generous initial threshold — a single missed trigger event (one geo's reroll dropped) could cause hundreds of corrections; 50 catches that without alarming on routine churn. Tune down once we see baseline drift in production.

---

## Q6 — Tenant scope

**Single-tenant per HTTP call** — same shape as `reroll_listings_in_set(uuid[], uuid)` (one tenant per call) and `reroll-worker` route (one tenant per POST). Workflow iterates known tenants.

Matches `F-SYNC-SINGLE-TENANT-IMPLICIT`: the codebase's standing pattern is single-tenant invocation from the cron layer, multi-tenant fan-out from the workflow's bash loop.

Future tenants: add to the workflow env vars + iteration loop. No code change to the route or function.

---

## Recommended fix shape (for review BEFORE migration draft)

### Migration: `20260601_event7_reconcile.sql` (planned)

1. `CREATE TABLE reconcile_corrections (...)` + 2 indexes.
2. `CREATE INDEX idx_mls_listings_updated_at ON mls_listings (updated_at DESC)` — bounded-scan support.
3. `CREATE OR REPLACE FUNCTION public.reconcile_tenant_cache(p_tenant_id uuid, ...)` — SECURITY DEFINER, locked search_path, returns `(corrections_count int, candidates_count int)`.
4. `GRANT SELECT ON public.reconcile_corrections TO service_role` — dashboard read path will need this.
5. In-tx V-asserts: shape + signature + a SAVEPOINT-isolated end-to-end test (~1000-row candidate set on WALLiam, verify pre/post diff + corrections INSERT + ROLLBACK).

### Route: `app/api/admin-homes/territory/reconcile/route.ts` (planned)

- POST only (idempotent-on-input but state-mutating — POST is the correct verb).
- Bearer-token auth (`RECONCILE_CRON_TOKEN`).
- pg-direct as postgres.
- Single function call, returns JSON.

### Workflow: `.github/workflows/reconcile.yml` (planned)

- Cron `0 9 * * *` (09:00 UTC, ~2h after nightly-sync start).
- Mirror reroll-worker.yml structure; iterate WALLIAM + AILY env vars.
- Exit non-0 on threshold-exceed.

### Smoke harness: `scripts/smoke-event7-reconcile.js` (planned)

T1: shape (function exists, table exists, index exists).
T2: candidate-set collection — assert sync-delta returns ~17k rows (or whatever the current 24h delta is) without seq-scan (EXPLAIN check).
T3: reconcile end-to-end on a small synthetic candidate set — assert corrections row inserted for mismatches, no rows mutated when pre==post matches.
T4: threshold alert — synthetic 60-correction scenario, assert `tenant_floor_alerts` row inserted with `reconcile_threshold_exceeded`.
T5: tenant isolation — invoke for WALLiam, assert no aily rows touched; siblings untouched.

---

## Open question for you

**Q6.5 (not in your list but flagged)** — for the `last_reconciled_at` column on mls_listings (used by oldest-reconciled rolling sample):

- **Option A**: skip it for v1. Random TABLESAMPLE is fine; can switch later. Cost: less-fair coverage over time.
- **Option B**: add it now as part of the same migration. Cost: 1.3M row UPDATE on backfill, ~30s. Benefits: fairer rolling sample from day 1.

My recommendation: **Option A** (skip) — keeps the migration minimal; the random sample is acceptable for v1 drift telemetry. Switch to Option B if drift data shows random sample missing hot spots.

---

**End of recon. NO build drafted yet. Awaiting review of the synthesis + raw probe at `cv-event7-recon-output.txt`. Especially the bounded-scope mechanism (Q2) and the NULL-then-delegate decision (Q3).**
