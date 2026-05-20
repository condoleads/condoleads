// scripts/patch-c6-charlie-executetool-tenant-domain.js
// C6 - executeTool accepts tenantDomain; all hardcoded URLs replaced
// Defect retired: D9 (8 hardcoded literal domain refs in charlie/route.ts)
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

patchFile(
  'app/api/charlie/route.ts',
  [
    // E1 -- executeTool signature accepts tenantDomain
    {
      find: `async function executeTool(name: string, input: any, agentId: string | null, geoContext?: any): Promise<any> {`,
      replace: `// C6/D9 -- tenantDomain param added; all platform URLs inside this function are now tenant-derived
async function executeTool(name: string, input: any, agentId: string | null, geoContext?: any, tenantDomain: string = ''): Promise<any> {`,
    },
    // E2 -- caller #1 (line 163 building intel pre-load) -- thread tenantDomain
    {
      find: `      const buildingIntel = await executeTool('get_building_intelligence', { building_id: geoContext.building_id }, agentId, geoContext)`,
      replace: `      const buildingIntel = await executeTool('get_building_intelligence', { building_id: geoContext.building_id }, agentId, geoContext, tenantDomain)`,
    },
    // E3 -- caller #2 (line 502 main tool dispatch) -- thread tenantDomain
    {
      find: `              const result = await executeTool(tool.name, tool.input, agentId, geoContext)`,
      replace: `              const result = await executeTool(tool.name, tool.input, agentId, geoContext, tenantDomain)`,
    },
    // E4 -- line 178 inside POST: Building URL literal in pre-load output
    {
      find: `  Building URL: https://walliam.ca/\${b?.slug}`,
      replace: `  Building URL: https://\${tenantDomain}/\${b?.slug}`,
    },
    // E5 -- line 287 inside POST: low-credits fetch fallback URL (1st occurrence -- chat)
    // E6 -- line 484 inside POST: low-credits fetch fallback URL (2nd occurrence -- plans)
    // Both lines are identical patterns. Replace once -- assert exactly two occurrences first via a wrapping match.
    {
      find: `            fetch(new URL('/api/email/low-credits', process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca').toString(), {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: sessionData.user_id, creditType: 'chat', remaining: 1, sessionId }),`,
      replace: `            fetch(new URL('/api/email/low-credits', process.env.NEXT_PUBLIC_APP_URL || \`https://\${tenantDomain}\`).toString(), {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: sessionData.user_id, creditType: 'chat', remaining: 1, sessionId }),`,
    },
    // E6 -- second low-credits fetch (plan credits)
    {
      find: `                    fetch(new URL('/api/email/low-credits', process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca').toString(), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },`,
      replace: `                    fetch(new URL('/api/email/low-credits', process.env.NEXT_PUBLIC_APP_URL || \`https://\${tenantDomain}\`).toString(), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },`,
    },
    // E7 -- search_buildings baseUrl
    {
      find: `  if (name === 'search_buildings') {
    const { geoType, geoId, sort = 'active_count', limit = 5 } = input
    const baseUrl = 'https://walliam.ca'`,
      replace: `  if (name === 'search_buildings') {
    const { geoType, geoId, sort = 'active_count', limit = 5 } = input
    const baseUrl = \`https://\${tenantDomain}\``,
    },
    // E8 -- compare_geo baseUrl
    {
      find: `  if (name === 'compare_geo') {
    const { geoIds, geoType, track = 'condo' } = input
    if (!geoIds || !Array.isArray(geoIds)) return { error: 'geoIds array required' }
    const baseUrl = 'https://walliam.ca'`,
      replace: `  if (name === 'compare_geo') {
    const { geoIds, geoType, track = 'condo' } = input
    if (!geoIds || !Array.isArray(geoIds)) return { error: 'geoIds array required' }
    const baseUrl = \`https://\${tenantDomain}\``,
    },
    // E9 -- get_investment_rankings baseUrl
    {
      find: `  if (name === 'get_investment_rankings') {
    const { parentGeoType, parentGeoId, track = 'condo', rankingType = 'best_yield' } = input
    const baseUrl = 'https://walliam.ca'`,
      replace: `  if (name === 'get_investment_rankings') {
    const { parentGeoType, parentGeoId, track = 'condo', rankingType = 'best_yield' } = input
    const baseUrl = \`https://\${tenantDomain}\``,
    },
    // E10 -- get_inventory_rankings baseUrl
    {
      find: `  if (name === 'get_inventory_rankings') {
    const { parentGeoType, parentGeoId, track = 'condo' } = input
    const baseUrl = 'https://walliam.ca'`,
      replace: `  if (name === 'get_inventory_rankings') {
    const { parentGeoType, parentGeoId, track = 'condo' } = input
    const baseUrl = \`https://\${tenantDomain}\``,
    },
    // E11 -- get_building_directory baseUrl
    {
      find: `  if (name === 'get_building_directory') {
    const { geoType, geoId, limit = 20 } = input
    const baseUrl = 'https://walliam.ca'`,
      replace: `  if (name === 'get_building_directory') {
    const { geoType, geoId, limit = 20 } = input
    const baseUrl = \`https://\${tenantDomain}\``,
    },
  ],
  'D9: charlie/route.ts executeTool + URL refs tenantDomain',
  'C6/D9 -- tenantDomain param added; all platform URLs inside this function'
)

console.log('\n=== C6 patch complete ===')