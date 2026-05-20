// scripts/patch-c8f-gettenant-localhost-fallback.js
// C8f Option beta -- add localhost/preview dev fallback to getTenant().
// Single-file change. Zero caller modifications.
// Production behavior preserved (fallback only fires when x-tenant-id is absent).
// Mirrors getTenantByHost localhost fallback logic (lib/utils/tenant-brand.ts:62-65).

const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

function detectLineEnding(content) { return content.includes('\r\n') ? '\r\n' : '\n' }
function normalizeAnchorToFileLE(anchor, fileLE) {
  const normalized = anchor.replace(/\r\n/g, '\n')
  return fileLE === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized
}

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched (marker: ' + idempotencyMarker + ')')
    return
  }

  const normalizedEdits = edits.map(e => ({
    find: normalizeAnchorToFileLE(e.find, LE),
    replace: normalizeAnchorToFileLE(e.replace, LE),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor #' + (i+1) + ' not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor #' + (i+1) + ' found ' + occurrences + ' times in ' + relPath + ':\n' + edit.find)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ============================================================
// Single edit: replace the early-return-on-missing-header block
// with the dev-fallback path.
// ============================================================
patchFile(
  'lib/tenant/getTenant.ts',
  [
    {
      find: `export async function getTenant(): Promise<Tenant | null> {
  const headerList = await headers()
  const tenantId = headerList.get('x-tenant-id')
  if (!tenantId) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(\``,
      replace: `export async function getTenant(): Promise<Tenant | null> {
  const headerList = await headers()
  let tenantId = headerList.get('x-tenant-id')

  // C8f -- localhost/preview dev fallback.
  // Production middleware injects x-tenant-id from host. In dev environments
  // (localhost, *.vercel.app preview) the middleware does not match any tenant
  // domain, so x-tenant-id is absent. Mirror the getTenantByHost dev fallback
  // (lib/utils/tenant-brand.ts:62-65): resolve tenant by DEV_TENANT_DOMAIN env var.
  if (!tenantId) {
    const host = headerList.get('host')
    if (host && (host.includes('localhost') || host.includes('vercel.app'))) {
      const devDomain = process.env.DEV_TENANT_DOMAIN
      if (!devDomain) return null

      const supabaseLookup = createServiceClient()
      const { data: byDomain } = await supabaseLookup
        .from('tenants')
        .select('id')
        .eq('domain', devDomain)
        .eq('is_active', true)
        .maybeSingle()

      if (!byDomain?.id) return null
      tenantId = byDomain.id
    } else {
      return null
    }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(\``,
    },
  ],
  'C8f Option beta: getTenant localhost fallback',
  'C8f -- localhost/preview dev fallback'
)

console.log('\n=== C8f patch complete ===')