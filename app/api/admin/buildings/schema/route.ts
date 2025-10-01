import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    console.log(' Checking buildings table schema...');
    
    // Try to insert an empty record to see what fields are required
    const { error: insertError } = await supabase
      .from('buildings')
      .insert({})
      .select();
    
    // Also try to get existing records to see field structure
    const { data: existingBuildings, error: selectError } = await supabase
      .from('buildings')
      .select('*')
      .limit(1);
    
    return NextResponse.json({
      success: true,
      insertError: insertError?.message || null,
      selectError: selectError?.message || null,
      sampleRecord: existingBuildings?.[0] || null,
      sampleFields: existingBuildings?.[0] ? Object.keys(existingBuildings[0]) : [],
      message: 'Buildings table analysis complete'
    });
    
  } catch (error: any) {
    console.error('Schema check failed:', error);
    return NextResponse.json(
      { 
        error: 'Schema check failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}
