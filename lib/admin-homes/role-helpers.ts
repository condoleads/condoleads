// lib/admin-homes/role-helpers.ts
//
// D30 (2026-05-22) — shared role-derivation helpers for admin-homes.
//
// Background: the agents table no longer carries an is_admin boolean column;
// admin capability is derived from agents.role. This module centralizes the
// derivation so no other file hardcodes the role-string comparison.
//
// Valid DB roles in production (verified 2026-05-22 against WALLiam tenant):
//   'agent' | 'tenant_admin'
// Auth path also accepts (from lib/admin-homes/permissions.ts DbRole):
//   'agent' | 'manager' | 'area_manager' | 'tenant_admin' | 'admin'
// Only 'tenant_admin' and 'admin' grant admin capability.

export function deriveIsAdmin(role: string | null | undefined): boolean {
  return role === 'tenant_admin' || role === 'admin';
}
