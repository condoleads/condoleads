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

## Lead origin inventory (verified by recon 2026-05-18)

| # | Route | lead_origin_route | Origin |
|---|---|---|---|
| 1 | `app/api/walliam/contact/route.ts` | `contact_form` | Public contact form |
| 2 | `app/api/walliam/charlie/vip-request/route.ts` | `charlie_vip_request` | Charlie chat VIP upgrade |
| 3 | `app/api/walliam/estimator/vip-request/route.ts` | `estimator_vip_request` | Estimator VIP request |
| 4 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | `estimator_questionnaire` | Estimator questionnaire submit |
| 5 | `app/api/charlie/lead/route.ts` | `charlie` (TBC at T2) | Charlie auth/lead capture |
| 6 | `app/api/charlie/appointment/route.ts` | (TBC at T2) | Charlie appointment booking |
| 7 | `app/api/charlie/plan-email/route.ts` | (TBC at T2) | Charlie plan generation + email |

**Open question**: `LeadOriginRoute` type includes `estimator`. No `.insert()` literal writes it. Either a missing route or a dead enum value. Resolved at T2 by reading each charlie route.

## Verification matrix (asserted per scenario)

After the real HTTP request returns 2xx:

- **DB**: lead row exists with
  - `tenant_id` = WALLiam
  - `agent_id` resolved (not null unless `assignment_source = admin`)
  - `contact_email` = synthetic test address (wleadflow+...)
  - `source` populated (tenant-prefixed where applicable)
  - `lead_origin_route` = expected literal
  - `source_url` populated when request carries it
  - `building_id` / `listing_id` populated when request carries entity context
  - `area_id` / `municipality_id` / `community_id` / `neighbourhood_id` populated when geo context present
  - `manager_id` / `area_manager_id` / `tenant_admin_id` stamped via resolver
  - `plan_data` / `appointment_date` populated where applicable
- **EMAIL**: Resend returns success; King Shah inbox receives notification with correct subject and rendered address. BCC overlay fires (manager + area_manager + tenant_admin + platform_admin per delegation rules).
- **DASHBOARD**: `/admin-homes/leads`
  - Lead row appears at top of list
  - Source pill renders correct label and color
  - `source_url` clickable when present
  - Geo context chain renders below pill
  - Click opens workbench `/admin-homes/leads/[id]`
- **WORKBENCH**: every relevant tab renders without crash
  - Overview (always)
  - Plan (when `plan_data` present)
  - Estimator (when estimator submission present)
  - Estimator Q (when questionnaire message present)
  - Credits & Usage (always)
  - Activity (always)
  - Emails (shows the notification just sent)
  - VIP (shows vip_request row when applicable)
  - Notes (always; empty by default)

## Phase plan

| Phase | Status | Description |
|---|---|---|
| T0 Recon | CLOSED | 7 routes, 5 confirmed lead_origin_route literals, type-vs-code gap noted |
| T1 Tracker + fixtures | THIS PHASE | Tracker + fetch-fixtures + fixtures.json |
| T2 Per-route read | NOT STARTED | Read 7 route handlers for request shape + write contract + email path |
| T3 Build harness | NOT STARTED | One `scripts/wleadflow/run-S<n>-<name>.js` per scenario; reads fixtures; real HTTP POST |
| T4 Execute | NOT STARTED | Run S1..S7; PASS requires real lead UUID + timestamp |
| T5 Dashboard cross-check | NOT STARTED | Verify pill + geo chain + workbench tabs render |
| T6 Fix-iterate | NOT STARTED | Each FAIL gets a fix-and-rerun cycle |
| T7 Multi-tenant smoke | NOT STARTED | Re-run S1..S7 against a second tenant |
| T8 Close | NOT STARTED | All scenarios PASS; tracker frozen |

## Scenario ledger (populated as T4 runs)

| # | Scenario | Route | Status | Real lead UUID | Timestamp | Notes |
|---|---|---|---|---|---|---|
| S1 | Contact form (public) | `walliam/contact` | NOT STARTED | - | - | - |
| S2 | Charlie VIP request | `walliam/charlie/vip-request` | NOT STARTED | - | - | - |
| S3 | Estimator VIP request | `walliam/estimator/vip-request` | NOT STARTED | - | - | - |
| S4 | Estimator questionnaire | `walliam/estimator/vip-questionnaire` | NOT STARTED | - | - | - |
| S5 | Charlie lead capture | `charlie/lead` | NOT STARTED | - | - | - |
| S6 | Charlie appointment | `charlie/appointment` | NOT STARTED | - | - | - |
| S7 | Charlie plan-email | `charlie/plan-email` | NOT STARTED | - | - | - |

## Rules

- No scenario marked PASS without a real lead UUID created by a real HTTP request to the running dev server.
- No fixture values invented. setup-t1.js aborts if any expected entity row is missing in WALLiam.
- Test contact emails follow `wleadflow+<scenario>+<timestamp>@condoleads.ca` so all rows produced by this workstream are greppable for cleanup.
- After T8 close, cleanup script deletes every lead with `contact_email LIKE wleadflow+%@condoleads.ca` and dependent rows.

_Last updated: T1 in progress 2026-05-18_
