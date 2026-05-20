// scripts/patch-c1-comment-literal-cleanup.js
// C1 follow-up - remove walliam literals from explanatory comments
// Test gate caught comments containing the dead syntax; rewriting to abstract description.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function detectLineEnding(content) {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeAnchorToFileLE(anchor, fileLE) {
  const normalized = anchor.replace(/\r\n/g, '\n')
  if (fileLE === '\r\n') {
    return normalized.replace(/\n/g, '\r\n')
  }
  return normalized
}

function patchFile(relPath, edits, description) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  const normalizedEdits = edits.map(e => ({
    find: normalizeAnchorToFileLE(e.find, LE),
    replace: normalizeAnchorToFileLE(e.replace, LE),
  }))

  for (const edit of normalizedEdits) {
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) {
      throw new Error('Anchor not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    }
    if (occurrences > 1) {
      throw new Error('Anchor found ' + occurrences + ' times in ' + relPath + ':\n' + edit.find)
    }
  }

  for (const edit of normalizedEdits) {
    content = content.replace(edit.find, edit.replace)
  }

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// FILE 1: increment route - rewrite both C1/D1 comments
patchFile(
  'app/api/walliam/estimator/increment/route.ts',
  [
    {
      find: `    // C1/D1 -- auth gate validates session.source against the tenant source_key
    // (was: hardcoded session.source !== 'walliam' which blocked all non-WALLiam tenants)`,
      replace: `    // C1/D1 -- auth gate validates chat session source against the tenant source_key
    // (was: hardcoded literal source comparison which blocked all non-WALLiam tenants)`,
    },
  ],
  'D1 comment cleanup'
)

// FILE 2: contact route - rewrite C1/D5 comment
patchFile(
  'app/api/walliam/contact/route.ts',
  [
    {
      find: `        // C1/D5 -- build source from tenant source_key (was: hardcoded 'walliam_contact_form')`,
      replace: `        // C1/D5 -- build source from tenant source_key (was: hardcoded literal source value)`,
    },
  ],
  'D5 comment cleanup'
)

console.log('\n=== C1 comment cleanup complete ===')