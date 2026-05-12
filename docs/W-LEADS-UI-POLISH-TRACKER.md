# W-LEADS-UI-POLISH-TRACKER

**Version:** v2 — OPEN — scope expanded from 3-phase rendering polish to 7-phase qualified-leads system

**Started:** 2026-05-12  
**Owner:** Shah (sole dev)  
**Status:** OPEN — seven UI/data phases that together produce the working qualified-leads management system. Sized 6-8 hours of focused work; ships in one block today.

## Why this exists

Original v1 scope was three rendering polish items (Source badge, hierarchy chain, activity discoverability) on the existing leads table. After design review the workstream expanded to address the actual goal: a working qualified-leads system where the agent can see one row and immediately know what to do.

The leads admin UI today is a flat table where every row has equal visual weight. The data needed for triage exists across multiple tables (`leads`, `user_activities`, `user_credit_overrides`, `vip_requests`) but is scattered across the page or hidden behind interactions. To answer "who do I call right now?" the agent has to mentally cross-reference. That's the problem.

The expanded scope produces a unified lead view with four signals per lead:

1. **Qualification** — agent-set: `unqualified` / `qualified_hot` / `qualified_cold` / `disqualified`
2. **VIP form status** — yes/no, did they fill the questionnaire (basic profile is always complete since email + phone are mandatory at signup)
3. **Engagement** — computed: activity count + recency (logic already exists at `calcEngagement` L66-67)
4. **Credit posture** — computed: usage + blocked state + pending VIP request

Plus inline actions (approve VIP, grant credits, mark qualified) and a detail drawer with the buyer/seller plan content (which the agent already receives in email but cannot see inline today).

## Scope contract

**In scope:**

- **L1 (qualification system):** `leads.quality` becomes agent-only with values `unqualified` / `qualified_hot` / `qualified_cold` / `disqualified`. Schema migration to expand CHECK constraint and change default to `unqualified`. Backfill existing rows (map `hot` — `qualified_hot`, `cold` — `unqualified`). Remove all code-set `quality` writes (closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19: `charlie/plan-email` L144 + `charlie/lead` L229 currently hardcode `'hot'` while DB default is `'cold'`). Replace existing dropdown at L414-417 with inline action buttons.
- **L2 (source badge swap-in):** Source column at L373-376 uses `deriveLeadOriginRoute(source)` helper from `lib/utils/lead-origin-route.ts` (shipped W-LEADS-EMAIL T6b) with per-route badge labels and colors.
- **L3 (hierarchy chain render):** Page query at `app/admin-homes/leads/page.tsx` L31-35 extends with `area_manager:agents!leads_area_manager_id_fkey(...)` + `tenant_admin:agents!leads_tenant_admin_id_fkey(...)` joins. Client renders conditional hierarchy chain at L388-395 with arrow indicators between levels.
- **L4 (engagement inline + activity):** Engagement count badge always visible on row (using existing `calcEngagement` at L66-67). Last 2 activities visible inline beneath each row. Full timeline moves to detail drawer (L7). The amber Activity expand button at L443 is removed.
- **L5 (credit posture chip):** Page query joins `user_credit_overrides` + `vip_requests` by `lead.user_id`. Compact chip on row showing consumption summary. Prominent "VIP pending" / "blocked at zero credits" badge when applicable.
- **L6 (inline action buttons):** Three buttons on the lead row — Approve VIP (when pending), Grant credits, Mark qualified (cycles through quality states). Reuses existing routes: `app/api/admin-homes/users/override/route.ts` for credit grants, `app/api/admin-homes/leads/[id]/route.ts` for quality updates.
- **L7 (lead detail drawer):** Click row — drawer opens with full lead context: complete activity timeline, all emails sent (from `lead_email_recipients_log`), the buyer/seller plan content (already stored in `chat_sessions.plan_data` or `leads.plan_data`, currently only delivered via email), full credit history, hierarchy chain, notes from prior calls.

**Out of scope:**

- New API routes or RPCs (all reuse existing).
- Schema changes beyond the `leads.quality` CHECK constraint expansion in L1.
- New data sync paths (`/api/admin-homes/activities` contract unchanged).
- Mobile-specific responsive polish (separate workstream if surfaced).
- The action-queue / grouped-list table redesign (separate W-LEADS-UX-V2 if needed post-launch).

## Outcomes Desired

- **OD-1:** Agent can mark a lead as qualified (hot/cold/disqualified) directly from the row in one click. Quality is set only by human action; code never writes `leads.quality`.
- **OD-2:** Source column displays categorized `lead_origin_route` value with per-route labels and colors. The raw `source` column remains the underlying truth but is no longer the primary display field.
- **OD-3:** Hierarchy column renders the full known chain (manager — area_manager — tenant_admin) with graceful degradation when levels are missing.
- **OD-4:** Engagement state visible at-a-glance per row; no per-row click needed for triage. Agent can scan 50 leads and identify hot ones in seconds.
- **OD-5:** Credit posture visible per row including a prominent badge for pending VIP requests or blocked-at-zero-credits states — the agent sees "this lead needs my action" without leaving the page.
- **OD-6:** Approve VIP and Grant credits actions executable inline without leaving the leads page.
- **OD-7:** Full lead context (complete activity timeline + buyer/seller plan + credit history + emails sent) viewable in a drawer without navigation away from the leads list.

## Phases

| Phase | Title | Status | Estimated size | Notes |
|---|---|---|---|---|
| L1 | Qualification system | OPEN | 60-90 min | Schema migration (CHECK + default + backfill) + code cleanup (remove `quality` writes from `charlie/plan-email` L144 + `charlie/lead` L229) + UI inline buttons replacing L414-417 dropdown. |
| L2 | Source badge swap-in | OPEN | 30-45 min | Helper already imported by `lib/actions/leads.ts`; client-side L373-376 substitution + label/color map. |
| L3 | Hierarchy chain render | OPEN | 45-60 min | Page query extension (2 new `agents!fk` joins) + client conditional render at L388-395 with arrow indicators. |
| L4 | Engagement inline + activity | OPEN | 45-60 min | Surface `calcEngagement` (L66-67) as always-visible badge; inline last 2 activities; remove L443 expand button (full timeline — drawer in L7). |
| L5 | Credit posture chip | OPEN | 45-60 min | Page query joins `user_credit_overrides` + `vip_requests` by `lead.user_id`. Chip render + blocked-state badge. |
| L6 | Inline action buttons | OPEN | 45-60 min | Approve VIP + Grant credits + Mark qualified buttons on row. Reuses existing API routes. |
| L7 | Lead detail drawer | OPEN | 60-90 min | Drawer component with full activity timeline + buyer/seller plan content + credit history + emails sent + notes. Plan content already stored; just needs to be surfaced. |
| Lclose | Workstream close + W-LAUNCH-TRACKER row flip | OPEN | 10 min | 4-anchor patch on master tracker, same pattern as W-LEADS-EMAIL Tlast. |

## Phase workflow

Each phase ships independently in sequence: L1 — L2 — L3 — L4 — L5 — L6 — L7 — Lclose. Per Rule Zero — Comprehensive: each phase = probe — patch (with timestamped backup) — TSC clean (`npx tsc --noEmit`) — local smoke at `http://localhost:3000/admin-homes/leads` (with `DEV_TENANT_DOMAIN=walliam.ca` in `.env.local`) — git commit — git push to origin/main. Lclose flips this tracker's Section 4 row in `docs/W-LAUNCH-TRACKER.md` to CLOSED with phase ship hashes referenced.

## Status log

- **2026-05-12 v1** — Tracker created with three rendering polish phases (L1 source badge, L2 hierarchy, L3 activity). Scope locked from W-LEADS-EMAIL closure recon at `components/admin-homes/AdminHomesLeadsClient.tsx`. Master tracker `docs/W-LAUNCH-TRACKER.md` Section 4 OPEN row + v15 status log entry shipped in same commit.
- **2026-05-12 v2** — **Scope expanded after design conversation.** The original three phases (now L2/L3/L4) are necessary but not sufficient — the actual goal is a working qualified-leads management system where the agent sees one row and immediately knows what to do. **Four new phases added:** L1 (qualification system: agent-set `leads.quality` with values `unqualified`/`qualified_hot`/`qualified_cold`/`disqualified`, closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19); L5 (credit posture chip: joins `user_credit_overrides` and `vip_requests` to surface consumption + blocked states — credit system lives under user but surfaces inline on the lead row); L6 (inline action buttons: Approve VIP / Grant credits / Mark qualified, all reusing existing API routes); L7 (lead detail drawer: surfaces the buyer/seller plan content the agent already receives in email but cannot see inline today). **Original phases renumbered:** L1 (source badge) — L2; L2 (hierarchy) — L3; L3 (activity) — L4. Total seven phases + Lclose, sized 6-8 hours of focused work. Ships in one block today. No new API routes; only one schema migration (L1 CHECK constraint expansion). Master tracker Section 4 row Open-items column updated to reflect new scope; v16 status log entry added.
- **2026-05-12 L1** — **Qualification system shipped (expanded scope).** Migration `supabase/migrations/20260512_l1_qualification_system_constraint.sql` expanded `leads_quality_check` to a UNION of legacy values (`hot`, `warm`, `cold`) and new values (`unqualified`, `qualified_hot`, `qualified_cold`, `disqualified`); default changed from `cold` to `unqualified`; backfilled 163 rows (all WALLiam tenant `b16e1039`): 145 `hot` — `qualified_hot` plus 18 `cold` — `unqualified`. **Why UNION (not REPLACE):** paste 92 safety grep found 14 `quality:` writes total — 8 in System 2 (patched here) + 6 in System 1 `app/api/chat/*` (UNTOUCHED per System 1 Isolation rule). A replacement CHECK would 500 every System 1 lead insert post-migration; union CHECK preserves System 1 compatibility while permitting the new System 2 taxonomy. **Backend code patches (8 System 2 files):** `app/api/charlie/plan-email/route.ts`, `app/api/charlie/lead/route.ts`, `app/api/charlie/appointment/route.ts`, `app/api/walliam/charlie/vip-request/route.ts`, `app/api/walliam/contact/route.ts`, `app/api/walliam/estimator/vip-questionnaire/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`, `lib/actions/leads.ts` (writes `cold`, not `hot`). Each `quality:` line removed from the `.insert({...})` payload; new inserts default to `unqualified` via the new DB default. **System 1 chat/* writes preserved (untouched):** 6 writes across 4 files (`chat/vip-approve:142,157`, `chat/vip-questionnaire:215`, `chat/vip-request:230`, `chat/vip-upgrade:67,89`) continue to write `hot` against the union CHECK. **UI patch on `components/admin-homes/AdminHomesLeadsClient.tsx`:** added `QUALITY_VALUES` and `QUALITY_LABELS` consts; rewrote `qualityColor` map with new keys; updated `stats.hot` — `stats.qualified_hot` counter; relabeled stats card to "Hot Leads"; rebuilt filter dropdown with five options (All / Unqualified / Hot / Cold / Disqualified); replaced the inline quality `<select>` dropdown with four action buttons, each clickable to set quality via the existing PATCH `/api/admin-homes/leads/[id]` route (no new API endpoints). `calcEngagement` was NOT touched — its `Hot`/`Warm`/`Active`/`Cold` labels are activity-score display strings, semantically independent of `lead.quality`. **Recovery note:** initial paste 94 patch script applied 8 backend patches + UI anchors 4a-4e successfully but UI anchor 4f (exact-string match on the 14-line inline `<select>` block) returned 0 matches. AdminHomesLeadsClient.tsx was untouched on disk (script threw before write). Recovery paste 95 re-applied anchors 4a-4e exact-string + 4f via line-pattern replacement (find unique `{/* Inline quality update */}` comment, find matching `</td>` at same indent, splice the block). Indent-agnostic; robust to whatever whitespace difference tripped the original exact-string anchor. Closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19. L1 row in the phase table stays OPEN until Lclose reconciles all phase commit hashes.
- **2026-05-12 L2** — **Source badge swap-in shipped.** `components/admin-homes/AdminHomesLeadsClient.tsx` now imports `deriveLeadOriginRoute` and `LeadOriginRoute` from `lib/utils/lead-origin-route.ts` (shipped W-LEADS-EMAIL T6b). `SOURCE_LABELS` (7 source-string keys: walliam_charlie, walliam_contact, walliam_agent_card, walliam_charlie_vip_request, walliam_estimator_vip_request, walliam_estimator_questionnaire, walliam_appointment) and `SOURCE_COLORS` (7 keys, parallel structure) were REPLACED with `ROUTE_LABELS` and `ROUTE_COLORS`, both typed `Record<LeadOriginRoute, string>` for compile-time exhaustiveness against the 11-value enum (charlie / charlie_vip_request / estimator / estimator_questionnaire / estimator_vip_request / contact_form / registration / property_inquiry / building_visit / sale_evaluation / unknown). Source column badge at L385-386 now uses `ROUTE_COLORS[deriveLeadOriginRoute(lead.source)]` and `ROUTE_LABELS[deriveLeadOriginRoute(lead.source)]` — no fallback needed since the helper always returns a valid enum value (`unknown` covers all unmatched inputs). Filter dropdown at L273 rebuilt from `Object.entries(ROUTE_LABELS)` so users now filter by route (11 options) instead of raw source string (7 options); filter logic at L147 compares `deriveLeadOriginRoute(l.source) === filterSource` instead of `l.source === filterSource`. **Vocabulary alignment notes:** the old `walliam_appointment` and `walliam_agent_card` SOURCE_LABELS keys had no corresponding route enum values; the DB distribution shows 0 rows with either source string (the appointment route actually writes `source: walliam_charlie`, which maps to the `charlie` route), so removing them is not a regression. CSV export at L173 was deliberately NOT changed (continues to emit raw `lead.source`) — data exports preserve original DB values; consumers can derive route downstream if needed. **No DB schema changes.** No new API endpoints. Pure client component swap. L2 row in the phase table stays OPEN until Lclose reconciles all phase commit hashes.
