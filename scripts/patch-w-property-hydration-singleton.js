// scripts/patch-w-property-hydration-singleton.js
// W-PROPERTY-HYDRATION root cause 1: convert 4 client-component createClient()
// call sites to the canonical singleton at lib/supabase/client.ts.
//
// Backup-before-touch: timestamped .backup_<ts> per file.
// Exact-string anchors: ASCII-only multi-line matches; LF/CRLF auto-detect.
// Verify post-edit: confirm the new content is present + the old createClient()
// call site is gone.

const fs = require('fs')
const path = require('path')

const TS = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)  // e.g., 20260601T194512
const ROOT = path.resolve(__dirname, '..')

function backup (relPath) {
  const abs = path.join(ROOT, relPath)
  const bak = abs + '.backup_' + TS
  fs.copyFileSync(abs, bak)
  console.log('  backup:', path.basename(bak))
}

function read (relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function write (relPath, content) {
  fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8')
}

function nlOf (s) {
  return s.indexOf('\r\n') !== -1 ? '\r\n' : '\n'
}

function replaceExact (content, oldStr, newStr, label) {
  // Files can be mixed-EOL (e.g., 188 LF + 1 trailing CRLF). Try the anchor
  // verbatim first (LF, as the source files use); fall back to a CRLF-rewritten
  // version. This avoids the bug where nlOf returns '\r\n' for a file with a
  // single stray CRLF and then forces the entire anchor to CRLF, missing the
  // LF-only function body it should have matched.
  let idx = content.indexOf(oldStr)
  if (idx !== -1) {
    if (content.indexOf(oldStr, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (LF): ' + label)
    return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length)
  }
  const oldStrCRLF = oldStr.replace(/\r?\n/g, '\r\n')
  const newStrCRLF = newStr.replace(/\r?\n/g, '\r\n')
  idx = content.indexOf(oldStrCRLF)
  if (idx !== -1) {
    if (content.indexOf(oldStrCRLF, idx + 1) !== -1) throw new Error('ANCHOR NOT UNIQUE (CRLF): ' + label)
    return content.slice(0, idx) + newStrCRLF + content.slice(idx + oldStrCRLF.length)
  }
  throw new Error('ANCHOR NOT FOUND (tried LF + CRLF): ' + label)
}

// ============================================================================
// SITE 1 — components/WalliamAgentCard.tsx (lines ~108-109)
// Dynamic import().then(({createClient}) => createClient()) -> singleton.
// ============================================================================
{
  const file = 'components/WalliamAgentCard.tsx'
  console.log('\n[site 1]', file)
  backup(file)
  let c = read(file)

  const oldAnchor = `  useEffect(() => {
    // Read user_id from Supabase auth client-side
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {`

  const newAnchor = `  useEffect(() => {
    // Read user_id from Supabase auth client-side (singleton from
    // @/lib/supabase/client to avoid the "Multiple GoTrueClient instances"
    // warning -- W-PROPERTY-HYDRATION root cause 1).
    import('@/lib/supabase/client').then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {`

  c = replaceExact(c, oldAnchor, newAnchor, 'WalliamAgentCard useEffect import')
  write(file, c)

  // Verify
  if (read(file).indexOf("import('@/lib/supabase/client').then(({ supabase }) =>") === -1) {
    throw new Error('VERIFY FAILED: WalliamAgentCard singleton import missing post-edit')
  }
  if (read(file).indexOf('const supabase = createClient()') !== -1) {
    throw new Error('VERIFY FAILED: WalliamAgentCard still has createClient() call')
  }
  console.log('  ok')
}

// ============================================================================
// SITE 2 — app/charlie/components/CharlieWidget.tsx (line ~6 + ~183)
// import { createClient } -> import { supabase }; replace local createClient() call.
// ============================================================================
{
  const file = 'app/charlie/components/CharlieWidget.tsx'
  console.log('\n[site 2]', file)
  backup(file)
  let c = read(file)

  // Step 1: change the import.
  c = replaceExact(
    c,
    `import { createClient } from '@/lib/supabase/client'`,
    `import { supabase } from '@/lib/supabase/client'`,
    'CharlieWidget import'
  )
  // Step 2: replace the local createClient() call (unique because the import
  // is now gone, and the singleton name 'supabase' is already in scope).
  c = replaceExact(
    c,
    `            const supabase = createClient()
            let attempts = 0`,
    `            // singleton -- W-PROPERTY-HYDRATION root cause 1
            let attempts = 0`,
    'CharlieWidget local createClient'
  )
  write(file, c)

  // Verify
  if (read(file).indexOf("import { supabase } from '@/lib/supabase/client'") === -1) {
    throw new Error('VERIFY FAILED: CharlieWidget singleton import missing')
  }
  if (read(file).indexOf('const supabase = createClient()') !== -1) {
    throw new Error('VERIFY FAILED: CharlieWidget still has createClient() call')
  }
  console.log('  ok')
}

// ============================================================================
// SITE 3 — app/charlie/components/AppointmentForm.tsx (line ~9 + ~61)
// ============================================================================
{
  const file = 'app/charlie/components/AppointmentForm.tsx'
  console.log('\n[site 3]', file)
  backup(file)
  let c = read(file)

  c = replaceExact(
    c,
    `import { createClient } from '@/lib/supabase/client'`,
    `import { supabase } from '@/lib/supabase/client'`,
    'AppointmentForm import'
  )
  c = replaceExact(
    c,
    `    if (!userId || profileLoaded) return
    const supabase = createClient()
    Promise.all([`,
    `    if (!userId || profileLoaded) return
    // singleton -- W-PROPERTY-HYDRATION root cause 1
    Promise.all([`,
    'AppointmentForm local createClient'
  )
  write(file, c)

  if (read(file).indexOf("import { supabase } from '@/lib/supabase/client'") === -1) {
    throw new Error('VERIFY FAILED: AppointmentForm singleton import missing')
  }
  if (read(file).indexOf('const supabase = createClient()') !== -1) {
    throw new Error('VERIFY FAILED: AppointmentForm still has createClient() call')
  }
  console.log('  ok')
}

// ============================================================================
// SITE 4 — app/charlie/components/SellerEstimateRunner.tsx (line ~10 + ~15)
// ============================================================================
{
  const file = 'app/charlie/components/SellerEstimateRunner.tsx'
  console.log('\n[site 4]', file)
  backup(file)
  let c = read(file)

  c = replaceExact(
    c,
    `import { createClient } from '@/lib/supabase/client'`,
    `import { supabase } from '@/lib/supabase/client'`,
    'SellerEstimateRunner import'
  )
  c = replaceExact(
    c,
    `async function fetchMediaForComparables(listingKeys: string[]) {
  if (!listingKeys.length) return {}
  const supabase = createClient()
  const { data: listings } = await supabase`,
    `async function fetchMediaForComparables(listingKeys: string[]) {
  if (!listingKeys.length) return {}
  // singleton -- W-PROPERTY-HYDRATION root cause 1
  const { data: listings } = await supabase`,
    'SellerEstimateRunner fetchMediaForComparables'
  )
  write(file, c)

  if (read(file).indexOf("import { supabase } from '@/lib/supabase/client'") === -1) {
    throw new Error('VERIFY FAILED: SellerEstimateRunner singleton import missing')
  }
  if (read(file).indexOf('const supabase = createClient()') !== -1) {
    throw new Error('VERIFY FAILED: SellerEstimateRunner still has createClient() call')
  }
  console.log('  ok')
}

console.log('\nSINGLETON PATCH COMPLETE -- 4 files modified.')
console.log('Backup timestamp:', TS)
