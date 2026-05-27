// scripts/r-w-territory-master-p5-2c-followup-2-smoke.js
// W-TERRITORY-MASTER P5.2c-followup-2 smoke.
// File-structure verification only. UX verification requires browser smoke.

const fs = require('fs')

let checks = 0
let passed = 0

function check(name, ok, detail) {
  checks++
  if (ok) {
    passed++
    console.log('  PASS [' + checks + ']: ' + name)
    if (detail) console.log('         ' + detail)
  } else {
    console.log('  FAIL [' + checks + ']: ' + name)
    if (detail) console.log('         ' + detail)
    throw new Error('Smoke check failed: ' + name)
  }
}

const APP = 'components/admin-homes/cockpit/territory/ActAsAgentPicker.tsx'
const PV = 'components/admin-homes/cockpit/territory/PinsView.tsx'
const BV = 'components/admin-homes/cockpit/territory/BuildingsView.tsx'

const appExists = fs.existsSync(APP)
check('ActAsAgentPicker component file exists', appExists)

if (appExists) {
  const app = fs.readFileSync(APP, 'utf8')
  check('ActAsAgentPicker has tenantId prop',
    app.includes('tenantId: string'))
  check('ActAsAgentPicker has value/onChange contract',
    app.includes('value: string') && app.includes('onChange: (id: string)'))
  check('ActAsAgentPicker calls agents-for-pinning endpoint',
    app.includes("/api/admin-homes/territory/pins/agents-for-pinning?tenant_id="))
  check('ActAsAgentPicker filters to selling agents',
    app.includes('is_selling'))
  check('ActAsAgentPicker is ASCII-only', (() => {
    for (let i = 0; i < app.length; i++) if (app.charCodeAt(i) > 127) return false
    return true
  })())
}

console.log('')
console.log('=== PinsView ===')
const pv = fs.readFileSync(PV, 'utf8')
check('PinsView imports ActAsAgentPicker',
  pv.includes("import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'"))
check('PinsView declares actAsAgentId state',
  pv.includes("const [actAsAgentId, setActAsAgentId] = useState('')"))
check('PinsView declares effectiveActingAgentId',
  pv.includes('const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null'))
check('PinsView renders ActAsAgentPicker conditionally',
  pv.includes('{!actingAgentId && (') &&
  pv.includes('<ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />'))
check('PinsView guards use effectiveActingAgentId',
  (pv.match(/!effectiveActingAgentId/g) || []).length === 4)
check('PinsView !actingAgentId only in JSX picker condition',
  (pv.match(/!actingAgentId/g) || []).length === 1)
check('PinsView assigned_by uses effectiveActingAgentId (2 sites)',
  (pv.match(/assigned_by: effectiveActingAgentId/g) || []).length === 2)
check('PinsView deactivated_by uses effectiveActingAgentId',
  pv.includes('deactivated_by: effectiveActingAgentId'))
check('PinsView has no stale assigned_by: actingAgentId',
  !pv.includes('assigned_by: actingAgentId'))
check('PinsView has no stale deactivated_by: actingAgentId',
  !pv.includes('deactivated_by: actingAgentId'))
check('PinsView is ASCII-only', (() => {
  for (let i = 0; i < pv.length; i++) if (pv.charCodeAt(i) > 127) return false
  return true
})())

console.log('')
console.log('=== BuildingsView ===')
const bv = fs.readFileSync(BV, 'utf8')
check('BuildingsView imports ActAsAgentPicker',
  bv.includes("import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'"))
check('BuildingsView declares actAsAgentId state',
  bv.includes("const [actAsAgentId, setActAsAgentId] = useState('')"))
check('BuildingsView declares effectiveActingAgentId',
  bv.includes('const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null'))
check('BuildingsView renders ActAsAgentPicker conditionally',
  bv.includes('{!actingAgentId && (') &&
  bv.includes('<ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />'))
check('BuildingsView guards use effectiveActingAgentId',
  (bv.match(/!effectiveActingAgentId/g) || []).length === 3)
check('BuildingsView !actingAgentId only in JSX picker condition',
  (bv.match(/!actingAgentId/g) || []).length === 1)
check('BuildingsView assigned_by uses effectiveActingAgentId',
  bv.includes('assigned_by: effectiveActingAgentId'))
check('BuildingsView deactivated_by uses effectiveActingAgentId',
  bv.includes('deactivated_by: effectiveActingAgentId'))
check('BuildingsView has no stale assigned_by: actingAgentId',
  !bv.includes('assigned_by: actingAgentId'))
check('BuildingsView has no stale deactivated_by: actingAgentId',
  !bv.includes('deactivated_by: actingAgentId'))
check('BuildingsView is ASCII-only', (() => {
  for (let i = 0; i < bv.length; i++) if (bv.charCodeAt(i) > 127) return false
  return true
})())

console.log('')
console.log('=== SMOKE COMPLETE: ' + passed + '/' + checks + ' PASS ===')