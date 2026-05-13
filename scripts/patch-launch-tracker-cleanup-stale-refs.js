const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'
const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')

if (original.includes('all 15 admin-homes routes gate through it in production')) {
  console.log('[SKIP] cleanup already applied')
  process.exit(0)
}

let content = original.replace(/\r\n/g, '\n')

const fixes = [
  {
    name: 'Section 2 Roles -> Permission gating (flip 13-routes-still-open to closed)',
    old: '- **Roles \u2192 Permission gating**: \ud83d\udfe1 `can()` shipped (R3.1); **only `POST /admin-homes/agents` gates through it in production**. W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`.',
    new: '- **Roles \u2192 Permission gating**: \u2705 `can()` shipped (R3.1); **all 15 admin-homes routes gate through it in production** (P0-5 commit `87b9b53` 2026-05-05). Legacy `api-auth.ts` deleted.'
  },
  {
    name: 'Section 3 stale duplicate P0-5 placeholder (delete the whole block)',
    old: '- Verification: TSC clean; project-wide grep for `@/lib/admin-homes/api-auth` returns 0; all 4 regression smoke suites pass (r3-3 42/42, r3-2-2 6/6, r4-2 25/25, smoke-recipients-helper 5/5).\n\n**P0-5. W-ADMIN-AUTH-LOCKDOWN \u2014 13 routes on legacy `api-auth.ts`**\n- Symptom: only `POST /admin-homes/agents` uses `can()`; remainder bypass matrix policy.\n- Verify: every admin-homes route imports + calls `can()` before any mutation.\n- Source: sister ticket noted in W-ROLES-DELEGATION close.\n\n### P1 \u2014 ship before scale',
    new: '- Verification: TSC clean; project-wide grep for `@/lib/admin-homes/api-auth` returns 0; all 4 regression smoke suites pass (r3-3 42/42, r3-2-2 6/6, r4-2 25/25, smoke-recipients-helper 5/5).\n\n### P1 \u2014 ship before scale'
  },
  {
    name: 'Section 4 W-ADMIN-AUTH-LOCKDOWN row (flip OPEN to CLOSED)',
    old: '| W-ADMIN-AUTH-LOCKDOWN (sister ticket) | OPEN | 13 routes \u2014 P0-5 |',
    new: '| W-ADMIN-AUTH-LOCKDOWN (sister ticket) | CLOSED 2026-05-05 (commit `87b9b53`) | none \u2014 closed via P0-5 |'
  }
]

for (const f of fixes) {
  const count = content.split(f.old).length - 1
  if (count === 0) { console.error('NOT FOUND:', f.name); process.exit(1) }
  if (count > 1)  { console.error('NOT UNIQUE:', f.name, '(' + count + ')'); process.exit(1) }
  content = content.replace(f.old, f.new)
  console.log('  Patched:', f.name)
}

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')
console.log('Original:', original.length, '-> New:', finalContent.length, '(delta', finalContent.length - original.length + ')')