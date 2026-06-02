// scripts/patch-w-console-cleanup-1.js
// W-CONSOLE-CLEANUP commit 1: strip 2 debug console.log lines from the
// property/charlie client tree. KEEPS all 8 console.error calls (real error
// paths) -- they're operationally useful and worth logging.
//
// Files touched (2):
//   1. components/property/PropertyEstimateCTA.tsx       -- line 21 (debug trace on every render)
//   2. app/charlie/components/SellerEstimateRunner.tsx   -- line 74 (debug trace at estimate start)

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
// FILE 1: components/property/PropertyEstimateCTA.tsx
// Remove the single-line debug trace at line 21 that fires on EVERY render.
// ============================================================================
patchFile('components/property/PropertyEstimateCTA.tsx', [[
  `export default function PropertyEstimateCTA({ listing, status, isSale, buildingName, buildingAddress, buildingSlug, agentId }: PropertyEstimateCTAProps) {
  console.log('[PropertyEstimateCTA] buildingSlug prop:', buildingSlug)
  const [loading, setLoading] = useState(true)`,
  `export default function PropertyEstimateCTA({ listing, status, isSale, buildingName, buildingAddress, buildingSlug, agentId }: PropertyEstimateCTAProps) {
  const [loading, setLoading] = useState(true)`,
  'PropertyEstimateCTA strip debug console.log at L21'
]])

// ============================================================================
// FILE 2: app/charlie/components/SellerEstimateRunner.tsx
// Remove the inline console.log on the same line as the arrow-function opener.
// Collapses to a clean function body opener.
// ============================================================================
patchFile('app/charlie/components/SellerEstimateRunner.tsx', [[
  `  const runEstimate = async () => { console.log('[Runner] starting estimate, path:', resolvedData.path, 'buildingId:', resolvedData.buildingId)
    try {`,
  `  const runEstimate = async () => {
    try {`,
  'SellerEstimateRunner strip inline debug console.log at L74'
]])

console.log('\nW-CONSOLE-CLEANUP commit 1 PATCH COMPLETE.')
console.log('Backup timestamp:', TS)
console.log('')
console.log('Kept (real error paths, NOT touched):')
console.log('  components/property/HomeAddressHistoryModal.tsx:61   console.error History fetch error')
console.log('  components/property/OfferInquiryModal.tsx:92         console.error Offer inquiry submit error')
console.log('  components/property/PropertyGallery.tsx:58           console.error Failed to load all photos')
console.log('  components/property/UnitHistoryModal.tsx:104,130,150 console.error history/activity/lead errors')
console.log('  app/charlie/components/CharlieWidget.tsx:198         console.error register-then-getUser stayed null')
console.log('  app/charlie/components/CharlieOverlay.tsx:64,224     .catch(console.error) + console.error(e)')
console.log('  app/charlie/components/SellerEstimateRunner.tsx:142,163  console.error competing + outer estimate err')
