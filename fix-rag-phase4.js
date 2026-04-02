const fs = require('fs')
let c = fs.readFileSync('app/api/charlie/route.ts', 'utf8').replace(/\r\n/g, '\n')
const o = `  const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName) + geoReminder`
const n = `  // Pre-load building intelligence if on a building page
  let buildingContext = ''
  if (geoContext?.building_id) {
    try {
      const buildingIntel = await executeTool('get_building_intelligence', { building_id: geoContext.building_id }, agentId, geoContext)
      if (buildingIntel && !buildingIntel.error) {
        const b = buildingIntel.building
        const s = buildingIntel.stats
        buildingContext = \`\n\nCURRENT BUILDING CONTEXT (pre-loaded — use this data directly):
Building: \${b?.building_name} at \${b?.canonical_address}
Total Units: \${b?.total_units || 'N/A'} | Year Built: \${b?.year_built || 'N/A'}
Active For Sale: \${s?.active_for_sale} | Sold Last 90 Days: \${s?.sold_last_90}
Median Sale Price: \$\${s?.median_sale_price?.toLocaleString() || 'N/A'} | Avg DOM: \${s?.avg_dom || 'N/A'} days
Avg Concession: \${s?.avg_concession_pct || 0}% below asking
Recent Sales: \${(buildingIntel.recent_sales || []).map((s: any) => \`Unit \${s.unit_number}: \${s.bedrooms_total}BR sold \$\${s.close_price?.toLocaleString()} (\${s.days_on_market} DOM)\`).join(', ')}
Active Listings: \${(buildingIntel.active_listings || []).map((l: any) => \`Unit \${l.unit_number}: \${l.bedrooms_total}BR at \$\${l.list_price?.toLocaleString()}\`).join(', ') || 'None'}
Use this data to answer building-specific questions immediately without calling get_building_intelligence again.\`
      }
    } catch (e) {
      console.error('[CHARLIE] building pre-load error:', e)
    }
  }

  const systemPrompt = buildCharlieSystemPrompt(agentName, brokerageName) + geoReminder + buildingContext`
if (!c.includes(o)) { console.error('not found'); process.exit(1) }
fs.writeFileSync('app/api/charlie/route.ts', c.replace(o, n), 'utf8')
console.log('done')