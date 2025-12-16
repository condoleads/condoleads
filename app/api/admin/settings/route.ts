import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch settings
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .eq('setting_key', 'estimator_defaults')
      .single()

    if (error) {
      console.error('Error fetching settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, settings: data })
  } catch (error) {
    console.error('Settings fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PUT - Update settings
export async function PUT(request: NextRequest) {
  try {
    const { parking_value_sale, parking_value_lease, locker_value_sale, locker_value_lease } = await request.json()

    const { data, error } = await supabase
      .from('system_settings')
      .update({
        setting_value: {
          parking_value_sale: parking_value_sale || 50000,
          parking_value_lease: parking_value_lease || 200,
          locker_value_sale: locker_value_sale || 10000,
          locker_value_lease: locker_value_lease || 50
        },
        updated_at: new Date().toISOString()
      })
      .eq('setting_key', 'estimator_defaults')
      .select()
      .single()

    if (error) {
      console.error('Error updating settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(' Estimator defaults updated:', data)
    return NextResponse.json({ success: true, settings: data })
  } catch (error) {
    console.error('Settings update error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}