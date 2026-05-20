// scripts/patch-c7-metadata-tenant-aware-v2.js
// C7 v2 - whole-region replacement to avoid em-dash mojibake in anchors
// Defects retired: D10 (layout.tsx), D11 (comprehensive-site/page.tsx), D12 (og/route.tsx)
// Skips tenant-brand.ts (already patched by v1)
// Idempotent

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function detectLineEnding(content) { return content.includes('\r\n') ? '\r\n' : '\n' }

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched')
    return
  }

  // Anchor-based with line-ending normalization
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    const findNormalized = LE === '\r\n' ? edit.find.replace(/\n/g, '\r\n') : edit.find
    const replaceNormalized = LE === '\r\n' ? edit.replace.replace(/\n/g, '\r\n') : edit.replace
    const occurrences = content.split(findNormalized).length - 1
    if (occurrences === 0) throw new Error('Anchor #' + (i+1) + ' not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath)
    content = content.replace(findNormalized, replaceNormalized)
  }

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ===== FILE: app/layout.tsx =====
// Anchor on the PURE ASCII structural lines: opening import + closing brace of metadata block.
// This deliberately includes everything between (the em-dash mojibake region) in the replacement.
patchFile(
  'app/layout.tsx',
  [
    {
      // Pure ASCII anchor: from first import line through const inter declaration
      find: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout"
import TenantHeader from "@/components/TenantHeader";
import { AuthProvider } from "@/components/auth/AuthContext";
import { CreditSessionProvider } from "@/components/credits/CreditSessionContext";
import { getWalliamTenantId } from "@/lib/utils/is-walliam";

const inter = Inter({ subsets: ["latin"] });`,
      replace: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout"
import TenantHeader from "@/components/TenantHeader";
import { AuthProvider } from "@/components/auth/AuthContext";
import { CreditSessionProvider } from "@/components/credits/CreditSessionContext";
import { getWalliamTenantId } from "@/lib/utils/is-walliam";
import { getTenantByHost } from "@/lib/utils/tenant-brand";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({ subsets: ["latin"] });

// C7/D10 -- root metadata is now per-tenant. Reads host at request time,
// resolves tenant config, builds metadata. Falls back to generic when host
// has no matching tenant (build-time SSG safety).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = headers().get('host')
    const supabase = createClient()
    const tenant = await getTenantByHost(supabase, host)

    if (!tenant) {
      return {
        title: "AI Real Estate Assistant",
        description: "AI-powered real estate platform.",
      }
    }

    const url = ` + '`https://${tenant.domain}`' + `
    const ogImageUrl = ` + '`${url}/og`' + `
    const title = ` + '`${tenant.name} - AI Real Estate Assistant`' + `
    const description = ` + '`Browse properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by ${tenant.name} AI.`' + `

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: tenant.name,
        type: "website",
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
    }
  } catch {
    return {
      title: "AI Real Estate Assistant",
      description: "AI-powered real estate platform.",
    }
  }
}`,
    },
    {
      // Now remove the OLD static metadata block. Anchor on its closing line + viewport (pure ASCII).
      find: `};

export const viewport = {`,
      replace: `export const viewport = {`,
    },
    {
      // Also remove the leading static metadata block opener (pure ASCII selector).
      // This deletes the 12 lines that were the static metadata block.
      // We anchor on the start ('export const metadata: Metadata = {') and the lines we know are pure ASCII.
      // But the lines between contain em-dash mojibake. Use a multi-line ASCII find with wildcard via split-write.
      // Solution: anchor only on the unique opening line, and use a longer ASCII-only chunk.
      find: `export const metadata: Metadata = {`,
      replace: `const _C7_REMOVED_METADATA_BLOCK_DO_NOT_USE: any = {`,
    },
  ],
  'D10: root layout generateMetadata',
  'C7/D10 -- root metadata is now per-tenant'
)

// Now post-process app/layout.tsx to remove the stale (renamed) static metadata block entirely
// We do this with regex-based excision since the block contains mojibake.
{
  const fullPath = path.join(ROOT, 'app/layout.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  // Match the renamed dead block: from `const _C7_REMOVED_METADATA_BLOCK_DO_NOT_USE: any = {` through the closing `};`
  // Use a non-greedy match across newlines.
  const deadBlockRegex = /const _C7_REMOVED_METADATA_BLOCK_DO_NOT_USE: any = \{[\s\S]*?^\};\s*$/m
  if (deadBlockRegex.test(content)) {
    content = content.replace(deadBlockRegex, '// C7/D10 -- static metadata block excised; replaced by generateMetadata above')
    fs.writeFileSync(fullPath, content, 'utf8')
    console.log('Excised stale static metadata block from app/layout.tsx')
  } else {
    console.log('WARN: dead block marker not found in app/layout.tsx -- may have been excised already or layout differs from expected')
  }
}

// ===== FILE: app/comprehensive-site/page.tsx =====
// Strategy: replace the WHOLE generateMetadata function (anchor on its declaration + the function above defs),
// and replace the WHOLE KNOWN_TENANTS-using block (anchor on pure ASCII const declaration + closing structural lines).
patchFile(
  'app/comprehensive-site/page.tsx',
  [
    {
      // Anchor on the function declaration line + a UNIQUE structural line further down (export const dynamic)
      // The em-dash region is between them; everything in between gets replaced.
      // We rebuild the whole generateMetadata function with tenant-driven values.
      find: `export async function generateMetadata(): Promise<Metadata> {`,
      replace: `// C7/D11 -- comprehensive-site metadata is now per-tenant.
export async function generateMetadata_C7_NEW(): Promise<Metadata> {
  try {
    const host = headers().get('host')
    const { createClient } = await import('@/lib/supabase/server')
    const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
    const supabase = createClient()
    const tenant = await getTenantByHost(supabase, host)

    if (!tenant) {
      return {
        title: 'AI Real Estate Assistant',
        description: 'Your AI-powered real estate platform.',
      }
    }

    const url = ` + '`https://${tenant.domain}`' + `
    const ogImageUrl = ` + '`${url}/og`' + `
    const title = ` + '`${tenant.name} - AI Real Estate Assistant for the GTA`' + `
    const description = ` + '`Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by ${tenant.name} AI.`' + `
    const ogTitle = ` + '`${tenant.name} - AI Real Estate Assistant`' + `
    const ogDescription = ` + "'Get your personalized real estate plan in minutes.'" + `

    return {
      title,
      description,
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        url,
        siteName: tenant.name,
        type: 'website',
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: ` + '`${tenant.name} AI Real Estate`' + ` }],
      },
      twitter: {
        card: 'summary_large_image',
        title: ogTitle,
        description: ogDescription,
        images: [ogImageUrl],
      },
    }
  } catch {
    return {
      title: 'AI Real Estate Assistant',
      description: 'Your AI-powered real estate platform.',
    }
  }
}

async function _generateMetadata_old_unused_STALE(): Promise<Metadata> {`,
    },
  ],
  'D11 (step 1): rename old generateMetadata, prepend new one',
  'C7/D11 -- comprehensive-site metadata is now per-tenant'
)

// Now: post-process comprehensive-site to (a) excise the stale `_generateMetadata_old_unused_STALE` function,
// (b) rename the new function to its proper name `generateMetadata`,
// (c) replace KNOWN_TENANTS-using block.
{
  const fullPath = path.join(ROOT, 'app/comprehensive-site/page.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')

  // Excise the renamed old function. It runs from `async function _generateMetadata_old_unused_STALE(): Promise<Metadata> {`
  // through the matching closing `}` of the function. The function is the original code that contained em-dash mojibake.
  // Match from the renamed declaration through the next standalone `}` at column 0.
  const oldFnRegex = /async function _generateMetadata_old_unused_STALE\(\): Promise<Metadata> \{[\s\S]*?^\}\s*$/m
  if (oldFnRegex.test(content)) {
    content = content.replace(oldFnRegex, '// C7/D11 -- stale hardcoded generateMetadata excised')
    console.log('Excised stale generateMetadata function from comprehensive-site/page.tsx')
  } else {
    console.log('WARN: stale function marker not found in comprehensive-site/page.tsx')
  }

  // Rename the new function from generateMetadata_C7_NEW to generateMetadata
  content = content.replace(/generateMetadata_C7_NEW/g, 'generateMetadata')

  // Replace the KNOWN_TENANTS-using block with getTenantByHost path
  const knownTenantsRegex = /\/\/ Known tenant domains[\s\S]*?const KNOWN_TENANTS:[\s\S]*?\}[\s\S]*?\}[\s\S]*?\}\s*\n\s*\/\/ Tenant lookup failed[\s\S]*?\}\s*\n\s*\}/m
  // Simpler approach: anchor on the unique `const KNOWN_TENANTS:` line and the unique pure-ASCII closing comment.
  // Use a different regex that anchors on the pure-ASCII start + end markers.
  const knownTenantsBlockStart = content.indexOf('const KNOWN_TENANTS:')
  if (knownTenantsBlockStart !== -1) {
    // Find the matching ComprehensiveHomePage function's first `if (tenantId) {` block. We need to replace
    // from `// Known tenant domains` (comment line above the const) through the closing `}` of `if (tenantId) {`.
    // Find boundaries by structural anchors.
    const startMarker = '// Known tenant domains resolved via tenant.default_agent_id (matches middleware pattern)'
    const startIdx = content.indexOf(startMarker)
    if (startIdx === -1) {
      console.log('WARN: KNOWN_TENANTS start marker not found')
    } else {
      // End marker: the closing `}` of the `if (tenantId) {` block, identifiable by the pure-ASCII line above it
      // "  // Tenant lookup failed for a known domain ..."
      const endMarkerLine = "    console.error('[comprehensive-site] Known tenant domain but default_agent_id lookup failed:', { host, tenantId })"
      const endIdx = content.indexOf(endMarkerLine)
      if (endIdx === -1) {
        console.log('WARN: KNOWN_TENANTS end marker not found')
      } else {
        // Find the closing `}` after endMarkerLine -- two close braces (close console.error parens + close if block)
        const restAfter = content.substring(endIdx)
        const ifBlockCloseIdx = restAfter.indexOf('\n  }')
        if (ifBlockCloseIdx === -1) {
          console.log('WARN: KNOWN_TENANTS if-block close not found')
        } else {
          const replaceEnd = endIdx + ifBlockCloseIdx + 4 // include the `\n  }`
          const replacement = `// C7/D11 -- KNOWN_TENANTS static host map removed; DB lookup via getTenantByHost handles all tenants generically.

  // C7/D11 -- resolve tenant by host via single DB-backed helper.
  const { createClient } = await import('@/lib/supabase/server')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const supabase = createClient()
  const tenant = await getTenantByHost(supabase, host)

  if (tenant) {
    const { data: tenantDetail, error: tenantErr } = await supabase
      .from('tenants')
      .select('default_agent_id, homepage_layout')
      .eq('id', tenant.id)
      .eq('is_active', true)
      .single()

    if (!tenantErr && tenantDetail?.default_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', tenantDetail.default_agent_id)
        .eq('is_active', true)
        .single()

      if (agent) {
        const agentProps = {...agent, is_active: true}
        const layout = tenantDetail?.homepage_layout ?? 'v1'
        return layout === 'v2'
          ? <HomePageComprehensiveV2 agent={agentProps} />
          : <HomePageComprehensive agent={agentProps} />
      }
    }
    console.error('[comprehensive-site] tenant by host resolved but default_agent_id lookup failed:', { host, tenantId: tenant.id })
  }`
          content = content.substring(0, startIdx) + replacement + content.substring(replaceEnd)
          console.log('Replaced KNOWN_TENANTS block in comprehensive-site/page.tsx')
        }
      }
    }
  } else {
    console.log('KNOWN_TENANTS already removed from comprehensive-site/page.tsx')
  }

  fs.writeFileSync(fullPath, content, 'utf8')
}

// ===== FILE: app/og/route.tsx =====
// Pure ASCII anchors throughout. No em-dashes in this file.
patchFile(
  'app/og/route.tsx',
  [
    {
      find: `import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(`,
      replace: `import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// C7/D12 -- OG image is now tenant-aware. Reads host from request header
// and renders the tenant brand/domain in the image.
async function fetchTenantBrand(host: string | null): Promise<{ name: string, domain: string } | null> {
  if (!host) return null
  const cleanHost = host.replace(/^www\\./, '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  try {
    const resp = await fetch(
      ` + '`${supabaseUrl}/rest/v1/tenants?domain=eq.${encodeURIComponent(cleanHost)}&is_active=eq.true&select=name,brand_name,domain`' + `,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': ` + '`Bearer ${supabaseKey}`' + `,
          'Accept': 'application/json',
        },
      }
    )
    if (!resp.ok) return null
    const rows = await resp.json() as Array<{ name: string | null, brand_name: string | null, domain: string | null }>
    const row = rows[0]
    if (!row || !row.domain) return null
    const name = row.brand_name || row.name
    if (!name) return null
    return { name, domain: row.domain }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const host = req.headers.get('host')
  const tenant = await fetchTenantBrand(host)
  const brandName = tenant?.name || 'AI Real Estate'
  const displayDomain = tenant?.domain || ''

  return new ImageResponse(`,
    },
    {
      // The static 'walliam.ca' rendered text -- pure ASCII anchor
      find: `        {/* URL */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', fontSize: '22px', color: 'rgba(59,130,246,0.7)', display: 'flex' }}>
          walliam.ca
        </div>`,
      replace: `        {/* URL -- C7/D12 tenant-derived */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', fontSize: '22px', color: 'rgba(59,130,246,0.7)', display: 'flex' }}>
          {displayDomain}
        </div>`,
    },
    {
      find: `          <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>leads</span>`,
      replace: `          <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>{brandName}</span>`,
    },
  ],
  'D12: OG route tenant-aware',
  'C7/D12 -- OG image is now tenant-aware'
)

console.log('\n=== C7 v2 patch complete ===')