// scripts/patch-c3-estimator-session-tenant-id.js
// C3 - Add p_tenant_id to resolve_agent_for_context call in estimator/session
// Defect retired: D3 (walliam/estimator/session:81-89)
// Idempotent

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
    console.log('SKIP ' + relPath + ' -- already patched')
    return
  }

  const normalizedEdits = edits.map(e => ({
    find: normalizeAnchorToFileLE(e.find, LE),
    replace: normalizeAnchorToFileLE(e.replace, LE),
  }))

  for (const edit of normalizedEdits) {
    const occurrences = content.split(edit.find).length - 1
    if (occurrences === 0) throw new Error('Anchor not found in ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + '):\n' + edit.find)
    if (occurrences > 1) throw new Error('Anchor found ' + occurrences + ' times in ' + relPath)
  }

  for (const edit of normalizedEdits) content = content.replace(edit.find, edit.replace)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log('Patched ' + relPath + ' (LE=' + (LE === '\r\n' ? 'CRLF' : 'LF') + ') -- ' + edits.length + ' edit(s) -- ' + description)
}

// C3/D3: add p_tenant_id param
patchFile(
  'app/api/walliam/estimator/session/route.ts',
  [
    {
      find: `    // Step 2: Resolve agent via priority chain (for lead routing only)
    const { data: resolvedAgentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listingId || null,
      p_building_id: buildingId || null,
      p_neighbourhood_id: null,
      p_community_id: communityId || null,
      p_municipality_id: municipalityId || null,
      p_area_id: areaId || null,
      p_user_id: userId || null,
    })`,
      replace: `    // Step 2: Resolve agent via priority chain (for lead routing only)
    // C3/D3 -- p_tenant_id added; resolver now scopes to the calling tenant.
    // Was: missing param caused resolver to potentially match agents from any
    // tenant whose territory covered the geo (cross-tenant agent leak risk).
    const { data: resolvedAgentId } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listingId || null,
      p_building_id: buildingId || null,
      p_neighbourhood_id: null,
      p_community_id: communityId || null,
      p_municipality_id: municipalityId || null,
      p_area_id: areaId || null,
      p_user_id: userId || null,
      p_tenant_id: tenantId,
    })`,
    },
  ],
  'D3: estimator/session p_tenant_id',
  'C3/D3 -- p_tenant_id added'
)

console.log('\n=== C3 patch complete ===')