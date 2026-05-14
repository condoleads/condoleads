'use client'

// components/admin-homes/TenantSwitcher.tsx
// W-LEADS-WORKBENCH W5a (2026-05-14)
//
// Client dropdown that lets switching-capable users (platform_admin,
// platform_assistant, tenant_manager) change their active tenant context.
// Posts to /api/admin-homes/scope/set-tenant which writes/clears the
// platform_tenant_override cookie, then reloads the page so the new
// tenant context applies via getAdminTenantContext.

import { useState } from 'react'

export interface TenantOption {
  id: string
  name: string
  brand_name: string | null
  domain: string
}

interface Props {
  tenants: TenantOption[]
  currentTenantId: string | null
  allowUniversal: boolean
}

const UNIVERSAL_VALUE = '__universal__'

export default function TenantSwitcher({
  tenants,
  currentTenantId,
  allowUniversal,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(value: string) {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const nextTenantId = value === UNIVERSAL_VALUE ? null : value
    try {
      const res = await fetch('/api/admin-homes/scope/set-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: nextTenantId }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        setError((data && data.error) || 'Failed to switch tenant')
        setSubmitting(false)
        return
      }
      // Reload so the server re-renders with the new tenant context.
      window.location.reload()
    } catch (e: any) {
      setError((e && e.message) || 'Network error')
      setSubmitting(false)
    }
  }

  const currentValue = currentTenantId || UNIVERSAL_VALUE

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        disabled={submitting}
        className="text-xs px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {allowUniversal && (
          <option value={UNIVERSAL_VALUE}>All tenants (Universal)</option>
        )}
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {(t.brand_name || t.name) + ' (' + t.domain + ')'}
          </option>
        ))}
      </select>
      {submitting && (
        <span className="text-xs text-slate-400">Switching\u2026</span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
