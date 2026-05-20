// scripts/patch-c8a-fix-4-finish.js
// C8a fix-4 - Finish the partial C8a-fix-3 patch.
// State at entry: WalliamCTA restored, WalliamCTAClient deleted, HomePropertyPageClient Props
// has assistantName. Remaining: destructure + callsites in 2 client comps, plus tenant fetch +
// JSX prop in 3 server parents + 5 direct-render server pages.

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function detectLineEnding(content) { return content.includes('\r\n') ? '\r\n' : '\n' }

// Replace ALL occurrences of a string, idempotent if marker already present.
function replaceAllInFile(relPath, find, replaceStr, label) {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) { console.log('SKIP ' + relPath + ' [' + label + '] -- file missing'); return }
  let content = fs.readFileSync(fullPath, 'utf8')
  if (content.includes(replaceStr) && !content.includes(find)) {
    console.log('SKIP ' + relPath + ' [' + label + '] -- already replaced')
    return
  }
  if (!content.includes(find)) {
    console.log('SKIP ' + relPath + ' [' + label + '] -- find string absent (likely already done)')
    return
  }
  const count = content.split(find).length - 1
  // Replace all
  content = content.split(find).join(replaceStr)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' [' + label + '] -- ' + count + ' occurrence(s) replaced')
}

// Single-occurrence replace, idempotent.
function replaceOnceInFile(relPath, find, replaceStr, label) {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) { console.log('SKIP ' + relPath + ' [' + label + '] -- file missing'); return }
  let content = fs.readFileSync(fullPath, 'utf8')
  if (content.includes(replaceStr.substring(0, Math.min(80, replaceStr.length)))) {
    // Check for the replacement marker (use a slice to avoid trivial substring conflicts)
    const replaceMarker = replaceStr.substring(0, Math.min(80, replaceStr.length))
    if (content.includes(replaceMarker) && !content.includes(find)) {
      console.log('SKIP ' + relPath + ' [' + label + '] -- already done')
      return
    }
  }
  if (!content.includes(find)) {
    console.log('SKIP ' + relPath + ' [' + label + '] -- find string absent')
    return
  }
  const count = content.split(find).length - 1
  if (count > 1) throw new Error('Found ' + count + ' occurrences (expected 1) in ' + relPath + ' [' + label + ']')
  content = content.replace(find, replaceStr)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' [' + label + '] -- 1 occurrence replaced')
}

// ===== STEP 2 (remainder): client components -- destructure + callsites =====

// HomePropertyPageClient: destructure
replaceOnceInFile(
  'app/property/[id]/HomePropertyPageClient.tsx',
  `}: HomePropertyPageClientProps) {`,
  `  assistantName,
}: HomePropertyPageClientProps) {`,
  'HomePropertyPageClient destructure'
)

// HomePropertyPageClient: BOTH WalliamCTA callsites (identical strings)
replaceAllInFile(
  'app/property/[id]/HomePropertyPageClient.tsx',
  `                  <WalliamCTA context={listing.unparsed_address} />`,
  `                  <WalliamCTA context={listing.unparsed_address} assistantName={assistantName} />`,
  'HomePropertyPageClient CTA callsites'
)

// PropertyPageClient: Props interface (add assistantName field)
replaceOnceInFile(
  'app/property/[id]/PropertyPageClient.tsx',
  `interface PropertyPageClientProps {`,
  `interface PropertyPageClientProps {
  assistantName: string`,
  'PropertyPageClient Props.assistantName'
)

// PropertyPageClient: destructure
replaceOnceInFile(
  'app/property/[id]/PropertyPageClient.tsx',
  `}: PropertyPageClientProps) {`,
  `  assistantName,
}: PropertyPageClientProps) {`,
  'PropertyPageClient destructure'
)

// PropertyPageClient: BOTH WalliamCTA callsites
replaceAllInFile(
  'app/property/[id]/PropertyPageClient.tsx',
  `                  <WalliamCTA context={building?.building_name} />`,
  `                  <WalliamCTA context={building?.building_name} assistantName={assistantName} />`,
  'PropertyPageClient CTA callsites'
)

// ===== STEP 3: 3 server parents that render the 2 client components =====

function addTenantFetchToServerPage(relPath, jsxAnchor, importAnchor, importBlock) {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) { console.log('SKIP ' + relPath + ' -- file missing'); return }
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  // Idempotency
  if (content.includes('const assistantName = ')) {
    console.log('SKIP ' + relPath + ' -- already has assistantName')
    return
  }

  // 1) Add imports above the existing import line (if not already present)
  if (!content.includes('getTenantByHost')) {
    if (!content.includes(importAnchor)) throw new Error('Import anchor not found in ' + relPath + ': ' + importAnchor)
    content = content.replace(importAnchor, importAnchor + (LE === '\r\n' ? '\r\n' : '\n') + importBlock.replace(/\n/g, LE === '\r\n' ? '\r\n' : '\n'))
  }

  // 2) Locate JSX block; insert tenant-fetch before the `return (` that wraps it
  if (!content.includes(jsxAnchor)) throw new Error('JSX anchor not found in ' + relPath + ': ' + jsxAnchor)
  const jsxIdx = content.indexOf(jsxAnchor)
  // Walk backward to find the most recent `return (` at a lower indent
  let returnIdx = content.lastIndexOf('return (', jsxIdx)
  if (returnIdx === -1) throw new Error('return ( not found before JSX anchor in ' + relPath)
  // Walk backward from returnIdx to the start of the line containing return (
  let lineStart = content.lastIndexOf('\n', returnIdx - 1) + 1
  const indent = content.substring(lineStart, returnIdx)
  const nl = LE === '\r\n' ? '\r\n' : '\n'
  const tenantBlock =
    `${indent}// C8a/D13 -- tenant for assistantName threading${nl}` +
    `${indent}const _c8a_host = headers().get('host')${nl}` +
    `${indent}const _c8a_supabase = createTenantClient()${nl}` +
    `${indent}const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)${nl}` +
    `${indent}const assistantName = _c8a_tenant?.name || 'Charlie'${nl}${nl}`
  content = content.substring(0, lineStart) + tenantBlock + content.substring(lineStart)

  // 3) Add assistantName prop to the JSX
  const newJsx = jsxAnchor.replace(
    /<(HomePropertyPageClient|PropertyPageClient)/,
    (match, comp) => `<${comp}\n${indent}  assistantName={assistantName}`
  )
  content = content.replace(jsxAnchor, newJsx)

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- tenant fetch + JSX prop')
}

// 3a: HomePropertyPage.tsx
addTenantFetchToServerPage(
  'app/property/[id]/HomePropertyPage.tsx',
  `<HomePropertyPageClient`,
  `import HomePropertyPageClient from './HomePropertyPageClient'`,
  `import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'`
)

// 3b: app/property/[id]/page.tsx
addTenantFetchToServerPage(
  'app/property/[id]/page.tsx',
  `<PropertyPageClient`,
  `import PropertyPageClient from './PropertyPageClient'`,
  `import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'`
)

// 3c: app/[slug]/PropertyPageContent.tsx (already has createClient + supabaseServer)
{
  const relPath = 'app/[slug]/PropertyPageContent.tsx'
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (content.includes('const assistantName = ')) {
    console.log('SKIP ' + relPath + ' -- already has assistantName')
  } else {
    const importAnchor = `import { getWalliamTenantId } from '@/lib/utils/is-walliam'`
    if (!content.includes('getTenantByHost')) {
      const importBlock = (LE === '\r\n' ? '\r\n' : '\n') + `import { headers } from 'next/headers'\nimport { getTenantByHost } from '@/lib/utils/tenant-brand'`.replace(/\n/g, LE === '\r\n' ? '\r\n' : '\n')
      content = content.replace(importAnchor, importAnchor + importBlock)
    }
    const jsxAnchor = `<PropertyPageClient`
    const jsxIdx = content.indexOf(jsxAnchor)
    const returnIdx = content.lastIndexOf('return (', jsxIdx)
    const lineStart = content.lastIndexOf('\n', returnIdx - 1) + 1
    const indent = content.substring(lineStart, returnIdx)
    const nl = LE === '\r\n' ? '\r\n' : '\n'
    const tenantBlock =
      `${indent}// C8a/D13 -- tenant for assistantName threading${nl}` +
      `${indent}const _c8a_host = headers().get('host')${nl}` +
      `${indent}const _c8a_tenant = await getTenantByHost(supabaseServer, _c8a_host)${nl}` +
      `${indent}const assistantName = _c8a_tenant?.name || 'Charlie'${nl}${nl}`
    content = content.substring(0, lineStart) + tenantBlock + content.substring(lineStart)
    // Add assistantName prop to JSX
    content = content.replace(jsxAnchor, `${jsxAnchor}\n${indent}  assistantName={assistantName}`)
    fs.writeFileSync(fullPath, content, 'utf8')
    console.log('Patched ' + relPath + ' -- tenant fetch + JSX prop')
  }
}

// ===== STEP 4: 5 direct-render server pages -- imports + tenant-fetch + CTA prop =====

function addTenantFetchToDirectCallerPage(relPath, ctaPattern, ctaReplacement) {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) { console.log('SKIP ' + relPath + ' -- file missing'); return }
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (content.includes('const assistantName = ') && content.includes('assistantName={assistantName}')) {
    console.log('SKIP ' + relPath + ' -- already done')
    return
  }

  // 1) Imports (find first import line, prepend our 3 imports above it)
  if (!content.includes('getTenantByHost')) {
    const firstImportMatch = content.match(/^import [^\n]+/m)
    if (!firstImportMatch) throw new Error('No top-level import in ' + relPath)
    const nl = LE === '\r\n' ? '\r\n' : '\n'
    const importBlock = `import { headers } from 'next/headers'\nimport { createClient as createTenantClient } from '@/lib/supabase/server'\nimport { getTenantByHost } from '@/lib/utils/tenant-brand'\n`.replace(/\n/g, nl)
    content = content.replace(firstImportMatch[0], importBlock + firstImportMatch[0])
  }

  // 2) CTA replacement
  if (!content.includes(ctaPattern)) {
    console.log('  CTA pattern not found -- may already be replaced for ' + relPath)
  } else {
    content = content.split(ctaPattern).join(ctaReplacement)
  }

  // 3) Tenant fetch before return statement that contains the CTA
  const ctaIdx = content.indexOf(ctaReplacement)
  const returnIdx = content.lastIndexOf('return (', ctaIdx)
  if (returnIdx === -1) throw new Error('No return ( found before CTA in ' + relPath)
  const lineStart = content.lastIndexOf('\n', returnIdx - 1) + 1
  const indent = content.substring(lineStart, returnIdx)
  const nl = LE === '\r\n' ? '\r\n' : '\n'
  const tenantBlock =
    `${indent}// C8a/D13 -- tenant for assistantName threading${nl}` +
    `${indent}const _c8a_host = headers().get('host')${nl}` +
    `${indent}const _c8a_supabase = createTenantClient()${nl}` +
    `${indent}const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)${nl}` +
    `${indent}const assistantName = _c8a_tenant?.name || 'Charlie'${nl}${nl}`
  content = content.substring(0, lineStart) + tenantBlock + content.substring(lineStart)

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' -- direct CTA caller')
}

addTenantFetchToDirectCallerPage(
  'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  `<WalliamCTA context={neighbourhood.name} />`,
  `<WalliamCTA context={neighbourhood.name} assistantName={assistantName} />`
)

addTenantFetchToDirectCallerPage(
  'app/[slug]/AreaPage.tsx',
  `<WalliamCTA context={area.name} />`,
  `<WalliamCTA context={area.name} assistantName={assistantName} />`
)

addTenantFetchToDirectCallerPage(
  'app/[slug]/BuildingPage.tsx',
  `<WalliamCTA context={building.building_name} />`,
  `<WalliamCTA context={building.building_name} assistantName={assistantName} />`
)

addTenantFetchToDirectCallerPage(
  'app/[slug]/CommunityPage.tsx',
  `<WalliamCTA context={community.name} />`,
  `<WalliamCTA context={community.name} assistantName={assistantName} />`
)

addTenantFetchToDirectCallerPage(
  'app/[slug]/MunicipalityPage.tsx',
  `<WalliamCTA context={municipality.name} />`,
  `<WalliamCTA context={municipality.name} assistantName={assistantName} />`
)

console.log('\n=== C8a fix-4 complete ===')