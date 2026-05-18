# W-LEAD-FLOW-VERIFICATION Tracker

Workstream: end-to-end runtime verification of every System 2 lead source.
Goal: each lead-creation route, when triggered with a real HTTP request, must
produce a correct lead row in `leads`, fire the correct email(s) with the
correct BCC overlay, and surface correctly in `/admin-homes/leads` with full
origin context. No static checks. No fake data. PASS requires a real lead
UUID created by a real request.

## Test environment (LOCKED)

- Server: `npm run dev` on `http://localhost:3000`
- Tenant: WALLiam, `b16e1039-38ed-43d7-bbc5-dd02bb651bc9`
  - `.env.local` must include `DEV_TENANT_DOMAIN=walliam.ca`
- Resolver agent: King Shah, `fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe`
- Notification sender: `notifications@condoleads.ca` (Resend verified)
- Test contact email pattern: `wleadflow+<scenario>+<timestamp>@condoleads.ca`
- Real fixture UUIDs read from `tests/lead-flow/fixtures.json`

## Scope

In scope: 7 System 2 lead-write routes (`app/api/walliam/*` and `app/api/charlie/*`).
Out of scope: System 1 `app/api/chat/*` routes (maintenance-only per RULE ZERO).

## Lead origin inventory

| # | Route | lead_origin_route | Surface |
|---|---|---|---|
| 1 | `app/api/walliam/contact/route.ts` | `contact_form` | Public contact form (Building / Listing / Geo pages) |
| 2 | `app/api/walliam/charlie/vip-request/route.ts` | `charlie_vip_request` | Charlie chat VIP upgrade |
| 3 | `app/api/walliam/estimator/vip-request/route.ts` | `estimator_vip_request` | Estimator VIP request |
| 4 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | `estimator_questionnaire` | Estimator questionnaire submit |
| 5 | `app/api/charlie/lead/route.ts` | `charlie` | Charlie auth/lead capture |
| 6 | `app/api/charlie/appointment/route.ts` | `charlie` | Charlie appointment booking |
| 7 | `app/api/charlie/plan-email/route.ts` | `charlie` | Charlie plan generation + email |

`LeadOriginRoute` type also includes `estimator` (no insert literal). Resolved at T4 as a dead enum value or surfaced if found.

## Verification matrix (asserted per scenario)

- DB: lead row exists with `tenant_id`, `agent_id` resolved, `contact_email`, `source`, `lead_origin_route`, `source_url`, entity FKs (`building_id` / `listing_id` / `*_id` geo), hierarchy stamps (`manager_id` / `area_manager_id` / `tenant_admin_id`), `plan_data` / `appointment_date` where applicable.
- EMAIL: Resend returns success; King Shah inbox receives the notification; BCC overlay (manager + area_manager + tenant_admin + platform_admin per delegation rules) fires.
- DASHBOARD: lead appears in `/admin-homes/leads` with correct source pill + geo chain + clickable source_url; workbench opens cleanly.
- WORKBENCH TABS: Overview, Plan, Estimator, Estimator Q, Credits & Usage, Activity, Emails, VIP, Notes -- each renders without crash; relevant tabs show real data.

## Phase plan

| Phase | Status | Description |
|---|---|---|
| T0 Recon | CLOSED | 7 routes, 5 confirmed lead_origin_route literals, type-vs-code gap noted |
| T1 Tracker + fixtures | CLOSED | Tracker + setup-t1.js + real WALLiam fixtures.json (commit 8c7ce69) |
| T2 Per-route digest | CLOSED | Request shapes / insert keys / auth / email patterns captured (commit e21e6c8) |
| T3-S1 Contact form | CLOSED | S1-Build PASS (lead c096f8d9); 5 variants PASS (commit 5ac84e3) |
| T3-S2/S3/S4 Session-based | CLOSED | S3+S4+S2 all PASS via run-S2-S3-S4-session.js; root cause: unique partial index `idx_chat_sessions_user_tenant_source_unique` on (user_id, tenant_id, source) -- fix: distinct auth user for S2 session + `.in()` lead lookup |
| T3-S5/S6/S7 Charlie chat | CLOSED | S5+S6+S7 all PASS via run-S5-S6-S7-charlie.js -- session-based + lead_origin_route='charlie' + intent disambiguation (S5/S6=buyer, S7=seller via planType) |
| T4 Hierarchy verification | NOT STARTED | Stamp manager_id / area_manager_id / tenant_admin_id when chain exists |
| T5 Gap fixes (G1 + G2) | IN PROGRESS | G2 CLOSED 2026-05-18 (lead.user_id via get-or-create from email; lib/auth/get-or-create-by-email.ts + walliam/contact patch). G1 (source_url) still open. |
| T6 Browser walkthrough (Phase B) | NOT STARTED | Real user flow through every page; verifies frontend wiring |
| T7 Multi-tenant smoke | NOT STARTED | Re-run S1..S7 against a second tenant |
| T8 Close + launch checklist | NOT STARTED | Tracker frozen; master `W-LAUNCH-TRACKER.md` updated; ready to ship |

## Scenario ledger (PASS = real lead UUID created by real HTTP request)

| # | Scenario | Route | Status | Real lead UUID | Notes |
|---|---|---|---|---|---|
| S1-Build | Building page contact form | `walliam/contact` | PASS | `c096f8d9-f437-4433-b82d-48c645de7da3` | agent=King Shah, src=geo |
| S1-List  | Listing page contact form | `walliam/contact` | PASS | `db84037d-afeb-4573-a962-7adcf4044e25` | full geo chain from listing |
| S1-Area  | Area page contact form | `walliam/contact` | PASS | `063f9888-9c91-44ad-b84b-7d7acb38c566` | area_id only |
| S1-Muni  | Municipality page contact form | `walliam/contact` | PASS | `9a7b92d4-e9fd-4cc8-8a91-5cb08353869e` | area + muni |
| S1-Comm  | Community page contact form | `walliam/contact` | PASS | `35f947ac-a1ae-41d7-a17a-d4a9df267949` | area + muni + community |
| S1-Nbhd  | Neighbourhood page contact form | `walliam/contact` | PASS | `2b9f668f-67f3-4637-9443-563dd383a3d2` | neighbourhood + area |
| S3       | Estimator VIP request | `walliam/estimator/vip-request` | PASS | `bf243fc5-e3c4-458a-9ced-520d60856d9e` | agent=King Shah, src=geo |
| S4       | Estimator questionnaire | `walliam/estimator/vip-questionnaire` | PASS | `bf243fc5-e3c4-458a-9ced-520d60856d9e` | enriches S3 lead in place; agent=King Shah, src=geo |
| S2       | Charlie VIP request | `walliam/charlie/vip-request` | PASS | `f906a371-ca90-4816-944a-74c2e9d42229` | distinct session+auth user from S3/S4; agent=King Shah, src=geo |
| S5       | Charlie lead capture | `charlie/lead` | PASS | `408e96ba-7186-4bed-b427-1d25b205fbdd` | intent=buyer, plan_data populated, agent=King Shah, src=geo |
| S6       | Charlie appointment | `charlie/appointment` | PASS | `c558ca62-b208-468f-aee4-8a1f097f6557` | intent=buyer, appointment_date+time+properties set, agent=King Shah, src=geo |
| S7       | Charlie plan-email | `charlie/plan-email` | PASS | `5477a25f-31c3-48ed-a428-eabbf585171f` | intent=seller (planType), plan_data.planType='seller', agent=King Shah, src=geo |

## Gaps to close before launch

### G1 -- `source_url` empty on lead rows

Observed in dashboard after S1 runs: Source column shows the contact email only; no clickable URL pill. `lead.source_url` is null because the harness did not send a `pageUrl` or `source_url` in the request body. The route itself supports it; the harness omitted it.

**Acceptance criteria**:
- Harness sends the canonical page URL per variant, verified against `app/[slug]/page.tsx` dispatch + `lib/utils/slugs.ts` builders (2026-05-18 verification):
  - S1-Build: `/<buildings.slug>` (root -- polymorphic `[slug]` route falls through to BuildingPage).
  - S1-List (condo, slug contains `-unit-`): `/<building-slug>-unit-<unit>-<mls>` (root, via `generatePropertySlug` in `lib/utils/slugs.ts`).
  - S1-List (home / freehold, last segment matches MLS pattern `/^[a-zA-Z]\d{5,}$/`): `/<street-slug>-<city-slug>-<mls>` (root, via `generateHomePropertySlug`).
  - S1-List (legacy fallback): `/property/<id>` -- the `app/property/[id]/page.tsx` route still exists and the slug builders fall back to this when `listing_key` is missing.
  - S1-Area: `/<treb_areas.slug>` (root). NOTE: `app/comprehensive-site/[slug]/page.tsx` has a `findArea` helper that tolerates a `-area` DB-slug suffix; main dispatch in `app/[slug]/page.tsx` requires exact match. Resolve per-fixture before send.
  - S1-Muni: `/<municipalities.slug>` (root, flat -- NOT nested under area).
  - S1-Comm: `/<communities.slug>` (root, flat -- NOT nested under area/muni).
  - S1-Nbhd: **not a root URL.** Only public neighbourhood route found is `/comprehensive-site/toronto/<neighbourhoods.slug>` (Toronto-only). For non-Toronto neighbourhoods the public URL surface is unverified -- resolve before sending pageUrl for this variant, or defer S1-Nbhd.
- Open verifications (must resolve before S1 G1 fix harness runs):
  - **V1** `treb_areas.slug` URL: exact-vs-clean `-area` suffix behaviour. Two handlers disagree; pick the canonical one before harness commits a value.
  - **V2** Non-Toronto neighbourhood URL pattern (or confirm S1-Nbhd defers indefinitely).
- Harness asserts `lead.source_url` non-null and matches the verified pattern for the variant.
- All 6 S1 variants re-run; ledger updated with new lead UUIDs.
- Dashboard re-verification: Source pill renders with `↗` link to the page; clicking opens the original page.

### G2 -- CLOSED 2026-05-18: lead.user_id population for credit-management

**Verified state**: No `user_credits` table exists. Per-user credit state is distributed: defaults on `tenants`, per-user overrides on `user_credit_overrides`, usage counters on `chat_sessions`. Workbench Credits & Usage tab (`components/admin-homes/lead-workbench/UserCreditPanel.tsx`) keys on `anchorLead.user_id` and handles override=NULL via tenant defaults (`getResolvedLimits`).

**Realized G2 goal**: every System 2 lead must carry non-NULL `user_id` so the workbench credits tab is functional per lead. The literal "create user_credits row" spec did not map onto the actual architecture; the spirit of the spec (agent has one place to grant/revoke per lead) translates to ensuring `lead.user_id` is always populated.

**Gap (forward-only -- no backfill; all current leads are test)**:
- 6 of 7 lead-write routes already populated `user_id` from session context (charlie/*, estimator/*).
- `app/api/walliam/contact/route.ts` was the only gap: public form, no session, was inserting leads with NULL `user_id`.

**Shipped**:
- New helper: `lib/auth/get-or-create-by-email.ts` -- resolves an `auth.users` row by email via create-first / list-on-conflict (Supabase Admin has no getUserByEmail). Returns `{ userId, created }`.
- Patched: `app/api/walliam/contact/route.ts` -- calls helper before lead insert, populates `user_id` on lead row. Wrapped in try/catch; on helper failure the lead still saves with `user_id=null` (graceful degradation, no regression on existing behavior).

**Verification**:
- S1-Build harness: PASS lead `abe3fd23-3f39-4a07-9c9f-f3a4327ff613`, user_id `f7de0765-0f0c-4861-8035-0cd8869a4c04`, `auth.users.email` matches `lead.contact_email`.
- S2/S3/S4 harness: PASS exit 0 (no regression on session-based routes).
- TSC clean.

## Rules

- No scenario marked PASS without a real lead UUID created by a real HTTP request to the running dev server.
- No fixture values invented. setup-t1.js aborts if any expected entity row is missing.
- Test contact emails follow `wleadflow+<scenario>+<timestamp>@condoleads.ca` so all rows produced by this workstream are greppable for cleanup.
- After T8 close, cleanup script deletes every lead with `contact_email LIKE wleadflow+%@condoleads.ca` and dependent rows (including user_credits initialized at lead creation).

_Last updated: 2026-05-18 (T3-S5/S6/S7 CLOSED: charlie/lead + charlie/appointment + charlie/plan-email all PASS via run-S5-S6-S7-charlie.js; user_id populated on all 7 lead-write routes per G2)_
