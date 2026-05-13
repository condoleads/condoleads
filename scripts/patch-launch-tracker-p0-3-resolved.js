const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Section 1 Credit System row — open logging gap retired',
    old: '**Open:** logging gap May 3\u20135 \u2014 P0-3.',
    new: '**P0-3 \u2705**: logging gap verified as no-traffic, not a code break (`chat_sessions` shows 0 activity post-May-2 11:00 UTC, aligned with last logged row at May 2 10:42).'
  },
  {
    name: 'Section 2 Charlie route logging entry',
    old: '- **Charlie route \u2192 chat_messages_v2 logging**: \ud83d\udfe1 64 rows logged Apr 29\u2192May 2 (Chunk 6 working). **3-day gap May 3\u20135** \u2014 needs verification (no traffic vs silent break) \u2014 P0-3.',
    new: '- **Charlie route \u2192 chat_messages_v2 logging**: \u2705 64 rows logged Apr 29\u2192May 2. May 3\u20135 gap **verified as no-traffic** (P0-3 closed): zero sessions had `last_activity_at > 2026-05-02 11:00 UTC`.'
  },
  {
    name: 'Section 3 P0-3 entry',
    old: '**P0-3. `chat_messages_v2` logging continuity gap May 3\u20135**\n- Symptom: 64 rows Apr 29 \u2192 May 2, then nothing. Cause unknown.\n- Verify: send one chat message, then `SELECT * FROM chat_messages_v2 ORDER BY created_at DESC LIMIT 5` shows new row with tenant_id + user_id.\n- Read `app/api/charlie/route.ts` lines 52, 354 if break is silent.',
    new: '**P0-3. `chat_messages_v2` logging continuity gap May 3\u20135** \u2014 \u2705 **RESOLVED 2026-05-05** (no code change required)\n- Diagnostic SQL on `chat_sessions`: 0 sessions had `last_activity_at > 2026-05-02 11:00 UTC`. Most recent activity is May 2 10:42, perfectly aligned with the most recent `chat_messages_v2` row.\n- **Logging code is fine; the gap reflects zero chat traffic on the dev environment between May 2 and May 5.**\n- Followup: after each future deploy, smoke by sending a chat and verifying a new `chat_messages_v2` row lands within the same minute.'
  },
  {
    name: 'Section 3 progress header',
    old: '**P0 progress: 2/5 shipped (P0-1 \u2705, P0-2 \u2705 2026-05-05).**',
    new: '**P0 progress: 3/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705 2026-05-05).**'
  },
  {
    name: 'Status line',
    old: '**Status:** TRACKER COMPLETE; **P0 execution: 2/5 shipped (P0-1 \u2705, P0-2 \u2705 2026-05-05)**.',
    new: '**Status:** TRACKER COMPLETE; **P0 execution: 3/5 closed (P0-1 \u2705, P0-2 \u2705, P0-3 \u2705 2026-05-05)**.'
  },
  {
    name: 'Next action',
    old: '**P0-3 in progress: chat_messages_v2 logging continuity gap (May 3\u20135).** Diagnose cause: query `chat_messages_v2` for any rows past May 2; if none and there has been chat traffic, read `/api/charlie/route.ts` lines 52, 354 to find silent break.',
    new: '**P0-4 in progress: W-ROLES-DELEGATION R7** \u2014 extend `lib/admin-homes/lead-email-recipients.ts` to query `agent_delegations` for each populated principal (layers 1\u20136) and add active delegates\u2019 `notification_email` to BCC. Update `scripts/smoke-recipients-helper.ts` to cover delegation cases. After P0-4, P0-5 (auth lockdown sweep) closes the P0 tier.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(occurrences:', occurrences, ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v8Marker = '**Status: 2/5 P0 shipped. Next: P0-3 (logging continuity gap May 3\u20135).**'
const v9Line = '\n- **2026-05-05 v9** \u2014 **P0-3 RESOLVED** (no code change required). Diagnostic SQL on `chat_sessions`: 0 sessions had `last_activity_at > 2026-05-02 11:00 UTC`; most recent activity at May 2 10:42 aligns exactly with most recent `chat_messages_v2` row. **The May 3\u20135 gap reflects zero chat traffic on the dev environment, not a logging break.** Logging code at `/api/charlie/route.ts` lines 52, 354 is fine. **Status: 3/5 P0 closed in one working block.** Next: P0-4 (W-ROLES-DELEGATION R7 \u2014 delegate BCC overlay in `lib/admin-homes/lead-email-recipients.ts`). After R7, P0-5 (W-ADMIN-AUTH-LOCKDOWN \u2014 13 routes) finishes the P0 tier.'

if (!content.includes(v8Marker)) { console.error('v8 marker not found'); process.exit(1) }
content = content.replace(v8Marker, v8Marker + v9Line)
console.log('  Appended v9 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)