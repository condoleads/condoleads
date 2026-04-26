// app/api/admin-homes/tenants/verify-anthropic-key/route.ts
// POST { key: string } -> { valid: boolean, error?: string }
// Makes a minimal Claude call to verify the key works
// Platform-admin only — no DB access, just the Anthropic API call.
// Phase 3.4+: auth + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requirePlatformAdmin } from '@/lib/admin-homes/api-auth'

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => ({}))
  const key = typeof body.key === 'string' ? body.key.trim() : ''

  if (!key) {
    return NextResponse.json({ valid: false, error: 'No key provided' }, { status: 400 })
  }

  if (!key.startsWith('sk-ant-')) {
    return NextResponse.json({ valid: false, error: 'Invalid format (expected sk-ant-...)' })
  }

  try {
    const anthropic = new Anthropic({ apiKey: key })
    await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return NextResponse.json({ valid: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    let friendly = msg
    if (msg.includes('401') || msg.toLowerCase().includes('authentication')) {
      friendly = 'Invalid API key'
    } else if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
      friendly = 'Rate limited - try again in a moment'
    } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
      friendly = 'Network error - check connection'
    }
    return NextResponse.json({ valid: false, error: friendly })
  }
}