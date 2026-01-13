// app/api/admin/psf-analytics/test/route.ts

import { NextResponse } from 'next/server';

export async function GET() {
  const PROPTX_URL = process.env.PROPTX_RESO_API_URL || 'https://query.ampre.ca/odata/';
  const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN;

  console.log('[TEST] URL:', PROPTX_URL);
  console.log('[TEST] Token exists:', !!PROPTX_TOKEN);

  const filter = `PropertyType eq 'Residential Condo & Other' and StandardStatus eq 'Closed' and TransactionType eq 'For Sale' and ClosePrice gt 100000`;
  const url = `${PROPTX_URL}Property?$filter=${encodeURIComponent(filter)}&$top=5`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${PROPTX_TOKEN}`,
        Accept: 'application/json',
      },
    });

    const data = await response.json();
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      tokenExists: !!PROPTX_TOKEN,
      tokenPreview: PROPTX_TOKEN?.substring(0, 20) + '...',
      url: PROPTX_URL,
      recordCount: data.value?.length || 0,
      sample: data.value?.[0] || null,
      error: !response.ok ? data : null,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      tokenExists: !!PROPTX_TOKEN,
    });
  }
}

