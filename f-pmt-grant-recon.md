# F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT — RECON (P1 FIX 3 of 3)

**Date:** 2026-06-01
**Scope:** read-only recon answering the 5 design questions. No fix drafted.
**Live probe:** `scripts/cv-pmt-grant-recon.js` → `cv-pmt-grant-recon-output.txt`

---

## TL;DR

1. **The blocker is the GRANT, NOT RLS.** Live test under `SET LOCAL ROLE service_role`: `ERROR 42501 — permission denied for table platform_manager_tenants`. `42501` is `INSUFFICIENT_PRIVILEGE` (pure grant denial). If RLS were the gate, the SELECT would succeed and return 0 rows (because the `auth.uid()`-keyed policies evaluate empty server-side); instead it errors out before RLS even runs.
2. **`service_role.rolbypassrls = TRUE` (verified live, probe §1).** Once the grant exists, RLS is bypassed regardless of the table's `relrowsecurity` flag. The existing `auth.uid()`-keyed policies remain on the table but never gate a service_role read.
3. **Fix (a) — `GRANT SELECT ON public.platform_manager_tenants TO service_role` — is sufficient and safe.** No SECURITY DEFINER helper needed. Minimal surface (1 GRANT). The Layer-5 read at [lib/admin-homes/lead-email-recipients.ts:208-213](lib/admin-homes/lead-email-recipients.ts#L208-L213) keeps its current shape; only the table grant changes.
4. **Layer-5 also has a SILENT SOFT-FAIL bug** ([lead-email-recipients.ts:208](lib/admin-homes/lead-email-recipients.ts#L208) destructures `{ data }` without capturing `error`, unlike Layer-6 at line 233). The v27 false-green-via-silent-soft-fail class. Recommend bundling a 4-line capture-and-log fix in the same commit (or filing as P3 if you prefer the grant-only scope). Even with the grant fix, the silent fall-through to `[]` would mask any future fault.
5. **Siblings (`tenant_floor_pool`, `tenant_floor_alerts`, `territory_reroll_queue`) ALSO error 42501 under service_role today**, but they were "fixed" by **caller-side pivot** (production paths use pg-direct as `postgres`, not supabase-js → service_role). No retrofit needed for the siblings as part of this commit; their callers are already routed correctly. Filing a P3 note suggesting a uniform class sweep is optional, not blocking.

---

## Q1 — Layer-5 query + fall-through path

[lib/admin-homes/lead-email-recipients.ts:204-230](lib/admin-homes/lead-email-recipients.ts#L204-L230) — Layer 5 (Manager Platforms assigned to this tenant):

```ts
// Two-step query (cleaner than nested-join type inference):
//   1. Find platform_admin_ids assigned to this tenant
//   2. Read those rows from platform_admins, filter active + tier='manager'
const { data: assignmentRows } = await supabase                       // <-- L208
  .from('platform_manager_tenants')
  .select('platform_admin_id')
  .eq('tenant_id', tenantId)

const assignedAdminIds = (assignmentRows || [])
  .map(r => (r as { platform_admin_id: string }).platform_admin_id)
const managerPlatformEmails: string[] = []

if (assignedAdminIds.length > 0) {                                    // <-- silently skipped
  const { data: managerPlatformRows } = await supabase
    .from('platform_admins')
    .select('id, email, is_active, tier')
    .in('id', assignedAdminIds)
    .eq('tier', 'manager')
    .eq('is_active', true)

  for (const row of (managerPlatformRows || []) as Array<...>) {
    if (row.email) {
      managerPlatformEmails.push(row.email)
      resolved.manager_platforms.push(row.email)
    }
  }
}
```

**Fall-through path under the current grant wall:**
1. `supabase.from('platform_manager_tenants').select(...)` → PostgREST returns `{ error: 42501, data: null }`.
2. `const { data: assignmentRows } = ...` — `error` is **not destructured**, swallowed.
3. `assignmentRows = null` → `(assignmentRows || []) = []` → `assignedAdminIds = []`.
4. `if (assignedAdminIds.length > 0)` evaluates false; the Layer-5 enrichment block is skipped entirely.
5. `managerPlatformEmails = []` → no Layer-5 BCC recipients added.
6. Email sends with Layer-1..4 + Layer-6 BCC only. Operator sees a successful send; the manager-platform BCC is silently dropped.

**Contrast with Layer-6 at [lib/admin-homes/lead-email-recipients.ts:233-239](lib/admin-homes/lead-email-recipients.ts#L233-L239):**
```ts
const { data: adminPlatformRows, error: adminError } = await supabase
  .from('platform_admins')
  ...
if (adminError) { ... throw AdminPlatformUnreachable(...) ... }
```

Layer-6 DOES capture `error` and throws on failure. Layer-5 doesn't. That asymmetry is the v27 false-green-via-silent-soft-fail bug.

**Callers of the function** (grep across `lib/` + `app/`):
- Only one DB-side reference to `platform_manager_tenants`: this Layer-5 read.
- Other references are in scripts (`smoke-cv-*`), tracker docs, recon notes — non-production paths.
- `getLeadEmailRecipients` is called from `createLead` and other lead-creation paths. All use `createServiceClient` (supabase-js with `SERVICE_ROLE_KEY`).

---

## Q2 — Grant + RLS state on `platform_manager_tenants`

**Table shape** (probe §2):
```
platform_admin_id  uuid  NOT NULL
tenant_id          uuid  NOT NULL
granted_at         timestamptz NOT NULL
granted_by         uuid (nullable)
```

**RLS** (probe §3): `relrowsecurity=true`, `relforcerowsecurity=false`. RLS is ENABLED but NOT FORCED.

**Policies** (probe §4 — 2 policies, both keyed on `auth.uid()`):

| polname | polcmd | USING |
|---|---|---|
| `platform_manager_tenants_admin_modify` | `ALL` | `EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid() AND is_active AND tier = 'admin')` |
| `platform_manager_tenants_admin_select` | `SELECT` | `(EXISTS admin-tier) OR (EXISTS self-pa-id match by auth.uid())` |

Both policies use `auth.uid()` which is NULL for any server-side caller. If service_role WERE NOT bypassrls, these policies would evaluate to FALSE for every row — the SELECT would succeed but return 0 rows. (That's the "false-green" classic.) But service_role IS bypassrls, so policies are skipped.

**Grants** (probe §5):
```
postgres -> DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
```
**`service_role` has NO grants on this table.** No row for `anon` or `authenticated` either — postgres-owner-only.

**Live SELECT under service_role** (probe §7):
```
ERROR 42501 — permission denied for table platform_manager_tenants
```

`42501` = `INSUFFICIENT_PRIVILEGE`. This is the GRANT layer rejecting the read, not RLS. Confirms the diagnosis.

**Row count** (probe §6): 0. No tenant has any manager-platform assignment today — which is why the bug is currently invisible in production. Any future assignment row would be muted under service_role.

---

## Q3 — (a) GRANT vs (b) SECURITY DEFINER determination

**Option (a) — `GRANT SELECT ON public.platform_manager_tenants TO service_role`:**

| Concern | Resolution |
|---|---|
| Does the grant clear the 42501? | YES — direct cause. Service_role currently has zero grants; the grant adds SELECT. |
| Does RLS still block after the grant? | NO. `pg_authid.rolbypassrls = true` for service_role (probe §1). RLS policies remain on the table but service_role bypasses them per PostgreSQL semantics. |
| Side effect on existing flows? | None. The policies stay in place for `anon`/`authenticated`/`authenticator` (which already get blocked by both grants and RLS today). The grant only opens read access for service_role specifically. |
| Write paths affected? | No — granting SELECT only, not INSERT/UPDATE/DELETE. Modifies happen via admin-tier sessions through the policies, unchanged. |
| Tenant isolation impact? | None. Service_role is already used DB-wide for cross-tenant operations; access to `platform_manager_tenants` (which holds tenant-to-platform-admin mappings, not tenant data) doesn't change the tenant-isolation surface. The Layer-5 caller filters by `tenant_id` in its WHERE. |

**Verification check that (a) is sufficient:** the probe demonstrates that the ONLY blocker is grant-level (`42501`). Postgres documentation confirms `rolbypassrls=true` bypasses RLS for ANY query under that role, regardless of `relforcerowsecurity` (which is FALSE here anyway). Tested empirically in adjacent fixes — Landing 1's `pick_floor_agent` DEFINER works on `tenant_floor_pool` precisely because the DEFINER runs as `postgres` (also `rolbypassrls=true`).

**Option (b) — SECURITY DEFINER helper function:**

| Concern | (b) Cost |
|---|---|
| Surface area | Adds 1 new function (e.g., `public.get_platform_manager_admin_ids(uuid) RETURNS uuid[]`). Maintains a body that must mirror the table schema; future column adds would need helper updates. |
| Caller change | `getLeadEmailRecipients` Layer-5 would call `.rpc('get_platform_manager_admin_ids', {p_tenant_id: tenantId})` instead of `.from('platform_manager_tenants').select(...)`. ~5-line code change. |
| Security audit | Need to re-run the Landing-1 v21 DEFINER rubric (no `auth.uid()`/`current_user`, callers auditable, tenant validated). Passes the rubric trivially but adds a review burden. |
| Necessary? | **No.** (a) already works. The (b) pattern was needed for `pick_floor_agent` because the function does WRITES + reads on a grant-walled table; the writes there required postgres effective role. The Layer-5 read is read-only. |

**Decision: option (a) — bare GRANT.** Minimum-surface fix; matches the v25 lesson's preferred resolution when service_role-grant alone closes the gap.

**Caveat to flag:** the grant is one-direction (SELECT). Service_role would still hit 42501 on INSERT/UPDATE/DELETE if any future code path tries to write to `platform_manager_tenants` via supabase-js. That's fine for now (Layer-5 is read-only), but if a future admin route adds a "grant manager access" UI, it should also receive INSERT/UPDATE/DELETE grants in the same migration OR route through pg-direct.

---

## Q4 — Cross-check with the 3 sibling grant-wall tables

Live probe (§8):

| table | relrowsecurity | relforcerowsecurity | policies | service_role current behavior |
|---|---|---|---|---|
| `tenant_floor_pool` | true | false | `tfp_read_own_tenant` (auth.uid()-keyed) | 42501 permission denied |
| `tenant_floor_alerts` | true | false | `tfa_read_own_tenant` (auth.uid()-keyed) | 42501 permission denied |
| `territory_reroll_queue` | **false** | false | (none) | 42501 permission denied |
| `platform_manager_tenants` (target) | true | false | 2 admin-keyed policies | 42501 permission denied |

**All four** error 42501 under service_role. SAME bug class.

**But the siblings were "fixed" differently — caller-side pivot, not grant-side:**

- **`tenant_floor_pool`**: Production reads/writes routed through `pick_floor_agent` (SECURITY DEFINER, runs as postgres). Direct supabase-js reads are documented (PART 5 line 471 — `F-TENANT-FLOOR-ALERTS-SAME-GRANT-WALL`) as "operational rule: pg-direct as postgres, not supabase-js → service_role." The class GAP isn't closed; the callers were just routed around it.
- **`tenant_floor_alerts`**: Same posture. Writes via `reresolve_listings_in_set` DEFINER. Health-route reads via pg-direct (`p-dashboard` cockpit).
- **`territory_reroll_queue`**: Reads/writes via pg-direct in `app/api/admin-homes/territory/reroll-worker/route.ts` (worker route uses `DATABASE_URL` as postgres, not service_role). Writes via the SECDEF chain through `handle_apa_*`.

**Implication for this fix's scope:** the siblings' callers are already pg-direct or DEFINER-chained — they DON'T hit the grant wall in production. Retrofitting `GRANT SELECT TO service_role` on the 3 siblings is **optional** (uniformity / future-proofing) and **non-blocking** (no production caller is broken today).

**Recommendation:**
- **This commit**: GRANT only on `platform_manager_tenants`. Scope = closes the named finding, no scope creep.
- **Optional follow-up (file as P3 if you want it tracked)**: "F-GRANT-CLASS-SWEEP-FOUR-TABLES" — uniform GRANT SELECT to service_role on the 3 siblings + similarly evaluate whether RLS policies on them should drop the auth.uid()-keyed clauses now that BYPASSRLS covers the real bypass case. Pure cleanup; no behavior change in production.

---

## Q5 — Smoke design

**Scope** — prove that under service_role:
- (a) Before the GRANT: SELECT errors 42501.
- (b) After the GRANT: SELECT succeeds, returns rows visible (bypassrls in effect).
- The Layer-5 caller's null-fall-through goes away; a fixture-inserted row makes it to `assignedAdminIds`.

**Harness shape** (`scripts/smoke-f-pmt-grant-fix.js`, all in one BEGIN/ROLLBACK envelope):

```
T1 — pre-grant negative (sanity check before the migration is applied):
  Own BEGIN/ROLLBACK. SET LOCAL ROLE service_role. SELECT COUNT(*) FROM
  platform_manager_tenants. Expect: error 42501.
  (If this runs AFTER the migration, T1 becomes the pre-grant-rollback test.)

T2 — post-grant SELECT under service_role (the core fix proof):
  Own BEGIN/ROLLBACK. SET LOCAL ROLE service_role. SELECT COUNT(*) FROM
  platform_manager_tenants. Expect: returns int (>=0), no error.

T3 — post-grant + fixture row visibility (proves BYPASSRLS works alongside the grant):
  Own BEGIN/ROLLBACK. As postgres: INSERT a synthetic row into
  platform_manager_tenants with a real platform_admin (runtime-SELECTed) and
  a real tenant (WALLiam, runtime-SELECTed). Then SET LOCAL ROLE service_role.
  SELECT platform_admin_id FROM platform_manager_tenants WHERE tenant_id = $1.
  Expect: returns the fixture row. ROLLBACK.

T4 — Layer-5 caller behavior end-to-end (the real flow):
  Own BEGIN/ROLLBACK. INSERT fixture row as above. Then invoke
  getLeadEmailRecipients(supabase=service_client, tenantId=fixture_tenant,
  agentId=null, ...) directly OR simulate via raw supabase-js call mirroring
  L208-213. Assert that assignedAdminIds non-empty AND resolved.manager_platforms
  reflects the fixture's platform_admin email (where platform_admins row exists
  with tier='manager', is_active=true). ROLLBACK.
  (Optional -- requires platform_admins to have a manager-tier row; if none
  exists in fixture-friendly form, simplify to just the assignedAdminIds
  assertion -- proves Layer-5 query no longer falls through to [].)

T5 — sibling tables still error (regression check, narrow-scope sanity):
  Own BEGIN/ROLLBACK. SET LOCAL ROLE service_role. SELECT COUNT(*) FROM
  tenant_floor_pool, then tenant_floor_alerts, then territory_reroll_queue.
  Expect: each errors 42501 (proves we did NOT widen-scope the grant
  unintentionally).
```

T5 is the narrow-scope regression that confirms this commit doesn't accidentally fix the siblings — important because the siblings are explicitly NOT in scope.

**Smoke runs as postgres (DATABASE_URL); role-switches are confined to single-statement test windows per the v25 lesson.** All fixture INSERTs happen inside SAVEPOINTs / BEGIN-ROLLBACK envelopes — no production state mutated.

---

## Bundled silent-soft-fail fix (recommendation)

Even after the GRANT, the Layer-5 code at [lib/admin-homes/lead-email-recipients.ts:208](lib/admin-homes/lead-email-recipients.ts#L208) still has the v27 false-green pattern: destructures `{ data }` without `error`. If a FUTURE failure mode hits (different schema name in another env, schema reload, etc.), the Layer-5 read would again silently fall through to `[]`.

Recommended minimal fix in the same commit (or as the bundled commit):

```ts
const { data: assignmentRows, error: l5Error } = await supabase
  .from('platform_manager_tenants')
  .select('platform_admin_id')
  .eq('tenant_id', tenantId)

if (l5Error) {
  // v27 lesson: distinguish "could not read" from "confirmed empty".
  console.error('[getLeadEmailRecipients] Layer-5 read failed:', l5Error)
  // Continue with empty assignedAdminIds, but the operator now sees the error.
}
```

This doesn't change the bug's surface — Layer-5 still falls through to `[]` if the read fails — but the failure is no longer silent. Operator sees the error in logs. Pairs naturally with the grant fix (one closes the cause, the other surfaces any residual fault).

**If you prefer a tighter scope:** strip the silent-soft-fail capture from this commit; file as a separate P3 entry. The grant fix alone closes the named finding.

---

## Recommended fix shape (for review BEFORE migration draft)

**Migration (1 GRANT statement):**

```sql
-- F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT -- P1 FIX 3 of 3.
-- 2026-06-01.
-- Closes the grant wall: supabase-js -> service_role reads on
-- platform_manager_tenants previously errored 42501 (insufficient privilege).
-- service_role.rolbypassrls = TRUE, so the existing auth.uid()-keyed RLS
-- policies are bypassed; the only thing missing was the table-level grant.

GRANT SELECT ON public.platform_manager_tenants TO service_role;

-- In-tx V-asserts (in the apply-runner):
-- V1: information_schema.role_table_grants for (service_role, SELECT) on this
--     table returns 1 row.
-- V2: under SET LOCAL ROLE service_role, SELECT COUNT(*) FROM
--     platform_manager_tenants returns a row count (no 42501).
-- V3: regression -- siblings tenant_floor_pool, tenant_floor_alerts,
--     territory_reroll_queue STILL error 42501 under service_role
--     (proves we didn't accidentally widen scope).
```

**Bundled code edit (if approved):** capture `error` at [lib/admin-homes/lead-email-recipients.ts:208](lib/admin-homes/lead-email-recipients.ts#L208) — 3-line change.

**Down-migration:** `REVOKE SELECT ON public.platform_manager_tenants FROM service_role;` (one line + DOWN-V1 assert).

**Apply-runner:** standard pattern matching the prior 2 P1 fixes. Snapshot pre-state grants → BEGIN → migration → V1-V3 → COMMIT or ROLLBACK → post-COMMIT verify under postgres.

---

## Properties of the chosen fix

- ✅ Closes the named finding via the smallest possible surface (1 GRANT).
- ✅ No SECURITY DEFINER helper added; one less function to audit.
- ✅ No code change required by the grant itself (the Layer-5 caller's existing `from('platform_manager_tenants').select(...)` works post-grant).
- ✅ RLS policies on the table remain (not touched); BYPASSRLS handles service_role.
- ✅ Siblings explicitly OUT of scope; T5 regression-checks the narrow scope.
- ✅ Optional bundled fix for the v27 silent-soft-fail at line 208 (capture `error`).
- ⚠️ Scope question for you: bundle the silent-soft-fail capture in the same commit (recommended), or split it to a follow-up P3? Either is defensible.

---

**End of recon. NO migration drafted yet. Awaiting review of this synthesis + raw probe at `cv-pmt-grant-recon-output.txt`.**
