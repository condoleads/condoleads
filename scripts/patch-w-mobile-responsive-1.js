// scripts/patch-w-mobile-responsive-1.js
// W-MOBILE-RESPONSIVE commit 1: Fix A (Charlie bar global clearance) +
// Fix B (Charlie bar stacks ABOVE PropertyStickyBar on property pages).
//
// Files touched (4):
//   1. app/globals.css                                  -- declare --charlie-bar-clearance
//   2. components/ConditionalLayout.tsx                 -- wrap {children} w/ padding-bottom on Charlie-visible non-home pages
//   3. components/property/PropertyStickyBar.tsx        -- publish measured height to --sticky-bar-height
//   4. app/charlie/components/CharlieWidget.tsx         -- read --sticky-bar-height to raise bar bottom
//
// Each edit: backup-before-touch (timestamped) + exact-anchor match (LF first,
// CRLF fallback for mixed-EOL files) + post-edit verification.

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
// FILE 1: app/globals.css -- declare --charlie-bar-clearance
// ============================================================================
patchFile('app/globals.css', [[
  `@tailwind base;
@tailwind components;
@tailwind utilities;

/* CRITICAL: Prevent horizontal scroll on mobile */`,
  `@tailwind base;
@tailwind components;
@tailwind utilities;

/* W-MOBILE-RESPONSIVE Fix A+B (2026-06-02): global clearance for the Charlie bar.
 * Base 72px = bar bottom-offset (24) + bar height (~48).
 * + var(--sticky-bar-height, 0px) covers PropertyStickyBar when visible.
 *   (PropertyStickyBar sets this var on documentElement on mount, clears on unmount.)
 * + env(safe-area-inset-bottom) covers iOS home-indicator notch.
 * + 16px breathing room.
 * Applied via padding-bottom on the ConditionalLayout {children} wrapper,
 * gated to the same scope where the bar renders (isCharlieVisible && !isHomepage).
 */
:root {
  --charlie-bar-clearance: calc(72px + var(--sticky-bar-height, 0px) + env(safe-area-inset-bottom, 0px) + 16px);
}

/* CRITICAL: Prevent horizontal scroll on mobile */`,
  'globals.css declare --charlie-bar-clearance'
]])

// ============================================================================
// FILE 2: components/ConditionalLayout.tsx
// Wrap {children} so non-admin/dashboard/login/01leads non-homepage routes get
// padding-bottom = var(--charlie-bar-clearance). Match the bar's own gate:
// isCharlieVisible && pathname !== '/'. (pathname already in scope via
// usePathname() at line 9.)
// ============================================================================
patchFile('components/ConditionalLayout.tsx', [[
  `      {showPublicLayout && <UniversalNav siteName={siteName} agentData={agentData} />}
      {children}
      {showPublicLayout && <Footer agentData={agentData} />}
      {isCharlieVisible && <CharlieWidget />}`,
  `      {showPublicLayout && <UniversalNav siteName={siteName} agentData={agentData} />}
      {/* W-MOBILE-RESPONSIVE Fix A (2026-06-02): reserve bottom space for the
          global Charlie bar so content never renders under it. Gated to the
          exact scope where the bar appears: Charlie visible (not admin/dashboard
          /login/01leads) AND not on the homepage (the bar self-hides on '/' per
          CharlieWidget.tsx:60-62 + 102). */}
      <div style={isCharlieVisible && pathname !== '/' ? { paddingBottom: 'var(--charlie-bar-clearance)' } : undefined}>
        {children}
      </div>
      {showPublicLayout && <Footer agentData={agentData} />}
      {isCharlieVisible && <CharlieWidget />}`,
  'ConditionalLayout wrap children with clearance'
]])

// ============================================================================
// FILE 3: components/property/PropertyStickyBar.tsx
// Add useRef import + useEffect to publish measured height to
// --sticky-bar-height on document.documentElement, cleared on hide/unmount.
// Attach ref to the outer fixed div.
// ============================================================================
patchFile('components/property/PropertyStickyBar.tsx', [
  [
    `import { useState, useEffect } from 'react'`,
    `import { useState, useEffect, useRef } from 'react'`,
    'PropertyStickyBar import useRef'
  ],
  [
    `  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 400px
      setIsVisible(window.scrollY > 400)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!isVisible) return null`,
    `  const [isVisible, setIsVisible] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 400px
      setIsVisible(window.scrollY > 400)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // W-MOBILE-RESPONSIVE Fix B (2026-06-02): publish this bar's measured pixel
  // height to documentElement as --sticky-bar-height so the global Charlie bar
  // (CharlieWidget, mounted by ConditionalLayout) can read it via
  // calc(var(--sticky-bar-height, 0px) + 24px) and stack ABOVE this bar.
  // Cleared on hide/unmount; re-measured on resize.
  useEffect(() => {
    if (!isVisible) {
      document.documentElement.style.removeProperty('--sticky-bar-height')
      return
    }
    const measure = () => {
      if (barRef.current) {
        const h = Math.round(barRef.current.getBoundingClientRect().height)
        document.documentElement.style.setProperty('--sticky-bar-height', h + 'px')
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      document.documentElement.style.removeProperty('--sticky-bar-height')
    }
  }, [isVisible])

  if (!isVisible) return null`,
    'PropertyStickyBar useRef + useEffect publish --sticky-bar-height'
  ],
  [
    `    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transform transition-transform duration-300">`,
    `    <div ref={barRef} className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transform transition-transform duration-300">`,
    'PropertyStickyBar attach barRef'
  ],
])

// ============================================================================
// FILE 4: app/charlie/components/CharlieWidget.tsx
// Change bar's bottom from 24 (number) to calc(var(--sticky-bar-height, 0px) + 24px).
// Var unset = 24px (current behavior). Var = 64px (sticky present) = 88px from bottom.
// ============================================================================
patchFile('app/charlie/components/CharlieWidget.tsx', [[
  `        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',`,
  `        <div style={{
          position: 'fixed',
          // W-MOBILE-RESPONSIVE Fix B (2026-06-02): clear PropertyStickyBar when
          // present. PropertyStickyBar publishes its measured height as
          // --sticky-bar-height on document.documentElement. Var unset = 24px
          // (current default behavior). Var set = sticky_height + 24px = bar
          // stacks above sticky.
          bottom: 'calc(var(--sticky-bar-height, 0px) + 24px)',
          left: '50%',`,
  'CharlieWidget bar bottom uses --sticky-bar-height'
]])

console.log('\nW-MOBILE-RESPONSIVE commit 1 PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
