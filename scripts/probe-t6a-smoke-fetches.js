#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const TARGETS = ['scripts/smoke-t3b.js', 'scripts/smoke-t3c.js']
const ENDPOINTS = [
  '/api/charlie/lead',
  '/api/charlie/plan-email',
  '/api/charlie/appointment',
  '/api/walliam/estimator/vip-request',
  '/api/walliam/estimator/session',
]

for (const t of TARGETS) {
  if (!fs.existsSync(path.resolve(process.cwd(), t))) {
    console.log('\nSKIP: ' + t + ' not found')
    continue
  }
  const raw = fs.readFileSync(path.resolve(process.cwd(), t), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  const lines = content.split('\n')

  console.log('\n===========================================================================')
  console.log('FILE: ' + t + '  (' + (usesCRLF ? 'CRLF' : 'LF') + ', ' + lines.length + ' lines)')
  console.log('===========================================================================')

  // Find every line that mentions one of the T6a endpoints
  for (let i = 0; i < lines.length; i++) {
    for (const ep of ENDPOINTS) {
      if (lines[i].includes(ep)) {
        const from = Math.max(0, i - 4)
        const to = Math.min(lines.length, i + 22)
        console.log('\n--- match for ' + ep + ' at line ' + (i + 1) + ' ---')
        for (let k = from; k < to; k++) {
          const marker = k === i ? '>' : ' '
          console.log('  ' + marker + ' ' + String(k + 1).padStart(4, ' ') + ': ' + lines[k])
        }
        break
      }
    }
  }

  // Also: every `fetch(` call + its options object (for header insertion anchoring)
  console.log('\n--- every fetch(...) call ---')
  for (let i = 0; i < lines.length; i++) {
    if (/\bfetch\(/.test(lines[i])) {
      const from = Math.max(0, i - 1)
      const to = Math.min(lines.length, i + 10)
      console.log('\n  lines ' + (from + 1) + '..' + to + ':')
      for (let k = from; k < to; k++) {
        const marker = k === i ? '>' : ' '
        console.log('  ' + marker + ' ' + String(k + 1).padStart(4, ' ') + ': ' + lines[k])
      }
    }
  }
}

console.log('\n=== END PROBE ===')