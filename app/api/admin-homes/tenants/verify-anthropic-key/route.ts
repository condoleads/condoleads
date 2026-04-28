// app/api/admin-homes/tenants/verify-anthropic-key/route.ts
// W5.5b: verify a tenant's Anthropic API key + detect credit status.
// POST { key: string, tenantId?: string }
//   -> { valid, error?, creditStatus?, lastCheckedAt }
//
// creditStatus:
//   'ok'       - key works, credits available
//   'depleted' - request rejected because balance too low
//
// Auth:
//   - If tenantId provided: requireTenantAccess (tenant_admin of that tenant OR platform admin)
//   - If no tenantId: requirePlatformAdmin (back-compat for old callers)

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requirePlatformAdmin, requireTenantAccess } from '@/lib/admin-homes/api-auth'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''

  if (tenantId) {
    const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin'] })
    if ('error' in auth) return auth.error
  } else {
    const auth = await requirePlatformAdmin()
    if ('error' in auth) return auth.error
  }

  const lastCheckedAt = new Date().toISOString()

  if (!key) {
    return NextResponse.json({ valid: false, error: 'No key provided', lastCheckedAt }, { status: 400 })
  }
  if (!key.startsWith('sk-ant-')) {
    return NextResponse.json({ valid: false, error: 'Invalid format (expected sk-ant-...)', lastCheckedAt })
  }

  try {
    const anthropic = new Anthropic({ apiKey: key })
    await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return NextResponse.json({ valid: true, creditStatus: 'ok', lastCheckedAt })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const lower = msg.toLowerCase()

    if (lower.includes('credit balance') || lower.includes('insufficient credits')) {
      return NextResponse.json({
        valid: false,
        creditStatus: 'depleted',
        error: 'Credit balance too low - top up at console.anthropic.com',
        lastCheckedAt,
      })
    }
    if (msg.includes('401') || lower.includes('authentication') || lower.includes('invalid x-api-key')) {
      return NextResponse.json({ valid: false, error: 'Invalid API key', lastCheckedAt })
    }
    if (msg.includes('429') || lower.includes('rate')) {
      return NextResponse.json({ valid: false, error: 'Rate limited - try again in a moment', lastCheckedAt })
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused')) {
      return NextResponse.json({ valid: false, error: 'Network error - check connection', lastCheckedAt })
    }

    return NextResponse.json({ valid: false, error: msg, lastCheckedAt })
  }
}