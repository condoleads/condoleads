# W-LEADS-EMAIL Tracker

**Started:** 2026-05-09
**Owner:** Shah (sole dev)
**Status:** **v1 SKELETON.** Scope contract DRAFT (7 in-scope items + out-of-scope list). 9 open decisions (OD-1..OD-9) pending T1 lock. Phase structure: T0 recon → T1 decision lock → T2..T8 backend build → **T9 Admin UI (WOW stage)** → T10 close. **Next: T0 recon — read-only audit of credit surface + lead routes + public page form coverage + email path + plan delivery + leads schema + tenant→platform routing + existing admin leads surface — feeds T1 decision lock in the same working block.**
**Sister tracker:** `docs/W-LAUNCH-TRACKER.md` — Section 4 will gain a W-LEADS-EMAIL row at v1 closure.

---

## Why this exists

Three prior workstreams answered the **routing layer** for leads:

- **W-HIERARCHY** (closed 2026-05-03 v17 FINAL) shipped `walkHierarchy()` + the 6-layer BCC fan-out contract via `lib/admin-homes/lead-email-recipients.ts`. 7 lead routes wired through the helper.
- **W-ROLES-DELEGATION R7** (shipped 2026-05-05 commit `8a686c0`) added the delegation BCC overlay — active delegates' `notification_email` injected at layers 1–4.
- **W-TERRITORY** (closed 2026-05-09 v21 FINAL) shipped the resolver chain (`resolve_agent_for_context` for routing, `resolve_display_agent_for_context` for display) that determines which agent owns a lead at any context.

Together those three answer "**when a lead arrives, which agent owns it and who gets BCC'd?**". They do **not** answer seven other questions that gate launch readiness:

1. **Credit accounting on lead writes.** Leads may consume / be gated by credits. Today's atomic counters (`increment_chat_session_counter` / `decrement_chat_session_counter`) cover Charlie chat. The interaction with `INSERT INTO leads` has not been audited end-to-end.
2. **Public form coverage.** Every public-facing geo and property page (Area / Municipality / Community / Neighbourhood / Building / Property) must render the right lead-capture form, posting to the right route, persisting the right context. Coverage has not been verified per page type.
3. **Origin attribution.** Lead origin (which page type, which geo IDs, which listing/building IDs, which component triggered the post) needs to live on the lead row consistently. Today's coverage is unverified and likely uneven across the 7 lead routes.
4. **Recipient contract extension.** The 6-layer fan-out covers leaf agent → manager → area_manager → tenant_admin. **Tenant → platform-admin routing** and **manager → tenant-admin overlay** are not in the current contract. Per Shah's spec, both must flow.
5. **Plan delivery integration.** Buyer Plan / Seller Plan email flows currently exist as a separate path from leads (per the WALLiam brand card). Whether plan signups create leads, whether lead-with-plan-context triggers the plan email, and whether the two paths share state has not been decided or wired.
6. **End-to-end smoke.** No single harness exercises every entry point × recipient layer × credit/plan combination. Without it, regressions in any of the above cannot be caught before production.
7. **Admin Leads-Email UI.** The `AdminHomesLeadsClient` (~26.9KB per W-LAUNCH-TRACKER recon) renders leads today, but a comprehensive — and intuitive, premium-feel — admin command center for leads + email + credits + recipient hierarchy + plan attribution + lifecycle does not yet exist. **Backend correctness without an exceptional admin surface is a half-shipped product.**

**Make-or-break framing per Shah:** Leads-Email is the system that converts a public site visitor into a tracked, attributed, credit-accounted, reviewable business event. The platform's revenue path runs through it. Without comprehensive wiring across all 7 axes — including the polished admin UI as the legibility layer — every other workstream's value is degraded.

---

## Scope contract (DRAFT — to be LOCKED at T1)

In scope:

1. **Credit gating + accounting on lead INSERT.** Recon current credit state, decide whether leads consume credits, decide where the gate fires (route layer / DB trigger / both). OD-1 locks the policy.
2. **Lead-capture form coverage on all 6 public page types.** Area, Municipality, Community, Neighbourhood, Building, Property — every page renders the right form variant for its scope, every form posts to the right route, every route writes a lead with the right context fields.
3. **Origin metadata on every lead row.** Origin scope (page type + geo IDs + listing/building IDs), origin URL, origin component (e.g., `WalliamAgentCard.contact_form` vs `WalliamCTA.buyer_plan_signup`). OD-2 locks the schema shape.
4. **Email recipient contract extension.** Current 6 layers + tenant→platform-admin layer + manager→tenant-admin overlay. OD-3 locks the layer count and assignment rules.
5. **Plan delivery integration.** Buyer Plan / Seller Plan email flows audited; OD-4 locks the relationship between leads and plan signups (one creates the other / both / neither).
6. **Comprehensive end-to-end smoke matrix.** Single test harness exercising every entry-point × recipient-layer × credit/plan combination. Production data never committed (SAVEPOINT-isolated per W-TERRITORY v13 pattern). OD-6 locks the test tier.
7. **Admin Leads-Email UI — the WOW stage.** Comprehensive, intuitive, premium-feel admin surface that makes the entire system legible: lead lifecycle viewer + email thread per lead + full recipient list with per-recipient delivery status + BCC layer visibility + audit trail + plan attribution + credit balance integration + smart filtering + drill-through to lead origin page + hierarchy explorer + bulk actions. Mobile responsive + WCAG-AA a11y baseline. **Quality bar: best-in-class (HubSpot / Salesforce / Pipedrive comparable).** OD-8 + OD-9 lock the design tier and surface placement.

Out of scope:
- **System 1 lead routes** (`/admin` / `condoleads.ca`) — never touched, per System 1 isolation rule.
- **Anonymous lead capture without registered user OR explicit anonymous-form path** — separate workstream; this workstream assumes either authenticated user OR a contact form that captures `tenant_id` + identity at submit time.
- **Lead → external CRM export** (Salesforce / Pipedrive / HubSpot) — post-launch feature.
- **SMS notifications** — separate workstream when SMS provider onboards; current scope is email only.
- **Public-facing lead list** (e.g., user-visible "your inquiries" page) — out of scope for this workstream; the focus here is the admin/agent/manager view.

---

## Open decisions (LOCKED at T1, after T0 recon evidence)

**OD-1.** [**Credit gating policy**] Does lead INSERT consume / require / ignore credits?
- (a) Credits required pre-INSERT — gate at route layer; insufficient credits returns 402 + no lead written.
- (b) Credits debited post-INSERT — lead always creates; debit fires on email-send confirmation.
- (c) Credits unrelated — leads are free; credits only gate Charlie chat.
- (d) Credits scoped per-tenant per-action — tenant pays per-lead; user-level credits track only chat.

**OD-2.** [**Origin metadata shape**] How is origin captured on `leads` rows?
- (a) Single `origin_url TEXT` column.
- (b) Multiple typed columns (`origin_scope`, `origin_geo_id`, `origin_listing_id`, `origin_component`).
- (c) JSONB `origin_context` blob with documented schema.
- (d) Hybrid — typed columns for indexed queries + JSONB for free-form.

**OD-3.** [**Recipient layer count**] Tenant→platform-admin path adds one layer. Manager→tenant-admin overlay adds another. Total layers becomes:
- (a) 8 layers — both new paths added as discrete layers.
- (b) 7 layers — one merged, one discrete.
- (c) 6 layers — overlay logic merged into existing layers, no new layer slots.

**OD-4.** [**Plan integration direction**] Buyer Plan / Seller Plan vs leads:
- (a) Plan signup creates a lead (`leads.source = 'buyer_plan_signup' | 'seller_plan_signup'`).
- (b) Lead with plan context triggers plan email (`leads.requested_plan = 'buyer' | 'seller'`).
- (c) Both — plan signups create leads AND leads can carry plan context.
- (d) Neither — plans and leads remain independent paths.

**OD-5.** [**Form variant per page type**] Are all 6 page types running the same lead-capture form, or does each type get a tailored form?
- (a) One form, one component (`WalliamContactForm` already exists).
- (b) Per-page-type variants (e.g., property pages have showing-request fields; area pages have generic-inquiry fields).
- (c) One component with conditional field rendering driven by scope prop.

**OD-6.** [**Smoke test tier**] What does "comprehensive" mean for the test harness?
- (a) Unit-level: every helper / route / form component tested in isolation.
- (b) Integration-level: every entry point posts to every route and lands the right rows + audit + recipient list.
- (c) End-to-end: production-shape SQL state, real BCC fan-out via Resend dry-run, every credit/plan combo, every form/page combo. Single transaction with ROLLBACK per test (W-TERRITORY v13 savepoint-isolation pattern).

**OD-7.** [**Tenant-admin email override**] When a tenant has a custom `notifications` or `support` email configured, do leads-related emails route to the custom address or always to `notifications@condoleads.ca`? Per memory: all WALLiam email currently uses `notifications@condoleads.ca` (verified domain). Tenant override is per-tenant config that may or may not exist.
- (a) Always `notifications@condoleads.ca` (current behavior, simpler, single domain).
- (b) Tenant override allowed when verified domain configured.
- (c) Hybrid — inbound email reply-to is tenant-custom; from address stays verified.

**OD-8.** [**Admin UI design tier**] What's the quality bar for T9?
- (a) Premium-tier, comparable to HubSpot Sales Hub / Salesforce Lightning / Pipedrive — bold typography, micro-animations, dense-but-elegant layouts, subtle depth + glassmorphism accents, real-time feel, command-bar shortcut UX.
- (b) Modern-functional — clean, fast, no unnecessary flourish; the same density as `/admin-homes/territory` (T4a-2 pattern).
- (c) Hybrid — premium-feel for the top-level dashboard + lead detail drawer (the most-used surfaces); functional for filter forms and admin settings.

Per Shah explicit direction at v1 creation: **"this needs to be the best"** — strong steer toward (a). Confirmed at T1 with mock-up review.

**OD-9.** [**Admin UI surface placement**] Where does T9 live in `/admin-homes`?
- (a) Substantially redesign the existing `AdminHomesLeadsClient` at `/admin-homes/leads` (one-surface approach).
- (b) Keep the existing leads page as a basic list, add a new dedicated command center at `/admin-homes/leads-email-center` that's the comprehensive surface.
- (c) Both — the existing page becomes the lightweight "inbox" view; the new surface is the analytics / lifecycle / hierarchy / plan-attribution view. Lead detail drawer opens from either.

---

## Phases

### T0 — Recon (NEXT, this working block)

Read-only audit of every existing surface that touches leads or email. **Outputs feed T1 decision lock — every OD answer must come from probe evidence, not memory or inference.** Per Rule Zero — No Guessing.

T0 sub-targets:

- **T0-A — Credit surface.** Files: `lib/credits/resolveUserLimits.ts`, `components/credits/CreditSessionContext.tsx`, `app/charlie/hooks/useCharlie.ts`, atomic counter migrations, `user_credit_overrides` table shape, admin UI for credit management. Map: who can increase/decrease credits, what fields/tables drive the resolution, where the admin-side controls live, whether credit logic is referenced anywhere in lead routes.
- **T0-B — Lead routes inventory.** Find every POST that writes to `leads` (grep on `from('leads').insert` + `INSERT INTO leads` + indirect helpers). For each: entry-point form, scope of context fields captured, walker call, recipients-helper call, credit interaction, audit row writes.
- **T0-C — Public page form coverage.** For each of Area / Muni / Community / Neighbourhood / Building / Property: which components render lead-capture forms, what props they take, what route they post to, how they're conditionally rendered (tenant gate, isWalliam gate, etc).
- **T0-D — Email path inventory.** Find every Resend send call (`resend.emails.send`, `sendEmail` helpers, etc). Map each to: trigger event, template, recipient resolution rules (helper-based vs ad hoc), BCC layers, plan-context handling.
- **T0-E — Plan delivery surface.** Buyer Plan / Seller Plan email flows: where they fire from, what data they carry, what creates them, where the call sites are, how `WalliamCTA.buyer_plan` / `WalliamCTA.seller_plan` button clicks land.
- **T0-F — `leads` schema.** Current columns, NOT NULL constraints, indexes, audit triggers, foreign keys. Includes any leads-adjacent tables (`lead_ownership_changes`, `leads_email_log` if exists, etc).
- **T0-G — Tenant→platform-admin routing.** Recon how platform admins receive notifications today (if at all). `tenants` table for `default_agent_id` / platform-admin association columns. `agents` table role values for platform-admin tier. Existing routes that BCC platform admins.
- **T0-H — Existing admin leads surface (FOR T9 BASELINE).** `AdminHomesLeadsClient.tsx` (~26.9KB per W-LAUNCH recon), `app/admin-homes/leads/page.tsx`, any existing `lead-detail` modal/drawer components, current filter/search/sort UX, current bulk actions. T9 design lock reads against this baseline.

T0 closure = all 8 sections probed and findings logged in this tracker as v2.

### T1 — Decision lock (after T0)

Resolve OD-1 through OD-9 with the recon evidence in hand. T1 closure = scope contract LOCKED + locked product model written + phase plan T2..T9 detailed.

### T2..T8 — Backend build phases (after T1)

Phase structure to be determined at T1 closure based on the dependency graph among OD-1..OD-7 outcomes. Likely shape (subject to T1 lock):

- **T2** — Schema migrations (origin metadata columns / recipient-extension tables / credit-accounting tables if needed). Append-only audit + DENY UPDATE/DELETE triggers per W-TERRITORY T2a pattern.
- **T3** — Recipient contract extension (helper updates for tenant→platform layer + manager→tenant-admin overlay). Smoke per layer.
- **T4** — Credit gating (route-layer changes if OD-1 = a or b). Atomic-debit pattern per W-CREDIT-VERIFY D0.
- **T5** — Form coverage audit + form component updates (per OD-5 outcome). Verifies every public page renders the right form.
- **T6** — Plan integration wiring (per OD-4 outcome). Buyer/Seller Plan email triggers + lead-context plumbing.
- **T7** — Smoke matrix harness (per OD-6 tier). SAVEPOINT-isolated, single-transaction-with-ROLLBACK pattern.
- **T8** — Comprehensive smoke run + regression sweep. Backend declared complete + verified before T9 starts.

### T9 — Admin Leads-Email UI: the WOW stage (FINAL build phase)

**Quality bar: best-in-class. The admin surface that makes the entire backend legible at a glance.** Per Shah explicit direction — "this needs to be the best."

T9 ships in sub-phases within this working block. Each sub-phase has its own anchored patch script + inline smoke + visual QA gate.

- **T9-1 — Recon + design lock.** Read against T0-H baseline. Mock layout for the top-level dashboard + lead detail drawer + filter shelf + hierarchy explorer. Lock OD-8 (design tier) + OD-9 (surface placement). Material sourced from current best-of-breed CRM admin surfaces (HubSpot Sales / Salesforce Lightning / Pipedrive Insights / Front).
- **T9-2 — Top-level dashboard.** Hero stats card (leads today / week / month, conversion rate, by-agent leaderboard, by-origin breakdown, by-plan breakdown, credit balance + burn rate). Real-time feel — leads appear in the recent-activity feed within seconds of INSERT. Clickable everywhere — every stat drills into a filtered lead list.
- **T9-3 — Lead list view + smart filtering.** Server-side paginated list with client-side filter shelf. Filters cover every dimension: tenant, agent, scope (geo/listing/building), origin component, plan context, time range, status, recipient layer membership, credits used. Filter combinations URL-encoded so links are shareable. Sub-100ms client-side filter response after data lands.
- **T9-4 — Lead detail drawer.** Slide-in from right, opens in <50ms (no full re-render). Tabs: Overview (lead state + origin metadata + agent assignment), Email Thread (every email triggered, per-recipient delivery status from Resend webhooks, BCC layer visibility toggle), Recipients (full hierarchy explorer — see who got BCC'd at which layer, with toggleable layer visibility and reason-for-inclusion per recipient), Audit Trail (every state change with diff + actor + timestamp), Plan Context (if lead carries plan attribution), Credits (debit history for this lead).
- **T9-5 — Hierarchy explorer (visual).** Inline tree visualization of the recipient list — leaf agent at center, BCC layers radiating out, delegation overlay shown as accent edges, color-coded per layer. Hover any node → see why they're included (which W-HIERARCHY contract clause). Fold/unfold per layer.
- **T9-6 — Bulk actions + drill-through.** Multi-select on the list. Bulk: reassign agent (with cascade through W-TERRITORY resolver), mark status, resend email, export filtered set as CSV. Single-row drill-through: "open lead origin" → opens the public page where the lead came from in a new tab, with the form that captured the lead visible.
- **T9-7 — Mobile responsive + a11y.** Same admin needs to work on phone. List collapses to per-lead cards; drawer becomes full-screen sheet; filter shelf becomes bottom sheet. WCAG-AA baseline matching W-TERRITORY T4c-3 pattern: aria-labels, focus rings, focus traps in drawer + sheets, keyboard nav (j/k for next/prev lead, Enter to open, Esc to close, /, for search).
- **T9-8 — Inline smoke + visual QA gate.** Comprehensive UI smoke + manual visual review on desktop and mobile before T9 closes. Per the local-smoke-first rule: every sub-phase smoke-tested locally before commit + push.

**T9 design principles (locked at v1, refinable at T9-1 design lock):**

- **Speed feels premium.** Filter response, drawer open, list paginate — everything sub-100ms wherever data is already loaded. Loading states are intentional, not afterthoughts.
- **Information density without clutter.** Every pixel earns its keep. No empty hero banners. Charts where text would be heavier; text where charts would be lighter.
- **Visual hierarchy via type and space, not borders.** Modern CRM aesthetic — large readable type for primary info, subdued meta info, generous whitespace, subtle elevation for interactive surfaces.
- **Real-time feel.** New leads appear in the activity feed without manual refresh (SSE or polling, decided at T9-1). Status changes propagate without a full re-fetch.
- **Hierarchy made visible.** The recipient layer system is the platform's most invisible-yet-powerful concept. T9-5's hierarchy explorer is the tool that makes it click for users for the first time.
- **Mobile is not an afterthought.** Tenant admins are often on phones. T9-7 is a co-equal design target, not a second-pass.
- **Multi-tenant correctness is invisible — but enforced.** Tenant admins see only their tenant; platform admins see all with explicit tenant filter. No tenant ID ever leaks across surfaces.

### T10 — Close

After T2-T8 (backend) + T9 (admin UI) ship + final comprehensive smoke matrix PASS + W-LAUNCH-TRACKER row updated.

---

## Workflow rules in effect

All Rule Zero invariants apply (multitenant at scale, no regressions, comprehensive only, nothing deferred, no guessing, backups before edits, no placeholders, secrets fingerprint, System 1 isolation, local smoke first).

Specific to W-LEADS-EMAIL:

- **System 1 lead routes are NEVER touched.** All work is System 2 (`/admin-homes`, `app/api/walliam/*`, `app/api/charlie/*`, walliam-tenant-scoped flows).
- **Email always uses `notifications@condoleads.ca`** (verified Resend domain) per memory — never `walliam.ca`. OD-7 may carve a per-tenant override, but the verified-domain default is the baseline.
- **Append-only audit on lead writes.** `leads` table inherits the `tenant_id NOT NULL` + `agent_id NOT NULL` constraints. Any new lead-adjacent table follows append-only via DENY UPDATE / DELETE triggers (per W-TERRITORY T2a pattern).
- **No DELETE on leads from any route.** Deactivation pattern (`status` field or soft-delete column) only.
- **Origin attribution is required.** Every lead INSERT must carry origin context per OD-2 outcome; route validation rejects writes missing it. Existing leads are backfilled to a known-default origin scope at the migration that lands the columns.
- **Test scope per OD-6 outcome.** Once locked, every new code path must come with smoke coverage in the chosen tier. Smoke runs locally first (per memory rule — local smoke first, never Vercel preview).
- **Probe-then-patch pattern (W-TERRITORY v11).** Any production trigger / function modification must be preceded by a read-only probe that captures the exact current source. The probe output is the ground truth; the patch is derived from it.
- **Per-row-diff via diff helper (W-TERRITORY v14).** Any future write path that ingests a desired-state payload (e.g., bulk recipient overrides per tenant) must use a server-side diff against current active state, not DELETE-all + INSERT-all. Identity key documented per table.
- **Smoke-via-savepoint-isolation (W-TERRITORY v13).** Smoke tests run in a single transaction with final ROLLBACK; per-test SAVEPOINT + ROLLBACK TO SAVEPOINT prevents drift. Production data is never committed.
- **T9 quality bar: best-in-class.** Per Shah explicit direction — "this needs to be the best." Visual reviews are first-class gates, not afterthoughts. If a sub-phase ships and it doesn't feel premium on first interaction, it's not done. The bar is set against current best-of-breed CRM admin surfaces; not against the existing internal UI baseline.

---

## Findings

(empty — populated during T0 recon and beyond)

---

## Status log

- **2026-05-09 v1** — Tracker skeleton created. **Why-this-exists** establishes the make-or-break framing: prior workstreams (W-HIERARCHY, W-ROLES-DELEGATION R7, W-TERRITORY) shipped the routing layer; this workstream covers credit accounting + public form coverage + origin attribution + recipient contract extension + plan delivery integration + end-to-end smoke + **admin Leads-Email UI as the WOW stage**. **Scope contract DRAFT** lists 7 in-scope items + 5 out-of-scope items. **Open decisions** OD-1 (credit gating), OD-2 (origin shape), OD-3 (recipient layer count), OD-4 (plan integration), OD-5 (form variants), OD-6 (smoke tier), OD-7 (tenant email override), OD-8 (UI design tier), OD-9 (UI surface placement). Per Shah explicit direction at v1 creation: T9 quality bar is "best-in-class" — strong steer toward OD-8 (a) premium-tier; confirmed at T1 with mockup review. **Phases**: T0 recon → T1 decision lock → T2..T8 backend build → T9 admin UI WOW stage (8 sub-phases T9-1..T9-8) → T10 close. T0 has 8 sub-targets (T0-A..T0-H, with T0-H added for T9 baseline). **Workflow rules** carry forward all Rule Zero invariants + W-TERRITORY-derived patterns (probe-then-patch, per-row-diff, savepoint smoke isolation, local smoke first) + T9-specific quality bar rule (best-in-class; visual reviews are first-class gates). **Next action: T0 recon, this working block.** Probes feed T1 decision lock. No code changes until T1 closes.

---

## Next action

**T0 recon, this working block.** Eight probe targets listed above. Each produces a verified-current state output under `recon/W-LEADS-EMAIL-T0-<letter>-<topic>.txt`. Recon order proposed (subject to revision based on findings):

1. **T0-F** (`leads` schema) — quickest probe; sets the data shape that every other recon target reads against.
2. **T0-B** (lead routes inventory) — finds every code path that writes to leads.
3. **T0-A** (credit surface) — feeds OD-1.
4. **T0-D** (email path inventory) + **T0-G** (tenant→platform routing) — feed OD-3 and OD-7.
5. **T0-E** (plan delivery surface) — feeds OD-4.
6. **T0-C** (public page form coverage) — feeds OD-5.
7. **T0-H** (existing admin leads surface) — feeds OD-8 + OD-9 + the T9 design lock.

T0 closure = all 8 probes complete + findings logged as tracker v2 + OD-1..OD-9 each have at least one evidence-backed candidate answer. T1 decision lock follows in the same working block. **No code changes until T1 closes.** **Build phase order is T2..T8 (backend) → T9 (admin UI) → T10 (close); T9 is explicitly the final build phase before close — the WOW stage is the legibility layer over everything else, not a side-project.**