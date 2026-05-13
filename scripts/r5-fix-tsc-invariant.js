// scripts/r5-fix-tsc-invariant.js
// W-ROLES-DELEGATION/R5 — TSC fix: result.code → result.invariant.
//
// TransitionResult<T> failure shape uses `invariant?: string | undefined`,
// not `code?: string`. The deploy script guessed the field name; TSC caught it.
// Public API key stays `code` (clients switch on it); only the internal
// source field name changes.
//
// Usage: node scripts/r5-fix-tsc-invariant.js

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)

const FILES = [
  'app/api/admin-homes/delegations/route.ts',
  'app/api/admin-homes/delegations/[id]/route.ts',
]

const FIND = 'code: result.code ?? null'
const REPLACE = 'code: result.invariant ?? null'

console.log('[R5-FIX] STAMP=' + STAMP)
console.log('[R5-FIX] Patching ' + FILES.length + ' files')
console.log('')

let abort = false
const plan = []

for (const rel of FILES) {
  const abs = path.join(PROJECT_ROOT, rel)
  if (!fs.existsSync(abs)) {
    console.error('[R5-FIX] MISSING: ' + rel)
    abort = true
    continue
  }

  const original = fs.readFileSync(abs, 'utf8')
  const escaped = FIND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const occurrences = (original.match(new RegExp(escaped, 'g')) || []).length

  if (occurrences !== 1) {
    console.error('[R5-FIX] ABORT: expected 1 match in ' + rel + ', found ' + occurrences)
    abort = true
    continue
  }

  plan.push({ rel, abs, original })
  console.log('[R5-FIX] PLAN  ' + rel + '  (1 match)')
}

if (abort) {
  console.error('')
  console.error('[R5-FIX] Aborted — no files modified.')
  process.exit(1)
}

console.log('')

// Phase 2: backup + write. All-or-nothing already verified above.
for (const f of plan) {
  const bak = f.abs + '.backup_' + STAMP
  fs.copyFileSync(f.abs, bak)
  console.log('[R5-FIX] BACKUP ' + path.basename(bak))

  const updated = f.original.replace(FIND, REPLACE)

  // Sanity: verify the replace actually changed something.
  if (updated === f.original) {
    console.error('[R5-FIX] WARN: replace was a no-op for ' + f.rel)
    process.exit(1)
  }

  fs.writeFileSync(f.abs, updated, 'utf8')
  const newSize = fs.statSync(f.abs).size
  console.log('[R5-FIX] PATCH  ' + f.rel + '  (' + newSize + ' bytes)')
}

console.log('')
console.log('[R5-FIX] Done. Next: npx tsc --noEmit')