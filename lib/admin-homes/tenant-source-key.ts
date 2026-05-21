// lib/admin-homes/tenant-source-key.ts
//
// W-MULTITENANT-BENCH P3 finding #1: tenant onboarding via the admin-homes
// dashboard fails because `source_key` is NOT NULL on the tenants table but
// the AddTenantModal does not collect it. This helper derives a canonical
// source_key from the tenant's domain.
//
// Migration `20260521_tenants_source_key_unique.sql` enforces NOT NULL + UNIQUE
// at the schema level.

export function deriveSourceKey(domain: string | null | undefined): string {
  if (!domain || typeof domain !== 'string') return ''
  const firstLabel = domain.toLowerCase().split('.')[0] || ''
  return firstLabel.replace(/[^a-z0-9_-]/g, '')
}

export function sanitizeSourceKey(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return ''
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}