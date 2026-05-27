// scripts/p5-2c-find-non-ascii.js
// Locate every non-ASCII byte in buildings/route.ts with line + column + char info.

const fs = require('fs')

const TARGET = 'app/api/admin-homes/territory/buildings/route.ts'

const content = fs.readFileSync(TARGET, 'utf8')
const lines = content.split(/\r?\n/)

console.log('=== Non-ASCII characters in ' + TARGET + ' ===\n')

let total = 0
for (let lineNo = 0; lineNo < lines.length; lineNo++) {
  const line = lines[lineNo]
  for (let col = 0; col < line.length; col++) {
    const code = line.charCodeAt(col)
    if (code > 127) {
      total++
      const ch = line[col]
      const hex = code.toString(16).padStart(4, '0')
      console.log('  line ' + String(lineNo + 1).padStart(4, ' ') +
                  ' col ' + String(col + 1).padStart(4, ' ') +
                  '  U+' + hex +
                  '  "' + ch + '"' +
                  '  in: ' + line.trim().slice(0, 80))
    }
  }
}
console.log('')
console.log('  total non-ASCII chars:', total)