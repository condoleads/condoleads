// scripts/patch-c8a-fix-nested-fn-assistant-name.js
// C8a fix - thread assistantName into nested helper functions and their callsites.
// Also add missing assistantName field to WalliamCTAClient Props interface.
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

// ===== FILE 1: HomePageComprehensiveClient.tsx =====
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    // WalliamSearch nested function signature
    {
      find: `function WalliamSearch() {`,
      replace: `function WalliamSearch({ assistantName }: { assistantName: string }) {`,
    },
    // HowItWorks nested function signature
    {
      find: `function HowItWorks() {`,
      replace: `function HowItWorks({ assistantName }: { assistantName: string }) {`,
    },
    // Callsite: <WalliamSearch /> -> pass assistantName
    {
      find: `        <WalliamSearch />`,
      replace: `        <WalliamSearch assistantName={assistantName} />`,
    },
    // Callsite: <HowItWorks /> -> pass assistantName
    {
      find: `      <HowItWorks />`,
      replace: `      <HowItWorks assistantName={assistantName} />`,
    },
  ],
  'C8a-fix V1 nested fn prop drilling',
  'function WalliamSearch({ assistantName }'
)

// ===== FILE 2: HomePageComprehensiveClientV2.tsx =====
patchFile(
  'components/HomePageComprehensiveClientV2.tsx',
  [
    {
      find: `function WalliamSearch() {`,
      replace: `function WalliamSearch({ assistantName }: { assistantName: string }) {`,
    },
    {
      find: `function HowItWorks() {`,
      replace: `function HowItWorks({ assistantName }: { assistantName: string }) {`,
    },
    // WalliamHero already has typed props -- extend the inline type
    {
      find: `function WalliamHero({ topAreas, neighbourhoods, access }: { topAreas: AreaCard[]; neighbourhoods: NeighbourhoodMenuItem[]; access: AccessInfo }) {`,
      replace: `function WalliamHero({ topAreas, neighbourhoods, access, assistantName }: { topAreas: AreaCard[]; neighbourhoods: NeighbourhoodMenuItem[]; access: AccessInfo; assistantName: string }) {`,
    },
    // Callsites
    {
      find: `        <WalliamSearch />`,
      replace: `        <WalliamSearch assistantName={assistantName} />`,
    },
    {
      find: `      <WalliamHero topAreas={topAreas} neighbourhoods={neighbourhoods} access={access} />`,
      replace: `      <WalliamHero topAreas={topAreas} neighbourhoods={neighbourhoods} access={access} assistantName={assistantName} />`,
    },
    {
      find: `      <HowItWorks />`,
      replace: `      <HowItWorks assistantName={assistantName} />`,
    },
  ],
  'C8a-fix V2 nested fn prop drilling',
  'function WalliamSearch({ assistantName }'
)

// ===== FILE 3: WalliamCTAClient.tsx -- add missing Props.assistantName =====
patchFile(
  'components/WalliamCTAClient.tsx',
  [
    {
      find: `interface Props {
  context?: string // optional geo/building name for display
}`,
      replace: `interface Props {
  context?: string // optional geo/building name for display
  assistantName: string
}`,
    },
  ],
  'C8a-fix WalliamCTAClient Props.assistantName',
  '  assistantName: string'
)

console.log('\n=== C8a-fix complete ===')