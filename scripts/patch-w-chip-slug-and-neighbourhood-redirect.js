// scripts/patch-w-chip-slug-and-neighbourhood-redirect.js
// W-CHIP-SLUG: fix the homepage geo chips that 404 on Toronto sub-district
// neighbourhoods + add a generic neighbourhood -> /toronto/<slug> redirect
// so the dead-URL class is killed for ALL 9 Toronto neighbourhoods (not just
// the 2 chip ones), preserving SEO via permanentRedirect (308).
//
// Three files touched:
//   1. components/home-page/BrowseListingsView.tsx -- chip slug fix (2 chips:
//      north-york + etobicoke now point to /toronto/<slug> directly)
//   2. app/[slug]/page.tsx                         -- neighbourhood redirect
//   3. app/comprehensive-site/[slug]/page.tsx      -- neighbourhood redirect
//
// Verified DB (this session): all 9 neighbourhoods are under Toronto-* munis
// (C01-C15, E01-E11, W01-W10). Redirect target /toronto/<slug> is correct
// for all of them. Works via existing /comprehensive-site/toronto/[neigh]
// route on tenant domains.

const fs = require('fs')
const path = require('path')

const TS = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const ROOT = path.resolve(__dirname, '..')

function backup (relPath) {
  const abs = path.join(ROOT, relPath)
  const bak = abs + '.backup_' + TS
  fs.copyFileSync(abs, bak)
  console.log('  backup:', path.basename(bak))
}
function read (relPath) { return fs.readFileSync(path.join(ROOT, relPath), 'utf8') }
function write (relPath, content) { fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8') }

function replaceExact (content, oldStr, newStr, label) {
  let idx = content.indexOf(oldStr)
  if (idx !== -1) {
    if (content.indexOf(oldStr, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (LF): ' + label)
    return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length)
  }
  const oldCRLF = oldStr.replace(/\r?\n/g, '\r\n')
  const newCRLF = newStr.replace(/\r?\n/g, '\r\n')
  idx = content.indexOf(oldCRLF)
  if (idx !== -1) {
    if (content.indexOf(oldCRLF, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (CRLF): ' + label)
    return content.slice(0, idx) + newCRLF + content.slice(idx + oldCRLF.length)
  }
  throw new Error('ANCHOR NOT FOUND (LF + CRLF): ' + label)
}

function patchFile (relPath, edits) {
  console.log('\n[file]', relPath)
  backup(relPath)
  let c = read(relPath)
  for (const [oldStr, newStr, label] of edits) {
    c = replaceExact(c, oldStr, newStr, label)
    console.log('  ok:', label)
  }
  write(relPath, c)
}

// ============================================================================
// 1. BrowseListingsView -- chip slugs: north-york + etobicoke -> /toronto/<slug>
// ============================================================================
patchFile('components/home-page/BrowseListingsView.tsx', [
  [
    `// Popular GTA quick-chip targets - links to municipality slugs
const QUICK_CHIPS = [
  { name: 'Downtown Toronto', slug: 'toronto' },
  { name: 'North York', slug: 'north-york' },
  { name: 'Mississauga', slug: 'mississauga' },
  { name: 'Whitby', slug: 'whitby' },
  { name: 'Etobicoke', slug: 'etobicoke' },
  { name: 'Oakville', slug: 'oakville' },
  { name: 'Markham', slug: 'markham' },
];`,
    `// Popular GTA quick-chip targets. Some entries are Toronto sub-district
// neighbourhoods (North York, Etobicoke) -- stored in the neighbourhoods
// table, accessed at /toronto/<slug> (NOT a flat /<slug>). The /[slug] router
// also redirects bare neighbourhood slugs to /toronto/<slug>, but linking the
// chips directly to the canonical path avoids the redirect hop.
const QUICK_CHIPS = [
  { name: 'Downtown Toronto', href: '/toronto' },
  { name: 'North York', href: '/toronto/north-york' },
  { name: 'Mississauga', href: '/mississauga' },
  { name: 'Whitby', href: '/whitby' },
  { name: 'Etobicoke', href: '/toronto/etobicoke' },
  { name: 'Oakville', href: '/oakville' },
  { name: 'Markham', href: '/markham' },
];`,
    'BrowseListingsView: chips switched to href (north-york + etobicoke get /toronto/ prefix)'
  ],

  // Update the chip render to use chip.href instead of chip.slug -> /\${chip.slug}
  [
    `        {QUICK_CHIPS.map((chip) => (
          <a
            key={chip.slug}
            href={\`/\${chip.slug}\`}
            target="_blank"
            rel="noopener noreferrer"`,
    `        {QUICK_CHIPS.map((chip) => (
          <a
            key={chip.href}
            href={chip.href}
            target="_blank"
            rel="noopener noreferrer"`,
    'BrowseListingsView: chip render uses chip.href (not /${chip.slug})'
  ],
])

// ============================================================================
// 2. app/comprehensive-site/[slug]/page.tsx -- neighbourhood redirect
//    Anchor on the final BuildingPage fallback line.
// ============================================================================
patchFile('app/comprehensive-site/[slug]/page.tsx', [
  // Add redirect import (currently only imports notFound from next/navigation).
  [
    `import { notFound } from 'next/navigation'`,
    `import { notFound, permanentRedirect } from 'next/navigation'`,
    'comprehensive [slug]: import permanentRedirect'
  ],

  // Insert neighbourhood redirect just before the BuildingPage fallback in the
  // default render. All 9 neighbourhoods in our DB are under Toronto-* munis,
  // so /toronto/<slug> is always the correct target.
  [
    `  // Community
  const { data: community } = await supabase
    .from('communities').select('id, name, slug, municipality_id').eq('slug', params.slug).single()
  if (community) return <CommunityPage community={community} />

  // Building
  return <BuildingPage params={params} />`,
    `  // Community
  const { data: community } = await supabase
    .from('communities').select('id, name, slug, municipality_id').eq('slug', params.slug).single()
  if (community) return <CommunityPage community={community} />

  // W-CHIP-SLUG (2026-06-02): bare neighbourhood slugs (e.g. /north-york,
  // /etobicoke) are Toronto sub-districts stored in the neighbourhoods table.
  // Their canonical page is at /toronto/<slug>. 308-redirect to the canonical
  // path so the dead-URL class is killed for all 9 Toronto neighbourhoods
  // (not just the chip ones), preserving SEO. Genuinely-unknown slugs still
  // fall through to BuildingPage / notFound() below.
  const { data: neighbourhood } = await supabase
    .from('neighbourhoods').select('slug').eq('slug', params.slug).eq('is_active', true).single()
  if (neighbourhood) permanentRedirect(\`/toronto/\${neighbourhood.slug}\`)

  // Building
  return <BuildingPage params={params} />`,
    'comprehensive [slug]: insert neighbourhood -> /toronto/<slug> permanent redirect'
  ],
])

// ============================================================================
// 3. app/[slug]/page.tsx -- same redirect for non-tenant traffic
// ============================================================================
patchFile('app/[slug]/page.tsx', [
  [
    `import { notFound } from 'next/navigation'`,
    `import { notFound, permanentRedirect } from 'next/navigation'`,
    'app [slug]: import permanentRedirect'
  ],

  [
    `  if (community) {
    return <CommunityPage community={community} />
  }

  // Building URL: /x2-condos-101-charles-st-e-toronto
  return <BuildingPage params={params} />`,
    `  if (community) {
    return <CommunityPage community={community} />
  }

  // W-CHIP-SLUG (2026-06-02): bare neighbourhood slugs -> /toronto/<slug>.
  // See app/comprehensive-site/[slug]/page.tsx for rationale. Genuinely-
  // unknown slugs still fall through to BuildingPage below.
  const { data: neighbourhood } = await supabase
    .from('neighbourhoods').select('slug').eq('slug', params.slug).eq('is_active', true).single()
  if (neighbourhood) permanentRedirect(\`/toronto/\${neighbourhood.slug}\`)

  // Building URL: /x2-condos-101-charles-st-e-toronto
  return <BuildingPage params={params} />`,
    'app [slug]: insert neighbourhood -> /toronto/<slug> permanent redirect'
  ],
])

console.log('\nW-CHIP-SLUG + neighbourhood-redirect PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
