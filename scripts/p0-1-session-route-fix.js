const fs = require('fs')
const path = 'C:/Condoleads/project/app/api/walliam/charlie/session/route.ts'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Step 4 comment',
    old: '    // Step 4: Create new session if none exists (skip if read_only)',
    new: '    // Step 4: Create new session if none exists.\n    // W-RECOVERY P0-1: skip create for read_only OR anonymous (!userId).\n    // Anonymous callers get the same default-shaped response as read_only\n    // \u2014 no DB row created. Bleed cause: prior code inserted rows with\n    // user_id=null on every anonymous page load (51 such rows Apr 28\u2192May 2).'
  },
  {
    name: 'Read-only branch condition',
    old: '    if (!session && read_only) {',
    new: '    if (!session && (read_only || !userId)) {'
  },
  {
    name: 'Create branch defensive guard',
    old: '    if (!session) {\n      const { data: newSession, error: createError } = await supabase\n        .from(\'chat_sessions\')',
    new: '    if (!session && userId) {\n      // W-RECOVERY P0-1 defense-in-depth: only create if userId is set.\n      // Anonymous case is already handled by the branch above; this guard\n      // prevents regression if someone restructures the conditions later.\n      const { data: newSession, error: createError } = await supabase\n        .from(\'chat_sessions\')'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(occurrences:', occurrences, ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)