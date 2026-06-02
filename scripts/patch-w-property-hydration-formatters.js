// scripts/patch-w-property-hydration-formatters.js
// W-PROPERTY-HYDRATION root cause 2: pin locale + timezone for every
// toLocaleString / toLocaleDateString in the property-page client tree so
// SSR (Node) and client (browser) emit byte-identical strings.
//
// Pattern A (numeric): .toLocaleString()                 -> .toLocaleString('en-CA')
// Pattern B (date):    toLocaleDateString('en-US', {opts}) -> add timeZone: 'America/Toronto'
// Pattern C (now):     PropertyHeader.formatTimeAgo reads `new Date()` -- defer to
//                      useEffect; SSR + first-paint render the absolute date.
//
// Backup-before-touch + ASCII anchors + verify post-edit.

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
  // LF first, CRLF fallback -- handles mixed-EOL files.
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
  throw new Error('ANCHOR NOT FOUND: ' + label)
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
// HomePropertyDetails.tsx -- 3 sites: line 10 (A), line 37 (B), line 182 (A)
// ============================================================================
patchFile('components/property/HomePropertyDetails.tsx', [
  [
    `  const displaySqft = exactSqft
    ? \`\${exactSqft.toLocaleString()} sqft\``,
    `  const displaySqft = exactSqft
    ? \`\${exactSqft.toLocaleString('en-CA')} sqft\``,
    'HPD sqft toLocaleString -> en-CA'
  ],
  [
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })`,
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Toronto'
    })`,
    'HPD formatDate timeZone'
  ],
  [
    `                \${Math.round(listing.tax_annual_amount).toLocaleString()}/year`,
    `                \${Math.round(listing.tax_annual_amount).toLocaleString('en-CA')}/year`,
    'HPD tax toLocaleString -> en-CA'
  ],
])

// ============================================================================
// PropertyDetails.tsx (CONDO) -- 4 sites
// ============================================================================
patchFile('components/property/PropertyDetails.tsx', [
  [
    `    ? \`\${exactSqft.toLocaleString()} sqft\` `,
    `    ? \`\${exactSqft.toLocaleString('en-CA')} sqft\` `,
    'PD sqft toLocaleString -> en-CA'
  ],
  [
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })`,
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Toronto'
    })`,
    'PD formatDate timeZone'
  ],
  [
    `                \${Math.round(listing.association_fee).toLocaleString()}/month`,
    `                \${Math.round(listing.association_fee).toLocaleString('en-CA')}/month`,
    'PD association_fee toLocaleString -> en-CA'
  ],
  [
    `                \${Math.round(listing.tax_annual_amount).toLocaleString()}/year`,
    `                \${Math.round(listing.tax_annual_amount).toLocaleString('en-CA')}/year`,
    'PD tax toLocaleString -> en-CA'
  ],
])

// ============================================================================
// PriceHistory.tsx -- 2 sites (B). This file has CRLF + a trailing SPACE before
// each \r\n inside the date-formatter args. String-concat builds the anchor
// with explicit trailing spaces (template literals + the Edit tool can't
// reliably preserve trailing whitespace; concat is the workaround).
// ============================================================================
{
  const SP = ' '  // single trailing space char
  const oldListing =
    "                Listed on {new Date(listingDate).toLocaleDateString('en-US', {" + SP + "\n" +
    "                  year: 'numeric'," + SP + "\n" +
    "                  month: 'short'," + SP + "\n" +
    "                  day: 'numeric'" + SP + "\n" +
    "                })}"
  const newListing =
    "                Listed on {new Date(listingDate).toLocaleDateString('en-US', {" + SP + "\n" +
    "                  year: 'numeric'," + SP + "\n" +
    "                  month: 'short'," + SP + "\n" +
    "                  day: 'numeric'," + SP + "\n" +
    "                  timeZone: 'America/Toronto'" + SP + "\n" +
    "                })}"
  const oldClose =
    "                  Sold on {new Date(closeDate).toLocaleDateString('en-US', {" + SP + "\n" +
    "                    year: 'numeric'," + SP + "\n" +
    "                    month: 'short'," + SP + "\n" +
    "                    day: 'numeric'" + SP + "\n" +
    "                  })}"
  const newClose =
    "                  Sold on {new Date(closeDate).toLocaleDateString('en-US', {" + SP + "\n" +
    "                    year: 'numeric'," + SP + "\n" +
    "                    month: 'short'," + SP + "\n" +
    "                    day: 'numeric'," + SP + "\n" +
    "                    timeZone: 'America/Toronto'" + SP + "\n" +
    "                  })}"
  patchFile('components/property/PriceHistory.tsx', [
    [oldListing, newListing, 'PriceHistory listingDate timeZone'],
    [oldClose,   newClose,   'PriceHistory closeDate timeZone'],
  ])
}

// ============================================================================
// PropertyStickyBar.tsx -- 1 site (A)
// ============================================================================
patchFile('components/property/PropertyStickyBar.tsx', [
  [
    `    if (isRental) {
      return \`$\${price.toLocaleString()}\`
    }`,
    `    if (isRental) {
      return \`$\${price.toLocaleString('en-CA')}\`
    }`,
    'PSB rental price toLocaleString -> en-CA'
  ],
])

// ============================================================================
// UnitHistory.tsx -- 1 site (B)
// ============================================================================
patchFile('components/property/UnitHistory.tsx', [
  [
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })`,
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Toronto'
    })`,
    'UnitHistory formatDate timeZone'
  ],
])

// ============================================================================
// UnitHistoryModal.tsx -- 1 site (B)
// ============================================================================
patchFile('components/property/UnitHistoryModal.tsx', [
  [
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })`,
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Toronto'
    })`,
    'UnitHistoryModal formatDate timeZone'
  ],
])

// ============================================================================
// HomeAddressHistoryModal.tsx -- already locale-pinned to 'en-CA'; add timeZone (B)
// ============================================================================
patchFile('components/property/HomeAddressHistoryModal.tsx', [
  [
    `                            ? new Date(item.close_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })`,
    `                            ? new Date(item.close_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Toronto' })`,
    'HAHM close_date timeZone'
  ],
  [
    `                            ? \`Listed \${new Date(item.listing_contract_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}\``,
    `                            ? \`Listed \${new Date(item.listing_contract_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Toronto' })}\``,
    'HAHM listing_contract_date timeZone'
  ],
])

// ============================================================================
// InvestmentAnalysis.tsx -- 3 sites (A)
// ============================================================================
patchFile('components/property/InvestmentAnalysis.tsx', [
  [
    `  const formatCurrency = (val: number) => \`$\${val.toLocaleString()}\``,
    `  const formatCurrency = (val: number) => \`$\${val.toLocaleString('en-CA')}\``,
    'IA formatCurrency toLocaleString -> en-CA'
  ],
  [
    `  const formatPsf = (val: number) => \`$\${Math.round(val).toLocaleString()}\``,
    `  const formatPsf = (val: number) => \`$\${Math.round(val).toLocaleString('en-CA')}\``,
    'IA formatPsf toLocaleString -> en-CA'
  ],
  [
    `          {data.annualTax && \` property tax ($\${Math.round(data.annualTax).toLocaleString()}/yr)\`}`,
    `          {data.annualTax && \` property tax ($\${Math.round(data.annualTax).toLocaleString('en-CA')}/yr)\`}`,
    'IA annualTax toLocaleString -> en-CA'
  ],
])

// ============================================================================
// PropertyHeader.tsx -- B (formatDate at line ~25) + C (formatTimeAgo at ~34)
//
// Pattern B: add timeZone to formatDate.
// Pattern C: formatTimeAgo reads `new Date()` (current clock) at render. To
// avoid hydration mismatch, defer the relative computation to a useEffect-set
// state. First paint renders the ABSOLUTE date (matches SSR); the relative
// text appears after mount.
//
// Implementation: introduce `mounted` state via useState/useEffect, render
// {mounted ? formatTimeAgo(...) : formatDate(...)} at the call site.
// ============================================================================

{
  const file = 'components/property/PropertyHeader.tsx'
  console.log('\n[file]', file)
  backup(file)
  let c = read(file)

  // C-prep step 1: add useEffect to the existing useState import.
  c = replaceExact(c,
    `import { useState } from 'react'`,
    `import { useState, useEffect } from 'react'`,
    'PropertyHeader import useEffect'
  )

  // C-prep step 2: add `mounted` state next to the existing showRegister state.
  c = replaceExact(c,
    `  const [showRegister, setShowRegister] = useState(false)
  const isClosed = status === 'Closed'`,
    `  const [showRegister, setShowRegister] = useState(false)
  // W-PROPERTY-HYDRATION pattern C: defer formatTimeAgo (which reads new Date()
  // at render) to post-mount. First paint renders the absolute close_date; the
  // relative "X months ago" appears after hydration. Eliminates the SSR vs
  // client clock-skew hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isClosed = status === 'Closed'`,
    'PropertyHeader add mounted state'
  )

  // Pattern B: add timeZone to formatDate.
  c = replaceExact(c,
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })`,
    `    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Toronto'
    })`,
    'PropertyHeader formatDate timeZone'
  )

  // Pattern C: gate formatTimeAgo behind `mounted`. The JSX call site at line ~128
  // currently reads `{formatTimeAgo(listing.close_date!)}`. Swap to the ternary.
  c = replaceExact(c,
    `                  {formatTimeAgo(listing.close_date!)}`,
    `                  {mounted ? formatTimeAgo(listing.close_date!) : formatDate(listing.close_date!)}`,
    'PropertyHeader formatTimeAgo JSX gate'
  )

  write(file, c)

  // Verify
  const post = read(file)
  if (!/import \{ useState, useEffect \} from 'react'/.test(post)) {
    throw new Error('VERIFY FAILED: PropertyHeader useEffect import missing')
  }
  if (!/const \[mounted, setMounted\] = useState\(false\)/.test(post)) {
    throw new Error('VERIFY FAILED: PropertyHeader mounted state missing')
  }
  if (!/timeZone: 'America\/Toronto'/.test(post)) {
    throw new Error('VERIFY FAILED: PropertyHeader timeZone missing')
  }
  if (!/mounted \? formatTimeAgo/.test(post)) {
    throw new Error('VERIFY FAILED: PropertyHeader formatTimeAgo gate missing')
  }
  console.log('  ok: PropertyHeader full pattern C verified')
}

console.log('\nFORMATTER PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
