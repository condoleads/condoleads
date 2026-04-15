const fs = require('fs')
const c = fs.readFileSync('app/api/walliam/charlie/vip-approve/route.ts', 'utf8')
const idx = c.indexOf("select('plan_hard_cap")
console.log(c.substring(idx - 50, idx + 800))