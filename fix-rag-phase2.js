const fs = require('fs')
let c = fs.readFileSync('app/api/charlie/route.ts', 'utf8').replace(/\r\n/g, '\n')
const o = `    return { analytics: data, geoType: input.geoType, geoId: input.geoId, track: input.track }`
const n = `    // Compute derived insights from raw analytics
    let computed: any = {}
    if (data) {
      // Market condition
      const absorption = data.absorption_rate_pct || 0
      computed.market_condition = absorption > 60 ? "Seller's Market" : absorption < 40 ? "Buyer's Market" : "Balanced Market"

      // Negotiation signal
      const overAsk = data.pct_sold_over_ask || 0
      const underAsk = data.pct_sold_under_ask || 0
      computed.negotiation_signal = overAsk > underAsk ? 'Over Ask' : underAsk > overAsk ? 'Under Ask' : 'At Ask'

      // Urgency
      const moi = data.months_of_inventory || 99
      computed.urgency = moi < 2 ? 'High' : moi < 4 ? 'Medium' : 'Low'

      // Bedroom pricing from bedroom_breakdown JSONB
      if (data.bedroom_breakdown) {
        try {
          const bd = typeof data.bedroom_breakdown === 'string' ? JSON.parse(data.bedroom_breakdown) : data.bedroom_breakdown
          computed.bedroom_pricing = bd
        } catch {}
      }
    }
    return { analytics: data, computed, geoType: input.geoType, geoId: input.geoId, track: input.track }`
if (!c.includes(o)) { console.error('not found'); process.exit(1) }
fs.writeFileSync('app/api/charlie/route.ts', c.replace(o, n), 'utf8')
console.log('done')