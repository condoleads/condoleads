// scripts/p5-2c-recon-step3.js
// W-TERRITORY-MASTER P5.2c step 3.
// Verify the agents-for-pinning endpoint shape that BuildingsView depends on.

const fs = require('fs')

const TARGET = 'app/api/admin-homes/territory/pins/agents-for-pinning/route.ts'

if (!fs.existsSync(TARGET)) {
  console.log('FATAL: endpoint not found at', TARGET)
  process.exit(1)
}

console.log('=== ' + TARGET + ' (full contents) ===\n')
console.log(fs.readFileSync(TARGET, 'utf8'))
console.log('')

console.log('=== BuildingsView lines 84-105 (consumer side) ===\n')
const bv = fs.readFileSync('components/admin-homes/cockpit/territory/BuildingsView.tsx', 'utf8').split(/\r?\n/)
for (let i = 83; i < 105; i++) {
  console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + (bv[i] || ''))
}
console.log('')

console.log('=== BuildingsView "activeAgents" useMemo (filtering logic) ===\n')
const fullBv = bv.join('\n')
const idx = fullBv.indexOf('activeAgents')
if (idx !== -1) {
  console.log('  starting at char', idx)
  console.log(fullBv.substring(idx, Math.min(idx + 800, fullBv.length)))
}
console.log('')

console.log('=== RECON STEP 3 COMPLETE ===')