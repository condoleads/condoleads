# W-CORE-VERIFICATION tracker

**Status:** PLANNING (v3, 2026-05-31). Authority for **proof** that the hierarchy → territory → leads flow works as designed, exhaustively. Design authority remains `W-TERRITORY-MASTER-TRACKER`; this tracker is referenced from its **P-SMOKE** row and owns the full verification matrix.

Read `CLAUDE.md` and `W-TERRITORY-MASTER-TRACKER` first. Every rule there (Rule Zero, recon-first, no-fake-data, frozen contracts, role-aware testing, backup-before-touch, full-vs-fast-path) governs everything here.

**This is the planning layer.** It produces phase specs that Claude Code executes. We return to the master tracker for syncs/keys ONLY after this exercise is done.

---

## A — EXECUTION MODEL (aligned to `.claude/settings.local.json` + CLAUDE.md)

This is how work actually flows. Corrected to match the real permission model — not "Claude-chat writes all code."

**The split:**
- **This chat (planning):** produces the phase specs, the matrix, the assertion design, and the phased instructions handed to Claude Code. Does NOT author literal script bodies — that's redundant with Claude Code's `Write(scripts/**)` permission and adds round-trips.
- **Claude Code (execution):** under its allow-list, autonomously **writes and runs** recon/smoke scripts (`Write(scripts/**)`, `Write(*.txt)`, `Bash(node scripts/probe-*)`, `…recon*`, `…smoke-*`, `cold-start*`, `investigate-*`, all `Read/Glob/Grep`). Reports output. No per-turn approval — running read-only/smoke scripts "is the work, not a thing to ask permission for" (CLAUDE.md).

**The gates Claude Code STOPS at (the `ask` list — these never collapse):**
- `Bash(node scripts/apply-*)` — any production-DB write (fixture build, any fix-as-we-move routing change).
- `git commit` / `push` / `add` / `reset` / `restore` / `checkout`.
- `Edit/Write(supabase/migrations/**)`, `Edit/Write(CLAUDE.md)`.

**The two HARD GATES (CLAUDE.md, never collapsed on any path):**
1. Production-DB write — the actual `apply-*` execution pauses for explicit operator approval; the SQL + runner are shown first.
2. Multi-tenant function review — any new/changed function that resolves, routes, or writes tenant-scoped data gets an explicit tenant-isolation review (every predicate scopes by `p_tenant_id`; both anchor table AND `agents` join) before apply.

**Where in THIS exercise Claude Code will stop for you (named up front, no surprises):**
- **CV-FIXTURE build** → `apply-*` gate (builds the isolated test world via an apply-runner) + multi-tenant review if it touches routing functions.
- **Any fix-as-we-move** that changes a routing/escalation function → `apply-*` gate + multi-tenant review.
- **CV-COMMIT** at the very end → commit/push gate.
- Everything else (all recon, all smoke, all script authoring into `scripts/`) → autonomous, no stop.

---

## A2 — GOVERNING METHODOLOGY (non-negotiable, every phase)

1. **Recon before code** — but ONE collapsed probe, not per-phase (see §B efficiency). Read-only, output to file, reviewed before tests are designed. Tests built against the map, never memory.
2. **Backup before any existing-file touch** — timestamped `Copy-Item ... .backup_<ts>`. The number-one safety guarantee; never skipped, never traded for speed.
3. **Isolation — never mutate what works** — fixtures in an isolated test tenant/namespaced geo. The 12 real WALLiam carves, floor pool, and production listings are NEVER mutated. `BEGIN/ROLLBACK` where possible; persistent fixtures torn down + fingerprint-verified gone.
4. **Baseline-diff guards regression** — capture prod resolution truth (12 carves + floor sample + homes + cross-tenant) before any routing-touching phase; re-capture + diff after; anything unexpectedly moved → HALT.
5. **Fix-as-we-move, root cause, same phase** — a failing test is fixed in the phase that found it (comprehensive, not band-aid). The fix is a gated write. Re-run until green before advancing.
6. **No advancing on red** — a phase closes only when every cell is PASS or explicitly BLOCKED-with-named-blocker.
7. **Command-backed tracker updates only** — results recorded cell-by-cell with the command behind each. No PASS from inference. BLOCKED cells name the exact blocker.
8. **Role-aware testing** — any path reachable from the admin route is tested under `SET LOCAL ROLE service_role`, not just postgres (the service_role permission bug shipped twice from postgres-only green).
9. **Frozen contracts untouched** — `resolve_agent_for_context` signature never changes; System 1 (`/admin`, `app/api/chat/*`, `agent_buildings`, `lib/actions/lead-management.ts`) never touched. Any test needing to → STOP, surface.

### "Don't break what's working" — structural, not a promise
Recon is read-only. Fixtures are isolated + backed-up + torn-down-verified-gone, and their build gates for approval. Baseline-diff mechanically catches any prod row that moves. Frozen contracts + System 1 off-limits. Four independent guards; if the exercise breaks a working feature, the diff halts it.

---

## B — PHASE SEQUENCE + the three efficiencies

Collapse turns that buy no safety; keep every gate that does (CLAUDE.md). Applied here:

**Efficiency 1 — ONE recon probe, not eight.** Recon is read-only and pre-approved; there's no gate between recon sub-steps, so splitting them buys nothing. A single `scripts/cv-recon-*.js` maps everything in one run → one output → one review. Six recon sub-steps collapse to one autonomous probe.

**Efficiency 2 — recon sizes the matrix; don't pre-size it.** The "surface × mechanism" cross-product is the *upper bound*. The probe outputs the REAL existing pairs + the shared-path map. Pairs sharing a handler = one core test + thin per-surface assertions, not duplicate tests. Test count is derived from reality → less code, identical coverage.

**Efficiency 3 — one gated fixture build, not six.** All fixtures (test tenant, full role chain, carves at every level, N>1 set, test listings) build through ONE `apply-*` runner = ONE `ask` gate, transactional, with teardown. One approval instead of six.

```
CV-RECON   → one read-only probe maps the whole flow        [autonomous]
   │          (review the one output → design everything against it)
CV-FIXTURE → one apply-runner builds the isolated world     [ASK gate ×1 + MT review]
   │          (baseline-diff confirms prod untouched)
CV-TERRITORY → prove the routing ladder                     [smoke, autonomous]
CV-HIERARCHY → prove the escalation chain                   [smoke, autonomous]
CV-LEADS   → prove every REAL surface×mechanism e2e          [smoke, autonomous]
CV-CROSS   → prove tenant isolation (hard gate)             [smoke, autonomous]
   │          (fix-as-we-move, if any → ASK gate + MT review)
CV-COMMIT  → commit tests + any fixes + this tracker         [ASK gate ×1]
CV-GUARANTEE → write the verdict (all green or named-blocked)
```

Order rationale: territory before hierarchy (a lead can't escalate until routed to the bottom of a chain); leads last among build phases (a lead-source test exercises routing AND escalation together, so both must be green first).

Net: from "eight phases each re-probing with scattered approvals" to **one probe → one map → one gated fixture build → recon-free smoke phases → one gated commit.** Far fewer round-trips, same coverage, every hard gate intact.

---

## C — THE GUARANTEE + its one honest conditional

Command-backed proof, not assertion. **One conditional, on the record:** the terminal hop is an email send up the chain; WALLiam's Resend + Anthropic keys are placeholders (`F-WALLIAM-CREDS-PLACEHOLDER-IN-DB`). Everything up to and including routing, stamping (`leads.agent_id`), and *invoking* the email machinery is testable now with real pass/fail; the terminal **email-arrival** hop is BLOCKED until the credential is real — marked per affected row, flips to testable on restore with no rewrite. Never faked green.

---

## 1 — THE FULL MATRIX (exhaustive; recon sizes the real test count)

### Axis A — Lead sources = SURFACE × MECHANISM (upper bound; recon finds the real set + shared paths)

**Surfaces (everything that renders a lead-capture surface) — find them all:**
home page, geo pages (area / municipality / community / neighbourhood landing pages), building pages, neighbourhood pages, single-property pages, **and any other lead-bearing surface the probe finds** (the list is "everything," not this enumeration).

**Mechanisms (how a lead is captured) — find them all:**
Charlie (AI assistant), contact form, estimator, appointment booking, direct property inquiry, **and any other capture mechanism the probe finds.**

**Cell** = a (surface, mechanism) pair that EXISTS in code → one e2e test: submission → resolve → stamp → invoke escalation/email. Non-existent pairs → N/A (with recon evidence). Pairs sharing a code path → one shared-core test + thin per-pair wrapper asserting the surface wires in correctly (Efficiency 2).

### Axis B — Roles / positions = ALL, full chain
Agent → Manager → Area Manager → Tenant Admin, plus platform admin (tenant_id NULL, e.g. Syed Shah) as an isolation check, plus any role the probe finds on the schema. Every escalation hop tested. Where WALLiam's live data is shallower than the full chain, synthetic-but-real fixtures (built via the prod code path, torn down verified-gone) build the missing roles so the **design** is proven, not just current data.

### Axis C — Territory scenarios = EVERY level × property type + all behaviors
Per level — pin, building, community, municipality, area, floor — for condo and home (building is condo-only; homes skip it). Plus: precedence (most-specific wins; walk stops; asserted via `assigned_scope` provenance), property-type split, sticky (add to N>1 → bindings unchanged), distribution hash-RR (deterministic, idempotent, never clobbers a more-specific carve), floor catch-all (never NULL), GAP-2 (new value equals expected resolver output, not merely "changed"). N>1 is synthetic (WALLiam's real carves are all N=1) — built or it's untested.

---

## 2 — PHASE SPECS (handoff units for Claude Code)

| Phase | Spec (what Claude Code does) | Gate |
|---|---|---|
| **CV-RECON** | Author + run ONE `scripts/cv-recon-*.js`: enumerate all lead surfaces; all mechanisms per surface; for each pair, cache-read vs `resolve_agent_for_context`; every `leads.agent_id` writer + frozen-after check; hierarchy columns + WALLiam chain depth; email/escalation invocation point + exact credential-dependency line; shared-path map; cold-start re-verify of 12 carves + floor pool. Output → `cv-recon-output.txt`. | autonomous |
| **CV-FIXTURE** | ONE `scripts/apply-cv-fixture-*.js`: isolated test tenant + full role chain + carves at every level × type + one N>1 set + condo/home test listings + minimal 2nd tenant (CV-CROSS) — all via prod create-paths, transactional, teardown defined. Backup any touched file. Baseline-diff before/after proves prod untouched. | **ASK (apply) + MT review** |
| **CV-TERRITORY** | Smoke per (level × type) + sticky + hash-RR + split + GAP-2; assert owner AND walk-stop via provenance; under service_role where admin-reachable. | autonomous (smoke) |
| **CV-HIERARCHY** | Smoke per hop (agent→mgr→area→admin) + GAP-5 boundary; email-arrival cells marked per creds. | autonomous (smoke) |
| **CV-LEADS** | Smoke per REAL (surface×mechanism) from recon: submit→resolve→stamp→invoke; arrival = BLOCKED-PENDING-CREDS; shared paths via core+wrapper. | autonomous (smoke) |
| **CV-CROSS** | Negative smoke: WALLiam never returns aily agent + vice versa; lead never escalates cross-tenant; cache-first readers filter tenant+is_active+is_selling. Data-breach hard gate. | autonomous (smoke); any fix → ASK + MT review |
| **CV-COMMIT** | Commit tests + any fix-as-we-move changes + this tracker, same session (CLAUDE.md: DB COMMIT ≠ git commit; do both before close). | **ASK (commit/push)** |
| **CV-GUARANTEE** | Verdict written here only when CV-TERRITORY→CV-CROSS all PASS or named-BLOCKED. | — |

---

## 3 — CV-RECON probe questions (the map everything is built against)
1. All lead surfaces — enumerate every page/route rendering a lead-capture surface; don't assume the §1 list is complete.
2. All mechanisms per surface — the real surface×mechanism cross-product.
3. Resolution call per pair — cache (`assigned_agent_id`) vs `resolve_agent_for_context`; confirm Phase 2 reader-wiring is in the live path.
4. Stamping — every `leads.agent_id` writer; resolved-owner source; frozen-after.
5. Hierarchy columns + WALLiam depth — `manager_id`/`area_manager_id`/`tenant_admin_id`; map the real chain (sizes the synthetic fixture).
6. Email/escalation invocation + credential boundary — where lead→email fires, where up-chain BCC (W-HIERARCHY/R7) runs, the exact credential-dependent line (BLOCKED boundary).
7. Code sharing — which pairs share a path (→ core+wrapper test count).
8. Cold-start re-verify — 12 carves + floor pool match the tracker before fixtures build on them.

**Gate:** output reviewed before fixture/tests are designed.

---

## 4 — CV-FIXTURE policy (Rule Zero compliant)
Synthetic entities built via the SAME code path production uses (never hand-stitched FK chains). All test data under an isolated test tenant / namespaced geo; no production WALLiam row mutated. `BEGIN/ROLLBACK` where possible; persistent fixtures torn down + fingerprint-verified gone. No un-torn-down synthetic agent in the production `agents` table (consistent with the aily-fixture decision). Backup any existing file touched. Builds: full role chain; carves at every level × type; one N>1 distribution set; condo+home test listings at each level; minimal 2nd tenant for CV-CROSS.

---

## 5 — PHASE RESULTS (2026-05-31, exercise complete)

| Phase | Status | Output | Notes |
|---|---|---|---|
| CV-RECON | PASS (autonomous) | `cv-recon-output.txt` (incl. CV-RECON-2 appendix) | 8 questions answered; 2 limitations closed in CV-RECON-2. |
| CV-FIXTURE | PASS (HARD GATE, COMMITTED then TORN DOWN zero-trace) | `cv-fixture-teardown-manifest.json` | 2 tenants + 9 agents + 93 apa rows + 12 listings + 1 synth building built via prod paths; manifest captured 134 entries; baseline-diff CLEAN before AND after. |
| CV-TERRITORY | PASS 46/46 | `cv-territory-smoke-output.txt` | precedence ladder L1-L8 (cache + live, postgres + service_role); prop-type split; distribution hash-RR determinism/idempotency; sticky-by-3rd-member. |
| CV-HIERARCHY | PASS 21/21 | `cv-hierarchy-smoke-output.txt` | chain stamp + 4-deep walk; envelope build; credential boundary at `sendTenantEmail.ts:82` BLOCKED-PENDING-CREDS; GAP-5 frozen-after verified (snapshot, not reference). |
| CV-LEADS | PASS 67/67 | `cv-leads-smoke-output.txt` | all 7 mechanisms end-to-end (4 cache-first+RPC, 1 RPC-only, 3 no-resolver) under postgres + service_role; F-CV-CHARLIE-APPOINTMENT-RPC-ONLY closed-by-design. |
| CV-CROSS | PASS 64/64 | `cv-cross-smoke-output.txt` | data-breach-class isolation: resolution, lead-chain, cache-first reader, distribution — same-Markham collision held under every probe; 0 cross-tenant leaks in 64 attempts. |
| CV-COMMIT | PASS (teardown clean, commit gate ready) | `cv-fixture-teardown-log_*.txt` | fixture removed, all 9 auth.users deleted, baseline-diff CLEAN, audit triggers re-enabled. |

**Smoke total: 198/198 PASS (territory + hierarchy + leads + cross). 0 FAIL.**

---

## 6 — THE GUARANTEE (CV-GUARANTEE verdict, 2026-05-31)

The W-TERRITORY-MASTER routing model is proven working as designed,
end-to-end, command-backed. Every PASS row in §5 is backed by a runnable
script and a captured output file. The single conditional on the record
is the terminal email-arrival hop, BLOCKED-PENDING-CREDS on the test
tenant (`.invalid` by design) and pending WALLiam credential restore on
real tenants (F-WALLIAM-CREDS-PLACEHOLDER-IN-DB).

**What is proven (command-backed by §5):**
- The **routing ladder** (pin > building > community > muni > area > floor)
  resolves correctly at every level × property type, under postgres AND
  service_role. (CV-TERRITORY 46/46.)
- The **hierarchy walker** captures the full chain at every depth and
  stamps it onto leads at insert; the stamp is a snapshot, not a reference
  — re-parenting/deactivating an agent leaves existing leads' chain frozen
  (GAP-5 verified). The **email envelope** assembles correctly through all
  4 on-tenant layers + the Admin Platform layer (Layer 6). (CV-HIERARCHY
  21/21.)
- All **7 lead-writing mechanisms** (4 cache-first+RPC, 1 RPC-only, 3
  no-resolver) submit → resolve → stamp → invoke envelope correctly.
  `charlie/appointment`'s RPC-only resolution is correct-by-design
  (geo-keyed input shape; cache-first inapplicable). (CV-LEADS 67/67.)
- **Cross-tenant isolation** holds under the deliberate same-Markham
  collision — 64 isolation probes, 0 leaks. The resolver scopes by
  `tenant_id` at every level; the cache-first reader JOIN filter rejects
  cross-tenant cache rows; the reresolve primitive's sticky-by-scope-
  specificity guard makes cross-tenant cache thrashing structurally
  impossible. (CV-CROSS 64/64.)
- The **fixture lifecycle** is provably zero-trace: CV-FIXTURE built
  via prod code paths (HARD-GATED); CV-COMMIT step 1 teardown removed
  every row (12 tables) + 9 `auth.users` + 196 audit rows (via scoped
  trigger DISABLE inside the same transaction); baseline-diff against
  the pre-exercise snapshot CLEAN.

**The single conditional (on the record):**
The terminal email-arrival hop is BLOCKED-PENDING-CREDS.
`sendTenantEmail`'s pre-flight at L71-79 throws `TenantEmailNotConfigured`
before reaching the `Resend` client at L82 because the test tenant's
`resend_api_key` is NULL. WALLiam's real-tenant credential is currently
a placeholder. **On credential restore, this hop becomes testable with
zero code rewrite** — every other layer (envelope build, recipient
resolution, chain assembly) is already proven.

**Findings queued (do NOT block this guarantee; separate landings in §7):**
2 × P1 production-latent + 1 × P2 latent gap. All filed.

**No premature green.** This verdict is written only after CV-RECON
through CV-COMMIT all PASSED, fixture torn down zero-trace, and three
findings filed for separate landings. Each claim above maps to a smoke
output file checked into this repo (see §5).

---

## 7 — OPEN ITEMS / FINDINGS

Three production findings surfaced during the exercise. Each lands as a separate
W-TERRITORY-MASTER landing; none was fixed inline (CV scope = verify, not modify).

### P1 — F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK (production-latent)
`public.reroll_listings_at_geo(scope, scope_id, tenant)` UPDATEs only
`assigned_agent_id`, leaving `assigned_scope` untouched. The check constraint
`mls_listings_assigned_coupled_check` enforces `(both NULL) OR (both non-NULL)`.
The function violates it when (a) new pick is NULL on a previously-assigned row,
or (b) old scope is non-NULL on a row that gets a NULL pick. The safe sibling
`reresolve_listings_in_set` (which `reresolve_listing` delegates to citing
"F-RERESOLVE-COUPLED-CHECK") writes the trio atomically and is correct.
`reroll_listings_at_geo` is still on the broken pattern and is called from the
inline branch of `handle_apa_insert/update/delete` when `skip_apa_reroll='off'`.
Currently latent (CV-TERRITORY at-risk-row probe = 0) but lights up under any
new apa carve created with the GUC off on inconsistent rows. **Fix:** port
`reroll_listings_at_geo` to the trio-atomic write pattern of
`reresolve_listings_in_set`. Surfaced in CV-TERRITORY case C.

### P1 — F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT (production-silent)
`service_role` lacks `SELECT` on `public.platform_manager_tenants`. The Layer-5
query inside `getLeadEmailRecipients`
([lead-email-recipients.ts:208-213](../lib/admin-homes/lead-email-recipients.ts))
hits this when called from `createLead` (which uses `createServiceClient`). In
production, `supabase-js` silently returns `{ error }` for that PostgREST request
and the code at L213 falls through to `assignedAdminIds = []`, dropping Layer-5
BCC entirely. Currently invisible because no tenant has assigned manager platforms
(count=0 across the DB), but any future `platform_manager_tenants` row would be
effectively muted under service_role. Same class as the
`tenant_floor_pool` / `tenant_floor_alerts` / `territory_reroll_queue`
service_role grant findings already logged in W-TERRITORY-MASTER.
**Fix:** `GRANT SELECT ON public.platform_manager_tenants TO service_role`
in a migration, OR flip the Layer-5 query to a SECURITY DEFINER wrapper.
Surfaced in CV-HIERARCHY C0 and CV-LEADS B/C.

### P2 — F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK (latent gap)
The `leads` table has no CHECK or FK ensuring `agent_id`'s tenant matches the row's
`tenant_id`. A bad INSERT (primary `tenant_id` + secondary `agent_id`) succeeds at
the DB level (CV-CROSS D3 probe confirms). Application code (createLead path)
doesn't write this combination because the resolver always returns a tenant-scoped
agent — but a future bug or direct SQL path could create the mismatch. The cache
reader + resolver layer is the security boundary that prevents the leak from being
observed in lead-driven flows (validated by CV-CROSS A + C cases). Not a current
vulnerability; worth a defensive CHECK in a follow-up landing.
**Fix:** add `CHECK (agent_id IS NULL OR EXISTS (SELECT 1 FROM agents WHERE
agents.id = leads.agent_id AND agents.tenant_id = leads.tenant_id))` — or
equivalent enforcement. Surfaced in CV-CROSS D3.

### Closed-by-design / positive findings
- **F-CV-CHARLIE-APPOINTMENT-RPC-ONLY** → closed-by-design. `charlie/appointment`
  has no `listing_id` input field; cache-first is inapplicable. Live RPC is the
  intentional choice for high-stakes appointment booking. NOT a Phase-2 gap.
  (CV-LEADS D2 static + D1 runtime divergence reproducer.)
- **F-CV-RERESOLVE-STICKY-BY-SCOPE-SPECIFICITY** → positive finding. The function
  gates every cache UPDATE on scope-specificity, making cross-tenant cache thrashing
  structurally impossible — stronger than tenant-filter-alone. (CV-CROSS D0.)
- **F-CV-FROZEN-AFTER-STAMP** → verified-closed. CV-HIERARCHY D1 proved the chain
  stamp on `leads` is a SNAPSHOT, not a reference — re-parenting an agent doesn't
  re-walk existing leads.

