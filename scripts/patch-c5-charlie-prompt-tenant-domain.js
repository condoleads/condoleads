// scripts/patch-c5-charlie-prompt-tenant-domain.js
// C5 - Add tenantDomain param to buildCharlieSystemPrompt and replace
//      hardcoded walliam.ca URLs in prompt body. Update single caller.
// Defect retired: D8 (charlie-prompts.ts lines 130, 131, 144, 146-149)
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

// ===== FILE 1: charlie-prompts.ts =====
// (a) signature: add tenantDomain param
// (b) NEIGHBOURHOOD RULES block: 2 walliam.ca URLs
// (c) PLATFORM LINKS block: 5 walliam.ca URLs
patchFile(
  'app/charlie/lib/charlie-prompts.ts',
  [
    {
      // Signature change -- add tenantDomain param (no default; caller must pass)
      find: `export function buildCharlieSystemPrompt(agentName: string, brokerageName: string | null, assistantName: string = 'Charlie') {`,
      replace: `// C5/D8 -- tenantDomain param added; all platform URLs now tenant-derived (was: hardcoded walliam.ca literals)
export function buildCharlieSystemPrompt(agentName: string, brokerageName: string | null, assistantName: string = 'Charlie', tenantDomain: string) {`,
    },
    {
      // NEIGHBOURHOOD RULES block -- 2 literal walliam.ca refs
      find: `NEIGHBOURHOOD RULES:
- Neighbourhood pages exist at https://walliam.ca/toronto/[neighbourhood-slug]
- When user asks about a Toronto neighbourhood, link to: [Neighbourhood Name](https://walliam.ca/toronto/[slug])
- Call get_market_analytics with the municipality_id of the neighbourhood for market data.`,
      replace: `NEIGHBOURHOOD RULES:
- Neighbourhood pages exist at https://\${tenantDomain}/toronto/[neighbourhood-slug]
- When user asks about a Toronto neighbourhood, link to: [Neighbourhood Name](https://\${tenantDomain}/toronto/[slug])
- Call get_market_analytics with the municipality_id of the neighbourhood for market data.`,
    },
    {
      // PLATFORM LINKS block -- 5 literal walliam.ca refs
      find: `- Base URL: https://walliam.ca
- URL structure:
  - Municipality page: https://walliam.ca/[municipality-slug] e.g. https://walliam.ca/whitby
  - Community page: https://walliam.ca/[community-slug] e.g. https://walliam.ca/downtown-whitby
  - Building page: https://walliam.ca/[building-slug] e.g. https://walliam.ca/sailwinds-360-watson-street-w-whitby
  - Property page: https://walliam.ca/[listing-slug] (use _slug field from search results)`,
      replace: `- Base URL: https://\${tenantDomain}
- URL structure:
  - Municipality page: https://\${tenantDomain}/[municipality-slug] e.g. https://\${tenantDomain}/whitby
  - Community page: https://\${tenantDomain}/[community-slug] e.g. https://\${tenantDomain}/downtown-whitby
  - Building page: https://\${tenantDomain}/[building-slug] e.g. https://\${tenantDomain}/sailwinds-360-watson-street-w-whitby
  - Property page: https://\${tenantDomain}/[listing-slug] (use _slug field from search results)`,
    },
  ],
  'D8: charlie-prompts.ts tenantDomain parameterization',
  'C5/D8 -- tenantDomain param added'
)

// ===== FILE 2: app/api/charlie/route.ts =====
// Update single caller to pass tenantDomain (already in scope at line 92)
patchFile(
  'app/api/charlie/route.ts',
  [
    {
      find: `  const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName, assistantName) + geoReminder + buildingContext + geoAnalyticsContext`,
      replace: `  // C5/D8 -- tenantDomain passed (from tenantConfig.domain at line 92) -- prompt URLs are now tenant-derived
  const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName, assistantName, tenantDomain) + geoReminder + buildingContext + geoAnalyticsContext`,
    },
  ],
  'D8: charlie/route.ts caller updated',
  'C5/D8 -- tenantDomain passed'
)

console.log('\n=== C5 patch complete ===')