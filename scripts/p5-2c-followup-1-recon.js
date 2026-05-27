// scripts/p5-2c-followup-1-recon.js
// W-TERRITORY-MASTER P5.2c-followup-1 recon.
// Read BuildingsView.tsx in full + map every state slice, effect, handler,
// and JSX block. The rewrite must preserve all of these.

const fs = require('fs')
const path = require('path')

const TARGET = 'components/admin-homes/cockpit/territory/BuildingsView.tsx'

const content = fs.readFileSync(TARGET, 'utf8')
const lines = content.split(/\r?\n/)

console.log('=== File metadata ===')
console.log('  path:        ', TARGET)
console.log('  bytes:       ', Buffer.byteLength(content, 'utf8'))
console.log('  lines:       ', lines.length)
console.log('  line ending: ', content.includes('\r\n') ? 'CRLF' : 'LF')
let nonAscii = 0
for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) > 127) nonAscii++
console.log('  non-ASCII:   ', nonAscii)
console.log('')

console.log('=== Section: imports (lines 1-15) ===')
for (let i = 0; i < Math.min(15, lines.length); i++) {
  console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
}
console.log('')

console.log('=== Section: type declarations (search for interface/type) ===')
for (let i = 0; i < lines.length; i++) {
  if (/^(interface|type|export interface|export type)/.test(lines[i].trim())) {
    console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
    // Show body until closing brace at column 0
    let depth = 0
    let started = false
    for (let j = i; j < Math.min(i + 40, lines.length); j++) {
      const line = lines[j]
      for (const ch of line) {
        if (ch === '{') { depth++; started = true }
        if (ch === '}') depth--
      }
      if (j > i) console.log('  ' + String(j + 1).padStart(4, ' ') + ': ' + lines[j])
      if (started && depth === 0) break
    }
    console.log('')
  }
}

console.log('=== Section: every useState / useMemo / useEffect declaration ===')
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim()
  if (/^(const|let)\s+\[[^\]]+\]\s*=\s*useState/.test(t)) {
    console.log('  STATE  ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i].trim())
  } else if (/useMemo\(/.test(t)) {
    console.log('  MEMO   ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i].trim().slice(0, 130))
  } else if (/useEffect\(/.test(t)) {
    console.log('  EFFECT ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i].trim().slice(0, 130))
  }
}
console.log('')

console.log('=== Section: every function/async function declaration ===')
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim()
  if (/^(async\s+)?function\s+\w+/.test(t)) {
    console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + t.slice(0, 130))
  }
}
console.log('')

console.log('=== Full file dump (every line numbered) ===')
for (let i = 0; i < lines.length; i++) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i])
}
console.log('')

console.log('=== RECON COMPLETE ===')