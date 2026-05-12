# W-LEADS-WORKBENCH-TRACKER

**Version:** v1 — OPEN 2026-05-12 — Lead workbench page (`/admin-homes/leads/[id]`) replacing the W-LEADS-UI-POLISH drawer+inline-row approach with a proper server-rendered workbench.

**Workstream:** Build `/admin-homes/leads/[id]` as the canonical lead workbench. Strip the L1+L5+L6+L7 surfaces from the leads table row. Surface the working user credit system in lead context. Render plans at full email-template richness. Replace tab-flipping flows with in-page actions. Add unified action audit log.

**Opened:** 2026-05-12
**Closed:** —

---

## Background — why this workstream exists

W-LEADS-UI-POLISH (closed 2026-05-12 v17) shipped 7 phases of inline-on-row + drawer features that surfaced thin versions of user-level data on the leads page. Review found this approach architecturally wrong:

1. **Credit management belongs at the user level** and was already working/tested on `/admin-homes/users`. The row credit chip + 4-input grant form duplicated and thinned that working surface.
2. **Drawer Plan Content rendered 4 fields** vs the agent-email's full `plan_data` JSONB rendering. Information density regressed inside the platform vs the email already going out.
3. **Quality 4-button row (Unqualified/Hot/Cold/Disqualified)** overlapped conceptually with Status (New/Contacted/Qualified/Closed) and drove zero business behavior.
4. **Drawer-based detail** limits real estate to ~480px, is not deep-linkable, not shareable, not bookmarkable — wrong vehicle for the agent's primary workbench surface.

Founder direction 2026-05-12: "make a tracker and lets get to work — a day's delay in launch won't hurt but we need something solid not a mediocre."

---

## Scope contract

### This workstream OWNS

- New route `app/admin-homes/leads/[id]/page.tsx` (server-rendered workbench)
- New client component for the workbench (interactive tabs, action handlers)
- New reusable `<UserCreditPanel>` component extracted from whatever credit UI exists on `/admin-homes/users` today (W1 will discover the source)
- New reusable `<PlanRenderer>` component (handles buyer + seller variants at email-template richness)
- Schema migrations:
  - Status enum extension: `do_not_contact`, `not_interested`, `disqualified`
  - New audit table `lead_admin_actions` (unified log of admin actions on leads)
  - Possibly new audit table `lead_status_changes` (if not already covered)
- New admin endpoints:
  - `POST /api/admin-homes/leads/[id]/send-email` — composer
  - `POST /api/admin-homes/leads/[id]/vip-approve` — admin-context wrap of existing token-based approve
  - `POST /api/admin-homes/leads/[id]/reassign-agent` — change `leads.agent_id` + re-walk hierarchy
  - `POST /api/admin-homes/leads/[id]/notes` — add structured note
- Strip from `components/admin-homes/AdminHomesLeadsClient.tsx`:
  - L1 Quality 4-button row
  - L5 credit posture chip + VIP pending badge row data
  - L6 inline Grant credits pill + form
  - L7 drawer JSX and state
- Default leads view filtering by Status (drop terminal states: `closed`, `do_not_contact`, `not_interested`, `disqualified`)
- Default leads view sorting by Quality (Hot at top within active statuses)
- Click-row → `router.push('/admin-homes/leads/' + id)` navigation

### This workstream does NOT own

- Charlie / chat / estimator / plan generation flows (W-LEADS-EMAIL etc. already shipped)
- Existing `POST /api/admin-homes/users/override` endpoint (reused as-is)
- Email walker / recipient resolution (W-HIERARCHY + W-LEADS-EMAIL already shipped)
- VIP token-based approve route (wrapped for admin-context, original kept untouched)
- Tenant onboarding / Paddle integration
- Mobile-specific UX polish (default responsive only)

---

## Outcomes desired

After Wclose:

1. Clicking any lead in `/admin-homes/leads` navigates to `/admin-homes/leads/[id]` — URL-routed, browser-back works, shareable to other admins.
2. Workbench page renders 7 tabs: Overview, Plan, Credits & Usage, Activity, Emails, VIP Requests, Notes.
3. Credits & Usage tab embeds the canonical user credit panel — same component used on `/admin-homes/users` (extracted to reusable in W4c).
4. Plan tab renders full buyer + full seller plan content at email-template richness — every field the plan email renders.
5. Approve VIP works in-page (no new-tab flip).
6. Send Email composer lets admin send arbitrary email to the lead, logged to `lead_email_recipients_log`.
7. Reassign Agent dropdown changes ownership, re-walks hierarchy, audit-logged.
8. Action audit log records every admin action (status flip, quality flip, credit grant, VIP approve, agent reassign, note add, email sent).
9. Status enum gains `do_not_contact`, `not_interested`, `disqualified`. Default leads view filters those out; agents see only active leads by default.
10. Quality field UI = Hot / Cold binary toggle; new leads default NULL. Hot sorts to top of default view.
11. Leads table row no longer renders L1 quality buttons, L5 credit chip, L6 grant pill, or L7 drawer. Row preserved: date, contact (with L4 engagement chip + activity preview), source (L2), intent, area, agent, hierarchy chain (L3), status dropdown, Plan/Delete buttons.

---

## Phase table

| # | Phase | Status | Commit | Notes |
|---|---|---|---|---|
| W1 | Recon — full sweep | OPEN | — | Read `/admin-homes/users/page.tsx` to discover credit UI shape; probe `leads.plan_data` JSONB (buyer + seller variants); locate plan email route(s); SQL probe `leads.status` enum values; SQL probe what writes `leads.quality`; check for existing `lead_status_changes` / `lead_admin_actions` tables; verify `lead_ownership_changes` table state |
| W2 | Schema + DB prep | OPEN | — | Status enum extension migration (3 new values); new audit tables if needed; multi-tenant safe with tenant_id NOT NULL |
| W3 | Strip leads-row noise | OPEN | — | Remove L1 quality buttons row, L5 chip, L6 grant pill, L7 drawer JSX from `AdminHomesLeadsClient.tsx` |
| W4a | Workbench page shell + header + sidebar + Overview tab | OPEN | — | Route `/admin-homes/leads/[id]/page.tsx`; server-side prefetch; layout |
| W4b | Plan tab — full buyer + seller renderer | OPEN | — | New `<PlanRenderer>` component; match email richness exactly |
| W4c | Credits & Usage tab — extract + embed user credit panel | OPEN | — | Pull credit UI out of `/admin-homes/users` into `<UserCreditPanel>` reusable; embed in workbench |
| W4d | Activity tab — unified visitor + admin timeline | OPEN | — | Join `user_activities` + `lead_admin_actions` chronologically |
| W4e | Emails tab — list + Send composer | OPEN | — | New `send-email` endpoint; Resend integration; audit-logged |
| W4f | VIP Requests tab — in-page Approve | OPEN | — | New admin-context `vip-approve` endpoint; optimistic UI update |
| W4g | Notes tab — list + Add note inline | OPEN | — | New `notes` POST endpoint; reuses `lead_notes` table |
| W5a | Click-row → navigate (drawer removal) | OPEN | — | `router.push` to workbench; delete drawer from L7 |
| W5b | Assigned Agent reassign dropdown | OPEN | — | New `reassign-agent` endpoint; re-walks hierarchy; logs to `lead_ownership_changes` + audit |
| W5c | Action audit log writes from every endpoint | OPEN | — | Every admin endpoint writes to `lead_admin_actions` with tenant_id, actor, action_type, target_id, before/after JSON |
| W5d | Status-driven default filter on leads list | OPEN | — | Default view shows only active statuses (`new`, `contacted`, `qualified`); filterable to show terminal states |
| W5e | Quality sort on leads list | OPEN | — | Default sort: Hot DESC, then date DESC; preserves user-chosen sort overrides |
| W6 | Local smoke matrix + Wclose | OPEN | — | End-to-end test all 7 tabs + all enhancements; master tracker Wclose entry |

---

## Multi-tenant safety contract

Every new query, every new admin endpoint, every new UI surface in this workstream MUST:

- Scope by `tenant_id` (either direct `.eq('tenant_id', scopedTenantId)` or implicit via foreign-key chains already filtered)
- Use `resolveAdminHomesUser` + `can()` for admin-context authorization
- Cross-tenant access returns 403 with no data leak in error message
- Audit log writes include `tenant_id`
- New `lead_admin_actions` table has `tenant_id NOT NULL` from creation (avoids the F-LEAD-NOTES-NO-TENANT-ID-COLUMN class of issue)

---

## Recon findings carried forward (from paste 113-recon, before W1 deep recon)

- `/admin-homes/users/[id]/page.tsx` does NOT exist — no dedicated user detail page route. The "working user credit system" Shah referenced must live on `/admin-homes/users/page.tsx` (6387 bytes); W1 reads to discover.
- `components/admin-homes/AdminHomesUsersClient.tsx` does NOT exist by that name — naming differs or surface is server-rendered.
- `app/api/walliam/charlie/plan-email/route.ts` does NOT exist at that path — plan email route is likely at `app/api/charlie/plan-email/route.ts`; W1 globs to find.
- `app/admin-homes/leads/page.tsx` (8681 bytes) and `components/admin-homes/AdminHomesLeadsClient.tsx` (48066 bytes) confirmed present, ready to receive W3 strip + W5a navigate patches.
- `app/api/admin-homes/users/override/route.ts` (4211 bytes) and `app/api/admin-homes/leads/[id]/route.ts` (3220 bytes) confirmed present, ready for reuse.

---

## Open questions log

(populated as we go)

---

## Status log

- **2026-05-12 W-open** — Workstream opened. v1 tracker created at `docs/W-LEADS-WORKBENCH-TRACKER.md`. 16-phase plan locked: W1 recon — W2 schema — W3 strip noise — W4a..g page build (7 tabs) — W5a..e enhancements — W6 smoke+Wclose. Sized 10-15 hours of focused work. Multi-tenant safety contract documented; every new surface scoped explicitly. Founder direction: ship solid not mediocre, day's delay in launch acceptable. Status enum will gain `do_not_contact`, `not_interested`, `disqualified` in W2. Quality field UI reduced to Hot/Cold binary (NULL default for new leads); Unqualified/Disqualified concepts moved to Status. Reusable components extracted in workstream: `<UserCreditPanel>` (W4c) + `<PlanRenderer>` (W4b) — built once for workbench, Users page can adopt later. Master tracker Section 4 row inserted as OPEN; v18 status log entry appended. Next: W1 deep recon — read Users page credit UI, probe plan_data shapes, locate plan email template, SQL probe status enum.