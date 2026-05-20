// scripts/patch-c7-comment-literal-cleanup.js
// C7 follow-up - remove KNOWN_TENANTS literal from explanatory comment.

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched')
    return
  }

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor #' + (i+1) + ' not found in ' + relPath + ':\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath)
    content = content.replace(edit.find, edit.replace)
  }

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' -- ' + edits.length + ' edit(s) -- ' + description)
}

patchFile(
  'app/comprehensive-site/page.tsx',
  [
    {
      find: `// C7/D11 -- KNOWN_TENANTS static host map removed; DB lookup via getTenantByHost handles all tenants generically.`,
      replace: `// C7/D11 -- static host-to-uuid map removed; DB lookup via getTenantByHost handles all tenants generically.`,
    },
  ],
  'C7 comment literal cleanup',
  'static host-to-uuid map removed'
)

console.log('\n=== C7 comment cleanup complete ===')