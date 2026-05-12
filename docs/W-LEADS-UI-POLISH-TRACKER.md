# W-LEADS-UI-POLISH-TRACKER

**Version:** v1 — OPEN — scope locked, L1/L2/L3 phases unstarted

**Started:** 2026-05-12  
**Owner:** Shah (sole dev)  
**Status:** OPEN — three UI-only polish phases identified during W-LEADS-EMAIL closure recon. Sized in hours; no schema, RPC, or API route changes anticipated.

## Why this exists

During W-LEADS-EMAIL closure recon at the leads admin UI (`components/admin-homes/AdminHomesLeadsClient.tsx`), three UX/render gaps surfaced that affect agent usability but are NOT data-plumbing bugs:

1. The categorized `lead_origin_route` column shipped in W-LEADS-EMAIL T2c and wired in T6b is not used by the leads UI at all. Source rendering still uses a `SOURCE_LABELS[lead.source]` dictionary lookup against the raw `source` column at L373-376. Any source string not in the dict shows up as a stripped raw value via the fallback `lead.source?.replace('walliam_', '')`.

2. Only the immediate `manager` is rendered in the hierarchy column at L388-395. The `area_manager_id` and `tenant_admin_id` columns exist on the row (page query uses `select('*')`) but the page join doesn't fetch their names, and the client doesn't render them. A lead handled by a managed agent shows only one level of the chain.

3. The Activity panel exists and works (L455-486 renders engagement score + timeline correctly) but is hidden behind a per-row amber Activity button at L443. Clicking toggles `expandedLead === lead.id + '-activity'` and fetches via `/api/admin-homes/activities`. The discoverability problem: an agent has to click every row to see engagement state — hot/warm leads aren't surfaced at-a-glance.

These are UI polish items, not schema/route bugs. Bundled as a single short workstream rather than scattered across post-launch tickets.

## Scope contract

**In scope:**

- **L1:** lead_origin_route badge swap-in on `AdminHomesLeadsClient` L373-376 (use `deriveLeadOriginRoute(source)` helper from `lib/utils/lead-origin-route.ts` shipped in W-LEADS-EMAIL T6b, plus per-route badge labels and color coding).
- **L2:** hierarchy chain render extending L388-395 to render area_manager and tenant_admin levels when present. Requires page join extension (add `area_manager:agents!leads_area_manager_id_fkey(...)` and `tenant_admin:agents!leads_tenant_admin_id_fkey(...)` joins in the page query) plus client-side conditional rendering with arrow indicators between levels.
- **L3:** activity panel discoverability. Two sub-changes: (a) engagement count badge on row (count of activities per lead, fetched in bulk on page load); (b) auto-expand activity panel for leads with hot/warm engagement at top of list.

**Out of scope:**

- Any schema migration (columns already exist).
- Any new API routes or RPCs.
- Any change to `/api/admin-homes/activities` endpoint contract.
- Any change to data sync, lead capture, or email flow (all owned by W-LEADS-EMAIL, now closed at v21).
- Mobile-specific responsive polish (separate workstream if surfaced).

## Outcomes Desired

- **OD-1:** Source column displays the categorized `lead_origin_route` value with per-route labels and colors. The raw `source` column remains the underlying truth but is no longer the primary display field.
- **OD-2:** Hierarchy column renders the full known chain (manager — area_manager — tenant_admin) when those rows exist on the lead. Missing levels degrade gracefully (only what exists is shown).
- **OD-3:** At-a-glance engagement state via a count badge on each row + auto-expand for hot/warm leads. Agent can triage 50+ leads without per-row clicks for the high-priority ones.

## Phases

| Phase | Title | Status | Estimated size | Notes |
|---|---|---|---|---|
| L1 | lead_origin_route badge swap-in | OPEN | 30-45 min | Helper already imported by `lib/actions/leads.ts`; client-side substitution + label/color map. |
| L2 | hierarchy chain render | OPEN | 1-2 hr | Page join extension (2 new `agents!fk` joins) + client conditional render with arrow indicators. |
| L3 | activity panel discoverability | OPEN | 1-2 hr | Engagement count fetch (bulk in page server component) + auto-expand logic for top-of-list hot/warm leads. |
| Lclose | Workstream close + W-LAUNCH-TRACKER row flip | OPEN | 10 min | After L1/L2/L3 ship. Mirrors W-LEADS-EMAIL Tlast pattern. |

## Phase workflow

Each phase ships independently in sequence: L1 — L2 — L3 — Lclose. Per Rule Zero — Comprehensive: each phase = probe — patch (with timestamped backup) — TSC clean (`npx tsc --noEmit`) — local smoke at `http://localhost:3000/admin-homes/leads` (with `DEV_TENANT_DOMAIN=walliam.ca` in `.env.local`) — git commit — git push to origin/main. Lclose flips this tracker's Section 4 row in `docs/W-LAUNCH-TRACKER.md` to CLOSED with phase ship hashes referenced.

## Status log

- **2026-05-12 v1** — Tracker created. Scope locked from W-LEADS-EMAIL closure recon at `components/admin-homes/AdminHomesLeadsClient.tsx`. Three UI polish phases identified: L1 (Source badge swap-in at L373-376), L2 (hierarchy chain render at L388-395), L3 (Activity panel discoverability at L443/L455-486). All sized in hours; no schema/RPC/API changes anticipated. Master tracker `docs/W-LAUNCH-TRACKER.md` Section 4 has corresponding OPEN row + v15 status log entry shipped in the same commit.
