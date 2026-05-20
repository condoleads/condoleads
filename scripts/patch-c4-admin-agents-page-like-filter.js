// scripts/patch-c4-admin-agents-page-like-filter.js
// C4 - Drop redundant .like('source', 'walliam_%') filter from admin agents page
// Defect retired: D2 (app/admin-homes/agents/page.tsx:67)
// Idempotent

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

  for (const edit of normalizedEdits) {
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor found ' + occurrences + ' times in ' + relPath)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// C4/D2: drop the .like clause; agent_id already enforces tenant boundary
patchFile(
  'app/admin-homes/agents/page.tsx',
  [
    {
      find: `        supabase.from('leads').select('id, status, quality, temperature').eq('agent_id', agent.id).like('source', 'walliam_%'),`,
      replace: `        // C4/D2 -- tenant boundary enforced by agent_id (leads belong to one agent in one tenant). LIKE filter dropped (was tenant-specific, broke non-WALLiam tenants).
        supabase.from('leads').select('id, status, quality, temperature').eq('agent_id', agent.id),`,
    },
  ],
  'D2: admin agents page LIKE filter dropped',
  'C4/D2 -- tenant boundary enforced by agent_id'
)

console.log('\n=== C4 patch complete ===')