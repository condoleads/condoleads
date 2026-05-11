// probe-t6c-diag.js — dump exact byte content of the 5 source-field lines
// touched by P5.2-P5.4 (vip-request) and P6.2-P6.3 (vip-questionnaire).
// Read-only. JSON.stringify reveals every char including trailing whitespace.

const fs = require('fs')

const f1 = 'app/api/walliam/estimator/vip-request/route.ts'
const f2 = 'app/api/walliam/estimator/vip-questionnaire/route.ts'

const a = fs.readFileSync(f1, 'utf8').replace(/\r\n/g, '\n').split('\n')
const b = fs.readFileSync(f2, 'utf8').replace(/\r\n/g, '\n').split('\n')

function dump(label, line) {
  console.log(label + ' len=' + line.length + '  raw=' + JSON.stringify(line))
}

console.log('=== vip-request (5 key lines + 1 sibling for indent baseline) ===')
dump('L97 (T6a comment) ', a[96])
dump('L98 (T6a check)   ', a[97])
dump('L169 (request_src)', a[168])
dump('L198 (lead src)   ', a[197])
dump('L280 (activity)   ', a[279])

console.log('')
console.log('=== vip-questionnaire (2 key lines + 1 sibling for indent baseline) ===')
dump('L136 (if-block)   ', b[135])
dump('L137 (enriched)   ', b[136])
dump('L182 (lead src)   ', b[181])
dump('L272 (activity)   ', b[271])