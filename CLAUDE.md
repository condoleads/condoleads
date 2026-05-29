# CLAUDE.md — standing instructions for this repository

This file is read automatically by Claude Code on every session. It encodes the non-negotiable engineering constraints for this project. Follow all of it, every task, no exceptions.

---

## Project shape

Multi-tenant real estate SaaS. Next.js 14.2.5 / TypeScript / Supabase (PostgreSQL) / Vercel. Resend for email. GitHub Actions for nightly MLS sync. Project root: `C:\Condoleads\project`.

Two permanently isolated systems:
- **System 1** — legacy condoleads.ca agent condo sites at `/admin`, `app/api/chat/*`, `agent_buildings`. **Maintenance-only. Never modify. Never add features.**
- **System 2** — the active build: walliam.ca, `/admin-homes`, `app/api/walliam/*`, `app/api/charlie/*`, `app/zerooneleads/*`. All new work is System 2.

Building pages are a documented shared exception requiring explicit handling. Otherwise System 1 isolation is absolute — zero cross-contamination.

---

## RULE ZERO — the hard constraints

These override convenience, speed, and "it compiles." A violation invalidates the work.

### No fake data, no placeholders, no invented values

Every value emitted in code, SQL, scripts, fixtures, examples, smoke tests, seed scripts, docs, commit messages, API responses, or console output must be one of:
1. Real and verified this session (read from file, SQL, command, env var, or explicit user confirmation).
2. Constructed via the same code path production uses.
3. Read from a secure input the script opens at runtime.

Banned outright:
- Placeholder tokens in any position that is syntactically valid: `<paste>`, `REPLACE_ME`, `YOUR_X_HERE`, `TODO`, `XXXX`, `[your value]`, `<your-value>`. **Especially never inside SQL string literals** — Postgres treats `'REPLACE_ME'` as a valid value and the UPDATE succeeds with garbage. If a value must be substituted by a human, make the sentinel syntactically INVALID outside quotes (e.g. `___FILL_ME___`) so the parser rejects accidental execution — or better, use a parameterized query, or a GUI table editor for credentials.
- Fabricated URLs, invented UUIDs/slugs/FKs/emails/MLS numbers/addresses, random FK stitching, mock/seed/sample data on any user-facing surface, fictional names/prices/dates anywhere.

If you cannot point to the verification command run this session that produced a value, do not emit it. Run the command first.

### No guessing

"Probably", "usually", "should be", "typically", "most likely" are banned. Every claim about file content, schema, behavior, config, or state must come from a verification command run this session. Reading from training memory or inferring from related code does NOT count. Valid sources of truth: file output, SQL output, command output, explicit user confirmation. A guess that turns out correct is still a violation.

### Backup before touching existing files

Before any modification to an existing file:
```
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item -LiteralPath "<path>" -Destination "<path>.backup_$timestamp"
```
Backup is created BEFORE the edit. New files from scratch don't need backup. Config files, SQL migrations, and infrastructure-as-code are existing files and DO need backup. A change without a backup is invalid.

### Multi-tenant at scale

- Tenant identity is derived per request (header, host, RPC) — NEVER hardcoded.
- A query without a tenant scoping filter is a tenant-leak bug.
- A constant referencing a single tenant ("walliam", "condoleads") in business logic is a violation.
- Every fetch, RPC, and cache key scopes by tenant.
- Code must work identically when tenant #2, #50, #1000 onboards — no per-tenant if/else branches.
- Tenant leakage is a data-breach incident.

### No regressions

Before any change ships: identify every existing feature touched (direct + transitive), smoke-test each end-to-end before commit. If you cannot name the affected features, you haven't understood the change — read more code. "TSC clean" is necessary, never sufficient. A regression of a working feature is worse than not shipping the new feature.

### Comprehensive work only

No half-fixes, no stop-gaps, no defer-to-later. Address the root cause, not the symptom. A fix is comprehensive when the bug cannot recur via the same mechanism AND the architecture prevents new instances of the same class of bug. If identified this session, it ships this session. The only valid deferral is an external blocker (waiting for human action or third-party quota) — logged and resumed when it clears.

---

## Secrets — absolute rules

- **Never `SELECT *` on tables that may hold credentials** (`tenants`, `agents`, config tables). Use explicit column allow-lists. `tenants` holds `anthropic_api_key` and `resend_api_key` per tenant — a `SELECT *` leaks them to logs/output.
- Never ask for or print full secrets/keys/tokens. Verify by fingerprint only: first 6 + last 4 chars with `...` between, plus length.
- If a full secret is accidentally exposed, instruct rotation/revocation before doing anything else.
- **Credential writes go through the Supabase Studio Table Editor (GUI), never through SQL drafted in chat or scripts.** The GUI makes substitution mechanical and visible.
- Never point this dev tool's billing at the product's Charlie API key. Use the developer's own Claude subscription / API credits.

---

## SQL and script execution discipline

- **Batch by execution context.** PowerShell commands that run in one shell = one block. SQL DDL/DML that runs as one transaction = one block. SQL verification SELECTs = separate blocks, one SELECT per block (Supabase SQL editor returns only the last result set). PowerShell and SQL are always separate blocks. Each block gets a header label.
- **All file edits** use Node.js patch scripts with timestamped backups and exact-string anchors. Anchors must be ASCII-only (Unicode em-dashes/smart-quotes/arrows are fragile across write pipelines). Multi-line anchors auto-detect line endings: `const NL = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n'`.
- **UTF-8 BOM trap:** PowerShell `Set-Content -Encoding UTF8` writes a BOM. Postgres rejects BOM-prefixed SQL with `syntax error at or near "" Position: 1`. Any script reading SQL via `fs.readFileSync('...','utf8')` must strip it: `if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1)`.
- **Production DB changes** use `node scripts/apply-*.js` runners that: capture a rollback snapshot before applying, run inside a transaction, verify post-state markers, COMMIT on full verification or ROLLBACK on any mismatch.
- **SQL too large for Supabase Studio** (~10KB payload limit) uses a Node+pg runner with `SET statement_timeout = 0` gated behind a `DISABLE_STATEMENT_TIMEOUT=1` env var. Large set-based UPDATEs over the MLS table (1.28M rows) exceed the 60s default pool timeout — disable timeout for those sessions.
- After sensitive writes, verify with a fingerprint check (prefix + length), one SELECT per block.

---

## Testing and deploy

- **Local smoke first, never Vercel preview.** All smoke testing runs locally via `npm run dev` before commit+push. Local URL: `http://localhost:3000/<path>`. For WALLiam tenant testing locally, `DEV_TENANT_DOMAIN=walliam.ca` must be in `.env.local`.
- Deploy pattern: Node.js patch script → backup → apply → verify → `git add` + commit after each phase group.
- Completed work commits to `origin/main`.

---

## External services

- **PropTx (MLS data):** Always use the VOW token (`$env:PROPTX_VOW_TOKEN`). NEVER use the DLA token — it is not available. OData API. City filter: always first word only (e.g. `'Toronto'` not `'Toronto C08'`).
- **Payment:** Paddle (Merchant of Record, Georgia-supported). Entity: Individual Entrepreneur LINKA. B2B site: 01leads.com.
- **Email:** Resend via `notifications@condoleads.ca` (verified domain). Per-tenant `resend_api_key` in `tenants`.
- **Supabase compute:** if upgraded to Medium for a full sync, downgrade back to Micro after to save cost.

---

## PostgREST / Supabase quirks

- FK hint pattern for PGRST201 ambiguous-FK errors: `agents!agent_geo_buildings_agent_id_fkey!inner` syntax.
- The advisory-lock trigger `apa_mutation_lock_trigger` serializes concurrent `agent_property_access` mutations — do not clobber it.

---

## Verified key IDs (do not invent others; re-verify before relying)

- WALLiam tenant: `b16e1039-38ed-43d7-bbc5-dd02bb651bc9`
- aily tenant: `e2619717-6401-4159-8d4c-d5f87651c8d6`
- King Shah (tenant_admin, WALLiam): `fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe`
- Neo Smith (agent, WALLiam): `f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f`
- WALLiam seed agent (agent, WALLiam): `cf002201-9b11-4c0f-a1b3-65ed702c9976`
- Syed Shah (platform admin, tenant_id NULL — NOT a tenant agent): `a7b4c075-60e9-40c3-b708-9a877c464e61`
- Whitby muni: `70103aef-1b32-4939-9ff8-264e859a5587`
- Oshawa muni: `94447f26-216a-47be-ac73-d07f33732036`

Geo tables: `treb_areas`, `municipalities`, `communities`, `neighbourhoods`, `municipality_neighbourhoods`. (NOT `areas` — that name does not exist.)

`mls_listings` has NO `tenant_id` and NO `neighbourhood_id` column. Neighbourhood is resolver-only. Property types: `'Residential Freehold'` (homes), `'Residential Condo & Other'` (condos), `'Commercial'`.

---

## Working style

- Make decisions and propose, rather than asking for direction at every step. Momentum over process — but PLAN before applying any production-touching change, and let the user review the diff first.
- Trackers drive development. Every W-* system has a markdown tracker in `docs/`. Work proceeds phase-by-phase; update the tracker at each phase close.
- Decisions, once locked in a tracker, are not silently revisited.
- The user communicates in short commands ("go", "its ready"). That is not permission to skip verification or backups.

---

## Current active work

See `docs/W-TERRITORY-MASTER-TRACKER.md` for the locked territory-routing model (v16) and phase roadmap. That tracker is the authoritative spec for the active build.