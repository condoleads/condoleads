// Shared site-name resolver for generateMetadata title paths.
//
// Extracted for LANE-B BUILD 2 (2026-07-07) so every metadata-emitting page
// resolves its brand suffix via the SAME source of truth. Prior pattern
// (`agentBranding?.site_title || 'CondoLeads'`) was duplicated across
// property/[id]/page.tsx, HomePropertyPage.tsx, BuildingPage.tsx, and
// DevelopmentPage.tsx — the last one was missed and shipped the CondoLeads
// leak on both aily.ca and walliam.ca (verified live in the ON-PAGE
// RE-AUDIT). This helper prevents a 6th miss: the class of bug can only
// recur if a NEW page-type file uses a different resolver.
//
// Precedence: agent site_title (System 1 legacy agent domain branding) →
// tenant.name (System 2 aily/walliam/future tenants via getTenantByHost) →
// neutral generic 'Real Estate' (last resort — NEVER a brand name).
//
// The 'CondoLeads' literal MUST NOT appear anywhere in the fall-through.
// condoleads.ca IS CondoLeads (the owner-promo site), so its own agent row
// will resolve site_title='CondoLeads' from DB — that's data-plane, not a
// hardcode.

export interface SiteNameInputs {
  agentBranding: { site_title: string | null } | null | undefined
  tenant: { name: string | null } | null | undefined
}

export function resolveSiteName({ agentBranding, tenant }: SiteNameInputs): string {
  return agentBranding?.site_title ?? tenant?.name ?? 'Real Estate'
}
