// scripts/patch-c8a-fix-2-walliam-hero-cta-text.js
// C8a final fix - V1 WalliamHero prop drilling + WalliamCTAClient text strings.
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

// ===== FILE 1: HomePageComprehensiveClient.tsx -- WalliamHero prop drilling =====
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    {
      find: `function WalliamHero() {`,
      replace: `function WalliamHero({ assistantName }: { assistantName: string }) {`,
    },
    {
      find: `      <WalliamHero />`,
      replace: `      <WalliamHero assistantName={assistantName} />`,
    },
  ],
  'C8a-fix-2 V1 WalliamHero prop drilling',
  'function WalliamHero({ assistantName }'
)

// ===== FILE 2: WalliamCTAClient.tsx -- text strings =====
patchFile(
  'components/WalliamCTAClient.tsx',
  [
    {
      find: `          {context
            ? \`Ask WALLiam about \${context}\`
            : 'Ask WALLiam anything about GTA real estate'}`,
      replace: `          {context
            ? \`Ask \${assistantName} about \${context}\`
            : \`Ask \${assistantName} anything about GTA real estate\`}`,
    },
  ],
  'C8a-fix-2 WalliamCTAClient text strings',
  '`Ask ${assistantName} about ${context}`'
)

console.log('\n=== C8a-fix-2 complete ===')