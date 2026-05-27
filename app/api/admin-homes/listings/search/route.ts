// app/api/admin-homes/listings/search/route.ts
// W-TERRITORY-MASTER P5.1: Search mls_listings by listing_key + unparsed_address.
//
// GET /api/admin-homes/listings/search?q=<query>&limit=20
//
// Strategy:
//   - If q matches a listing_key shape (1-2 letters + digits, no whitespace),
//     try exact listing_key lookup first; if found, return it as the top result.
//   - Otherwise (or in parallel for safety), trigram ILIKE on unparsed_address.
//   - All results filtered by available_in_vow = true (same gate as /listings/lookup).
//
// Index used: idx_mls_listings_unparsed_address_trgm (GIN gin_trgm_ops on unparsed_address).
//             idx_mls_listings_listing_key (BTREE on listing_key).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MIN_QUERY_LEN = 3
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

// Pattern for a listing_key candidate: optional letter prefix (1-3 chars) then digits.
// Examples that should match: X11930580, C11961013, E12628218, W12376218.
const LISTING_KEY_PATTERN = /^[a-zA-Z]{1,3}\d{4,}$/

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const qRaw = (url.searchParams.get('q') || '').trim()
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(limitRaw || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))

  if (!qRaw) {
    return NextResponse.json({ error: 'q parameter required' }, { status: 400 })
  }
  if (qRaw.length < MIN_QUERY_LEN) {
    return NextResponse.json(
      { error: `q must be at least ${MIN_QUERY_LEN} chars`, data: [] },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // Branch 1: Looks like a listing_key — try exact match first (cheap, index-backed).
  if (LISTING_KEY_PATTERN.test(qRaw)) {
    const { data: exactRow, error: exactErr } = await supabase
      .from('mls_listings')
      .select('id, listing_key, unparsed_address, property_type, list_price, standard_status')
      .eq('listing_key', qRaw.toUpperCase())
      .eq('available_in_vow', true)
      .maybeSingle()

    if (exactErr) {
      return NextResponse.json({ error: exactErr.message }, { status: 500 })
    }
    if (exactRow) {
      // Return just the exact match. Operator typed an MLS — they want that one.
      return NextResponse.json({ data: [exactRow], match_kind: 'exact' })
    }
    // If the listing_key shape didn't match anything, fall through to fuzzy search.
  }

  // Branch 2: Fuzzy address search via trigram. ILIKE %q% uses the GIN index.
  const ilikePattern = `%${qRaw}%`
  const { data: addrRows, error: addrErr } = await supabase
    .from('mls_listings')
    .select('id, listing_key, unparsed_address, property_type, list_price, standard_status')
    .ilike('unparsed_address', ilikePattern)
    .eq('available_in_vow', true)
    .limit(limit)

  if (addrErr) {
    return NextResponse.json({ error: addrErr.message }, { status: 500 })
  }

  return NextResponse.json({
    data: addrRows || [],
    match_kind: 'fuzzy_address',
    query: qRaw
  })
}