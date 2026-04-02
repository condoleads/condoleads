const fs = require('fs')
let c = fs.readFileSync('app/api/charlie/route.ts', 'utf8').replace(/\r\n/g, '\n')
const o = `      .select('median_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, active_count, closed_sale_count_90, median_lease_price, gross_rental_yield_pct, psf_trend_pct, dom_trend_pct, bedroom_breakdown, subtype_breakdown, price_trend_monthly, insight_seasonal, avg_concession_pct')`
const n = `      .select('median_psf, avg_psf, closed_avg_dom_90, sale_to_list_ratio, absorption_rate_pct, months_of_inventory, active_count, closed_sale_count_90, median_lease_price, gross_rental_yield_pct, psf_trend_pct, dom_trend_pct, bedroom_breakdown, subtype_breakdown, price_trend_monthly, insight_seasonal, avg_concession_pct, pct_sold_over_ask, pct_sold_under_ask, pct_sold_at_ask, median_sale_price, avg_sale_price, p25_sale_price, p75_sale_price, stale_listing_pct, new_listings_7d')`
if (!c.includes(o)) { console.error('not found'); process.exit(1) }
fs.writeFileSync('app/api/charlie/route.ts', c.replace(o, n), 'utf8')
console.log('done')