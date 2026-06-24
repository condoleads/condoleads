'use client'
import { useEffect, useState } from 'react'

/**
 * Returns the current tenant's wordmark_style for the site the user is on
 * (e.g. 'hero', 'aiglow', 'standard').
 *
 * Reads from `document.body.dataset.tenantWordmarkStyle`, which is set
 * server-side by RootLayout from getCurrentTenantWordmarkStyle(). Mirrors the
 * useTenantId.ts pattern exactly — same body.dataset source, same SSR/first-
 * render null behavior — so client components can branch on tenant identity-
 * style without a new fetch.
 *
 * Returns undefined on server (SSR) and on first render before hydration,
 * and when the data attribute is empty (no tenant resolved). Callers should
 * treat undefined as "fall back to default".
 */
export function useTenantWordmarkStyle(): string | undefined {
  const [style, setStyle] = useState<string | undefined>(undefined)

  useEffect(() => {
    const s = document.body.dataset.tenantWordmarkStyle
    setStyle(s && s.length > 0 ? s : undefined)
  }, [])

  return style
}
