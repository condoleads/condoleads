// scripts/p5-2c-recon.js
// W-TERRITORY-MASTER P5.2c recon.
// Read-only inspection of uncommitted files + existing geo endpoints.

const fs = require('fs')
const path = require('path')

const FILES_TO_READ = [
  'app/api/admin-homes/territory/buildings/route.ts',
  'app/api/admin-homes/territory/buildings/assign/route.ts',
  'app/api/admin-homes/territory/buildings/[id]/deactivate/route.ts',
  'components/admin-homes/cockpit/territory/BuildingsView.tsx',
  'components/admin-homes/cockpit/tabs/TerritoryTab.tsx',
]

const GEO_ENDPOINT_DIRS_TO_SCAN = [
  'app/api/admin-homes/geo-tree',
  'app/api/admin-homes/areas',
  'app/api/admin-homes/municipalities',
  'app/api/admin-homes/communities',
  'app/api/admin-homes/buildings',
  'app/api/admin-homes',
]

function exists(p) {
  try { fs.accessSync(p); return true } catch { return false }
}

function detectLineEnding(content) {
  if (content.includes('\r\n')) return 'CRLF'
  if (content.includes('\n')) return 'LF'
  return 'NONE'
}

console.log('=== Section 1: uncommitted files ===\n')
for (const f of FILES_TO_READ) {
  if (!exists(f)) {
    console.log('  MISSING:', f)
    continue
  }
  const buf = fs.readFileSync(f)
  const content = buf.toString('utf8')
  const ascii = content.split('').every(c => c.charCodeAt(0) < 128)
  console.log('  FILE:', f)
  console.log('    bytes:       ', buf.length)
  console.log('    lines:       ', content.split(/\r?\n/).length)
  console.log('    line ending: ', detectLineEnding(content))
  console.log('    ASCII-only:  ', ascii)
  console.log('')
}

console.log('=== Section 2: full contents of API routes ===\n')
const API_FILES = [
  'app/api/admin-homes/territory/buildings/route.ts',
  'app/api/admin-homes/territory/buildings/assign/route.ts',
  'app/api/admin-homes/territory/buildings/[id]/deactivate/route.ts',
]
for (const f of API_FILES) {
  if (!exists(f)) continue
  console.log('--- ' + f + ' ---')
  console.log(fs.readFileSync(f, 'utf8'))
  console.log('')
}

console.log('=== Section 3: BuildingsView.tsx (first 80 lines + last 30 lines) ===\n')
const buildingsView = 'components/admin-homes/cockpit/territory/BuildingsView.tsx'
if (exists(buildingsView)) {
  const lines = fs.readFileSync(buildingsView, 'utf8').split(/\r?\n/)
  console.log('  total lines:', lines.length)
  console.log('  --- first 80 lines ---')
  lines.slice(0, 80).forEach((l, i) => console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + l))
  console.log('  --- last 30 lines ---')
  lines.slice(-30).forEach((l, i) => console.log('  ' + String(lines.length - 30 + i + 1).padStart(4, ' ') + ': ' + l))
}
console.log('')

console.log('=== Section 4: TerritoryTab.tsx (modified -- show full) ===\n')
const tt = 'components/admin-homes/cockpit/tabs/TerritoryTab.tsx'
if (exists(tt)) {
  console.log(fs.readFileSync(tt, 'utf8'))
}
console.log('')

console.log('=== Section 5: existing geo-related endpoints ===\n')
function walkApiDir(dir) {
  const results = []
  if (!exists(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      results.push(...walkApiDir(full))
    } else if (ent.name === 'route.ts' || ent.name === 'route.tsx') {
      results.push(full)
    }
  }
  return results
}

const allApiRoutes = walkApiDir('app/api/admin-homes')
console.log('  Total routes under app/api/admin-homes:', allApiRoutes.length)
console.log('')
console.log('  Routes matching geo/area/muni/community/building/neighbourhood patterns:')
for (const r of allApiRoutes) {
  const lower = r.toLowerCase().replace(/\\/g, '/')
  if (/geo|area|muni|community|building|neighbourhood|tree/.test(lower)) {
    const buf = fs.readFileSync(r)
    console.log('    ' + r + '  (' + buf.length + ' bytes)')
  }
}
console.log('')

console.log('=== Section 6: probe geo-tree route specifically (if exists) ===\n')
const geoTreeCandidates = [
  'app/api/admin-homes/geo-tree/route.ts',
  'app/api/admin-homes/territory/geo-tree/route.ts',
  'app/api/admin-homes/territory/tree/route.ts',
]
for (const c of geoTreeCandidates) {
  if (exists(c)) {
    console.log('  FOUND:', c)
    console.log('  --- contents ---')
    console.log(fs.readFileSync(c, 'utf8'))
    console.log('')
  }
}

console.log('=== RECON COMPLETE ===')