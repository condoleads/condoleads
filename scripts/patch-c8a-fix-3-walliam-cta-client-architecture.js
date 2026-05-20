// scripts/patch-c8a-fix-3-walliam-cta-client-architecture.js
// C8a fix-3 - Revert WalliamCTA to client component; delete WalliamCTAClient;
// thread assistantName through 2 client components + their 3 server parents +
// add prop to 5 server pages that render <WalliamCTA> directly.
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
  if (!fs.existsSync(fullPath)) {
    console.log('SKIP ' + relPath + ' -- file does not exist')
    return
  }
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched (marker found)')
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

// ===== STEP 1: Restore WalliamCTA.tsx as client component =====
// Strategy: copy WalliamCTAClient.tsx content into WalliamCTA.tsx (function renamed),
// then delete WalliamCTAClient.tsx.
{
  const ctaPath = path.join(ROOT, 'components/WalliamCTA.tsx')
  const clientPath = path.join(ROOT, 'components/WalliamCTAClient.tsx')

  // Idempotency check: if WalliamCTA already 'use client' and contains the markers, skip
  if (fs.existsSync(ctaPath)) {
    const existing = fs.readFileSync(ctaPath, 'utf8')
    if (existing.startsWith("'use client'") && existing.includes('export default function WalliamCTA(')) {
      console.log('SKIP components/WalliamCTA.tsx -- already client component')
    } else {
      if (!fs.existsSync(clientPath)) {
        throw new Error('Cannot restore WalliamCTA: WalliamCTAClient.tsx missing')
      }
      let clientContent = fs.readFileSync(clientPath, 'utf8')
      const LE = detectLineEnding(clientContent)
      // Rename function from WalliamCTAClient back to WalliamCTA
      clientContent = clientContent.replace(
        'export default function WalliamCTAClient(',
        'export default function WalliamCTA('
      )
      // Update the file-header comment if present (the original had a WalliamCTA comment)
      clientContent = clientContent.replace(
        /\/\/ WalliamCTA[^\n]*\n/,
        '// WalliamCTA -- drop into any page to show Buyer/Seller Plan CTAs + AI search\n// Fully decoupled: dispatches charlie:open event only, no direct imports\n// C8a/D13 -- assistantName required prop (AI-action copy uses tenant assistant_name)\n'
      )
      fs.writeFileSync(ctaPath, clientContent, 'utf8')
      console.log('Restored components/WalliamCTA.tsx as client component (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ')')
    }
  }

  if (fs.existsSync(clientPath)) {
    fs.unlinkSync(clientPath)
    console.log('Deleted components/WalliamCTAClient.tsx')
  } else {
    console.log('SKIP delete WalliamCTAClient.tsx -- already absent')
  }
}

// ===== STEP 2: Update 2 client components -- add assistantName prop =====

patchFile(
  'app/property/[id]/HomePropertyPageClient.tsx',
  [
    {
      find: `interface HomePropertyPageClientProps {`,
      replace: `interface HomePropertyPageClientProps {
  assistantName: string`,
    },
  ],
  'C8a-fix-3 HomePropertyPageClient Props.assistantName',
  '  assistantName: string'
)

patchFile(
  'app/property/[id]/HomePropertyPageClient.tsx',
  [
    {
      // Function signature -- add assistantName to destructure.
      // The destructure spans multiple lines (line 48 starts the function, line 64 closes the param list).
      // Anchor on the closing of the destructure pattern + ': HomePropertyPageClientProps'
      find: `}: HomePropertyPageClientProps) {`,
      replace: `  assistantName,
}: HomePropertyPageClientProps) {`,
    },
    // Both <WalliamCTA context=...> callsites get assistantName
    {
      find: `                  <WalliamCTA context={listing.unparsed_address} />`,
      replace: `                  <WalliamCTA context={listing.unparsed_address} assistantName={assistantName} />`,
    },
  ],
  'C8a-fix-3 HomePropertyPageClient destructure + 2 callsites',
  '  assistantName,'
)

// HomePropertyPageClient has TWO identical WalliamCTA callsites -- after the first replace,
// the second instance still exists. Run a second patch to handle the second (now-unique) one.
{
  const fullPath = path.join(ROOT, 'app/property/[id]/HomePropertyPageClient.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')
  const oldStr = `                  <WalliamCTA context={listing.unparsed_address} />`
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, `                  <WalliamCTA context={listing.unparsed_address} assistantName={assistantName} />`)
    fs.writeFileSync(fullPath, content, 'utf8')
    console.log('Patched HomePropertyPageClient -- 2nd WalliamCTA callsite')
  } else {
    console.log('SKIP HomePropertyPageClient 2nd callsite -- already absent')
  }
}

patchFile(
  'app/property/[id]/PropertyPageClient.tsx',
  [
    {
      find: `interface PropertyPageClientProps {`,
      replace: `interface PropertyPageClientProps {
  assistantName: string`,
    },
  ],
  'C8a-fix-3 PropertyPageClient Props.assistantName',
  '  assistantName: string'
)

patchFile(
  'app/property/[id]/PropertyPageClient.tsx',
  [
    {
      find: `}: PropertyPageClientProps) {`,
      replace: `  assistantName,
}: PropertyPageClientProps) {`,
    },
    {
      find: `                  <WalliamCTA context={building?.building_name} />`,
      replace: `                  <WalliamCTA context={building?.building_name} assistantName={assistantName} />`,
    },
  ],
  'C8a-fix-3 PropertyPageClient destructure + 1st callsite',
  '  assistantName,'
)

// 2nd WalliamCTA callsite in PropertyPageClient
{
  const fullPath = path.join(ROOT, 'app/property/[id]/PropertyPageClient.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')
  const oldStr = `                  <WalliamCTA context={building?.building_name} />`
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, `                  <WalliamCTA context={building?.building_name} assistantName={assistantName} />`)
    fs.writeFileSync(fullPath, content, 'utf8')
    console.log('Patched PropertyPageClient -- 2nd WalliamCTA callsite')
  } else {
    console.log('SKIP PropertyPageClient 2nd callsite -- already absent')
  }
}

// ===== STEP 3: 3 server parent pages -- fetch tenant + thread assistantName to client =====

// 3a: app/property/[id]/HomePropertyPage.tsx
patchFile(
  'app/property/[id]/HomePropertyPage.tsx',
  [
    // Add imports + fetch tenant
    // Anchor on the existing import line for HomePropertyPageClient
    {
      find: `import HomePropertyPageClient from './HomePropertyPageClient'`,
      replace: `import HomePropertyPageClient from './HomePropertyPageClient'
import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'`,
    },
    // Pass assistantName to client. Anchor on the unique JSX prop pattern.
    {
      find: `        <HomePropertyPageClient
          listing={listing}`,
      replace: `        <HomePropertyPageClient
          assistantName={assistantName}
          listing={listing}`,
    },
  ],
  'C8a-fix-3 HomePropertyPage imports + JSX prop',
  'C8a/D13 -- tenant for assistantName threading'
)

// 3a (cont): inject tenant fetch into HomePropertyPage default function body. Read first, then insert.
{
  const fullPath = path.join(ROOT, 'app/property/[id]/HomePropertyPage.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)
  if (content.includes('const assistantName = ')) {
    console.log('SKIP HomePropertyPage tenant fetch -- already present')
  } else {
    // Insert tenant-fetch immediately before the JSX return. Anchor on the unique JSX wrapper line.
    const anchorOriginal = `      <main className="min-h-screen bg-gray-50">
        <HomePropertyPageClient`
    const anchorNormalized = LE === '\r\n' ? anchorOriginal.replace(/\n/g, '\r\n') : anchorOriginal
    if (content.includes(anchorNormalized)) {
      const insertion = `      {/* C8a/D13 -- tenant for assistantName threading */}
      {/* tenant-fetch happens above the JSX return; see const assistantName declaration */}
      <main className="min-h-screen bg-gray-50">
        <HomePropertyPageClient`
      // Actually need to insert BEFORE the return statement. Find the return statement.
      // Pattern: a single `return (` line preceding the JSX block.
      const returnMatch = content.match(/(\n)([ \t]+)return \(\s*\n([ \t]+)<main className="min-h-screen bg-gray-50">/)
      if (returnMatch) {
        const indent = returnMatch[2]
        const before = content.substring(0, returnMatch.index + 1)
        const after = content.substring(returnMatch.index + 1)
        const tenantBlock = `${indent}// C8a/D13 -- tenant for assistantName threading\n${indent}const _c8a_host = headers().get('host')\n${indent}const _c8a_supabase = createTenantClient()\n${indent}const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)\n${indent}const assistantName = _c8a_tenant?.name || 'Charlie'\n\n`
        content = before + tenantBlock + after
        fs.writeFileSync(fullPath, content, 'utf8')
        console.log('Inserted tenant-fetch into HomePropertyPage')
      } else {
        throw new Error('HomePropertyPage: could not find return statement anchor for tenant-fetch insertion')
      }
    } else {
      throw new Error('HomePropertyPage: JSX anchor not found')
    }
  }
}

// 3b: app/property/[id]/page.tsx
patchFile(
  'app/property/[id]/page.tsx',
  [
    {
      find: `import PropertyPageClient from './PropertyPageClient'`,
      replace: `import PropertyPageClient from './PropertyPageClient'
import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'`,
    },
    {
      find: `      <PropertyPageClient
        listing={listing}`,
      replace: `      <PropertyPageClient
        assistantName={assistantName}
        listing={listing}`,
    },
  ],
  'C8a-fix-3 page.tsx imports + JSX prop',
  'C8a/D13 -- tenant for assistantName threading'
)

{
  const fullPath = path.join(ROOT, 'app/property/[id]/page.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')
  if (content.includes('const assistantName = ')) {
    console.log('SKIP page.tsx tenant fetch -- already present')
  } else {
    const returnMatch = content.match(/(\n)([ \t]+)return \(\s*\n([ \t]+)<main className="min-h-screen bg-gray-50">\s*\n\s+<PropertyPageClient/)
    if (returnMatch) {
      const indent = returnMatch[2]
      const before = content.substring(0, returnMatch.index + 1)
      const after = content.substring(returnMatch.index + 1)
      const tenantBlock = `${indent}// C8a/D13 -- tenant for assistantName threading\n${indent}const _c8a_host = headers().get('host')\n${indent}const _c8a_supabase = createTenantClient()\n${indent}const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)\n${indent}const assistantName = _c8a_tenant?.name || 'Charlie'\n\n`
      content = before + tenantBlock + after
      fs.writeFileSync(fullPath, content, 'utf8')
      console.log('Inserted tenant-fetch into page.tsx')
    } else {
      throw new Error('page.tsx: could not find return statement anchor for tenant-fetch insertion')
    }
  }
}

// 3c: app/[slug]/PropertyPageContent.tsx (already has createClient imported as 'createClient'; reuse)
patchFile(
  'app/[slug]/PropertyPageContent.tsx',
  [
    {
      find: `import { getWalliamTenantId } from '@/lib/utils/is-walliam'`,
      replace: `import { getWalliamTenantId } from '@/lib/utils/is-walliam'
import { headers } from 'next/headers'
import { getTenantByHost } from '@/lib/utils/tenant-brand'`,
    },
    {
      find: `      <PropertyPageClient
        listing={listingWithBuilding}`,
      replace: `      <PropertyPageClient
        assistantName={assistantName}
        listing={listingWithBuilding}`,
    },
  ],
  'C8a-fix-3 PropertyPageContent imports + JSX prop',
  'C8a/D13 -- tenant for assistantName threading'
)

{
  const fullPath = path.join(ROOT, 'app/[slug]/PropertyPageContent.tsx')
  let content = fs.readFileSync(fullPath, 'utf8')
  if (content.includes('const assistantName = ')) {
    console.log('SKIP PropertyPageContent tenant fetch -- already present')
  } else {
    // PropertyPageContent already creates supabaseServer; reuse it for the tenant lookup.
    // Anchor on the return statement preceding the JSX render.
    const returnMatch = content.match(/(\n)([ \t]+)return \(\s*\n([ \t]+)<main className="min-h-screen bg-slate-50">/)
    if (returnMatch) {
      const indent = returnMatch[2]
      const before = content.substring(0, returnMatch.index + 1)
      const after = content.substring(returnMatch.index + 1)
      const tenantBlock = `${indent}// C8a/D13 -- tenant for assistantName threading\n${indent}const _c8a_host = headers().get('host')\n${indent}const _c8a_tenant = await getTenantByHost(supabaseServer, _c8a_host)\n${indent}const assistantName = _c8a_tenant?.name || 'Charlie'\n\n`
      content = before + tenantBlock + after
      fs.writeFileSync(fullPath, content, 'utf8')
      console.log('Inserted tenant-fetch into PropertyPageContent')
    } else {
      throw new Error('PropertyPageContent: could not find return statement anchor for tenant-fetch insertion')
    }
  }
}

// ===== STEP 4: 5 server pages that render <WalliamCTA> directly -- fetch tenant + pass prop =====

function patchDirectServerCaller(relPath, ctaAnchorOld, ctaAnchorNew, returnRegex, returnIndent) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (content.includes('const assistantName = ') && content.includes('assistantName={assistantName}')) {
    console.log('SKIP ' + relPath + ' -- already patched')
    return
  }

  // Replace the <WalliamCTA ... /> callsite to include assistantName
  if (!content.includes(ctaAnchorOld)) {
    throw new Error('CTA anchor not found in ' + relPath + ':\n' + ctaAnchorOld)
  }
  content = content.replace(ctaAnchorOld, ctaAnchorNew)

  // Insert tenant fetch + import additions
  // Add imports above existing import block: anchor on the first 'import' line
  const firstImportMatch = content.match(/(^|\n)import [^\n]+/)
  if (!firstImportMatch) throw new Error('No import line found in ' + relPath)
  const importBlock = `import { headers } from 'next/headers'\nimport { createClient as createTenantClient } from '@/lib/supabase/server'\nimport { getTenantByHost } from '@/lib/utils/tenant-brand'\n`
  if (!content.includes(`import { getTenantByHost }`)) {
    content = content.replace(firstImportMatch[0], firstImportMatch[0] + '\n' + importBlock)
  }

  // Insert tenant-fetch before return statement
  const returnMatch = content.match(returnRegex)
  if (!returnMatch) throw new Error('Return statement anchor not found in ' + relPath + ' regex=' + returnRegex.source)
  const indent = returnIndent || returnMatch[2] || '  '
  const before = content.substring(0, returnMatch.index + 1)
  const after = content.substring(returnMatch.index + 1)
  const tenantBlock = `${indent}// C8a/D13 -- tenant for assistantName threading\n${indent}const _c8a_host = headers().get('host')\n${indent}const _c8a_supabase = createTenantClient()\n${indent}const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)\n${indent}const assistantName = _c8a_tenant?.name || 'Charlie'\n\n`
  content = before + tenantBlock + after

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- direct server caller')
}

patchDirectServerCaller(
  'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  `          <WalliamCTA context={neighbourhood.name} />`,
  `          <WalliamCTA context={neighbourhood.name} assistantName={assistantName} />`,
  /(\n)([ \t]+)return \(/
)

patchDirectServerCaller(
  'app/[slug]/AreaPage.tsx',
  `            <WalliamCTA context={area.name} />`,
  `            <WalliamCTA context={area.name} assistantName={assistantName} />`,
  /(\n)([ \t]+)return \(/
)

patchDirectServerCaller(
  'app/[slug]/BuildingPage.tsx',
  `                  <WalliamCTA context={building.building_name} />`,
  `                  <WalliamCTA context={building.building_name} assistantName={assistantName} />`,
  /(\n)([ \t]+)return \(/
)

patchDirectServerCaller(
  'app/[slug]/CommunityPage.tsx',
  `            <WalliamCTA context={community.name} />`,
  `            <WalliamCTA context={community.name} assistantName={assistantName} />`,
  /(\n)([ \t]+)return \(/
)

patchDirectServerCaller(
  'app/[slug]/MunicipalityPage.tsx',
  `            <WalliamCTA context={municipality.name} />`,
  `            <WalliamCTA context={municipality.name} assistantName={assistantName} />`,
  /(\n)([ \t]+)return \(/
)

console.log('\n=== C8a-fix-3 complete ===')