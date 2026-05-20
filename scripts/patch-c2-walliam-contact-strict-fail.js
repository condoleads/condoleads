// scripts/patch-c2-walliam-contact-strict-fail.js
// C2 - Replace silent 'walliam' fallback in walliam/contact with strict 500 throw
// Defect retired: D4 (walliam/contact:73)
// Idempotent: detects already-patched state and exits clean

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function detectLineEnding(content) {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeAnchorToFileLE(anchor, fileLE) {
  const normalized = anchor.replace(/\r\n/g, '\n')
  if (fileLE === '\r\n') return normalized.replace(/\n/g, '\r\n')
  return normalized
}

function patchFile(relPath, edits, description, idempotencyMarker) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

  // Idempotency check
  if (idempotencyMarker && content.includes(idempotencyMarker)) {
    console.log('SKIP ' + relPath + ' -- already patched (idempotency marker present: "' + idempotencyMarker + '")')
    return
  }

  const normalizedEdits = edits.map(e => ({
    find: normalizeAnchorToFileLE(e.find, LE),
    replace: normalizeAnchorToFileLE(e.replace, LE),
  }))

  for (const edit of normalizedEdits) {
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) {
      throw new Error('Anchor not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    }
    if (occurrences > 1) {
      throw new Error('Anchor found ' + occurrences + ' times in ' + relPath + ':\n' + edit.find)
    }
  }

  for (const edit of normalizedEdits) {
    content = content.replace(edit.find, edit.replace)
  }

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// C2/D4: Replace silent fallback block with strict-fail
// Anchor: the full block from `// T6f-C-1` comment through the closing brace of the else branch
patchFile(
  'app/api/walliam/contact/route.ts',
  [
    {
      find: `    // T6f-C-1 — tenant brand context (tenant_id guaranteed non-null by L62 check)
    let brandName = ''
    let sourceKey = 'walliam'  // safe default — replaced when tenant load succeeds
    const _t6fcCtx = await getTenantContext(supabase, tenant_id)
    if (_t6fcCtx) {
      brandName = _t6fcCtx.brandName
      sourceKey = _t6fcCtx.sourceKey
    } else {
      console.warn('[walliam/contact] getTenantContext returned null for tenant_id:', tenant_id)
    }`,
      replace: `    // C2/D4 -- tenant brand context (strict-fail: no silent fallback)
    // Per multi-tenant rule zero: a missing tenant config is a server-side data
    // integrity issue, not a recoverable condition. Returning 500 here prevents
    // cross-tenant lead misattribution from a silent default source value.
    const _t6fcCtx = await getTenantContext(supabase, tenant_id)
    if (!_t6fcCtx) {
      console.error('[walliam/contact] tenant context unavailable for tenant_id:', tenant_id)
      return NextResponse.json({ error: 'Tenant configuration unavailable' }, { status: 500 })
    }
    const brandName = _t6fcCtx.brandName
    const sourceKey = _t6fcCtx.sourceKey`,
    },
  ],
  'D4: walliam/contact strict-fail on tenant lookup',
  'C2/D4 -- tenant brand context (strict-fail'
)

console.log('\n=== C2 patch complete ===')