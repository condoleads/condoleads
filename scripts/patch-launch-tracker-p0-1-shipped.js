const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Auth & Sessions row',
    old: '| Auth & Sessions (gates, anonymous\u2192registered) | \u2705 | \ud83d\udfe1 | \u2705 | \u2705 | W-RECOVERY A1 auth gate live on `/api/charlie/route.ts` + Wave 1\u20132 routes. **CRITICAL:** 51/61 post-W-RECOVERY sessions still anonymous \u2014 **W-RECOVERY Chunk 5 (anonymous session creation in `walliam/charlie/session/route.ts`) DEFERRED, never shipped**. Bleed plugged at chat endpoint (no Anthropic burn) but anonymous DB rows still grow. `tenant_users` membership wired via `RegisterModal` + `joinTenant.ts`. W-TENANT-AUTH Phase 4b 8/8. |',
    new: '| Auth & Sessions (gates, anonymous\u2192registered) | \u2705 | \u2705 | \u2705 | \u2705 | W-RECOVERY A1 auth gate on `/api/charlie/route.ts` + Wave 1\u20132 routes. **P0-1 SHIPPED 2026-05-05 commit `6dee05f`** \u2014 anonymous session creation closed in `walliam/charlie/session/route.ts` (read-only branch extended to cover `!userId`; create branch defensive `userId` guard). SQL acceptance post-ship: 0 anonymous rows. 51 legacy anonymous rows remain in DB (P2-1 cleanup). `tenant_users` membership wired via `RegisterModal` + `joinTenant.ts`. W-TENANT-AUTH Phase 4b 8/8. |'
  },
  {
    name: 'Section 3 progress header',
    old: '## Section 3 \u2014 Launch Blockers\n\nConcrete items required to ship to first paid customer (P0), to scale beyond 3 customers (P1), or hygiene before launch (P2). Each with the verification step that confirms removal.',
    new: '## Section 3 \u2014 Launch Blockers\n\nConcrete items required to ship to first paid customer (P0), to scale beyond 3 customers (P1), or hygiene before launch (P2). Each with the verification step that confirms removal.\n\n**P0 progress: 1/5 shipped (P0-1 \u2705 2026-05-05).**'
  },
  {
    name: 'P0-1 entry SHIPPED marker',
    old: '**P0-1. W-RECOVERY Chunk 5 \u2014 anonymous session creation in `walliam/charlie/session/route.ts`**',
    new: '**P0-1. W-RECOVERY Chunk 5 \u2014 anonymous session creation in `walliam/charlie/session/route.ts`** \u2014 \u2705 **SHIPPED 2026-05-05** commit `6dee05f`'
  },
  {
    name: 'Section 4 W-RECOVERY-A1.5 row',
    old: '| `docs/W-RECOVERY-A1.5-TRACKER.md` | A1 + Wave 1\u20132 SHIPPED Apr 28 | **Chunk 5 anonymous sessions DEFERRED (P0-1)**; Chunk 6 logging confirmed working (May 5); Waves 3\u20134 deferred |',
    new: '| `docs/W-RECOVERY-A1.5-TRACKER.md` | A1 + Wave 1\u20132 SHIPPED Apr 28; **Chunk 5 SHIPPED via P0-1** 2026-05-05 commit `6dee05f` | Chunk 6 logging confirmed working (May 5); Waves 3\u20134 deferred |'
  },
  {
    name: 'Status line',
    old: '**Status:** TRACKER COMPLETE \u2014 Section 1 (5/5 blocks) + Sections 2\u20134 populated. Launch-blocker execution begins.',
    new: '**Status:** TRACKER COMPLETE; **P0 execution: 1/5 shipped (P0-1 \u2705 2026-05-05)**.'
  },
  {
    name: 'Next action',
    old: '**Begin P0-1: W-RECOVERY Chunk 5** \u2014 close anonymous session creation in `walliam/charlie/session/route.ts`. After P0-1 ships, P0-2 (W-CREDITS Phase 9 atomic counter), then P0-3 (logging continuity), P0-4 (R7 delegate BCC), P0-5 (auth lockdown sweep) in order.',
    new: '**P0-2 in progress: W-CREDITS Phase 9** \u2014 atomic `increment_chat_message_count` RPC. After P0-2 ships, P0-3 (logging continuity), P0-4 (R7 delegate BCC), P0-5 (auth lockdown sweep) in order.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(occurrences:', occurrences, ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v6Marker = '**Next: execute P0-1 (Chunk 5) \u2192 P0-2 (Phase 9) \u2192 P0-3 (logging gap) \u2192 P0-4 (R7) \u2192 P0-5 (auth lockdown). No more recon.**'
const v7Line = '\n- **2026-05-05 v7** \u2014 **P0-1 SHIPPED.** Commit `6dee05f` pushed; TSC clean; SQL acceptance returned `anonymous_after_ship=0`. Three structural changes in `app/api/walliam/charlie/session/route.ts`: (i) read-only branch extended to `(read_only || !userId)`; (ii) create branch defensive `userId` guard; (iii) Step 4 comment updated to document W-RECOVERY P0-1. **Auth & Sessions row Wired column flipped \ud83d\udfe1 \u2192 \u2705.** Section 4 W-RECOVERY-A1.5 row updated. **Next:** P0-2 recon \u2014 find current `message_count` increment site in `/api/charlie/route.ts`, write atomic RPC migration, replace read-then-write.'

if (!content.includes(v6Marker)) { console.error('v6 marker not found'); process.exit(1) }
content = content.replace(v6Marker, v6Marker + v7Line)
console.log('  Appended v7 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)