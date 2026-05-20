// scripts/patch-c8b-2-hero-wordmark.js
// C8b-2 -- Homepage HeroWordmark tenant-conditional rendering.
// Defect retired: D13 (hero subset).
// Idempotent. Per-file LE-aware. ASCII-only anchors (em-dash comment skipped).
// Hooks-first ordering preserves React Rules of Hooks across both branches.

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
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ============================================================
// Edit 1: BrandWordmark.tsx -- add 'hero' size variant
// ============================================================
patchFile(
  'components/navigation/BrandWordmark.tsx',
  [
    {
      find: `interface BrandWordmarkProps {
  brand: string
  size?: 'sm' | 'md'
}

export default function BrandWordmark({ brand, size = 'md' }: BrandWordmarkProps) {
  const fontSize = size === 'sm' ? 15 : 20
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        fontSize,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {brand}
    </span>
  )
}`,
      replace: `// C8b-2 -- 'hero' size added for homepage HeroWordmark fallback.
interface BrandWordmarkProps {
  brand: string
  size?: 'sm' | 'md' | 'hero'
}

export default function BrandWordmark({ brand, size = 'md' }: BrandWordmarkProps) {
  const isHero = size === 'hero'
  const fontSize = isHero ? 'clamp(52px, 10vw, 96px)' : (size === 'sm' ? 15 : 20)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        fontSize,
        fontWeight: isHero ? 900 : 700,
        color: '#fff',
        letterSpacing: isHero ? '-0.03em' : '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {brand}
    </span>
  )
}`,
    },
  ],
  'C8b-2: BrandWordmark hero variant',
  "C8b-2 -- 'hero' size added"
)

// ============================================================
// Edit 2: HomePageComprehensive.tsx (V1 server wrapper)
// ============================================================
patchFile(
  'components/HomePageComprehensive.tsx',
  [
    {
      find: `      <HomePageComprehensiveClient
        assistantName={assistantName}
        agent={{`,
      replace: `      {/* C8b-2 -- tenantId + brandName for hero wordmark gating */}
      <HomePageComprehensiveClient
        tenantId={tenantContext?.id ?? null}
        brandName={tenantContext?.name ?? null}
        assistantName={assistantName}
        agent={{`,
    },
  ],
  'C8b-2: V1 wrapper passes tenantId + brandName',
  'C8b-2 -- tenantId + brandName for hero wordmark gating'
)

// ============================================================
// Edit 3: HomePageComprehensiveV2.tsx (V2 server wrapper)
// ============================================================
patchFile(
  'components/HomePageComprehensiveV2.tsx',
  [
    {
      find: `      <HomePageComprehensiveClientV2
        assistantName={assistantName}
        agent={{`,
      replace: `      {/* C8b-2 -- tenantId + brandName for hero wordmark gating */}
      <HomePageComprehensiveClientV2
        tenantId={tenantContext?.id ?? null}
        brandName={tenantContext?.name ?? null}
        assistantName={assistantName}
        agent={{`,
    },
  ],
  'C8b-2: V2 wrapper passes tenantId + brandName',
  'C8b-2 -- tenantId + brandName for hero wordmark gating'
)

// ============================================================
// Edit 4: V1 client -- 4 sub-edits
// Hooks-first ordering: useState + useEffect declared BEFORE tenant gate.
// ============================================================
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    // 4a: WALLIAM_TENANT_ID constant + BrandWordmark import + Props expansion.
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
    // 4b: HeroWordmark -- add props + hooks-first gating (Rules of Hooks safe).
    // Anchor: from function declaration through the END of the useEffect closure.
    // We replace the entire hooks block so we can insert the tenant gate AFTER all hooks.
    {
      find: `function HeroWordmark() {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);

  useEffect(() => {
    // Sequence: reveal WALL glow settle
    const t1 = setTimeout(() => setRevealed(true), 300);
    const t2 = setTimeout(() => setWallGlow(true), 900);
    const t3 = setTimeout(() => setWallGlow(false), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);`,
      replace: `// C8b-2 -- gates on tenantId; falls back to BrandWordmark for non-WALLiam tenants.
// Hooks-first: useState + useEffect declared unconditionally before tenant gate.
function HeroWordmark({ tenantId, brandName }: { tenantId: string | null; brandName: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);

  useEffect(() => {
    // Sequence: reveal WALL glow settle
    const t1 = setTimeout(() => setRevealed(true), 300);
    const t2 = setTimeout(() => setWallGlow(true), 900);
    const t3 = setTimeout(() => setWallGlow(false), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

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
  }`,
    },
    // 4c: <HeroWordmark /> callsite.
    {
      find: `      {/* WALLiam name */}
      <HeroWordmark />`,
      replace: `      {/* WALLiam name */}
      {/* C8b-2 -- tenant-aware hero wordmark */}
      <HeroWordmark tenantId={tenantId} brandName={brandName} />`,
    },
    // 4d: export-default destructure.
    {
      find: `export default function HomePageComprehensiveClient({ agent, stats, topAreas, access, assistantName }: Props) {`,
      replace: `export default function HomePageComprehensiveClient({ tenantId, brandName, agent, stats, topAreas, access, assistantName }: Props) {`,
    },
  ],
  'C8b-2: V1 client (4 edits, hooks-first)',
  'C8b-2 -- WALLIAM_TENANT_ID constant duplicated from SiteHeaderClient'
)

// ============================================================
// Edit 5: V2 client -- identical pattern, 4 sub-edits
// ============================================================
patchFile(
  'components/HomePageComprehensiveClientV2.tsx',
  [
    // 5a: constant + import + Props expansion.
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
    // 5b: HeroWordmark hooks-first gating.
    {
      find: `function HeroWordmark() {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);

  useEffect(() => {
    // Sequence: reveal WALL glow settle
    const t1 = setTimeout(() => setRevealed(true), 300);
    const t2 = setTimeout(() => setWallGlow(true), 900);
    const t3 = setTimeout(() => setWallGlow(false), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);`,
      replace: `// C8b-2 -- gates on tenantId; falls back to BrandWordmark for non-WALLiam tenants.
// Hooks-first: useState + useEffect declared unconditionally before tenant gate.
function HeroWordmark({ tenantId, brandName }: { tenantId: string | null; brandName: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [wallGlow, setWallGlow] = useState(false);

  useEffect(() => {
    // Sequence: reveal WALL glow settle
    const t1 = setTimeout(() => setRevealed(true), 300);
    const t2 = setTimeout(() => setWallGlow(true), 900);
    const t3 = setTimeout(() => setWallGlow(false), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

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
  }`,
    },
    // 5c: <HeroWordmark /> callsite.
    {
      find: `      {/* WALLiam name */}
      <HeroWordmark />`,
      replace: `      {/* WALLiam name */}
      {/* C8b-2 -- tenant-aware hero wordmark */}
      <HeroWordmark tenantId={tenantId} brandName={brandName} />`,
    },
    // 5d: export-default destructure.
    {
      find: `export default function HomePageComprehensiveClientV2({ agent, stats, topAreas, neighbourhoods, access, assistantName }: Props) {`,
      replace: `export default function HomePageComprehensiveClientV2({ tenantId, brandName, agent, stats, topAreas, neighbourhoods, access, assistantName }: Props) {`,
    },
  ],
  'C8b-2: V2 client (4 edits, hooks-first)',
  'C8b-2 -- WALLIAM_TENANT_ID constant duplicated from SiteHeaderClient'
)

console.log('\n=== C8b-2 patch complete ===')