// scripts/patch-c8b-2-walliam-hero-prop-thread.js
// Final C8b-2 patch -- threads tenantId + brandName through WalliamHero
// (intermediate component between default export and HeroWordmark).
// 2 edits per client file: signature expansion + callsite expansion.
// All anchors verified against disk bytes 2026-05-20.

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
    console.log('SKIP ' + relPath + ' -- already patched (marker: ' + idempotencyMarker + ')')
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
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath + ':\n' + edit.find)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ============================================================
// V1: HomePageComprehensiveClient.tsx
// Add tenantId + brandName to WalliamHero (signature + callsite).
// ============================================================
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    // Edit 1: WalliamHero signature -- add tenantId + brandName to params + type.
    {
      find: `function WalliamHero({ assistantName }: { assistantName: string }) {`,
      replace: `// C8b-2 -- tenantId + brandName threaded through WalliamHero to reach HeroWordmark.
function WalliamHero({ tenantId, brandName, assistantName }: { tenantId: string | null; brandName: string | null; assistantName: string }) {`,
    },
    // Edit 2: WalliamHero callsite in default export -- pass tenantId + brandName.
    {
      find: `      <WalliamHero assistantName={assistantName} />`,
      replace: `      <WalliamHero tenantId={tenantId} brandName={brandName} assistantName={assistantName} />`,
    },
  ],
  'C8b-2: V1 WalliamHero prop-thread (2 edits)',
  'C8b-2 -- tenantId + brandName threaded through WalliamHero'
)

// ============================================================
// V2: HomePageComprehensiveClientV2.tsx
// Add tenantId + brandName to WalliamHero (signature + callsite).
// ============================================================
patchFile(
  'components/HomePageComprehensiveClientV2.tsx',
  [
    // Edit 1: WalliamHero signature -- add tenantId + brandName before topAreas.
    {
      find: `function WalliamHero({ topAreas, neighbourhoods, access, assistantName }: { topAreas: AreaCard[]; neighbourhoods: NeighbourhoodMenuItem[]; access: AccessInfo; assistantName: string }) {`,
      replace: `// C8b-2 -- tenantId + brandName threaded through WalliamHero to reach HeroWordmark.
function WalliamHero({ tenantId, brandName, topAreas, neighbourhoods, access, assistantName }: { tenantId: string | null; brandName: string | null; topAreas: AreaCard[]; neighbourhoods: NeighbourhoodMenuItem[]; access: AccessInfo; assistantName: string }) {`,
    },
    // Edit 2: WalliamHero callsite in default export -- pass tenantId + brandName.
    {
      find: `      <WalliamHero topAreas={topAreas} neighbourhoods={neighbourhoods} access={access} assistantName={assistantName} />`,
      replace: `      <WalliamHero tenantId={tenantId} brandName={brandName} topAreas={topAreas} neighbourhoods={neighbourhoods} access={access} assistantName={assistantName} />`,
    },
  ],
  'C8b-2: V2 WalliamHero prop-thread (2 edits)',
  'C8b-2 -- tenantId + brandName threaded through WalliamHero'
)

console.log('\n=== C8b-2 WalliamHero prop-thread patch done ===')