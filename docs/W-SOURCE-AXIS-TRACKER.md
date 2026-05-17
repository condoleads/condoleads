# W-SOURCE-AXIS Tracker

Workstream: source-axis cleanup + read-path enrichment (workbench + leads list).

## Phase status

| Phase | Status | Notes |
|---|---|---|
| T0 â€” Recon | CLOSED | Five probes; evidence in `recon/W-SOURCE-AXIS-T0-*.txt` |
| T1 â€” Decision lock | CLOSED | source-display reads `lead_origin_route` |
| T2 â€” Schema migration | VACATED | columns already present |
| T3 â€” Write-path patches | VACATED | writes already populate `lead_origin_route` |
| T4-a..T4-g | CLOSED | shipped 2026-05-16/17 |
| T4-h Patch A + B v2 | CLOSED 2026-05-17 | h.1â€“h.7 applied; h.8 verifier 68/68 PASS |
| T4-h-fix (F1/F2/F3) | CLOSED 2026-05-17 | this batch |
| T5 â€” Multi-tenant smoke | IN PROGRESS | h.3 helper 25/25; comprehensive test data shipped |
| T6 â€” Close + master tracker | OPEN | deferred per Shah directive until W-TERRITORY T7 |

## T4-h-fix patch inventory

- **F1** `app/admin-homes/leads/[id]/page.tsx` â€” `ANCHOR_SELECT` extended with 6 entity JOINs.
  Root cause: h.4b patched the DELETE handler in route.ts (audit snapshot path), not the server component that builds `anchorLead`. h.8 verified strings on disk but did not verify the runtime data path.
- **F2** `components/admin-homes/AdminHomesLeadsClient.tsx` â€” row-context wrapper gets `max-w-[260px]`.
  Root cause: `truncate` cannot truncate when the table cell auto-sizes to inline content width.
- **F3** `app/admin-homes/leads/page.tsx` â€” stray-comma SELECT anomaly cleaned (NON-FATAL â€” SKIP if anchors do not match exactly; cosmetic only).

## Test data inventory

Test lead `58c85af4-f6d8-4713-99db-2e8ecb029f3e` populated with `user_id`, buyer `plan_data`, estimator fields, questionnaire `message`.
Sibling seller-plan lead in same family. Supporting rows: 7 activities, 3 notes, 1 VIP request, 1 chat_session + 6 messages, 5 email recipients (across 2 emails).
Re-running this batch is idempotent â€” cleanup removes prior T4-h supporting rows before re-INSERT.

## Open issues / deferred

- F-AGENTS-PAGE-SOURCE-LIKE-TENANT-PROXY â€” `app/admin-homes/agents/page.tsx` `.like('source', 'walliam_%')`; breaks at tenant #2.
- F-SOURCE-COLUMN-VERBOSE-TENANT-PREFIX â€” raw `source` stores tenant-prefixed values; display layer does not read it; cosmetic.
- T6 deferral â€” master `W-LAUNCH-TRACKER.md` update held until W-TERRITORY T7 close.

_Last updated: 2026-05-17T16:09:42.364Z_
