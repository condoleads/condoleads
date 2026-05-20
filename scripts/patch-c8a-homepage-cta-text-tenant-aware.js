// scripts/patch-c8a-homepage-cta-text-tenant-aware.js
// C8a - Text-string prop drilling for homepage clients + WalliamCTA
// Wordmark JSX deliberately untouched (locked for C8b WALLiam-preserved + tenant-fallback).
// Defects retired: D13 (text-string subset only)
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
// Add assistantName to Props interface + consume in 2 text strings
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    // Add assistantName to Props interface (anchor on the function declaration which is unique)
    {
      find: `export default function HomePageComprehensiveClient({ agent, stats, topAreas, access }: Props) {`,
      replace: `export default function HomePageComprehensiveClient({ agent, stats, topAreas, access, assistantName }: Props) {`,
    },
    // Line 307: Ask WALLiam label
    {
      find: `      {/* Ask WALLiam label */}
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Ask WALLiam anything about GTA real estate
      </div>`,
      replace: `      {/* C8a/D13 -- AI-action copy uses tenant assistant_name */}
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Ask {assistantName} anything about GTA real estate
      </div>`,
    },
    // Line 344: AI Builds Your Plan desc
    {
      find: `      desc: 'WALLiam pulls live MLS data, market analytics, and comparable sales to build your personalized real estate plan.',`,
      replace: `      desc: ` + '`${assistantName} pulls live MLS data, market analytics, and comparable sales to build your personalized real estate plan.`' + `,`,
    },
  ],
  'C8a: HomePageComprehensiveClient text-tenant',
  'C8a/D13 -- AI-action copy uses tenant assistant_name'
)

// ===== FILE 2: HomePageComprehensiveClient.tsx -- Props interface separately =====
// (already-patched-skip on second invocation safeguarded by the function-signature change above)
patchFile(
  'components/HomePageComprehensiveClient.tsx',
  [
    {
      find: `interface Props {`,
      replace: `interface Props {
  assistantName: string`,
    },
  ],
  'C8a: HomePageComprehensiveClient Props.assistantName',
  '  assistantName: string'
)

// ===== FILE 3: HomePageComprehensiveClientV2.tsx =====
patchFile(
  'components/HomePageComprehensiveClientV2.tsx',
  [
    // Function signature destructuring
    {
      find: `export default function HomePageComprehensiveClientV2({ agent, stats, topAreas, neighbourhoods, access }: Props) {`,
      replace: `export default function HomePageComprehensiveClientV2({ agent, stats, topAreas, neighbourhoods, access, assistantName }: Props) {`,
    },
    // Line 312: Ask WALLiam label (V2 mirror)
    {
      find: `      {/* Ask WALLiam label */}
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Ask WALLiam anything about GTA real estate
      </div>`,
      replace: `      {/* C8a/D13 -- AI-action copy uses tenant assistant_name */}
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Ask {assistantName} anything about GTA real estate
      </div>`,
    },
    // Line 349: AI Builds Your Plan desc (V2 mirror)
    {
      find: `      desc: 'WALLiam pulls live MLS data, market analytics, and comparable sales to build your personalized real estate plan.',`,
      replace: `      desc: ` + '`${assistantName} pulls live MLS data, market analytics, and comparable sales to build your personalized real estate plan.`' + `,`,
    },
    // Line 519: Ask WALLiam (AI) button
    {
      find: `            Ask WALLiam (AI)`,
      replace: `            Ask {assistantName} (AI)`,
    },
  ],
  'C8a: HomePageComprehensiveClientV2 text-tenant',
  'C8a/D13 -- AI-action copy uses tenant assistant_name'
)

patchFile(
  'components/HomePageComprehensiveClientV2.tsx',
  [
    {
      find: `interface Props {`,
      replace: `interface Props {
  assistantName: string`,
    },
  ],
  'C8a: HomePageComprehensiveClientV2 Props.assistantName',
  '  assistantName: string'
)

// ===== FILE 4: HomePageComprehensive.tsx (server wrapper) =====
// Fetch tenant, pass assistantName to client
patchFile(
  'components/HomePageComprehensive.tsx',
  [
    {
      find: `import { resolveAgentAccess } from '@/lib/comprehensive/access-resolver';
import { fetchMarketStats, fetchTopAreas } from '@/lib/comprehensive/stats-fetcher';
import HomePageComprehensiveClient from './HomePageComprehensiveClient';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import { getWalliamTenantId } from '@/lib/utils/is-walliam';
import MobileContactBar from './MobileContactBar';`,
      replace: `import { resolveAgentAccess } from '@/lib/comprehensive/access-resolver';
import { fetchMarketStats, fetchTopAreas } from '@/lib/comprehensive/stats-fetcher';
import HomePageComprehensiveClient from './HomePageComprehensiveClient';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import { getWalliamTenantId } from '@/lib/utils/is-walliam';
import { getTenantByHost } from '@/lib/utils/tenant-brand';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import MobileContactBar from './MobileContactBar';`,
    },
    {
      find: `export async function HomePageComprehensive({ agent }: HomePageComprehensiveProps) {
  // Resolve agent's geographic access
  const tenantId = await getWalliamTenantId();
  const isWalliam = !!tenantId;
    const access = await resolveAgentAccess(agent.id);`,
      replace: `export async function HomePageComprehensive({ agent }: HomePageComprehensiveProps) {
  // C8a/D13 -- fetch tenant context for prop-drilling assistant name to client
  const host = headers().get('host');
  const supabaseForTenant = createClient();
  const tenantContext = await getTenantByHost(supabaseForTenant, host);
  const assistantName = tenantContext?.name || 'Charlie';

  // Resolve agent's geographic access
  const tenantId = await getWalliamTenantId();
  const isWalliam = !!tenantId;
    const access = await resolveAgentAccess(agent.id);`,
    },
    {
      find: `      <HomePageComprehensiveClient
        agent={{`,
      replace: `      <HomePageComprehensiveClient
        assistantName={assistantName}
        agent={{`,
    },
  ],
  'C8a: HomePageComprehensive server wrapper',
  'C8a/D13 -- fetch tenant context for prop-drilling'
)

// ===== FILE 5: HomePageComprehensiveV2.tsx (server wrapper) =====
patchFile(
  'components/HomePageComprehensiveV2.tsx',
  [
    {
      find: `import { resolveAgentAccess } from '@/lib/comprehensive/access-resolver';
import { fetchMarketStats, fetchTopAreas } from '@/lib/comprehensive/stats-fetcher';
import { getMenuData } from '@/components/navigation/SiteHeader';
import HomePageComprehensiveClientV2 from './HomePageComprehensiveClientV2';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import { getWalliamTenantId } from '@/lib/utils/is-walliam';`,
      replace: `import { resolveAgentAccess } from '@/lib/comprehensive/access-resolver';
import { fetchMarketStats, fetchTopAreas } from '@/lib/comprehensive/stats-fetcher';
import { getMenuData } from '@/components/navigation/SiteHeader';
import HomePageComprehensiveClientV2 from './HomePageComprehensiveClientV2';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import { getWalliamTenantId } from '@/lib/utils/is-walliam';
import { getTenantByHost } from '@/lib/utils/tenant-brand';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';`,
    },
    {
      find: `export async function HomePageComprehensiveV2({ agent }: HomePageComprehensiveV2Props) {
  // Resolve agent's geographic access
  const tenantId = await getWalliamTenantId();
  const isWalliam = !!tenantId;
    const access = await resolveAgentAccess(agent.id);`,
      replace: `export async function HomePageComprehensiveV2({ agent }: HomePageComprehensiveV2Props) {
  // C8a/D13 -- fetch tenant context for prop-drilling assistant name to client
  const host = headers().get('host');
  const supabaseForTenant = createClient();
  const tenantContext = await getTenantByHost(supabaseForTenant, host);
  const assistantName = tenantContext?.name || 'Charlie';

  // Resolve agent's geographic access
  const tenantId = await getWalliamTenantId();
  const isWalliam = !!tenantId;
    const access = await resolveAgentAccess(agent.id);`,
    },
    {
      find: `      <HomePageComprehensiveClientV2
        agent={{`,
      replace: `      <HomePageComprehensiveClientV2
        assistantName={assistantName}
        agent={{`,
    },
  ],
  'C8a: HomePageComprehensiveV2 server wrapper',
  'C8a/D13 -- fetch tenant context for prop-drilling'
)

// ===== FILE 6: WalliamCTA.tsx -- convert to server-wrapper + client pattern =====
// Strategy: rename existing file to WalliamCTAClient.tsx, create new WalliamCTA.tsx that fetches tenant.
// Anchor-based patch on the existing WalliamCTA.tsx -- transforms it from client to server component;
// emits a new sibling WalliamCTAClient.tsx with the original 'use client' content.

// Since this requires a structural file split, do it imperatively (not via anchor):
{
  const ctaPath = path.join(ROOT, 'components/WalliamCTA.tsx')
  const clientPath = path.join(ROOT, 'components/WalliamCTAClient.tsx')

  // Idempotency: if the client file already exists, skip
  if (fs.existsSync(clientPath)) {
    console.log('SKIP WalliamCTA split -- WalliamCTAClient.tsx already exists')
  } else {
    const original = fs.readFileSync(ctaPath, 'utf8')
    const LE = detectLineEnding(original)

    // Build new client component: original file with Props extended + text replacements
    let clientContent = original
    // 1) Props add assistantName
    clientContent = clientContent.replace(
      `interface Props {
  context?: string // optional geo/building name for display
}`,
      `interface Props {
  context?: string // optional geo/building name for display
  assistantName: string
}`
    )
    // 2) Function signature destructure
    clientContent = clientContent.replace(
      `export default function WalliamCTA({ context }: Props) {`,
      `export default function WalliamCTAClient({ context, assistantName }: Props) {`
    )
    // 3) Line 60-61 text replacements
    clientContent = clientContent.replace(
      `          {context
            ? ` + '`Ask WALLiam about ${context}`' + `
            : 'Ask WALLiam anything about GTA real estate'}`,
      `          {context
            ? ` + '`Ask ${assistantName} about ${context}`' + `
            : ` + '`Ask ${assistantName} anything about GTA real estate`' + `}`
    )
    // 4) Line 78 placeholder
    clientContent = clientContent.replace(
      `          placeholder="Ask WALLiam..."`,
      `          placeholder={` + '`Ask ${assistantName}...`' + `}`
    )

    fs.writeFileSync(clientPath, clientContent, 'utf8')
    console.log('Created components/WalliamCTAClient.tsx (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ')')

    // Now overwrite WalliamCTA.tsx to be the server wrapper
    const wrapperContent = `import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import WalliamCTAClient from './WalliamCTAClient'

// C8a/D13 -- server wrapper: fetches tenant context, passes assistantName to client.
// All callers continue to import WalliamCTA from '@/components/WalliamCTA' with no change.
// The wordmark JSX inside WalliamCTAClient is the WALLiam wordmark and stays untouched
// (per C8b plan: WALLiam-preserved, other tenants get plain-text fallback).

interface Props {
  context?: string
}

export default async function WalliamCTA({ context }: Props) {
  const host = headers().get('host')
  const supabase = createClient()
  const tenant = await getTenantByHost(supabase, host)
  const assistantName = tenant?.name || 'Charlie'

  return <WalliamCTAClient context={context} assistantName={assistantName} />
}
`
    const normalizedWrapper = LE === '\r\n' ? wrapperContent.replace(/\n/g, '\r\n') : wrapperContent
    fs.writeFileSync(ctaPath, normalizedWrapper, 'utf8')
    console.log('Rewrote components/WalliamCTA.tsx as server wrapper')
  }
}

console.log('\n=== C8a patch complete ===')