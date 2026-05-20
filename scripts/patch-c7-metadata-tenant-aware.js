// scripts/patch-c7-metadata-tenant-aware.js
// C7 - Root layout + comprehensive-site + OG metadata + OG route tenant-aware
// Defects retired: D10, D11, D12
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
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath + ':\n' + edit.find)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ===== FILE 1: lib/utils/tenant-brand.ts -- extend TenantContext + add getTenantByHost =====
patchFile(
  'lib/utils/tenant-brand.ts',
  [
    // Extend TenantContext type with id and name
    {
      find: `export interface TenantContext {
  sourceKey: string
  brandName: string
  domain: string
}`,
      replace: `export interface TenantContext {
  id: string
  sourceKey: string
  brandName: string
  domain: string
  name: string
}`,
    },
    // Update getTenantContext to populate the new fields
    {
      find: `  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('source_key, brand_name, name, domain')
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !tenant?.source_key || !tenant?.domain) return null

  const brandName = tenant.brand_name || tenant.name
  if (!brandName) return null

  return {
    sourceKey: tenant.source_key,
    brandName,
    domain: tenant.domain,
  }
}`,
      replace: `  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, source_key, brand_name, name, domain')
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !tenant?.id || !tenant?.source_key || !tenant?.domain) return null

  const brandName = tenant.brand_name || tenant.name
  if (!brandName) return null

  return {
    id: tenant.id,
    sourceKey: tenant.source_key,
    brandName,
    domain: tenant.domain,
    name: tenant.name || brandName,
  }
}

// C7/D10-D12 -- single source of truth for host-based tenant resolution
// Used by root layout metadata, comprehensive-site metadata + page, /og route.
// Dev fallback: when host is localhost or vercel.app preview, uses DEV_TENANT_DOMAIN.
export async function getTenantByHost(
  supabase: SupabaseClient,
  host: string | null | undefined
): Promise<TenantContext | null> {
  if (!host) return null

  // Dev / preview fallback -- match getWalliamTenantId behavior
  let lookupDomain: string
  if (host.includes('localhost') || host.includes('vercel.app')) {
    const devDomain = process.env.DEV_TENANT_DOMAIN
    if (!devDomain) return null
    lookupDomain = devDomain
  } else {
    lookupDomain = host.replace(/^www\\./, '')
  }

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, source_key, brand_name, name, domain')
    .eq('domain', lookupDomain)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !tenant?.id || !tenant?.source_key || !tenant?.domain) return null

  const brandName = tenant.brand_name || tenant.name
  if (!brandName) return null

  return {
    id: tenant.id,
    sourceKey: tenant.source_key,
    brandName,
    domain: tenant.domain,
    name: tenant.name || brandName,
  }
}`,
    },
  ],
  'C7: tenant-brand.ts + getTenantByHost helper',
  'export async function getTenantByHost('
)

// ===== FILE 2: app/layout.tsx -- replace static metadata with generateMetadata =====
patchFile(
  'app/layout.tsx',
  [
    {
      find: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout"
import TenantHeader from "@/components/TenantHeader";
import { AuthProvider } from "@/components/auth/AuthContext";
import { CreditSessionProvider } from "@/components/credits/CreditSessionContext";
import { getWalliamTenantId } from "@/lib/utils/is-walliam";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WALLiam â€” AI Real Estate Assistant",
  description: "Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert.",
  openGraph: {
    title: "WALLiam â€” AI Real Estate Assistant",
    description: "Browse â†’ Get an AI plan â†’ Lead Captured. Powered by WALLiam AI.",
    url: "https://walliam.ca",
    siteName: "WALLiam",
    type: "website",
    images: [{ url: "https://walliam.ca/og-walliam.png", width: 1200, height: 630 }],
  },
};`,
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

// C7/D10 -- root metadata is now per-tenant (was: static WALLiam-only metadata for every page).
// Reads host header at request time, resolves tenant config, builds metadata.
// Falls back to a generic title when host has no matching tenant (build-time SSG safety).
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

    const url = \`https://\${tenant.domain}\`
    const ogImageUrl = \`\${url}/og\`
    const title = \`\${tenant.name} - AI Real Estate Assistant\`
    const description = \`Browse properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by \${tenant.name} AI.\`

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
  ],
  'C7/D10: root layout generateMetadata',
  'C7/D10 -- root metadata is now per-tenant'
)

// ===== FILE 3: app/comprehensive-site/page.tsx =====
patchFile(
  'app/comprehensive-site/page.tsx',
  [
    // Replace the entire hardcoded WALLiam branch in generateMetadata with tenant-driven
    {
      find: `export async function generateMetadata(): Promise<Metadata> {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\\./, '')
  
  if (cleanHost === 'walliam.ca') {
    return {
      title: 'WALLiam â€” AI Real Estate Assistant for the GTA',
      description: 'Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by WALLiam AI.',
      openGraph: {
        title: 'WALLiam â€” AI Real Estate Assistant',
        description: 'Get your personalized real estate plan in minutes. Browse â†’ Get an AI plan â†’ Lead Captured.',
        url: 'https://walliam.ca',
        siteName: 'WALLiam',
        type: 'website',
        images: [{ url: 'https://walliam.ca/og-walliam.png', width: 1200, height: 630, alt: 'WALLiam AI Real Estate' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'WALLiam â€” AI Real Estate Assistant',
        description: 'Get your personalized real estate plan in minutes.',
        images: ['https://walliam.ca/og-walliam.png'],
      },
    }
  }
  return {
    title: 'AI Real Estate Assistant',
    description: 'Your AI-powered real estate platform.',
  }
}`,
      replace: `// C7/D11 -- comprehensive-site metadata is now per-tenant (was: hardcoded WALLiam branch).
export async function generateMetadata(): Promise<Metadata> {
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

    const url = \`https://\${tenant.domain}\`
    const ogImageUrl = \`\${url}/og\`
    const title = \`\${tenant.name} - AI Real Estate Assistant for the GTA\`
    const description = \`Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by \${tenant.name} AI.\`
    const ogTitle = \`\${tenant.name} - AI Real Estate Assistant\`
    const ogDescription = \`Get your personalized real estate plan in minutes.\`

    return {
      title,
      description,
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        url,
        siteName: tenant.name,
        type: 'website',
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: \`\${tenant.name} AI Real Estate\` }],
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
}`,
    },
    // Replace KNOWN_TENANTS-based fast path with DB lookup via getTenantByHost
    {
      find: `// Known tenant domains resolved via tenant.default_agent_id (matches middleware pattern)
const KNOWN_TENANTS: Record<string, string> = {
  'walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
}

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\\./, '')

  // FAST PATH: known tenant domain â€” resolve via tenant.default_agent_id
  const tenantId = KNOWN_TENANTS[cleanHost] || KNOWN_TENANTS[host]
  if (tenantId) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('default_agent_id, homepage_layout')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    if (!tenantErr && tenant?.default_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', tenant.default_agent_id)
        .eq('is_active', true)
        .single()

      if (agent) {
        const agentProps = {...agent, is_active: true}
        const layout = tenant?.homepage_layout ?? 'v1'
        return layout === 'v2'
          ? <HomePageComprehensiveV2 agent={agentProps} />
          : <HomePageComprehensive agent={agentProps} />
      }
    }
    // Tenant lookup failed for a known domain â€” log and fall through to default path
    console.error('[comprehensive-site] Known tenant domain but default_agent_id lookup failed:', { host, tenantId })
  }`,
      replace: `// C7/D11 -- KNOWN_TENANTS static host map removed; DB lookup via getTenantByHost handles all tenants generically.

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''

  // C7/D11 -- resolve tenant by host via single DB-backed helper (was: static KNOWN_TENANTS map).
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
  }`,
    },
  ],
  'C7/D11: comprehensive-site tenant-aware',
  'C7/D11 -- comprehensive-site metadata is now per-tenant'
)

// ===== FILE 4: app/og/route.tsx -- tenant-aware dynamic OG image =====
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

// C7/D12 -- OG image is now tenant-aware. Reads host from request header and
// renders the tenant's brand/domain in the image. When host is unknown the
// image renders with a generic platform identity.
//
// NOTE: this route uses fetch() directly (not @supabase/supabase-js) because
// it runs at the edge. Imports of the Supabase client would pull in Node-only
// modules.
async function fetchTenantBrand(host: string | null): Promise<{ name: string, domain: string } | null> {
  if (!host) return null
  const cleanHost = host.replace(/^www\\./, '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  try {
    const resp = await fetch(
      \`\${supabaseUrl}/rest/v1/tenants?domain=eq.\${encodeURIComponent(cleanHost)}&is_active=eq.true&select=name,brand_name,domain\`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': \`Bearer \${supabaseKey}\`,
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
      find: `        {/* URL */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', fontSize: '22px', color: 'rgba(59,130,246,0.7)', display: 'flex' }}>
          walliam.ca
        </div>`,
      replace: `        {/* URL -- C7/D12 tenant-derived */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', fontSize: '22px', color: 'rgba(59,130,246,0.7)', display: 'flex' }}>
          {displayDomain}
        </div>`,
    },
    // Replace the static 'leads' brand text with tenant-aware brand name
    {
      find: `          <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>leads</span>`,
      replace: `          <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>{brandName}</span>`,
    },
  ],
  'C7/D12: OG route tenant-aware',
  'C7/D12 -- OG image is now tenant-aware'
)

console.log('\n=== C7 patch complete ===')