// app/api/charlie/test-seller-estimate-view-probe/route.ts
//
// W-CHARLIE-CONVERGENCE CV-0 (2026-06-14) — test-only probe. Wraps the
// canonical helpers (lib/charlie/seller-estimate-view.ts +
// lib/charlie/tier-chip.ts) so scripts/smoke-seller-estimate-view.js can
// invoke the SHIPPED implementations without a ts-node loader. Mirrors
// the pattern used by /api/charlie/test-render-plan-email-probe.
//
// SECURITY: takes plan_data (or a leadId, in which case it reads
// leads.plan_data via service role) and returns the helper output. No
// mutation, no email send, no auth gates. Underscore-prefix avoided
// because Next.js treats _folders as private/non-routable; "-probe"
// suffix marks it as test-only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildSellerEstimateView } from '@/lib/charlie/seller-estimate-view'
import { tierChipFor, TIER_META, TIER_ORDER, asTierName } from '@/lib/charlie/tier-chip'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const op = body?.op
    if (op === 'view') {
      let planData = body.planData
      if (!planData && body.leadId) {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('leads')
          .select('plan_data')
          .eq('id', body.leadId)
          .maybeSingle()
        if (error) return NextResponse.json({ ok: false, error: 'lead read failed: ' + error.message }, { status: 500 })
        if (!data) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 })
        planData = (data as any).plan_data
      }
      const view = buildSellerEstimateView(planData)
      return NextResponse.json({ ok: true, view, sourceShape: planData ? Object.keys(planData) : null })
    }
    if (op === 'tierChip') {
      const result = tierChipFor(body.sourceTier ?? null, body.anchorTier ?? null, body.path === 'condo' ? 'condo' : 'home')
      return NextResponse.json({ ok: true, result })
    }
    if (op === 'tierMeta') {
      return NextResponse.json({ ok: true, TIER_META, TIER_ORDER, knownTiers: ['platinum','gold','silver','bronze'] })
    }
    if (op === 'asTierName') {
      return NextResponse.json({ ok: true, result: asTierName(body.value ?? null) })
    }
    return NextResponse.json({ ok: false, error: 'unknown op (expected view|tierChip|tierMeta|asTierName)' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err), stack: err?.stack }, { status: 500 })
  }
}
