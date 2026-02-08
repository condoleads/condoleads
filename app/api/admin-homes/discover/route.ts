// app/api/admin-homes/discover/route.ts
// Preview: count available freehold homes per municipality/community from PropTx
import { NextRequest, NextResponse } from 'next/server';
import { previewHomes } from '@/lib/homes-sync/search';

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { municipalityName, communityName } = await request.json();

    if (!municipalityName) {
      return NextResponse.json(
        { success: false, error: 'Municipality name is required' },
        { status: 400 }
      );
    }

    console.log(`[HomesDiscover] Preview: ${municipalityName}${communityName ? ' / ' + communityName : ''}`);

    const result = await previewHomes({ municipalityName, communityName });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      municipality: municipalityName,
      community: communityName || null,
      counts: result.counts
    });

  } catch (error: any) {
    console.error('[HomesDiscover] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
