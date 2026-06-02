// scripts/patch-w-console-cleanup-2.js
// W-CONSOLE-CLEANUP commit 2: add sizes="..." to all 5 fill <Image> components
// in PropertyGallery.tsx. Sizes values confirmed by operator after container-
// width survey (PropertyGallery is rendered OUTSIDE max-w-7xl on both home +
// condo property page clients; container chain bounded only by globals.css
// `section, div, nav, header, main { max-width: 100vw }`).
//
// File touched (1): components/property/PropertyGallery.tsx
//
// Five anchors -- each uniquely identified by src + alt + the fill / className
// combination present in the current file:
//   #1 (single-photo main)        -> sizes="100vw"
//   #2 (single-photo lightbox)    -> sizes="100vw"
//   #3 (multi-photo LEFT)         -> sizes="(max-width: 639px) 100vw, 50vw"
//   #4 (multi-photo RIGHT)        -> sizes="(max-width: 639px) 100vw, 50vw"
//   #5 (multi-photo lightbox)     -> sizes="100vw"

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

patchFile('components/property/PropertyGallery.tsx', [
  // ============================================================================
  // Anchor #1 -- single-photo main image (~line 123)
  // unique: src=displayPhotos[0].media_url AND alt="Property photo" (no template)
  // ============================================================================
  [
    `            <Image
              src={displayPhotos[0].media_url}
              alt="Property photo"
              fill
              className="object-cover"
              priority
            />`,
    `            <Image
              src={displayPhotos[0].media_url}
              alt="Property photo"
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />`,
    'PropertyGallery #1 single-photo main sizes=100vw'
  ],
  // ============================================================================
  // Anchor #2 -- single-photo lightbox (~line 164)
  // unique: alt="Full size photo" (no template literal)
  // 14-space indent (more deeply nested than the others)
  // ============================================================================
  [
    `              <Image
                src={displayPhotos[0].media_url}
                alt="Full size photo"
                fill
                className="object-contain"
              />`,
    `              <Image
                src={displayPhotos[0].media_url}
                alt="Full size photo"
                fill
                sizes="100vw"
                className="object-contain"
              />`,
    'PropertyGallery #2 single-photo lightbox sizes=100vw'
  ],
  // ============================================================================
  // Anchor #3 -- multi-photo LEFT (~line 198)
  // unique: alt template uses currentIndex AND priority is unconditional
  // ============================================================================
  [
    `            <Image
              src={displayPhotos[currentIndex].media_url}
              alt={\`Property photo \${currentIndex + 1}\`}
              fill
              className="object-cover"
              priority
            />`,
    `            <Image
              src={displayPhotos[currentIndex].media_url}
              alt={\`Property photo \${currentIndex + 1}\`}
              fill
              sizes="(max-width: 639px) 100vw, 50vw"
              className="object-cover"
              priority
            />`,
    'PropertyGallery #3 multi LEFT sizes=(max-width:639px) 100vw, 50vw'
  ],
  // ============================================================================
  // Anchor #4 -- multi-photo RIGHT (~line 220)
  // unique: uses secondPhotoIndex AND priority={currentIndex === 0}
  // ============================================================================
  [
    `            <Image
              src={displayPhotos[secondPhotoIndex].media_url}
              alt={\`Property photo \${secondPhotoIndex + 1}\`}
              fill
              className="object-cover"
              priority={currentIndex === 0}
            />`,
    `            <Image
              src={displayPhotos[secondPhotoIndex].media_url}
              alt={\`Property photo \${secondPhotoIndex + 1}\`}
              fill
              sizes="(max-width: 639px) 100vw, 50vw"
              className="object-cover"
              priority={currentIndex === 0}
            />`,
    'PropertyGallery #4 multi RIGHT sizes=(max-width:639px) 100vw, 50vw'
  ],
  // ============================================================================
  // Anchor #5 -- multi-photo lightbox (~line 363)
  // unique: alt template "Full size ${currentIndex + 1}" AND object-contain
  // (no priority prop)
  // ============================================================================
  [
    `            <Image
              src={displayPhotos[currentIndex].media_url}
              alt={\`Full size \${currentIndex + 1}\`}
              fill
              className="object-contain"
            />`,
    `            <Image
              src={displayPhotos[currentIndex].media_url}
              alt={\`Full size \${currentIndex + 1}\`}
              fill
              sizes="100vw"
              className="object-contain"
            />`,
    'PropertyGallery #5 multi lightbox sizes=100vw'
  ],
])

console.log('\nW-CONSOLE-CLEANUP commit 2 PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
