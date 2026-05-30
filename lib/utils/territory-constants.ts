// lib/utils/territory-constants.ts
//
// Tenant constants for the Landing 2 sync-hook call sites. The nightly sync
// is single-tenant today by design (F-SYNC-SINGLE-TENANT-IMPLICIT): every
// listing imported from PropTx is treated as WALLiam's. When a second tenant
// onboards routing, this constant is replaced by a per-listing tenant
// derivation (likely by geo) and the sync's call sites swap to passing the
// resolved tenant_id per-batch.
//
// LOCATION NOTE: This file was originally planned at scripts/lib/
// territory-constants.ts (locked decision D4 from the Landing 2 plan). v22+1
// correction: scripts/ is excluded from the TypeScript compilation graph
// (tsconfig.exclude includes "scripts"), so Next.js-tree files in lib/ and
// app/ cannot import from scripts/. Canonical was moved to lib/utils/ so a
// single file serves all 6 sync surfaces. Single canonical file, no inlined
// literals.
//
// CLAUDE.md multi-tenant constraint compatibility:
//   - This constant is referenced ONLY at sync call sites that pass it
//     explicitly to reresolve_listings_in_set(p_listing_ids, p_tenant_id).
//     The PG function itself is fully parameterized; there is no tenant
//     hardcoding in any routing/resolving function.
//   - The sync's tenant scope is operationally fixed by the PropTx feed
//     (single feed -> single tenant today).
//   - Multi-tenant onboarding is tracked in F-SYNC-SINGLE-TENANT-IMPLICIT
//     and is out of scope for Landing 2's sync-hook tail.
//
// Tenant id source: CLAUDE.md "Verified key IDs" (re-verify before relying):
//   WALLiam tenant: b16e1039-38ed-43d7-bbc5-dd02bb651bc9

export const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
