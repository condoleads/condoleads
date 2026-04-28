// scripts/fix-gate-typecheck.js
// Widen ChatPanel.gateReason prop to match the hook's full union
const fs = require('fs')

const p = 'app/charlie/components/ChatPanel.tsx'
const raw = fs.readFileSync(p, 'utf8')
const ending = raw.includes('\r\n') ? '\r\n' : '\n'
let c = raw.replace(/\r\n/g, '\n')

const find = `gateReason?: 'register' | 'vip_required' | null`
const replace = `gateReason?: 'register' | 'vip_required' | 'chat_limit' | null`

const occ = c.split(find).length - 1
if (occ !== 1) {
  console.error('FAIL: gateReason prop type found ' + occ + ' times, expected 1')
  process.exit(1)
}
c = c.replace(find, replace)

const out = ending === '\r\n' ? c.replace(/\n/g, '\r\n') : c
fs.writeFileSync(p, out, 'utf8')
console.log('OK: widened ChatPanel.gateReason prop type')