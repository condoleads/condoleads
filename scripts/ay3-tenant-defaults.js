const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

;(async () => {
  // Query information_schema for column defaults on tenants table
  const { data, error } = await supabase
    .rpc('exec_sql_jsonb', {
      query: `
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants'
        ORDER BY ordinal_position
      `
    })
    .single()

  if (error) {
    // RPC unavailable -- try alternate approach: PostgREST direct query won't work
    // for system catalogs without a custom RPC. Inspect WALLiam row instead.
    console.log('exec_sql_jsonb unavailable, falling back to WALLiam row inspection')
    console.log('Modal-unsupplied columns -- watching for NULL vs default-populated:')
    console.log('')
    const WALLIAM_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    const { data: w } = await supabase.from('tenants').select('*').eq('id', WALLIAM_ID).single()
    const modalSupplied = new Set([
      'name','brand_name','domain','admin_email','logo_url','primary_color','secondary_color',
      'anthropic_api_key','ai_free_messages','vip_auto_approve','ai_auto_approve_limit',
      'ai_manual_approve_limit','ai_hard_cap','plan_mode','plan_free_attempts',
      'plan_auto_approve_limit','plan_manual_approve_limit','plan_hard_cap','plan_vip_auto_approve',
      'seller_plan_free_attempts','seller_plan_hard_cap','estimator_nonai_enabled',
      'estimator_free_attempts','estimator_vip_auto_approve','estimator_auto_approve_attempts',
      'estimator_manual_approve_attempts','estimator_hard_cap','assistant_name',
      'brokerage_name','brokerage_address','brokerage_phone','broker_of_record',
      'license_number','footer_tagline','about_content','privacy_content','terms_content',
      'homepage_layout'
    ])
    const autoColumns = new Set(['id','created_at','updated_at']) // always auto-populated

    console.log('Columns NOT collected by modal (need DB default or will be NULL):')
    for (const k of Object.keys(w)) {
      if (modalSupplied.has(k) || autoColumns.has(k)) continue
      const v = w[k]
      const status = v === null ? 'NULL on WALLiam' : 'SET on WALLiam (will be NULL on Aily unless DB default)'
      console.log('  ' + k.padEnd(35) + ' = ' + status)
    }
    return process.exit(0)
  }

  console.log('=== tenants column defaults ===')
  console.table(data)
  process.exit(0)
})()