// scripts/p4-phase2-recon.js
// Dumps the existing leads client + its tab/filter structure so the P4 phase 2 patch
// can be surgical (anchor-based) rather than a blind rewrite.
// Run: node scripts/p4-phase2-recon.js > p4-phase2-recon-output.txt

const fs = require('fs')
const path = require('path')

function dump(label, relpath) {
  const full = path.join(process.cwd(), relpath)
  console.log('=== ' + label + ' (' + relpath + ') ===')
  if (!fs.existsSync(full)) {
    console.log('(not found)')
    console.log('')
    return
  }
  const content = fs.readFileSync(full, 'utf8')
  console.log('SIZE:', content.length, 'bytes')
  console.log('LINES:', content.split('\n').length)
  console.log('')
  console.log(content)
  console.log('')
}

// Primary file we need to patch
dump('1. AdminHomesLeadsClient', 'components/admin-homes/AdminHomesLeadsClient.tsx')

// The page that hosts it (for prop wiring)
dump('2. Leads page (currently passes initial data)', 'app/admin-homes/leads/page.tsx')