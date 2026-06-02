// scripts/patch-w-mobile-responsive-2.js
// W-MOBILE-RESPONSIVE commit 2: Fix C (geo tab rows wrap on mobile instead
// of horizontal-scrolling). Single shared component (GeoListingSection.tsx
// + the top-tabs in GeoPageTabs.tsx) reached by community/municipality/area
// pages -- one fix covers all three.
//
// Files touched (2):
//   1. app/[slug]/components/GeoListingSection.tsx   -- status tab row (For Sale/For Lease/Sold/Leased)
//   2. app/[slug]/components/GeoPageTabs.tsx         -- top tab row (All Listings/Homes/Condos/Buildings)

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
// FILE 1: app/[slug]/components/GeoListingSection.tsx
//
// Status tab row (For Sale | For Lease | Sold | Leased) at line ~275.
// BEFORE: flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 + buttons have
//   whitespace-nowrap flex-shrink-0 (horizontal-scroll pattern).
// AFTER:  flex flex-wrap gap-2 mb-4 + buttons drop whitespace-nowrap and
//   flex-shrink-0 (wrap to a second line on narrow viewports).
// WebkitOverflowScrolling style dropped (no longer scrollable).
// ============================================================================
patchFile('app/[slug]/components/GeoListingSection.tsx', [[
  `      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={\`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors \${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }\`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>`,
  `      {/* Status Tabs -- W-MOBILE-RESPONSIVE Fix C (2026-06-02): wrap instead
          of horizontal-scroll on mobile. Was full-bleed overflow-x-auto with
          flex-shrink-0/whitespace-nowrap tabs that overflowed 358px (390 viewport
          - 32 px-4 padding) and presented as a clipped right edge. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={\`px-4 py-2 rounded-lg text-sm font-medium transition-colors \${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }\`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>`,
  'GeoListingSection status tab row -> flex-wrap'
]])

// ============================================================================
// FILE 2: app/[slug]/components/GeoPageTabs.tsx
//
// Top tab row (All Listings | Homes | Condos | Buildings) at line ~52.
// Same fix shape: flex-wrap + drop whitespace-nowrap + drop flex-shrink-0.
// Also cleans up the duplicate 'overflow-x-auto overflow-x-auto' typo present
// in the original. Border-b on the parent stays (visual baseline under tabs);
// the border now spans the row's flex container, which on wrap to a second
// line looks fine (Tailwind defaults border below the flex children).
// ============================================================================
patchFile('app/[slug]/components/GeoPageTabs.tsx', [[
  `      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto overflow-x-auto pb-px">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={\`flex items-center gap-2 px-3 sm:px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap flex-shrink-0 \${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }\`}
          >`,
  `      {/* Tab bar -- W-MOBILE-RESPONSIVE Fix C (2026-06-02): wrap instead of
          horizontal-scroll on mobile. Also cleans up the duplicate
          overflow-x-auto class token. */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200 pb-px">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={\`flex items-center gap-2 px-3 sm:px-5 py-3 text-sm font-semibold border-b-2 transition-all \${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }\`}
          >`,
  'GeoPageTabs top tab row -> flex-wrap'
]])

console.log('\nW-MOBILE-RESPONSIVE commit 2 PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
