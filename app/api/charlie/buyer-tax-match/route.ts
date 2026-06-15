// app/api/charlie/buyer-tax-match/route.ts
//
// W-CHARLIE-BUYER-CHUNK4 (2026-06-15) — buyer Tax-Matched derivation
// endpoint. The in-chat Charlie component calls this whenever its
// matched-listings state changes; the response is the SAME shape the
// plan-email route persists to plan_data.buyerTaxMatch + the email
// template renders. Three surfaces, one derivation, identical output.
//
// SECURITY: takes matched-listings (already client-side state) + geo
// context + tenant header. No PII. No auth gate beyond the tenant
// header. The query runs against mls_listings only (no users, no
// leads, no email sends).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deriveBuyerTaxMatch } from '@/lib/charlie/buyer-tax-match'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const matchedListings = Array.isArray(body?.matchedListings) ? body.matchedListings : []
    const geoContext = body?.geoContext || null
    const supabase = createServiceClient()
    const result = await deriveBuyerTaxMatch({
      supabase,
      matchedListings,
      geoContext: {
        geoType: geoContext?.geoType,
        geoId: geoContext?.geoId,
        municipalityId: geoContext?.municipalityId
          ?? (geoContext?.geoType === 'municipality' ? geoContext?.geoId : null),
        communityId: geoContext?.communityId
          ?? (geoContext?.geoType === 'community' ? geoContext?.geoId : null),
      },
    })
    return NextResponse.json({ ok: true, buyerTaxMatch: result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 })
  }
}
