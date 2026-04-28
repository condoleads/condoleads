# W-RECOVERY A1.5 — Route Auth Gate Sweep

**Started:** Apr 28, 2026, after commit `ca4b97e` (W-RECOVERY A1 chat gate UX fix)
**Status:** Audit complete. 13 unguarded routes identified. Patches not yet written.
**Bleed status:** PLUGGED. `/api/charlie/route.ts` gated. None of the unguarded routes call Anthropic, so no active credit burn.

---

## Audit Results (file evidence — `Select-String "Authentication required|status: 401"`)

### Charlie sub-routes (`app/api/charlie/*`)

| Route | HasGate | CallsAnthropic | UsesServiceRole | Severity | Notes |
|---|---|---|---|---|---|
| `app/api/charlie/route.ts` | ✅ | ✅ | ✅ | DONE | Main chat — gated in commit `ca4b97e` |
| `app/api/charlie/appointment/route.ts` | ❌ | ❌ | ✅ | 🟡 MED | Books appointments — anonymous can spam DB |
| `app/api/charlie/community-buildings/route.ts` | ❌ | ❌ | ❌ | 🟢 LOW | Read-only DB lookup likely |
| `app/api/charlie/competing-listings/route.ts` | ❌ | ❌ | ❌ | 🟢 LOW | Read-only DB lookup likely |
| `app/api/charlie/lead/route.ts` | ❌ | ❌ | ✅ | 🟡 MED | Captures leads — anonymous spam vector |
| `app/api/charlie/municipalities/route.ts` | ❌ | ❌ | ❌ | 🟢 LOW | Autocomplete lookup, low risk |
| `app/api/charlie/plan-email/route.ts` | ❌ | ❌ | ✅ | 🟠 HIGH | Sends emails — anonymous can trigger Resend bills + email spam |
| `app/api/charlie/seller-estimate/route.ts` | ❌ | ❌ | ❌ | 🟡 MED | Generates estimates — needs investigation, may use external API |

### Estimator sub-routes (`app/api/walliam/estimator/*`)

| Route | HasGate | CallsAnthropic | UsesServiceRole | Severity | Notes |
|---|---|---|---|---|---|
| `app/api/walliam/estimator/session/route.ts` | ✅ | ❌ | ✅ | DONE | Already gated |
| `app/api/walliam/estimator/increment/route.ts` | ❌ | ❌ | ✅ | 🟠 HIGH | Increments credit usage — anonymous can spam-increment, corrupt counts |
| `app/api/walliam/estimator/vip-request/route.ts` | ❌ | ❌ | ✅ | 🟡 MED | User-initiated VIP request — needs user session gate |
| `app/api/walliam/estimator/vip-questionnaire/route.ts` | ❌ | ❌ | ✅ | 🟡 MED | User-initiated questionnaire — needs user session gate |
| `app/api/walliam/estimator/vip-approve/route.ts` | ❌ | ❌ | ✅ | ⚠️ SPECIAL | **Agent email-link route** — needs SIGNED TOKEN gate, NOT session gate |

### WALLiam Charlie sub-routes (`app/api/walliam/charlie/*`)

| Route | HasGate | CallsAnthropic | UsesServiceRole | Severity | Notes |
|---|---|---|---|---|---|
| `app/api/walliam/charlie/session/route.ts` | ❌ | ❌ | ✅ | ⚠️ SPECIAL | Creates anonymous sessions — see Chunk 5 (separate ticket) |
| `app/api/walliam/charlie/vip-request/route.ts` | ❌ | ❌ | ✅ | 🟡 MED | User-initiated VIP request — needs user session gate |
| `app/api/walliam/charlie/vip-approve/route.ts` | ❌ | ❌ | ✅ | ⚠️ SPECIAL | **Agent email-link route** — needs SIGNED TOKEN gate, NOT session gate |

---

## Severity Definitions

- 🔴 **CRITICAL (BLEED)** — calls Anthropic / costs money. **None left in this list.**
- 🟠 **HIGH** — calls a paid service (Resend, etc) or corrupts counted state
- 🟡 **MED** — anonymous DB writes, spam vectors, lead pollution
- 🟢 **LOW** — read-only DB lookups
- ⚠️ **SPECIAL** — non-session gate model required (signed tokens for email links, etc)

---

## Patch Plan (when resumed)

### Wave 1 — HIGH severity (do first)
1. `app/api/charlie/plan-email/route.ts` — gate against authenticated user, blocks Resend abuse
2. `app/api/walliam/estimator/increment/route.ts` — gate against valid session, prevents credit-counter corruption

### Wave 2 — MED severity (user-initiated routes that need session gate)
3. `app/api/charlie/appointment/route.ts`
4. `app/api/charlie/lead/route.ts`
5. `app/api/charlie/seller-estimate/route.ts` (read file first to confirm what it does)
6. `app/api/walliam/estimator/vip-request/route.ts`
7. `app/api/walliam/estimator/vip-questionnaire/route.ts`
8. `app/api/walliam/charlie/vip-request/route.ts`

### Wave 3 — SPECIAL routes (DIFFERENT gate model required)
9. `app/api/walliam/charlie/vip-approve/route.ts` — agent clicks link in email. Gate must be HMAC-signed token in URL, not user session. **Read existing implementation first** — may already have token verification.
10. `app/api/walliam/estimator/vip-approve/route.ts` — same pattern as above

### Wave 4 — LOW severity (defer or accept risk)
11. `app/api/charlie/community-buildings/route.ts` — read-only, defer unless we find DB cost issue
12. `app/api/charlie/competing-listings/route.ts` — read-only, defer
13. `app/api/charlie/municipalities/route.ts` — autocomplete, leave open or rate-limit at edge

### Wave 5 — Special: Chunk 5 (already on W-RECOVERY plan, separate)
- `app/api/walliam/charlie/session/route.ts` — stop creating anonymous sessions before user identifies. Different fix pattern (don't create rows, return registration prompt instead).

---

## Per-Route Patch Pattern (template)

For user-session routes, the gate is the same shape as `/api/charlie/route.ts`:

```typescript
// W-RECOVERY A1.5 auth gate
const tenantId = req.headers.get('x-tenant-id') || null
if (!sessionId || !tenantId || !userId) {
  return new Response(
    JSON.stringify({ error: 'Authentication required' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  )
}
const { data: validSession } = await supabase
  .from('chat_sessions')
  .select('id')
  .eq('id', sessionId)
  .eq('tenant_id', tenantId)
  .eq('user_id', userId)
  .eq('source', 'walliam')
  .maybeSingle()
if (!validSession) {
  return new Response(
    JSON.stringify({ error: 'Invalid session' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  )
}
// END W-RECOVERY A1.5 auth gate
```

For email-link routes (`vip-approve`), the gate is a signed URL token — different pattern. Read each file first.

---

## Resume Checklist (next session)

1. Read this tracker
2. Read commit `ca4b97e` to see what A1 closed
3. Pick Wave 1 — start with `plan-email` (highest impact, simplest)
4. Per-route loop:
   - `Get-Content -LiteralPath {path} | Select-Object -First 80` — read entry point
   - Backup with timestamp
   - Git checkpoint
   - Write Node.js patch script
   - Run script
   - `npx tsc --noEmit`
   - curl smoke (no auth → 401, valid session → 200)
   - Commit per route or per wave
5. After all waves done: full incognito smoke + git push
6. Then move to Chunk 5 (anonymous session creation) and Chunk 6 (logging inserts)

---

## Files Touched in A1 (already shipped, commit `ca4b97e`)

- `app/charlie/hooks/useCharlie.ts` — gate branch, removed message echo
- `app/charlie/components/CharlieOverlay.tsx` — forward gateReason + onOpenRegister
- `app/charlie/components/ChatPanel.tsx` — gate quick replies, disable input/button, widen gateReason type

---

## Open Questions for Next Session

1. **`seller-estimate` — what does it actually do?** Listed as 🟡 MED but unverified. Read the file first turn next session.
2. **`vip-approve` routes — token model?** Are they already protected by HMAC-signed URLs? If yes, mark as DONE. If no, design token signing scheme (use `tenant.api_secret` or env-level signing key).
3. **Listing card register modal pattern (`setShowRegister`)** — separate from this audit but flagged earlier as a parallel gate system. Decide: unify with `gateActive` model, or leave as-is.
4. **Anonymous session creation (`walliam/charlie/session/route.ts`)** — Chunk 5 in original W-RECOVERY plan. Do this AFTER A1.5, BEFORE Chunk 6 (logging).

---

## Notes from this session

- Bleed is plugged. Server gate on `/api/charlie/route.ts` is the only Anthropic-calling route, and it's gated. Everything in this tracker is data-integrity / authorization, not money-burn.
- The two 🟢 LOW read-only routes (`community-buildings`, `competing-listings`, `municipalities`) can probably be left unguarded if we add Cloudflare rate-limiting at the edge in Phase C.
- DON'T touch System 1. Nothing in this tracker is System 1 — confirmed by paths (`app/api/charlie/*` and `app/api/walliam/*` only).
- `plan-email` may already have a session check inside it that the grep didn't catch (it might use a different error string than "Authentication required"). VERIFY by reading the file before patching.