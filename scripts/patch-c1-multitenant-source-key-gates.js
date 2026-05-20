// scripts/patch-c1-multitenant-source-key-gates.js
// C1 - Source-key gates + auth-user attribution
// Defects retired: D1 (walliam/estimator/increment), D5 (walliam/contact)
// v3 - line-ending-aware anchor matching

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function detectLineEnding(content) {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeAnchorToFileLE(anchor, fileLE) {
  const normalized = anchor.replace(/\r\n/g, '\n')
  if (fileLE === '\r\n') {
    return normalized.replace(/\n/g, '\r\n')
  }
  return normalized
}

function patchFile(relPath, edits, description) {
  const fullPath = path.join(ROOT, relPath)
  let content = fs.readFileSync(fullPath, 'utf8')
  const LE = detectLineEnding(content)

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
      throw new Error('Anchor found ' + occurrences + ' times (must be unique) in ' + relPath + ':\n' + edit.find)
    }
  }

  for (const edit of normalizedEdits) {
    content = content.replace(edit.find, edit.replace)
  }

  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// ===== FILE 1: walliam/estimator/increment/route.ts (CRLF on disk) =====
patchFile(
  'app/api/walliam/estimator/increment/route.ts',
  [
    {
      find: `    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('estimator_count, user_id, source')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    if (!session.user_id || session.source !== 'walliam') {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }`,
      replace: `    // C1/D1 -- auth gate validates session.source against the tenant source_key
    // (was: hardcoded session.source !== 'walliam' which blocked all non-WALLiam tenants)
    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('estimator_count, user_id, source, tenant_id')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    if (!session.user_id || !session.tenant_id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // C1/D1 -- resolve tenant source_key and require session.source match
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenants')
      .select('source_key')
      .eq('id', session.tenant_id)
      .single()
    if (tenantErr || !tenantRow || !tenantRow.source_key) {
      console.error('[walliam/estimator/increment] tenant source_key fetch failed:', tenantErr)
      return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })
    }
    if (session.source !== tenantRow.source_key) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }`,
    },
  ],
  'D1: source-key auth gate'
)

// ===== FILE 2: walliam/contact/route.ts (LF on disk) =====
patchFile(
  'app/api/walliam/contact/route.ts',
  [
    {
      find: `      const result = await getOrCreateAuthUserByEmail(supabase, email, {
        source: 'walliam_contact_form',
        initial_contact_name: name,
        initial_tenant_id: tenant_id,
      })`,
      replace: `      const result = await getOrCreateAuthUserByEmail(supabase, email, {
        // C1/D5 -- build source from tenant source_key (was: hardcoded 'walliam_contact_form')
        source: \`\${sourceKey}_contact_form\`,
        initial_contact_name: name,
        initial_tenant_id: tenant_id,
      })`,
    },
  ],
  'D5: auth-user attribution'
)

console.log('\n=== C1 patch complete ===')