const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

;(async () => {
  // 1. WALLiam row -- column names + nullness, safe columns shown
  const WALLIAM_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
  const { data: walliamRow, error: e2 } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', WALLIAM_ID)
    .single()
  if (e2) { console.error('walliam fetch err:', e2); process.exit(1) }

  console.log('\n=== WALLiam row -- column structure (values shown for safe-to-display, redacted otherwise) ===')
  const safeKeys = ['id', 'name', 'domain', 'brand_name', 'homepage_layout', 'primary_color', 'assistant_name', 'created_at', 'source_key', 'updated_at']
  for (const k of Object.keys(walliamRow)) {
    const v = walliamRow[k]
    const isNull = v === null
    const safe = safeKeys.includes(k)
    let display
    if (safe) {
      display = JSON.stringify(v)
    } else if (isNull) {
      display = 'NULL'
    } else if (typeof v === 'string' && v.length > 0) {
      display = '<set> (len=' + v.length + ', fingerprint=' + v.slice(0, 4) + '...' + v.slice(-2) + ')'
    } else {
      display = '<set>'
    }
    console.log('  ' + k.padEnd(30) + ' = ' + display)
  }

  // 2. Confirm no existing Aily row (must not collide)
  const { data: existingAily } = await supabase
    .from('tenants')
    .select('id, name, domain')
    .or('name.ilike.%aily%,domain.ilike.%aily%')
  console.log('\n=== Existing Aily-shaped rows (must be empty before insert) ===')
  console.log(existingAily && existingAily.length ? existingAily : '(none -- clean to insert)')

  // 3. Count of all tenants (sanity)
  const { count } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true })
  console.log('\n=== Tenant count: ' + count + ' ===')

  process.exit(0)
})()