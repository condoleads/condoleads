// scripts/patch-c8b-2-clients-completion.js
// Completion patch -- V1 + V2 client files only.
// The other 3 files (BrandWordmark, V1 wrapper, V2 wrapper) already patched in prior run.
// Idempotency markers gate each client file; safe to re-run.

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
// V1 client: HomePageComprehensiveClient.tsx
// ============================================================
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    // Edit 1 (4a): WALLIAM_TENANT_ID + BrandWordmark import + Props expansion.
    {
      find: `interface Props {
  assistantName: string
  agent: Agent;`,
      replace: `// C8b-2 -- WALLIAM_TENANT_ID constant duplicated from SiteHeaderClient.tsx:13.
// C8c follow-up will replace all three callsites with a tenants.wordmark_style flag.
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

import BrandWordmark from './navigation/BrandWordmark';

interface Props {
  tenantId: string | null;
  brandName: string | null;
  assistantName: string
  agent: Agent;`,
    },
    // Edit 2 (4b-i): Add props to HeroWordmark signature.
    {
      find: `function HeroWordmark() {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);`,
      replace: `// C8b-2 -- gates on tenantId; falls back to BrandWordmark for non-WALLiam tenants.
// Hooks-first: useState + useEffect declared unconditionally before tenant gate.
function HeroWordmark({ tenantId, brandName }: { tenantId: string | null; brandName: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);`,
    },
    // Edit 3 (4b-ii): Insert tenant gate AFTER all hooks complete.
    {
      find: `  }, []);

  return (
    <div style={{`,
      replace: `  }, []);

  // C8b-2 -- non-WALLiam tenants get plain-text BrandWordmark at hero size.
  // Tenant gate runs AFTER all hooks per React Rules of Hooks.
  if (tenantId !== WALLIAM_TENANT_ID) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
        marginBottom: 20,
      }}>
        <BrandWordmark brand={brandName ?? 'Brand'} size="hero" />
      </div>
    );
  }

  return (
    <div style={{`,
    },
    // Edit 4 (4c): callsite.
    {
      find: `      {/* WALLiam name */}
      <HeroWordmark />`,
      replace: `      {/* WALLiam name */}
      {/* C8b-2 -- tenant-aware hero wordmark */}
      <HeroWordmark tenantId={tenantId} brandName={brandName} />`,
    },
    // Edit 5 (4d): export-default destructure.
    {
      find: `export default function HomePageComprehensiveClient({ agent, stats, topAreas, access, assistantName }: Props) {`,
      replace: `export default function HomePageComprehensiveClient({ tenantId, brandName, agent, stats, topAreas, access, assistantName }: Props) {`,
    },
  ],
  'C8b-2: V1 client (5 edits, completion)',
  'C8b-2 -- WALLIAM_TENANT_ID constant duplicated from SiteHeaderClient'
)

// ============================================================
// V2 client: HomePageComprehensiveClientV2.tsx
// ============================================================
patchFile(
  'components/HomePageComprehensiveClientV2.tsx',
  [
    // Edit 1 (5a): constant + import + Props expansion.
    {
      find: `interface Props {
  assistantName: string`,
      replace: `// C8b-2 -- WALLIAM_TENANT_ID constant duplicated from SiteHeaderClient.tsx:13.
// C8c follow-up will replace all three callsites with a tenants.wordmark_style flag.
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

import BrandWordmark from './navigation/BrandWordmark';

interface Props {
  tenantId: string | null;
  brandName: string | null;
  assistantName: string`,
    },
    // Edit 2 (5b-i): Add props to HeroWordmark signature.
    {
      find: `function HeroWordmark() {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);`,
      replace: `// C8b-2 -- gates on tenantId; falls back to BrandWordmark for non-WALLiam tenants.
// Hooks-first: useState + useEffect declared unconditionally before tenant gate.
function HeroWordmark({ tenantId, brandName }: { tenantId: string | null; brandName: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);`,
    },
    // Edit 3 (5b-ii): Insert tenant gate after hooks.
    {
      find: `  }, []);

  return (
    <div style={{`,
      replace: `  }, []);

  // C8b-2 -- non-WALLiam tenants get plain-text BrandWordmark at hero size.
  // Tenant gate runs AFTER all hooks per React Rules of Hooks.
  if (tenantId !== WALLIAM_TENANT_ID) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
        marginBottom: 20,
      }}>
        <BrandWordmark brand={brandName ?? 'Brand'} size="hero" />
      </div>
    );
  }

  return (
    <div style={{`,
    },
    // Edit 4 (5c): callsite.
    {
      find: `      {/* WALLiam name */}
      <HeroWordmark />`,
      replace: `      {/* WALLiam name */}
      {/* C8b-2 -- tenant-aware hero wordmark */}
      <HeroWordmark tenantId={tenantId} brandName={brandName} />`,
    },
    // Edit 5 (5d): export-default destructure.
    {
      find: `export default function HomePageComprehensiveClientV2({ agent, stats, topAreas, neighbourhoods, access, assistantName }: Props) {`,
      replace: `export default function HomePageComprehensiveClientV2({ tenantId, brandName, agent, stats, topAreas, neighbourhoods, access, assistantName }: Props) {`,
    },
  ],
  'C8b-2: V2 client (5 edits, completion)',
  'C8b-2 -- WALLIAM_TENANT_ID constant duplicated from SiteHeaderClient'
)

console.log('\n=== C8b-2 completion patch done ===')