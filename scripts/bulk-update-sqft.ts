import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RANGE_MIDPOINTS: Record<string, number> = {
  '< 700':      600,
  '0-499':      250,
  '500-599':    550,
  '600-699':    650,
  '700-799':    750,
  '800-899':    850,
  '900-999':    950,
  '1000-1199':  1100,
  '1100-1500':  1300,
  '1200-1399':  1300,
  '1400-1599':  1500,
  '1500-2000':  1750,
  '1600-1799':  1700,
  '1800-1999':  1900,
  '2000-2249':  2125,
  '2000-2500':  2250,
  '2250-2499':  2375,
  '2500-2749':  2625,
  '2500-3000':  2750,
  '2750-2999':  2875,
  '3000-3249':  3125,
  '3000-3500':  3250,
  '3250-3499':  3375,
  '3500-3749':  3625,
  '3500-5000':  4250,
  '3750-3999':  3875,
  '4000-4249':  4125,
  '4250-4499':  4375,
  '4500-4749':  4625,
  '5000 +':     5000,
  '700-1100':   900,
}

async function run() {
  console.log('=== BULK SQFT UPDATE (cursor-based) ===')
  let lastId = '00000000-0000-0000-0000-000000000000'
  const batchSize = 500
  let totalUpdated = 0
  let totalFailed = 0
  let batchNum = 0

  while (true) {
    const { data, error } = await supabase
      .from('mls_listings')
      .select('id, living_area_range')
      .is('calculated_sqft', null)
      .not('living_area_range', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(batchSize)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) { console.log('Done — no more rows.'); break }

    batchNum++
    lastId = data[data.length - 1].id

    // Group by living_area_range for batch updates
    const groups: Record<string, string[]> = {}
    for (const row of data) {
      const sqft = RANGE_MIDPOINTS[row.living_area_range]
      if (!sqft) { totalFailed++; continue }
      if (!groups[row.living_area_range]) groups[row.living_area_range] = []
      groups[row.living_area_range].push(row.id)
    }

    // One update per range value — much faster than one update per row
    for (const [range, ids] of Object.entries(groups)) {
      const sqft = RANGE_MIDPOINTS[range]
      const { error: updateErr } = await supabase
        .from('mls_listings')
        .update({ calculated_sqft: sqft, sqft_method: 'range_midpoint' })
        .in('id', ids)
      if (updateErr) {
        totalFailed += ids.length
        console.error(`Update error for range ${range}:`, updateErr.message)
      } else {
        totalUpdated += ids.length
      }
    }

    console.log(`Batch ${batchNum}: ${data.length} rows | cursor: ${lastId} | ${totalUpdated} updated / ${totalFailed} failed`)
  }

  console.log(`=== COMPLETE: ${totalUpdated} updated / ${totalFailed} failed ===`)
  process.exit(totalFailed > 100 ? 1 : 0)
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1) })
