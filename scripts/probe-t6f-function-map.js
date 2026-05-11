// probe-t6f-function-map.js
//
// Corrects the unreliable "enclosing fn" output from
// probe-t6f-brand-context.js by walking column-0 function declarations only
// and brace-matching their ranges.
//
// For each T6f-scope file:
//   A. Enumerate ALL module-level (column-0) function declarations + ranges.
//   B. For each previously-identified user-facing /walliam/i hit line, report
//      which module-level function (if any) contains it.
//
// Output: recon/W-LEADS-EMAIL-T6F-FUNCTION-MAP.txt + stdout.
// Read-only.

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const REPORT = path.join('recon', 'W-LEADS-EMAIL-T6F-FUNCTION-MAP.txt')

const FILES_AND_HITS = {
  'app/api/charlie/lead/route.ts':                       [35, 250, 432, 439, 518],
  'app/api/charlie/plan-email/route.ts':                 [27, 154, 632, 637],
  'app/api/charlie/appointment/route.ts':                [25, 335, 403],
  'app/api/walliam/estimator/vip-request/route.ts':      [166, 196, 203, 215, 216, 217, 220, 245, 331, 332, 420, 432, 473, 482, 484],
  'app/api/walliam/estimator/vip-approve/route.ts':      [156, 159, 192, 198, 218],
  'app/api/walliam/estimator/session/route.ts':          [86, 148, 191],
  'app/api/walliam/estimator/vip-questionnaire/route.ts':[148, 169, 190, 208, 247, 312, 357],
  'app/api/walliam/charlie/vip-approve/route.ts':        [162, 165, 197, 205, 211, 212, 234],
  'app/api/walliam/contact/route.ts':                    [113, 125, 175],
}

function findModuleFunctions(content) {
  const lines = content.split('\n')
  const fns = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Only column 0 — module-level declarations
    let name = null
    let sig = null

    const m1 = /^export\s+(?:async\s+)?function\s+(\w+)\s*\(/.exec(line)
    if (m1) { name = m1[1]; sig = line.trim() }

    if (!name) {
      const m2 = /^(?:async\s+)?function\s+(\w+)\s*\(/.exec(line)
      if (m2) { name = m2[1]; sig = line.trim() }
    }

    if (!name) {
      const m3 = /^(?:export\s+)?const\s+(\w+)\s*[:=][^=]/.exec(line)
      if (m3) {
        // Confirm it's an arrow function or function-shaped: peek next 3 lines
        const peek = lines.slice(i, Math.min(i + 4, lines.length)).join(' ')
        if (/=>\s*[{(]|=\s*(?:async\s*)?function\b|=\s*(?:async\s*)?\(/.test(peek)) {
          name = m3[1]; sig = line.trim()
        }
      }
    }

    if (!name) continue

    // Brace-match forward to find the end of this declaration block.
    let depth = 0
    let opened = false
    let endLine = i
    let inString = false
    let stringChar = null
    let inTemplate = false
    let templateDepth = 0

    outer:
    for (let j = i; j < lines.length; j++) {
      const l = lines[j]
      for (let k = 0; k < l.length; k++) {
        const ch = l[k]
        const prev = k > 0 ? l[k - 1] : ''
        // crude string/template tracking
        if (!inString && !inTemplate && (ch === '"' || ch === "'") && prev !== '\\') {
          inString = true; stringChar = ch; continue
        }
        if (inString && ch === stringChar && prev !== '\\') {
          inString = false; stringChar = null; continue
        }
        if (!inString && ch === '`' && prev !== '\\') {
          inTemplate = !inTemplate; continue
        }
        if (inString || inTemplate) continue
        if (ch === '{') { depth++; opened = true }
        else if (ch === '}') {
          depth--
          if (opened && depth === 0) { endLine = j; break outer }
        }
      }
    }

    fns.push({ name, startLine: i + 1, endLine: endLine + 1, signature: sig })
  }
  return fns
}

const out = []
function emit(s) { out.push(s); process.stdout.write(s + '\n') }

emit('W-LEADS-EMAIL T6f function-map recon (corrects probe-t6f-brand-context)')
emit('Generated: ' + new Date().toISOString())

for (const [file, hits] of Object.entries(FILES_AND_HITS)) {
  emit('\n' + '='.repeat(78))
  emit('FILE: ' + file)
  emit('='.repeat(78))

  const abs = path.resolve(ROOT, file)
  if (!fs.existsSync(abs)) { emit('  MISSING'); continue }
  const content = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
  const fns = findModuleFunctions(content)

  emit('\n  Module-level declarations (' + fns.length + '):')
  for (const f of fns) {
    emit('    L' + String(f.startLine).padStart(4) + '..L' + String(f.endLine).padStart(4) + '  ' + f.name)
    emit('      signature: ' + f.signature)
  }

  emit('\n  Hit  ->  enclosing module-level fn:')
  for (const ln of hits) {
    const containing = fns.find(f => ln >= f.startLine && ln <= f.endLine)
    emit('    L' + String(ln).padStart(4) + '  ->  ' + (containing ? containing.name : '(module-level / outside any fn)'))
  }
}

emit('')

fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, REPORT), out.join('\n'), 'utf8')
emit('[probe-t6f-function-map] Report: ' + REPORT)