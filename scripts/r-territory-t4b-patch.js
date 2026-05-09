#!/usr/bin/env node
// scripts/r-territory-t4b-patch.js
// W-TERRITORY T4b — public geo card display resolver swap + neighbourhood_id pass-through + dead-constant cleanup
// 4 files, 12 anchored edits, atomic per-file with timestamped backup, idempotent, CRLF/LF tolerant.
//
// Files:
//   1. components/WalliamAgentCard.tsx                                 (4 edits)
//   2. app/api/walliam/resolve-agent/route.ts                          (3 edits)
//   3. lib/utils/is-walliam.ts                                         (3 edits)
//   4. app/comprehensive-site/toronto/[neighbourhood]/page.tsx         (2 edits)
//
// Findings closed: F-IS-WALLIAM-DEAD-CONSTANT (dead WALLIAM_TENANT_ID const removed)
// RPC contract changes:
//   - /api/walliam/resolve-agent now calls resolve_display_agent_for_context (is_selling-aware)
//   - lib/utils/is-walliam.ts resolveWalliamAgent keeps resolve_agent_for_context (routing)

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()
const TIMESTAMP = (() => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
})()

let totalPatched = 0
let totalSkipped = 0

// ---------- helpers ----------

function backup(relPath) {
  const abs = path.join(PROJECT_ROOT, relPath)
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found for backup: ${relPath}`)
  }
  const bak = abs + `.backup_${TIMESTAMP}`
  fs.copyFileSync(abs, bak)
  console.log(`  BACKUP: ${relPath}.backup_${TIMESTAMP}`)
}

// Apply an exact-string edit. CRLF/LF tolerant. Idempotent via alreadyMarker.
function tryEdit({ file, label, oldStr, newStr, alreadyMarker }) {
  const abs = path.join(PROJECT_ROOT, file)
  const raw = fs.readFileSync(abs, 'utf8')
  const usesCRLF = raw.includes('\r\n')
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw

  if (alreadyMarker && content.includes(alreadyMarker)) {
    console.log(`  SKIP (already applied): ${label}`)
    totalSkipped++
    return
  }

  const matches = content.split(oldStr).length - 1
  if (matches === 0) {
    throw new Error(`Anchor not found for "${label}" in ${file}`)
  }
  if (matches > 1) {
    throw new Error(`Anchor matched ${matches} times for "${label}" in ${file} — must be unique`)
  }

  let updated = content.replace(oldStr, newStr)
  if (usesCRLF) updated = updated.replace(/\n/g, '\r\n')
  fs.writeFileSync(abs, updated, 'utf8')
  console.log(`  PATCHED: ${label}`)
  totalPatched++
}

// Inverted-marker variant for deletions: skip if the dead string is already gone.
function tryDelete({ file, label, oldStr, presentMarker }) {
  const abs = path.join(PROJECT_ROOT, file)
  const raw = fs.readFileSync(abs, 'utf8')
  const usesCRLF = raw.includes('\r\n')
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw

  if (!content.includes(presentMarker)) {
    console.log(`  SKIP (already applied): ${label}`)
    totalSkipped++
    return
  }

  const matches = content.split(oldStr).length - 1
  if (matches === 0) {
    throw new Error(`Anchor not found for "${label}" in ${file}`)
  }
  if (matches > 1) {
    throw new Error(`Anchor matched ${matches} times for "${label}" in ${file} — must be unique`)
  }

  let updated = content.replace(oldStr, '')
  if (usesCRLF) updated = updated.replace(/\n/g, '\r\n')
  fs.writeFileSync(abs, updated, 'utf8')
  console.log(`  PATCHED: ${label}`)
  totalPatched++
}

// ---------- run ----------

console.log('\n=== W-TERRITORY T4b patch script ===')
console.log(`Timestamp: ${TIMESTAMP}\n`)

const FILES = [
  'components/WalliamAgentCard.tsx',
  'app/api/walliam/resolve-agent/route.ts',
  'lib/utils/is-walliam.ts',
  'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
]

console.log('--- Backups ---')
for (const f of FILES) backup(f)
console.log()

// =======================================================================
// File 1: components/WalliamAgentCard.tsx
// =======================================================================
console.log('--- File 1: components/WalliamAgentCard.tsx ---')

tryEdit({
  file: 'components/WalliamAgentCard.tsx',
  label: 'A1: props interface — add neighbourhood_id',
  oldStr:
    `  building_id?: string | null
  community_id?: string | null`,
  newStr:
    `  building_id?: string | null
  neighbourhood_id?: string | null
  community_id?: string | null`,
  alreadyMarker:
    `  neighbourhood_id?: string | null
  community_id?: string | null`,
})

tryEdit({
  file: 'components/WalliamAgentCard.tsx',
  label: 'A2: function destructure — add neighbourhood_id',
  oldStr:
    `  listing_id,
  building_id,
  community_id,
  municipality_id,
  area_id,
  tenant_id,
  hideCTA = false,
}: WalliamAgentCardProps)`,
  newStr:
    `  listing_id,
  building_id,
  neighbourhood_id,
  community_id,
  municipality_id,
  area_id,
  tenant_id,
  hideCTA = false,
}: WalliamAgentCardProps)`,
  alreadyMarker:
    `  building_id,
  neighbourhood_id,
  community_id,
  municipality_id,
  area_id,
  tenant_id,`,
})

tryEdit({
  file: 'components/WalliamAgentCard.tsx',
  label: 'A3: fetch body — add neighbourhood_id',
  oldStr:
    `            listing_id: listing_id || null,
            building_id: building_id || null,
            community_id: community_id || null,`,
  newStr:
    `            listing_id: listing_id || null,
            building_id: building_id || null,
            neighbourhood_id: neighbourhood_id || null,
            community_id: community_id || null,`,
  alreadyMarker:
    `            building_id: building_id || null,
            neighbourhood_id: neighbourhood_id || null,`,
})

tryEdit({
  file: 'components/WalliamAgentCard.tsx',
  label: 'A4: useEffect deps — add neighbourhood_id',
  oldStr: `  }, [listing_id, building_id, community_id, municipality_id, area_id])`,
  newStr: `  }, [listing_id, building_id, neighbourhood_id, community_id, municipality_id, area_id])`,
  alreadyMarker: `[listing_id, building_id, neighbourhood_id, community_id, municipality_id, area_id]`,
})

// =======================================================================
// File 2: app/api/walliam/resolve-agent/route.ts
// =======================================================================
console.log('\n--- File 2: app/api/walliam/resolve-agent/route.ts ---')

tryEdit({
  file: 'app/api/walliam/resolve-agent/route.ts',
  label: 'B1: request destructure — add neighbourhood_id',
  oldStr:
    `    const {
      listing_id,
      building_id,
      community_id,
      municipality_id,
      area_id,
      user_id,
    } = await req.json()`,
  newStr:
    `    const {
      listing_id,
      building_id,
      neighbourhood_id,
      community_id,
      municipality_id,
      area_id,
      user_id,
    } = await req.json()`,
  alreadyMarker:
    `      building_id,
      neighbourhood_id,
      community_id,
      municipality_id,
      area_id,
      user_id,
    } = await req.json()`,
})

tryEdit({
  file: 'app/api/walliam/resolve-agent/route.ts',
  label: 'B2: RPC swap to resolve_display_agent_for_context + pass neighbourhood_id',
  oldStr:
    `    // Call the DB resolution function
    const { data, error } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_neighbourhood_id: null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: user_id || null,
      p_tenant_id: tenantId,
    })`,
  newStr:
    `    // Call the DB display-resolution function (is_selling-aware, public-card surface)
    const { data, error } = await supabase.rpc('resolve_display_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_neighbourhood_id: neighbourhood_id || null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: user_id || null,
      p_tenant_id: tenantId,
    })`,
  alreadyMarker: `'resolve_display_agent_for_context'`,
})

tryEdit({
  file: 'app/api/walliam/resolve-agent/route.ts',
  label: 'B3: source detection — include neighbourhood_id in geo_assignment check',
  oldStr:
    `    if (source === 'walliam_default' && (community_id || municipality_id || area_id)) {
      source = 'geo_assignment'
    }`,
  newStr:
    `    if (source === 'walliam_default' && (neighbourhood_id || community_id || municipality_id || area_id)) {
      source = 'geo_assignment'
    }`,
  alreadyMarker: `(neighbourhood_id || community_id || municipality_id || area_id)`,
})

// =======================================================================
// File 3: lib/utils/is-walliam.ts
// =======================================================================
console.log('\n--- File 3: lib/utils/is-walliam.ts ---')

tryDelete({
  file: 'lib/utils/is-walliam.ts',
  label: 'C1: remove dead WALLIAM_TENANT_ID constant (F-IS-WALLIAM-DEAD-CONSTANT)',
  oldStr:
    `const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

`,
  presentMarker: `const WALLIAM_TENANT_ID =`,
})

tryEdit({
  file: 'lib/utils/is-walliam.ts',
  label: 'C2: resolveWalliamAgent params — add neighbourhood_id',
  oldStr:
    `export async function resolveWalliamAgent(params: {
  listing_id?: string | null
  building_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
  user_id?: string | null
  tenant_id: string
}): Promise<string | null> {`,
  newStr:
    `export async function resolveWalliamAgent(params: {
  listing_id?: string | null
  building_id?: string | null
  neighbourhood_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
  user_id?: string | null
  tenant_id: string
}): Promise<string | null> {`,
  alreadyMarker:
    `  building_id?: string | null
  neighbourhood_id?: string | null
  community_id?: string | null`,
})

tryEdit({
  file: 'lib/utils/is-walliam.ts',
  label: 'C3: resolveWalliamAgent RPC call — pass neighbourhood_id (was hardcoded null)',
  oldStr:
    `    const { data } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: params.listing_id || null,
      p_building_id: params.building_id || null,
      p_neighbourhood_id: null,
      p_community_id: params.community_id || null,
      p_municipality_id: params.municipality_id || null,
      p_area_id: params.area_id || null,
      p_user_id: params.user_id || null,
      p_tenant_id: params.tenant_id,
    })`,
  newStr:
    `    const { data } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: params.listing_id || null,
      p_building_id: params.building_id || null,
      p_neighbourhood_id: params.neighbourhood_id || null,
      p_community_id: params.community_id || null,
      p_municipality_id: params.municipality_id || null,
      p_area_id: params.area_id || null,
      p_user_id: params.user_id || null,
      p_tenant_id: params.tenant_id,
    })`,
  alreadyMarker: `p_neighbourhood_id: params.neighbourhood_id || null`,
})

// =======================================================================
// File 4: app/comprehensive-site/toronto/[neighbourhood]/page.tsx
// =======================================================================
console.log('\n--- File 4: app/comprehensive-site/toronto/[neighbourhood]/page.tsx ---')

// D1: server helper call uses data.neighbourhood.id because `neighbourhood` is not
// yet destructured from `data` at this line in the source.
tryEdit({
  file: 'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  label: 'D1: resolveWalliamAgent server call — pass neighbourhood_id',
  oldStr:
    `  if (isWalliam && tenantId) {
    walliamAgentId = await resolveWalliamAgent({ tenant_id: tenantId })
  }`,
  newStr:
    `  if (isWalliam && tenantId) {
    walliamAgentId = await resolveWalliamAgent({ neighbourhood_id: data.neighbourhood.id, tenant_id: tenantId })
  }`,
  alreadyMarker: `resolveWalliamAgent({ neighbourhood_id: data.neighbourhood.id, tenant_id: tenantId })`,
})

tryEdit({
  file: 'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  label: 'D2: WalliamAgentCard JSX — pass neighbourhood_id prop',
  oldStr: `          <WalliamAgentCard tenant_id={tenantId!} />`,
  newStr: `          <WalliamAgentCard neighbourhood_id={neighbourhood.id} tenant_id={tenantId!} />`,
  alreadyMarker: `<WalliamAgentCard neighbourhood_id={neighbourhood.id} tenant_id={tenantId!} />`,
})

// ---------- summary ----------

console.log('\n=========================================================')
console.log(`DONE: ${totalPatched} patched, ${totalSkipped} skipped (already applied)`)
console.log('=========================================================\n')
console.log('Next: npx tsc --noEmit')
console.log('Then: manual smoke on a Toronto neighbourhood URL')
console.log('Then: tracker bump to v20 and single commit (4 source edits + this script + tracker)\n')