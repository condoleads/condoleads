// app/api/charlie/test-render-plan-email-probe/route.ts
//
// NOTE: probe name + path are intentionally non-underscore-prefixed (Next.js
// treats _underscore folders as private/non-routable per Next 13+ rules).
// The "-probe" suffix marks it as a test-only seam — production code does
// not call it; only scripts/smoke-charlie-email-fixture.js does.
//
// C-CHARLIE-FOLLOWUP B(i) (2026-06-13) — test-only probe. Returns the HTML
// that buildRichPlanEmail produces for a given fixture payload, so the
// smoke harness can assert against the live render path WITHOUT writing
// leads, sending emails, or hitting the auth/session gates.
//
// Mirrors the pattern of app/api/test-estimator-sections/route.ts
// (also a test-only probe — the underscore prefix here marks it more
// loudly as not-production-traffic).
//
// SECURITY: the probe builds an HTML preview from the request body only.
// No DB read, no PII lookup, no send. The smoke harness fetches the real
// fixture from the DB via pg locally and POSTs it here; the probe is a
// pure render seam.

import { NextRequest, NextResponse } from 'next/server'
import { buildRichPlanEmail } from '@/lib/email/charlie-plan-email-html'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      sellerEstimate,
      planType = 'seller',
      plan = null,
      analytics = null,
      listings = [],
      comparables = [],
      vipCreditUsed = false,
      vipCreditPlansUsed = 0,
      vipCreditTotal = 1,
      blocks = [],
      brandName = 'WALLiam',
      domain = 'walliam.ca',
      baseUrl = 'https://walliam.ca',
      userName = 'Test User',
      userEmail = 'test@example.invalid',
      agent = null,
      geoName = 'Pickering',
      sourceUrl = null,
    } = body
    const html = buildRichPlanEmail({
      userName, userEmail, planType, plan, analytics,
      listings, agent, geoName,
      comparables, sellerEstimate,
      vipCreditUsed, vipCreditPlansUsed, vipCreditTotal,
      blocks, brandName, domain, baseUrl, sourceUrl,
    })
    return NextResponse.json({ ok: true, htmlLength: html.length, html })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err), stack: err?.stack }, { status: 500 })
  }
}
