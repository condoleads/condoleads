const fs = require('fs')
let c = fs.readFileSync('app/api/charlie/route.ts', 'utf8').replace(/\r\n/g, '\n')
const o = `    const concessions = sales.map((s: any) => s.close_price && s.list_price ? ((s.list_price - s.close_price) / s.list_price * 100) : null).filter((v: any) => v !== null)`
const n = `    const concessions = sales.map((s: any) => s.close_price && s.list_price ? ((s.list_price - s.close_price) / s.list_price * 100) : null).filter((v: any): v is number => v !== null)`
if (!c.includes(o)) { console.error('not found'); process.exit(1) }
fs.writeFileSync('app/api/charlie/route.ts', c.replace(o, n), 'utf8')
console.log('done')