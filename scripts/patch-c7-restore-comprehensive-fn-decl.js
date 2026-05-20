// scripts/patch-c7-restore-comprehensive-fn-decl.js
// C7 follow-up - restore the ComprehensiveHomePage function declaration
// that was excised by the KNOWN_TENANTS replacement step in v2.
// Idempotent

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched')
    return
  }

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor #' + (i+1) + ' not found in ' + relPath + ':\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath)
    content = content.replace(edit.find, edit.replace)
  }

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' -- ' + edits.length + ' edit(s) -- ' + description)
}

patchFile(
  'app/comprehensive-site/page.tsx',
  [
    {
      find: `// C7/D11 -- KNOWN_TENANTS static host map removed; DB lookup via getTenantByHost handles all tenants generically.

  // C7/D11 -- resolve tenant by host via single DB-backed helper.
  const { createClient } = await import('@/lib/supabase/server')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const supabase = createClient()
  const tenant = await getTenantByHost(supabase, host)`,
      replace: `// C7/D11 -- KNOWN_TENANTS static host map removed; DB lookup via getTenantByHost handles all tenants generically.

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''

  // C7/D11 -- resolve tenant by host via single DB-backed helper.
  const { createClient } = await import('@/lib/supabase/server')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const supabase = createClient()
  const tenant = await getTenantByHost(supabase, host)`,
    },
  ],
  'C7 restore-fn-decl',
  'export default async function ComprehensiveHomePage'
)

console.log('\n=== C7 restore-fn-decl complete ===')