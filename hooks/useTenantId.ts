'use client'
import { useEffect, useState } from 'react'

/**
 * Returns the current tenant ID for the site the user is on.
 *
 * Reads from `document.body.dataset.tenantId`, which is set server-side by RootLayout
 * from the `x-tenant-id` response header injected by middleware.
 *
 * Returns null on server (SSR) and on first render before hydration, so callers
 * should handle null gracefully (e.g. skip the fetch until hydration completes).
 *
 * Use this instead of hardcoding WALLiam's UUID in client components. It makes
 * every component automatically multi-tenant — the hook returns the correct
 * tenant ID for whichever domain the user is currently on.
 */
export function useTenantId(): string | null {
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    const id = document.body.dataset.tenantId || null
    setTenantId(id)
  }, [])

  return tenantId
}