import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    console.log('?? Fetching actual database schema...');
    
    // Get all table schemas from information_schema
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_table_columns');
    
    if (tablesError) {
      // Fallback method using direct SQL
      const { data: directTables, error: directError } = await supabase
        .from('information_schema.columns')
        .select('table_name, column_name, data_type, is_nullable')
        .eq('table_schema', 'public');
      
      if (directError) {
        throw new Error(`Could not fetch schema: ${directError.message}`);
      }
      
      const schemaByTable = {};
      directTables.forEach(col => {
        if (!schemaByTable[col.table_name]) {
          schemaByTable[col.table_name] = [];
        }
        schemaByTable[col.table_name].push({
          column: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES'
        });
      });
      
      return NextResponse.json({
        success: true,
        schema: schemaByTable,
        method: 'direct_query'
      });
    }
    
    return NextResponse.json({
      success: true,
      schema: tables,
      method: 'rpc_function'
    });
    
  } catch (error: any) {
    console.error(' Schema validation failed:', error);
    return NextResponse.json(
      { 
        error: 'Schema validation failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tableName, recordData } = await request.json();
    
    console.log(` Validating record for table: ${tableName}`);
    
    // Get table schema
    const schemaResponse = await fetch(`${request.nextUrl.origin}/api/admin/database/validate-schema`);
    const schemaData = await schemaResponse.json();
    
    if (!schemaData.success) {
      throw new Error('Could not fetch schema');
    }
    
    const tableSchema = schemaData.schema[tableName];
    if (!tableSchema) {
      throw new Error(`Table ${tableName} does not exist`);
    }
    
    // Validate each field in record
    const validFields = {};
    const invalidFields = [];
    const missingFields = [];
    
    // Check which fields from record exist in schema
    Object.keys(recordData).forEach(field => {
      const columnExists = tableSchema.find(col => col.column === field);
      if (columnExists) {
        validFields[field] = recordData[field];
      } else {
        invalidFields.push({
          field,
          value: recordData[field],
          reason: 'Column does not exist in database'
        });
      }
    });
    
    // Check for required fields that are missing
    tableSchema.forEach(col => {
      if (!col.nullable && col.column !== 'id' && col.column !== 'created_at' && col.column !== 'updated_at') {
        if (!(col.column in recordData)) {
          missingFields.push({
            field: col.column,
            type: col.type,
            reason: 'Required field missing from record'
          });
        }
      }
    });
    
    return NextResponse.json({
      success: true,
      tableName,
      validation: {
        validFields,
        invalidFields,
        missingFields,
        totalFields: Object.keys(recordData).length,
        validCount: Object.keys(validFields).length,
        invalidCount: invalidFields.length,
        isValid: invalidFields.length === 0 && missingFields.length === 0
      },
      message: invalidFields.length === 0 && missingFields.length === 0 
        ? ' Record is valid for database insertion'
        : ` Found ${invalidFields.length} invalid fields and ${missingFields.length} missing required fields`
    });
    
  } catch (error: any) {
    console.error(' Record validation failed:', error);
    return NextResponse.json(
      { 
        error: 'Record validation failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}
