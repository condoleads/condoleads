// app/api/admin-homes/discover/route.ts
// Preview: count available residential properties per municipality/community from PropTx
import { NextRequest, NextResponse } from 'next/server';
import { previewHomes, PropertyTypeFilter } from '@/lib/homes-sync/search';

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { municipalityName, communityName, propertyType } = await request.json();

    if (!municipalityName) {
      return NextResponse.json(
        { success: false, error: 'Municipality name is required' },
        { status: 400 }
      );
    }

    const ptFilter: PropertyTypeFilter = propertyType || 'freehold';

    console.log(`[HomesDiscover] Preview: ${municipalityName}${communityName ? ' / ' + communityName : ''} (${ptFilter})`);

    const result = await previewHomes({ municipalityName, communityName, propertyType: ptFilter });

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
      propertyType: ptFilter,
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
