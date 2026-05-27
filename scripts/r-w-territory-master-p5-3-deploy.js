#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * W-TERRITORY-MASTER P5.3 deploy script.
 *
 * Two files modified atomically:
 *   1. app/api/admin-homes/territory/geo-rollup/route.ts
 *        - Remove single-owner resolver call + cursor cascade walk
 *        - Replace with per-property-type inline apa lookups + ancestor walk
 *          + tenants.default_agent_id fallback
 *        - Response shape: remove primary_card_holder_ and inherited_from_
 *          fields; add condo_owner_/homes_owner_ triplets per row
 *   2. components/admin-homes/cockpit/territory/GeographyView.tsx
 *        - GeoRow interface: -4 fields, +6 fields
 *        - Table header: Holder column -> Condo + Homes columns
 *        - Table body: holder cell -> two property-type cells
 *        - conflictOnly predicate: updated to use source_tier
 *
 * Discipline:
 *   - Timestamped backup BEFORE each write (.backup_<ts>, ignored by gitignore *.backup_*)
 *   - Pre-write anchor uniqueness gate (every old_str count must equal 1)
 *   - Pre-write ASCII purity gate on all new content
 *   - 3-layer marker check post-write: v1 markers absent, v2 markers present,
 *     and v1 forbidden markers (the actively-removed identifiers) absent
 *   - Sanity check: primary_card_holder_ references drop to zero across both files
 *   - Sanity check: condo_owner_ + homes_owner_ references appear in both files
 *
 * Invocation:
 *   node scripts/r-w-territory-master-p5-3-deploy.js
 *
 * Idempotency: NOT idempotent. Each run modifies state; backup files capture pre-state.
 * Run TSC --noEmit after this and before commit.
 */

const fs = require('fs')
const path = require('path')

// ============================================================
// Discipline helpers
// ============================================================

function ts() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}

function assertAscii(label, content) {
  // The codebase has been bitten by U+2014 em dashes before (P5.2c ASCII purity rule).
  // Any non-ASCII char in a new payload is a violation.
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i)
    if (code > 127) {
      const start = Math.max(0, i - 30)
      const end = Math.min(content.length, i + 30)
      throw new Error(
        'ASCII violation in ' +
          label +
          ' at index ' +
          i +
          ' (charCode=' +
          code +
          '): "' +
          content.slice(start, end).replace(/\r?\n/g, '\\n') +
          '"'
      )
    }
  }
}

function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0
  let count = 0
  let pos = 0
  while (true) {
    const idx = haystack.indexOf(needle, pos)
    if (idx === -1) return count
    count++
    pos = idx + needle.length
  }
}

function applyEdit(label, content, oldStr, newStr) {
  const occ = countOccurrences(content, oldStr)
  if (occ !== 1) {
    throw new Error(
      'Anchor uniqueness violation in ' +
        label +
        ': expected exactly 1 occurrence of old_str, found ' +
        occ +
        '. First 100 chars of old_str: ' +
        JSON.stringify(oldStr.slice(0, 100))
    )
  }
  assertAscii(label + ' (new_str)', newStr)
  const next = content.replace(oldStr, newStr)
  if (next === content) {
    throw new Error('Edit produced no change in ' + label + '; this should never happen after uniqueness check.')
  }
  return next
}

function backupFile(filePath, tsStr) {
  const backupPath = filePath + '.backup_' + tsStr
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

// ============================================================
// FILE 1: app/api/admin-homes/territory/geo-rollup/route.ts
// ============================================================

const ROUTE_PATH = path.join(
  process.cwd(),
  'app',
  'api',
  'admin-homes',
  'territory',
  'geo-rollup',
  'route.ts'
)

// --- Edit R1: header doc block — add P5.3 context line to the existing comment header ---
// Anchored on the row-shape doc lines. Replace ONLY the row-shape description.
const R1_OLD =
  '// Returns: { rows: [...] }. Each row:\n' +
  '//   id, name, slug, level, parent_id, has_own_card,\n' +
  '//   listing_count, building_count, child_count,\n' +
  '//   primary_card_holder_agent_id?, primary_card_holder_name?,\n' +
  '//   inherited_from_level?, inherited_from_id?\n'

const R1_NEW =
  '// Returns: { rows: [...] }. Each row:\n' +
  '//   id, name, slug, level, parent_id, has_own_card,\n' +
  '//   listing_count, building_count, child_count,\n' +
  '//   condo_owner_id?, condo_owner_name?, condo_source_tier,\n' +
  '//   homes_owner_id?, homes_owner_name?, homes_source_tier\n' +
  '//\n' +
  '// W-TERRITORY-MASTER P5.3: per-property-type resolved owner + source tier.\n' +
  '// Source tier values: area | municipality | community | neighbourhood | tenant_default | unresolved.\n' +
  '// "Own scope" tier value equals the row level (e.g. row.level=community AND a primary\n' +
  '// apa row exists at that community with the property flag true -> source_tier = community).\n' +
  '// "Ancestor" tier values are the level where the cascade walk found a primary apa row\n' +
  '// with the property flag true (community -> municipality -> area; neighbourhood -> area).\n' +
  '// "tenant_default" means no apa row matched at any level for this property type and the\n' +
  '// row falls back to tenants.default_agent_id. "unresolved" means the tenant has no default.\n' +
  '//\n' +
  '// Replaces the v1 single-owner resolve_geo_primary call. resolve_geo_primary is NOT\n' +
  '// property-type-aware (verified 2026-05-27 oid 24991104) so P5.3 does the apa walk inline\n' +
  '// with a property-type filter. The canonical resolver chain is intentionally untouched.\n'

// --- Edit R2: the row-build loop — replace resolve_geo_primary + cursor walk with per-property-type lookups ---
// This is the heart of the change. Old block: lines that begin at the holderRes RPC call
// and end at the rows.push({...}) closing brace.
const R2_OLD =
  '    const rows: any[] = []\n' +
  '    for (const r of geoRes.rows) {\n' +
  "      const holderRes = await c.query(\n" +
  "        'SELECT resolve_geo_primary($1::text, $2::uuid, $3::uuid) AS holder_id',\n" +
  '        [level, r.id, tenantId]\n' +
  '      )\n' +
  '      const holderId: string | null = holderRes.rows[0]?.holder_id || null\n' +
  '\n' +
  '      let holderName: string | null = null\n' +
  '      if (holderId) {\n' +
  '        const aRes = await c.query(\n' +
  "          'SELECT full_name FROM agents WHERE id = $1::uuid LIMIT 1',\n" +
  '          [holderId]\n' +
  '        )\n' +
  '        holderName = aRes.rows[0]?.full_name || null\n' +
  '      }\n' +
  '\n' +
  '      let inheritedFromLevel: Level | null = null\n' +
  '      let inheritedFromId: string | null = null\n' +
  '      if (holderId && !r.has_own_card) {\n' +
  '        let cursorLevel: Level | null = PARENT_LEVEL_BY_LEVEL[level]\n' +
  '        let cursorId: string | null = r.parent_id\n' +
  '        while (cursorLevel && cursorId) {\n' +
  '          const cursorApaCol = APA_SCOPE_COL[cursorLevel]\n' +
  '          const hasSql =\n' +
  "            'SELECT EXISTS( ' +\n" +
  "            'SELECT 1 FROM agent_property_access apa ' +\n" +
  "            ' WHERE apa.tenant_id = $1::uuid ' +\n" +
  "            '   AND apa.scope = $2::text ' +\n" +
  "            '   AND apa.' + cursorApaCol + ' = $3::uuid ' +\n" +
  "            '   AND apa.agent_id = $4::uuid ' +\n" +
  "            '   AND apa.is_active = true ' +\n" +
  "            ') AS hit'\n" +
  '          const hasRes = await c.query(hasSql, [tenantId, cursorLevel, cursorId, holderId])\n' +
  '          if (hasRes.rows[0]?.hit === true) {\n' +
  '            inheritedFromLevel = cursorLevel\n' +
  '            inheritedFromId = cursorId\n' +
  '            break\n' +
  '          }\n' +
  '          const nextParentLevel: Level | null = PARENT_LEVEL_BY_LEVEL[cursorLevel]\n' +
  '          const nextParentFk = PARENT_FK_BY_LEVEL[cursorLevel]\n' +
  '          if (!nextParentLevel || !nextParentFk) {\n' +
  '            cursorLevel = null\n' +
  '            cursorId = null\n' +
  '            break\n' +
  '          }\n' +
  '          const cursorTable = TABLE_BY_LEVEL[cursorLevel]\n' +
  '          const parentLookup = await c.query(\n' +
  "            'SELECT ' + nextParentFk + ' AS pid FROM ' + cursorTable + ' WHERE id = $1::uuid LIMIT 1',\n" +
  '            [cursorId]\n' +
  '          )\n' +
  '          cursorLevel = nextParentLevel\n' +
  '          cursorId = parentLookup.rows[0]?.pid || null\n' +
  '        }\n' +
  '      }\n' +
  '\n' +
  '      rows.push({\n' +
  '        id: r.id,\n' +
  '        name: r.name,\n' +
  '        slug: r.slug,\n' +
  '        level,\n' +
  '        parent_id: r.parent_id,\n' +
  '        listing_count: r.listing_count,\n' +
  '        building_count: r.building_count,\n' +
  '        child_count: r.child_count,\n' +
  '        has_own_card: r.has_own_card,\n' +
  '        primary_card_holder_agent_id: holderId,\n' +
  '        primary_card_holder_name: holderName,\n' +
  '        inherited_from_level: inheritedFromLevel,\n' +
  '        inherited_from_id: inheritedFromId,\n' +
  '      })\n' +
  '    }\n'

const R2_NEW =
  '    // P5.3: load tenant default once outside the per-row loop. Used as the\n' +
  '    // terminal fallback when no apa row matches at any level for a property type.\n' +
  "    const defaultRes = await c.query(\n" +
  "      'SELECT default_agent_id FROM tenants WHERE id = $1::uuid LIMIT 1',\n" +
  '      [tenantId]\n' +
  '    )\n' +
  '    const tenantDefaultAgentId: string | null = defaultRes.rows[0]?.default_agent_id || null\n' +
  '\n' +
  '    // Resolve agent name for the tenant default once (avoid N queries when many\n' +
  '    // rows fall back to the same default).\n' +
  '    let tenantDefaultName: string | null = null\n' +
  '    if (tenantDefaultAgentId) {\n' +
  '      const dnRes = await c.query(\n' +
  "        'SELECT full_name FROM agents WHERE id = $1::uuid LIMIT 1',\n" +
  '        [tenantDefaultAgentId]\n' +
  '      )\n' +
  '      tenantDefaultName = dnRes.rows[0]?.full_name || null\n' +
  '    }\n' +
  '\n' +
  '    // Local cache: agent_id -> full_name. Avoids re-fetching the same agent name\n' +
  '    // across rows that resolve to the same owner.\n' +
  '    const agentNameCache = new Map<string, string | null>()\n' +
  '    if (tenantDefaultAgentId) agentNameCache.set(tenantDefaultAgentId, tenantDefaultName)\n' +
  '\n' +
  '    async function nameFor(agentId: string | null): Promise<string | null> {\n' +
  '      if (!agentId) return null\n' +
  '      if (agentNameCache.has(agentId)) return agentNameCache.get(agentId) || null\n' +
  '      const nRes = await c.query(\n' +
  "        'SELECT full_name FROM agents WHERE id = $1::uuid LIMIT 1',\n" +
  '        [agentId]\n' +
  '      )\n' +
  '      const nm = nRes.rows[0]?.full_name || null\n' +
  '      agentNameCache.set(agentId, nm)\n' +
  '      return nm\n' +
  '    }\n' +
  '\n' +
  '    // Per-property-type primary lookup at a single scope. Returns agent_id or null.\n' +
  '    // propertyCol must be one of the whitelisted access flag columns.\n' +
  "    async function lookupPrimary(scopeLevel: Level, scopeRowId: string, propertyCol: 'condo_access' | 'homes_access'): Promise<string | null> {\n" +
  '      const apaCol = APA_SCOPE_COL[scopeLevel]\n' +
  '      const sql =\n' +
  "        'SELECT agent_id FROM agent_property_access ' +\n" +
  "        ' WHERE tenant_id = $1::uuid ' +\n" +
  "        '   AND scope = $2::text ' +\n" +
  "        '   AND ' + apaCol + ' = $3::uuid ' +\n" +
  "        '   AND is_primary = true ' +\n" +
  "        '   AND is_active = true ' +\n" +
  "        '   AND ' + propertyCol + ' = true ' +\n" +
  "        ' LIMIT 1'\n" +
  '      const res = await c.query(sql, [tenantId, scopeLevel, scopeRowId])\n' +
  '      return res.rows[0]?.agent_id || null\n' +
  '    }\n' +
  '\n' +
  '    // Walk own-scope -> ancestor chain for a single property type. Returns\n' +
  '    // { ownerId, sourceTier }. Falls back to tenant_default, then unresolved.\n' +
  "    async function resolveForProperty(row: any, propertyCol: 'condo_access' | 'homes_access'): Promise<{ ownerId: string | null; sourceTier: string }> {\n" +
  '      // Step 1: own scope\n' +
  '      const ownHit = await lookupPrimary(level, row.id, propertyCol)\n' +
  "      if (ownHit) return { ownerId: ownHit, sourceTier: level }\n" +
  '\n' +
  '      // Step 2: walk ancestors\n' +
  '      let cursorLevel: Level | null = PARENT_LEVEL_BY_LEVEL[level]\n' +
  '      let cursorId: string | null = row.parent_id\n' +
  '      while (cursorLevel && cursorId) {\n' +
  '        const hit = await lookupPrimary(cursorLevel, cursorId, propertyCol)\n' +
  "        if (hit) return { ownerId: hit, sourceTier: cursorLevel }\n" +
  '        const nextParentLevel: Level | null = PARENT_LEVEL_BY_LEVEL[cursorLevel]\n' +
  '        const nextParentFk = PARENT_FK_BY_LEVEL[cursorLevel]\n' +
  '        if (!nextParentLevel || !nextParentFk) break\n' +
  '        const cursorTable = TABLE_BY_LEVEL[cursorLevel]\n' +
  '        const parentLookup = await c.query(\n' +
  "          'SELECT ' + nextParentFk + ' AS pid FROM ' + cursorTable + ' WHERE id = $1::uuid LIMIT 1',\n" +
  '          [cursorId]\n' +
  '        )\n' +
  '        cursorLevel = nextParentLevel\n' +
  '        cursorId = parentLookup.rows[0]?.pid || null\n' +
  '      }\n' +
  '\n' +
  '      // Step 3: tenant default\n' +
  "      if (tenantDefaultAgentId) return { ownerId: tenantDefaultAgentId, sourceTier: 'tenant_default' }\n" +
  '\n' +
  '      // Step 4: unresolved\n' +
  "      return { ownerId: null, sourceTier: 'unresolved' }\n" +
  '    }\n' +
  '\n' +
  '    const rows: any[] = []\n' +
  '    for (const r of geoRes.rows) {\n' +
  "      const condo = await resolveForProperty(r, 'condo_access')\n" +
  "      const homes = await resolveForProperty(r, 'homes_access')\n" +
  '      const condoName = await nameFor(condo.ownerId)\n' +
  '      const homesName = await nameFor(homes.ownerId)\n' +
  '\n' +
  '      rows.push({\n' +
  '        id: r.id,\n' +
  '        name: r.name,\n' +
  '        slug: r.slug,\n' +
  '        level,\n' +
  '        parent_id: r.parent_id,\n' +
  '        listing_count: r.listing_count,\n' +
  '        building_count: r.building_count,\n' +
  '        child_count: r.child_count,\n' +
  '        has_own_card: r.has_own_card,\n' +
  '        condo_owner_id: condo.ownerId,\n' +
  '        condo_owner_name: condoName,\n' +
  '        condo_source_tier: condo.sourceTier,\n' +
  '        homes_owner_id: homes.ownerId,\n' +
  '        homes_owner_name: homesName,\n' +
  '        homes_source_tier: homes.sourceTier,\n' +
  '      })\n' +
  '    }\n'

// ============================================================
// FILE 2: components/admin-homes/cockpit/territory/GeographyView.tsx
// ============================================================

const VIEW_PATH = path.join(
  process.cwd(),
  'components',
  'admin-homes',
  'cockpit',
  'territory',
  'GeographyView.tsx'
)

// --- Edit V1: GeoRow interface — drop 4 fields, add 6 ---
const V1_OLD =
  'interface GeoRow {\n' +
  '  id: string\n' +
  '  name: string\n' +
  '  slug: string | null\n' +
  '  level: Level\n' +
  '  parent_id: string | null\n' +
  '  listing_count: number\n' +
  '  building_count: number\n' +
  '  child_count: number\n' +
  '  has_own_card: boolean\n' +
  '  primary_card_holder_agent_id: string | null\n' +
  '  primary_card_holder_name: string | null\n' +
  '  inherited_from_level: Level | null\n' +
  '  inherited_from_id: string | null\n' +
  '}\n'

const V1_NEW =
  '// P5.3: per-property-type owner + source tier. Replaces the v1 single-owner shape.\n' +
  "type SourceTier = 'area' | 'municipality' | 'community' | 'neighbourhood' | 'tenant_default' | 'unresolved'\n" +
  '\n' +
  'interface GeoRow {\n' +
  '  id: string\n' +
  '  name: string\n' +
  '  slug: string | null\n' +
  '  level: Level\n' +
  '  parent_id: string | null\n' +
  '  listing_count: number\n' +
  '  building_count: number\n' +
  '  child_count: number\n' +
  '  has_own_card: boolean\n' +
  '  condo_owner_id: string | null\n' +
  '  condo_owner_name: string | null\n' +
  '  condo_source_tier: SourceTier\n' +
  '  homes_owner_id: string | null\n' +
  '  homes_owner_name: string | null\n' +
  '  homes_source_tier: SourceTier\n' +
  '}\n'

// --- Edit V2: conflictOnly filter predicate ---
const V2_OLD =
  '    // Conflict definition: has_own_card=true (own card exists) OR no holder at all.\n' +
  '    // The own-card case is flagged because operators want to verify whether the\n' +
  '    // own card is functional vs phantom (full functional-vs-phantom requires the\n' +
  '    // Cards view; this is the entry point).\n' +
  '    return rows.filter(r => r.has_own_card || !r.primary_card_holder_agent_id)\n'

const V2_NEW =
  '    // Conflict definition (P5.3): has_own_card=true OR either property type is\n' +
  '    // unresolved (no apa match at any level AND no tenant default). The own-card\n' +
  '    // case is flagged because operators want to verify whether the own card is\n' +
  '    // functional vs phantom (full functional-vs-phantom requires the Cards view;\n' +
  '    // this is the entry point).\n' +
  "    return rows.filter(r => r.has_own_card || r.condo_source_tier === 'unresolved' || r.homes_source_tier === 'unresolved')\n"

// --- Edit V3: table header — replace single Holder column with two ---
const V3_OLD =
  "              <th className='px-3 py-2 text-left'>{LEVEL_LABEL[currentLevel]}</th>\n" +
  "              <th className='px-3 py-2 text-right'>Listings</th>\n" +
  "              <th className='px-3 py-2 text-right'>Buildings</th>\n" +
  "              <th className='px-3 py-2 text-right'>Children</th>\n" +
  "              <th className='px-3 py-2 text-left'>Holder</th>\n" +
  "              <th className='px-3 py-2 text-right'>Actions</th>\n"

const V3_NEW =
  "              <th className='px-3 py-2 text-left'>{LEVEL_LABEL[currentLevel]}</th>\n" +
  "              <th className='px-3 py-2 text-right'>Listings</th>\n" +
  "              <th className='px-3 py-2 text-right'>Buildings</th>\n" +
  "              <th className='px-3 py-2 text-right'>Children</th>\n" +
  "              <th className='px-3 py-2 text-left'>Condo</th>\n" +
  "              <th className='px-3 py-2 text-left'>Homes</th>\n" +
  "              <th className='px-3 py-2 text-right'>Actions</th>\n"

// --- Edit V4: colSpan on the two loading/empty placeholders changes from 6 to 7 ---
const V4_OLD =
  '            {loading && (\n' +
  '              <tr>\n' +
  "                <td colSpan={6} className='px-3 py-6 text-center text-gray-500'>\n" +
  "                  <RefreshCw className='w-4 h-4 animate-spin inline-block mr-2' /> Loading {LEVEL_LABEL[currentLevel].toLowerCase()}...\n" +
  '                </td>\n' +
  '              </tr>\n' +
  '            )}\n' +
  '            {!loading && filtered && filtered.length === 0 && (\n' +
  '              <tr>\n' +
  "                <td colSpan={6} className='px-3 py-6 text-center text-gray-500'>\n" +
  '                  No rows match the current filter.\n' +
  '                </td>\n' +
  '              </tr>\n' +
  '            )}\n'

const V4_NEW =
  '            {loading && (\n' +
  '              <tr>\n' +
  "                <td colSpan={7} className='px-3 py-6 text-center text-gray-500'>\n" +
  "                  <RefreshCw className='w-4 h-4 animate-spin inline-block mr-2' /> Loading {LEVEL_LABEL[currentLevel].toLowerCase()}...\n" +
  '                </td>\n' +
  '              </tr>\n' +
  '            )}\n' +
  '            {!loading && filtered && filtered.length === 0 && (\n' +
  '              <tr>\n' +
  "                <td colSpan={7} className='px-3 py-6 text-center text-gray-500'>\n" +
  '                  No rows match the current filter.\n' +
  '                </td>\n' +
  '              </tr>\n' +
  '            )}\n'

// --- Edit V5: row body — replace holderState block + Holder cell with two property-type cells ---
const V5_OLD =
  '            {!loading && filtered && filtered.map(r => {\n' +
  '              const childLevel = CHILD_LEVEL[r.level]\n' +
  '              const canDrill = childLevel !== null && r.child_count > 0\n' +
  '              const holderState = r.has_own_card\n' +
  "                ? 'ASSIGNED'\n" +
  '                : r.primary_card_holder_agent_id\n' +
  "                  ? 'INHERITED'\n" +
  "                  : 'NONE'\n" +
  '              const stateClass =\n' +
  "                holderState === 'ASSIGNED' ? 'bg-green-50 text-green-700 border-green-200' :\n" +
  "                holderState === 'INHERITED' ? 'bg-blue-50 text-blue-700 border-blue-200' :\n" +
  "                'bg-amber-50 text-amber-700 border-amber-200'\n" +
  '              return (\n' +
  "                <tr key={r.id} className='border-t border-gray-100 hover:bg-gray-50'>\n" +
  "                  <td className='px-3 py-2'>\n" +
  "                    <div className='flex items-center gap-2'>\n" +
  "                      <MapPin className='w-3.5 h-3.5 text-gray-400' />\n" +
  "                      <span className='font-medium'>{r.name}</span>\n" +
  '                      {r.slug && (\n' +
  "                        <span className='text-xs text-gray-400'>/{r.slug}</span>\n" +
  '                      )}\n' +
  '                    </div>\n' +
  '                  </td>\n' +
  "                  <td className='px-3 py-2 text-right tabular-nums'>{r.listing_count.toLocaleString()}</td>\n" +
  "                  <td className='px-3 py-2 text-right tabular-nums'>{r.building_count.toLocaleString()}</td>\n" +
  "                  <td className='px-3 py-2 text-right tabular-nums'>{r.child_count.toLocaleString()}</td>\n" +
  "                  <td className='px-3 py-2'>\n" +
  "                    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + stateClass}>\n" +
  "                      {holderState === 'ASSIGNED' && <CheckCircle2 className='w-3 h-3' />}\n" +
  "                      {holderState === 'INHERITED' && <ChevronDown className='w-3 h-3' />}\n" +
  "                      {holderState === 'NONE' && <AlertTriangle className='w-3 h-3' />}\n" +
  '                      {r.primary_card_holder_name || "no holder"}\n' +
  '                    </span>\n' +
  '                    {holderState === \'INHERITED\' && r.inherited_from_level && (\n' +
  "                      <span className='ml-2 text-xs text-gray-500'>\n" +
  '                        from {LEVEL_LABEL[r.inherited_from_level].toLowerCase()}\n' +
  '                      </span>\n' +
  '                    )}\n' +
  '                  </td>\n'

const V5_NEW =
  '            {!loading && filtered && filtered.map(r => {\n' +
  '              const childLevel = CHILD_LEVEL[r.level]\n' +
  '              const canDrill = childLevel !== null && r.child_count > 0\n' +
  '              // P5.3: derive owner-cell state per property type from source_tier.\n' +
  '              // ASSIGNED  = source_tier equals this row\'s own level (own card)\n' +
  '              // INHERITED = source_tier is an ancestor level or tenant_default\n' +
  '              // NONE      = source_tier is unresolved\n' +
  "              function ownerState(tier: SourceTier): 'ASSIGNED' | 'INHERITED' | 'NONE' {\n" +
  "                if (tier === 'unresolved') return 'NONE'\n" +
  "                if (tier === r.level) return 'ASSIGNED'\n" +
  "                return 'INHERITED'\n" +
  '              }\n' +
  '              function ownerClass(state: string): string {\n' +
  "                if (state === 'ASSIGNED') return 'bg-green-50 text-green-700 border-green-200'\n" +
  "                if (state === 'INHERITED') return 'bg-blue-50 text-blue-700 border-blue-200'\n" +
  "                return 'bg-amber-50 text-amber-700 border-amber-200'\n" +
  '              }\n' +
  '              function tierHint(tier: SourceTier, state: string): string | null {\n' +
  "                if (state !== 'INHERITED') return null\n" +
  "                if (tier === 'tenant_default') return 'tenant default'\n" +
  '                return tier\n' +
  '              }\n' +
  '              const condoState = ownerState(r.condo_source_tier)\n' +
  '              const homesState = ownerState(r.homes_source_tier)\n' +
  '              return (\n' +
  "                <tr key={r.id} className='border-t border-gray-100 hover:bg-gray-50'>\n" +
  "                  <td className='px-3 py-2'>\n" +
  "                    <div className='flex items-center gap-2'>\n" +
  "                      <MapPin className='w-3.5 h-3.5 text-gray-400' />\n" +
  "                      <span className='font-medium'>{r.name}</span>\n" +
  '                      {r.slug && (\n' +
  "                        <span className='text-xs text-gray-400'>/{r.slug}</span>\n" +
  '                      )}\n' +
  '                    </div>\n' +
  '                  </td>\n' +
  "                  <td className='px-3 py-2 text-right tabular-nums'>{r.listing_count.toLocaleString()}</td>\n" +
  "                  <td className='px-3 py-2 text-right tabular-nums'>{r.building_count.toLocaleString()}</td>\n" +
  "                  <td className='px-3 py-2 text-right tabular-nums'>{r.child_count.toLocaleString()}</td>\n" +
  "                  <td className='px-3 py-2'>\n" +
  "                    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + ownerClass(condoState)}>\n" +
  "                      {condoState === 'ASSIGNED' && <CheckCircle2 className='w-3 h-3' />}\n" +
  "                      {condoState === 'INHERITED' && <ChevronDown className='w-3 h-3' />}\n" +
  "                      {condoState === 'NONE' && <AlertTriangle className='w-3 h-3' />}\n" +
  "                      {r.condo_owner_name || 'unresolved'}\n" +
  '                    </span>\n' +
  '                    {tierHint(r.condo_source_tier, condoState) && (\n' +
  "                      <span className='ml-2 text-xs text-gray-500'>\n" +
  '                        from {tierHint(r.condo_source_tier, condoState)}\n' +
  '                      </span>\n' +
  '                    )}\n' +
  '                  </td>\n' +
  "                  <td className='px-3 py-2'>\n" +
  "                    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + ownerClass(homesState)}>\n" +
  "                      {homesState === 'ASSIGNED' && <CheckCircle2 className='w-3 h-3' />}\n" +
  "                      {homesState === 'INHERITED' && <ChevronDown className='w-3 h-3' />}\n" +
  "                      {homesState === 'NONE' && <AlertTriangle className='w-3 h-3' />}\n" +
  "                      {r.homes_owner_name || 'unresolved'}\n" +
  '                    </span>\n' +
  '                    {tierHint(r.homes_source_tier, homesState) && (\n' +
  "                      <span className='ml-2 text-xs text-gray-500'>\n" +
  '                        from {tierHint(r.homes_source_tier, homesState)}\n' +
  '                      </span>\n' +
  '                    )}\n' +
  '                  </td>\n'

// ============================================================
// Execute
// ============================================================

function main() {
  const tsStr = ts()
  console.log('=== W-TERRITORY-MASTER P5.3 deploy ===')
  console.log('Timestamp: ' + tsStr)
  console.log('')

  // ---- File 1: geo-rollup route ----
  console.log('--- File 1: ' + ROUTE_PATH + ' ---')
  if (!fs.existsSync(ROUTE_PATH)) {
    throw new Error('Route file not found: ' + ROUTE_PATH)
  }
  const routeOriginal = fs.readFileSync(ROUTE_PATH, 'utf8')
  console.log('  pre-state bytes: ' + routeOriginal.length)
  if (routeOriginal.length !== 10974) {
    console.log(
      '  WARN: expected 10,974 bytes (verified 2026-05-27), got ' +
        routeOriginal.length +
        '. Continuing — anchor uniqueness will catch any drift.'
    )
  }

  // v1-baseline markers must be present pre-write
  if (routeOriginal.indexOf('resolve_geo_primary($1::text, $2::uuid, $3::uuid)') === -1) {
    throw new Error('Route v1-baseline marker missing: resolve_geo_primary RPC call. File may already be patched or has drifted.')
  }
  if (routeOriginal.indexOf('primary_card_holder_agent_id: holderId') === -1) {
    throw new Error('Route v1-baseline marker missing: primary_card_holder_agent_id assignment.')
  }

  const backupR = backupFile(ROUTE_PATH, tsStr)
  console.log('  backup: ' + backupR)

  let routeNext = routeOriginal
  routeNext = applyEdit('route R1 (doc header)', routeNext, R1_OLD, R1_NEW)
  console.log('  edit R1 OK: doc header')
  routeNext = applyEdit('route R2 (row-build loop)', routeNext, R2_OLD, R2_NEW)
  console.log('  edit R2 OK: row-build loop')

  // v1 forbidden markers must NOT remain
  const routeForbidden = [
    'resolve_geo_primary($1::text, $2::uuid, $3::uuid)',
    'primary_card_holder_agent_id: holderId',
    'primary_card_holder_name: holderName',
    'inherited_from_level: inheritedFromLevel',
    'inherited_from_id: inheritedFromId',
  ]
  for (const f of routeForbidden) {
    if (routeNext.indexOf(f) !== -1) {
      throw new Error('Route v1 forbidden marker still present after patch: ' + f)
    }
  }
  // v2 expected markers
  const routeRequired = [
    'condo_owner_id:',
    'condo_owner_name:',
    'condo_source_tier:',
    'homes_owner_id:',
    'homes_owner_name:',
    'homes_source_tier:',
    'tenants.default_agent_id',
    'lookupPrimary',
    'resolveForProperty',
    'W-TERRITORY-MASTER P5.3',
  ]
  for (const m of routeRequired) {
    if (routeNext.indexOf(m) === -1) {
      throw new Error('Route v2 required marker missing after patch: ' + m)
    }
  }

  fs.writeFileSync(ROUTE_PATH, routeNext, 'utf8')
  console.log('  wrote (bytes: ' + routeNext.length + ')')
  console.log('')

  // ---- File 2: GeographyView ----
  console.log('--- File 2: ' + VIEW_PATH + ' ---')
  if (!fs.existsSync(VIEW_PATH)) {
    throw new Error('View file not found: ' + VIEW_PATH)
  }
  const viewOriginal = fs.readFileSync(VIEW_PATH, 'utf8')
  console.log('  pre-state bytes: ' + viewOriginal.length)
  if (viewOriginal.length !== 21613) {
    console.log(
      '  WARN: expected 21,613 bytes (verified 2026-05-27), got ' +
        viewOriginal.length +
        '. Continuing — anchor uniqueness will catch any drift.'
    )
  }

  // v1-baseline markers must be present pre-write
  if (viewOriginal.indexOf('primary_card_holder_agent_id: string | null') === -1) {
    throw new Error('View v1-baseline marker missing: primary_card_holder_agent_id type. File may already be patched.')
  }
  if (viewOriginal.indexOf('r.primary_card_holder_name || "no holder"') === -1) {
    throw new Error('View v1-baseline marker missing: r.primary_card_holder_name render expression.')
  }

  const backupV = backupFile(VIEW_PATH, tsStr)
  console.log('  backup: ' + backupV)

  let viewNext = viewOriginal
  viewNext = applyEdit('view V1 (GeoRow interface)', viewNext, V1_OLD, V1_NEW)
  console.log('  edit V1 OK: GeoRow interface + SourceTier type')
  viewNext = applyEdit('view V2 (conflictOnly predicate)', viewNext, V2_OLD, V2_NEW)
  console.log('  edit V2 OK: conflictOnly predicate')
  viewNext = applyEdit('view V3 (table header)', viewNext, V3_OLD, V3_NEW)
  console.log('  edit V3 OK: table header (Holder -> Condo + Homes)')
  viewNext = applyEdit('view V4 (colSpan)', viewNext, V4_OLD, V4_NEW)
  console.log('  edit V4 OK: colSpan 6 -> 7 on placeholders')
  viewNext = applyEdit('view V5 (row body)', viewNext, V5_OLD, V5_NEW)
  console.log('  edit V5 OK: row body (holder cell -> 2 property cells)')

  // v1 forbidden markers must NOT remain
  const viewForbidden = [
    'primary_card_holder_agent_id',
    'primary_card_holder_name',
    'inherited_from_level',
    'inherited_from_id',
    "const holderState = r.has_own_card",
    'const stateClass =',
  ]
  for (const f of viewForbidden) {
    if (viewNext.indexOf(f) !== -1) {
      throw new Error('View v1 forbidden marker still present after patch: ' + f)
    }
  }
  // v2 expected markers
  const viewRequired = [
    'condo_owner_id: string | null',
    'condo_owner_name: string | null',
    'condo_source_tier: SourceTier',
    'homes_owner_id: string | null',
    'homes_owner_name: string | null',
    'homes_source_tier: SourceTier',
    "type SourceTier = 'area' | 'municipality' | 'community' | 'neighbourhood' | 'tenant_default' | 'unresolved'",
    "r.condo_source_tier === 'unresolved'",
    "r.homes_source_tier === 'unresolved'",
    "<th className='px-3 py-2 text-left'>Condo</th>",
    "<th className='px-3 py-2 text-left'>Homes</th>",
    'function ownerState',
    'function ownerClass',
    'function tierHint',
    'r.condo_owner_name',
    'r.homes_owner_name',
  ]
  for (const m of viewRequired) {
    if (viewNext.indexOf(m) === -1) {
      throw new Error('View v2 required marker missing after patch: ' + m)
    }
  }

  // Cross-file sanity check: confirm primary_card_holder_ references drop to zero
  // and condo_owner_ / homes_owner_ references appear in BOTH files.
  const combined = routeNext + '\n--FILE_BOUNDARY--\n' + viewNext
  if (combined.indexOf('primary_card_holder_') !== -1) {
    throw new Error('Cross-file sanity violation: primary_card_holder_ still appears somewhere after patch.')
  }
  const condoInRoute = countOccurrences(routeNext, 'condo_owner_')
  const condoInView = countOccurrences(viewNext, 'condo_owner_')
  const homesInRoute = countOccurrences(routeNext, 'homes_owner_')
  const homesInView = countOccurrences(viewNext, 'homes_owner_')
  if (condoInRoute < 2 || condoInView < 2 || homesInRoute < 2 || homesInView < 2) {
    throw new Error(
      'Cross-file sanity violation: condo_owner_ / homes_owner_ under-represented. ' +
        'route condo=' +
        condoInRoute +
        ' homes=' +
        homesInRoute +
        '; view condo=' +
        condoInView +
        ' homes=' +
        homesInView
    )
  }

  fs.writeFileSync(VIEW_PATH, viewNext, 'utf8')
  console.log('  wrote (bytes: ' + viewNext.length + ')')
  console.log('')

  console.log('=== DEPLOY COMPLETE ===')
  console.log('Next steps:')
  console.log('  1. npx tsc --noEmit')
  console.log('  2. node scripts/r-w-territory-master-p5-3-smoke.js')
  console.log('  3. Local browser smoke as King Shah tenant admin')
  console.log('  4. git add ' + ROUTE_PATH + ' ' + VIEW_PATH + ' scripts/r-w-territory-master-p5-3-*.js docs/W-TERRITORY-MASTER-TRACKER.md')
  console.log('  5. atomic commit + push')
}

try {
  main()
} catch (err) {
  console.error('DEPLOY FAILED:', err.message)
  console.error(err.stack)
  process.exit(1)
}