// scripts/patch-c9-session-agent-name-fallback.js
// C9 - Session route initial agent-config full_name fallback.
// Defect retired: D15 (app/api/walliam/charlie/session/route.ts:93)
// Idempotent.

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function detectLineEnding(content) { return content.includes('\r\n') ? '\r\n' : '\n' }
function normalizeAnchorToFileLE(anchor, fileLE) {
  const normalized = anchor.replace(/\r\n/g, '\n')
  return fileLE === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized
}

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched')
    return
  }

  const normalizedEdits = edits.map(e => ({
    find: normalizeAnchorToFileLE(e.find, LE),
    replace: normalizeAnchorToFileLE(e.replace, LE),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor #' + (i+1) + ' not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// D15: replace initial agent-config full_name default
patchFile(
  'app/api/walliam/charlie/session/route.ts',
  [
    {
      find: `      vip_auto_approve: false,
      full_name: 'WALLiam',
      plan_free_attempts: 1,`,
      replace: `      vip_auto_approve: false,
      // C9/D15 -- initial full_name fallback is empty; tenant.name (line ~118) and
      // agent.full_name (line ~143) override this when their fetches succeed.
      full_name: '',
      plan_free_attempts: 1,`,
    },
  ],
  'D15: session agent-name fallback',
  'C9/D15 -- initial full_name fallback is empty'
)

console.log('\n=== C9 patch complete ===')