// scripts/patch-c8a-fix-5-dedupe-imports.js
// C8a fix-5 - Remove duplicate `import { headers } from 'next/headers'` lines.
// 7 server pages already imported headers; my fix-4 patch added a second copy.
// Idempotent.

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function detectLineEnding(content) { return content.includes('\r\n') ? '\r\n' : '\n' }

function dedupeHeadersImport(relPath) {
  const fullPath = path.join(ROOT, relPath)
  if (!fs.existsSync(fullPath)) { console.log('SKIP ' + relPath + ' -- missing'); return }
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  // The exact import line my patch added (single quote, no semicolon variation possible)
  const importLine = `import { headers } from 'next/headers'`

  // Count current occurrences
  const count = content.split(importLine).length - 1
  if (count <= 1) {
    console.log('SKIP ' + relPath + ' -- ' + count + ' occurrence(s), no dedupe needed')
    return
  }

  // Strategy: remove ONE occurrence (the first remaining duplicate) by finding the
  // second instance and removing it along with its trailing newline.
  // Find first index, then second index.
  const firstIdx = content.indexOf(importLine)
  const secondIdx = content.indexOf(importLine, firstIdx + importLine.length)
  if (secondIdx === -1) {
    console.log('UNEXPECTED ' + relPath + ' -- count > 1 but second index not found')
    return
  }
  // Determine line ending after the second occurrence
  const afterSecond = content.substring(secondIdx + importLine.length)
  let toRemoveLen = importLine.length
  if (afterSecond.startsWith('\r\n')) toRemoveLen += 2
  else if (afterSecond.startsWith('\n')) toRemoveLen += 1

  content = content.substring(0, secondIdx) + content.substring(secondIdx + toRemoveLen)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' -- removed duplicate headers import')
}

dedupeHeadersImport('app/[slug]/AreaPage.tsx')
dedupeHeadersImport('app/[slug]/BuildingPage.tsx')
dedupeHeadersImport('app/[slug]/CommunityPage.tsx')
dedupeHeadersImport('app/[slug]/MunicipalityPage.tsx')
dedupeHeadersImport('app/comprehensive-site/toronto/[neighbourhood]/page.tsx')
dedupeHeadersImport('app/property/[id]/HomePropertyPage.tsx')
dedupeHeadersImport('app/property/[id]/page.tsx')

console.log('\n=== C8a fix-5 dedupe complete ===')