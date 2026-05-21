const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
;(async () => {
  // List all tenants + their source_keys
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, domain, source_key')
  if (error) { console.error(error); process.exit(1) }
  console.log('All tenants:')
  for (const t of data) {
    console.log('  ' + t.name.padEnd(15) + ' domain=' + t.domain.padEnd(15) + ' source_key=' + (t.source_key === null ? 'NULL' : t.source_key))
  }
  // Check for duplicate source_keys
  const counts = {}
  for (const t of data) {
    const k = t.source_key
    counts[k] = (counts[k] || 0) + 1
  }
  const dups = Object.entries(counts).filter(([k, c]) => c > 1)
  console.log('')
  if (dups.length) {
    console.log('DUPLICATE source_keys:')
    for (const [k, c] of dups) console.log('  ' + k + ' appears ' + c + ' times')
  } else {
    console.log('No duplicate source_keys')
  }
  process.exit(0)
})()