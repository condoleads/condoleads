// patch-t6c-anchor-fix.js
//
// Fixes substring-overlap bug in patch-t6c-wire.js where the 8-space-indent
// anchors P5_4_OLD and P6_3_OLD were substrings of the deeper-indented
// siblings P5_3_OLD (10-space) and P6_2_OLD (12-space) respectively.
//
// Adds leading "\n" to OLD and NEW values for both anchors, forcing
// line-boundary match. This eliminates the substring match at the deeper-
// indented sibling line and gives count=1 as expected for both validations.

const fs = require('fs')
const path = require('path')

const TARGET = 'scripts/patch-t6c-wire.js'
const abs = path.resolve(process.cwd(), TARGET)

if (!fs.existsSync(abs)) {
  console.error('FAIL: ' + TARGET + ' not found')
  process.exit(1)
}

const raw = fs.readFileSync(abs, 'utf8')
const usesCRLF = /\r\n/.test(raw)
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw

const PATCHES = [
  {
    label: 'P5_4_OLD',
    old: 'const P5_4_OLD = "        source: \'walliam_estimator_vip_request\',"',
    neu: 'const P5_4_OLD = "\\n        source: \'walliam_estimator_vip_request\',"',
  },
  {
    label: 'P5_4_NEW',
    old: 'const P5_4_NEW = "        source: `${sourceKey}_estimator_vip_request`,"',
    neu: 'const P5_4_NEW = "\\n        source: `${sourceKey}_estimator_vip_request`,"',
  },
  {
    label: 'P6_3_OLD',
    old: 'const P6_3_OLD = "        source: \'walliam_estimator_questionnaire\',"',
    neu: 'const P6_3_OLD = "\\n        source: \'walliam_estimator_questionnaire\',"',
  },
  {
    label: 'P6_3_NEW',
    old: 'const P6_3_NEW = "        source: sourceKey ? `${sourceKey}_estimator_questionnaire` : \'walliam_estimator_questionnaire\',"',
    neu: 'const P6_3_NEW = "\\n        source: sourceKey ? `${sourceKey}_estimator_questionnaire` : \'walliam_estimator_questionnaire\',"',
  },
]

// Validate
const errors = []
for (const p of PATCHES) {
  const count = content.split(p.old).length - 1
  if (count !== 1) {
    errors.push(p.label + ': expected 1 match in ' + TARGET + ', found ' + count)
  }
}

// Re-run guard
if (content.includes('const P5_4_OLD = "\\n        source')) {
  errors.push('P5_4 already has \\n prefix (re-run state)')
}
if (content.includes('const P6_3_OLD = "\\n        source')) {
  errors.push('P6_3 already has \\n prefix (re-run state)')
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

// Backup + apply
function makeTs() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
         pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}
const ts = makeTs()
const backupPath = abs + '.backup_' + ts
fs.writeFileSync(backupPath, raw, 'utf8')
console.log('backup: ' + path.basename(backupPath))

let updated = content
for (const p of PATCHES) {
  updated = updated.replace(p.old, p.neu)
}

const out = usesCRLF ? updated.replace(/\n/g, '\r\n') : updated
fs.writeFileSync(abs, out, 'utf8')
console.log('wrote:  ' + TARGET + ' (' + (usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('Fixed 4 anchors with leading \\n (line-boundary anchor):')
for (const p of PATCHES) console.log('  - ' + p.label)
console.log('')
console.log('Re-run scripts/patch-t6c-wire.js now.')