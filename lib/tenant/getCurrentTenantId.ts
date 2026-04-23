// lib/tenant/getCurrentTenantId.ts
// Reads the current tenant ID from the x-tenant-id request header.
// The header is set by middleware based on the request host.
// Returns null if no tenant can be resolved.
// Use this in server components + server helpers that need tenant-scoped queries.

import { headers } from 'next/headers'

export async function getCurrentTenantId(): Promise<string | null> {
  const h = await headers()
  return h.get('x-tenant-id') || null
}