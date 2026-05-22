# W-MULTITENANT-BENCH TRACKER

**Status: SESSION-CLOSED 2026-05-22.** All work items resolved or properly handed off. Disk version refreshed from artifact tracker after 2026-05-20 version went 4 commits stale.

**Workstream:** End-to-end multi-tenant lead routing verification + brand-leak elimination across customer-facing surfaces.
**Tenants under test:** WALLiam (Tenant #1, prod) + Aily (Tenant #2, peer via same code path).
**Owner:** Shah (sole dev) + Claude.
**Started:** 2026-05-20 | **Active sessions:** 2026-05-20 (C1-C12), 2026-05-22 (post-C12 cleanup + discovered cross-tenant leak handoff).

---

## Closing summary (2026-05-22)

| Phase | Result | Commit |
|---|---|---|
| C1 — source-key gates + auth-user attribution | CLOSED | `e3a711e` |
| C2 — walliam/contact strict-fail on tenant lookup | CLOSED | `2b36174` |
| C3 — estimator/session p_tenant_id | CLOSED | `b797c79` |
| C4 — admin agents page LIKE filter | CLOSED | `c9289a8` |
| C5 — Charlie system prompt URLs | CLOSED | `4176fb7` |
| C6 — Charlie executeTool URLs | CLOSED | `00d1f42` |
| C7 — Root layout + comprehensive-site + OG metadata | CLOSED | `83acdd5` |
| C8a — Homepage CTA text strings | CLOSED | `6db2699` + `1ffd2eb` |
| C8b-1 — SiteHeader wordmark tenant-conditional | CLOSED (pre-bench) | `479fc49` |
| C8b-2 — Homepage HeroWordmark tenant-conditional | CLOSED | `14db882` |
| C8f — getTenant() localhost fallback | CLOSED | `c441d98` |
| C9 — Session agent-name fallback | CLOSED | `1191d6f` |
| C10 — Admin leads + agent management brand strings | CLOSED | `dc1abbb` |
| C11 — Retire lib/utils/territory.ts (D16) | CLOSED | `f946eb6` |
| C12 — Aggregate multi-tenant regression gate (P2 seal) | CLOSED | `4b324c7` |
| MTB-DEF-5 — Hardcoded 'Charlie' in tenant-admin views | CLOSED (silent, files deleted in P3.F1/F5) | n/a |
| MTB-DEF-2 + MTB-DEF-3 — app/page.tsx tenant-aware root path | CLOSED | `58acd2e` |
| MTB-DEF-4 — Super-admin onboarding modal copy | CLOSED | `5377819` |
| MTB-DEF-1 — tenants.wordmark_style schema + 3-file client refactor | CLOSED | `35471e8` |
| MTB-DEF-6 — Was framed as misleading-rename; recon revealed cross-tenant leak | SPLIT → W-CROSSTENANT-LEAK tracker | (in progress) |

Adjacent work item shipped in same session (not formally part of W-MULTITENANT-BENCH but discovered + fixed via the same multi-tenant lens):

| Item | Result | Commit |
|---|---|---|
| D30 — admin-homes org chart 500 (column agents.is_admin does not exist) | CLOSED | `17a5512` |

---

## What the tracker is/was

Permanent benchmark for multi-tenant correctness. Every future feature edit that touches lead capture, agent resolution, hierarchy walking, brand-context display, or workbench rendering re-runs the regression matrix from C12 before merging.

Yardstick contract (unchanged from 2026-05-20):
1. **Comprehensive** — every lead source × entry-point geo level × territory cascade × role-viewing perspective covered.
2. **Atomic** — each test cell wraps in BEGIN ... ROLLBACK; zero production state mutation.
3. **Accurate** — every fixture UUID verified from disk or DB this session; zero invented values; real geo/agent/email IDs; real HTTP against live dev server.

---

## Discovered scope expansion (MTB-DEF-6 → W-CROSSTENANT-LEAK)

During post-C12 cleanup recon on 2026-05-22, MTB-DEF-6 was originally framed in this tracker as a low-priority rename (`F-IS-WALLIAM-NAMING-MISLEADS-CALLERS`). Recon revealed the real bug:

- `lib/utils/is-walliam.ts` exports `getWalliamTenantId()` which despite its name does NOT look up WALLiam specifically — it looks up whichever tenant matches the current request host.
- 21 callers across 14 files use the pattern `const isWalliam = !!tenantId` and gate WALLiam-branded UI on it.
- Result: Aily visitors (and every future tenant) currently see WALLiam-branded CTAs (WalliamCTA, WalliamAgentCard, WalliamContactForm) on comprehensive-site pages and property pages — cross-tenant brand leak across the entire public surface, same severity class as MTB-DEF-2 (root path King Shah leak).

**Decision (2026-05-22):** scope this larger problem out into a dedicated tracker (W-CROSSTENANT-LEAK) to keep this tracker's scope honest (P2 lead-routing) and give the discovered bug the focused attention it deserves. W-CROSSTENANT-LEAK is in-progress at time of this disk write.

---

## Rule Zero invariants (in force throughout)

- Multi-tenant at scale — every query scoped by tenant_id; constants referencing a single tenant in business logic = violation.
- No regressions — every change smoke-tested end-to-end before commit.
- Comprehensive only — no half-fixes, no deferred items, no "phase 2 next session".
- No guessing — every claim verified via PowerShell, SQL, or command output.
- Backup before touching existing files — timestamped backups (Get-Date -Format yyyyMMdd_HHmmss).
- No placeholders, no fake data — every value real and verified, OR built via prod code path, OR read from secure input.
- System 1 isolation absolute — never modify /admin, app/api/chat/*, agent_buildings, or any System 1 file.
- Smoke locally before commit (npm run dev + browser hit; never rely on Vercel preview for verification).
- Multi-line commit messages via temp file on Windows (PowerShell here-string and -m flag both corrupt multi-line content; only Node-written temp file + git commit -F is reliable).

---

## Sessions (chronological)

**2026-05-20** — P1 recon + P2.C1-C12 shipped pushed in one session. Tracker materialized to disk at C9. Final commit `4b324c7` (C12 aggregate regression gate). Original tracker last touched here.

**2026-05-22** — Resumed post-C12 to close MTB-DEF deferred items. Sequence:
1. D30 (org chart 500) discovered + fixed (`17a5512`).
2. Cleanup of 14 untracked one-shot scripts.
3. Recon on 6 MTB-DEF items revealed MTB-DEF-5 silently closed in P3.F1/F5.
4. MTB-DEF-2 + MTB-DEF-3 shipped (`58acd2e`).
5. MTB-DEF-4 shipped (`5377819`).
6. MTB-DEF-1 shipped (`35471e8`) with schema migration.
7. MTB-DEF-6 recon exposed cross-tenant leak — split into dedicated W-CROSSTENANT-LEAK tracker.
8. Disk tracker refreshed (this write) — replaces stale 2026-05-20 version.

Pre-refresh disk version recoverable via: `git show dc1abbb:docs/W-MULTITENANT-BENCH-TRACKER.md`

---

## Next

1. W-CROSSTENANT-LEAK ships (rename `is-walliam.ts` → `tenant-resolver.ts`, fix 21 caller misuses, gate WALLiam-branded UI on `wordmark_style === 'hero'`).
2. W-TERRITORY (T6-followup-A re-run, T6-followup-B Test 1d, T7 close) — see `docs/W-TERRITORY-TRACKER.md`.
