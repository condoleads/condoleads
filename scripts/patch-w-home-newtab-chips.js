// scripts/patch-w-home-newtab-chips.js
// W-HOME-AND-NEIGHBOURHOOD Fix 1: make homepage geo-chips open in a new tab.
//
// File touched (1): components/home-page/BrowseListingsView.tsx
//
// The chip <a> at line ~85 currently navigates same-tab. Adds target="_blank"
// rel="noopener noreferrer" to open each municipality slug in a new tab.
// Destinations unchanged. QUICK_CHIPS list is hardcoded (not tenant-config), so
// the same chip set ships to every tenant -- no tenant logic touched.

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

// Anchor uniqueness: the `<a key={chip.slug} href={\`/\${chip.slug}\`}` opener
// occurs exactly once in the file (within QUICK_CHIPS.map). Insert
// target/rel attrs right after href.
patchFile('components/home-page/BrowseListingsView.tsx', [[
  `          <a
            key={chip.slug}
            href={\`/\${chip.slug}\`}
            style={{`,
  `          <a
            key={chip.slug}
            href={\`/\${chip.slug}\`}
            target="_blank"
            rel="noopener noreferrer"
            style={{`,
  'BrowseListingsView chip <a> target=_blank rel=noopener'
]])

console.log('\nW-HOME-AND-NEIGHBOURHOOD Fix 1 PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
