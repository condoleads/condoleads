// app/api/debug/paddle-check/route.ts
// TEMPORARY endpoint to verify Paddle API key + webhook secret from server-side.
// Delete this file + PADDLE_DEBUG_TOKEN env var after verification.
//
// Usage: GET /api/debug/paddle-check?token=<PADDLE_DEBUG_TOKEN>

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckResult = {
  ok: boolean
  httpStatus: number | null
  note: string
}

async function probe(url: string, apiKey: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Paddle-Version': '1',
      },
    })
    return {
      ok: res.status === 200,
      httpStatus: res.status,
      note: res.status === 200 ? 'authenticated successfully' : `rejected by this environment`,
    }
  } catch (err: any) {
    return { ok: false, httpStatus: null, note: `network error: ${err?.message || 'unknown'}` }
  }
}

export async function GET(req: NextRequest) {
  // Auth: require ?token= matching PADDLE_DEBUG_TOKEN env var
  const providedToken = req.nextUrl.searchParams.get('token') || ''
  const expectedToken = process.env.PADDLE_DEBUG_TOKEN || ''
  if (!expectedToken) {
    return NextResponse.json({ error: 'PADDLE_DEBUG_TOKEN not configured' }, { status: 500 })
  }
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const apiKey = process.env.PADDLE_API_KEY || ''
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET || ''

  // --- Basic presence + shape checks (never echo the full values) ---
  const apiKeyInfo = {
    present: apiKey.length > 0,
    length: apiKey.length,
    prefix: apiKey.substring(0, 12),
    environmentHint:
      apiKey.startsWith('pdl_live_') ? 'live'
      : apiKey.startsWith('pdl_sdbx_') ? 'sandbox'
      : apiKey.startsWith('apikey_') ? 'legacy (unknown env — prefix ambiguous)'
      : 'unknown (unexpected prefix)',
  }

  const webhookSecretInfo = {
    present: webhookSecret.length > 0,
    length: webhookSecret.length,
    prefix: webhookSecret.substring(0, 12),
  }

  // --- Live API probe ---
  let liveProbe: CheckResult = { ok: false, httpStatus: null, note: 'skipped (no api key)' }
  let sandboxProbe: CheckResult = { ok: false, httpStatus: null, note: 'skipped (no api key)' }

  if (apiKey.length > 0) {
    liveProbe = await probe('https://api.paddle.com/event-types', apiKey)
    sandboxProbe = await probe('https://sandbox-api.paddle.com/event-types', apiKey)
  }

  // --- Verdict ---
  let verdict: string
  if (!apiKeyInfo.present) {
    verdict = 'FAIL: PADDLE_API_KEY is empty at runtime'
  } else if (!webhookSecretInfo.present) {
    verdict = 'WARN: PADDLE_API_KEY ok but PADDLE_WEBHOOK_SECRET is empty at runtime'
  } else if (liveProbe.ok && !sandboxProbe.ok) {
    verdict = 'PASS: API key is LIVE (production). Fully production-ready.'
  } else if (!liveProbe.ok && sandboxProbe.ok) {
    verdict = 'FAIL: API key is SANDBOX. Not ready for real payments.'
  } else if (liveProbe.ok && sandboxProbe.ok) {
    verdict = 'UNUSUAL: key accepted by both live and sandbox — investigate'
  } else {
    verdict = `FAIL: API key rejected by both endpoints (live=${liveProbe.httpStatus}, sandbox=${sandboxProbe.httpStatus}). Key is invalid or revoked.`
  }

  // --- Env vars presence summary ---
  const priceEnvs = [
    'NEXT_PUBLIC_PADDLE_PRICE_SOLO_STARTER',
    'NEXT_PUBLIC_PADDLE_PRICE_SOLO_PREMIUM',
    'NEXT_PUBLIC_PADDLE_PRICE_TEAM_STARTER',
    'NEXT_PUBLIC_PADDLE_PRICE_TEAM_PREMIUM',
    'NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE',
    'NEXT_PUBLIC_PADDLE_PRICE_SOLO_SETUP',
    'NEXT_PUBLIC_PADDLE_PRICE_TEAM_SETUP',
  ]
  const priceStatus = Object.fromEntries(
    priceEnvs.map((k) => [k, (process.env[k] || '').length > 0 ? 'set' : 'MISSING'])
  )

  return NextResponse.json({
    verdict,
    paddleEnvVar: process.env.NEXT_PUBLIC_PADDLE_ENV || '(unset — defaults to production)',
    apiKey: apiKeyInfo,
    webhookSecret: webhookSecretInfo,
    probes: {
      live: { url: 'https://api.paddle.com/event-types', ...liveProbe },
      sandbox: { url: 'https://sandbox-api.paddle.com/event-types', ...sandboxProbe },
    },
    priceIds: priceStatus,
    resendApiKey: (process.env.RESEND_API_KEY || '').length > 0 ? 'set' : 'MISSING',
    timestamp: new Date().toISOString(),
  })
}