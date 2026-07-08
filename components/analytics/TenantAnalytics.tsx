'use client'

// C-UNIT-1 (2026-07-08): tenant-scoped GA4 + Consent Mode v2 + SPA
// pageview tracker. Fail-closed on NULL: no measurement ID → renders NULL
// (no script, no banner, no cookies, no tracking). Per-tenant by design;
// no hardcoded G-XXXX literal; every render reads the ID passed by the
// server layout from tenant.google_analytics_id.
//
// Consent Mode v2 posture: BEFORE gtag config, we emit
// gtag('consent','default',{...:'denied'}). This means gtag loads but sets
// NO cookies until the user accepts. Decline keeps the denied state — GA4
// runs cookieless ping mode (aggregate hits only). Accept → gtag update
// switches to full mode; _ga cookies are created at that moment, not before.
//
// Consent persistence: single first-party cookie `analytics_consent` =
// 'granted' | 'denied'. Cookie only (no localStorage, no session storage).
// Path=/, SameSite=Lax, expires 12mo. Once set, banner never re-shows.
//
// Tenant-neutral copy: "We use analytics cookies to improve this site" —
// no brand names hardcoded. Works for aily / walliam / any future tenant.

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const CONSENT_COOKIE = 'analytics_consent'
const CONSENT_MAX_AGE_SEC = 60 * 60 * 24 * 365 // 12 months

function readConsentCookie(): 'granted' | 'denied' | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(CONSENT_COOKIE + '='))
  if (!raw) return null
  const value = raw.slice(CONSENT_COOKIE.length + 1)
  if (value === 'granted' || value === 'denied') return value
  return null
}

function writeConsentCookie(value: 'granted' | 'denied'): void {
  if (typeof document === 'undefined') return
  document.cookie =
    CONSENT_COOKIE + '=' + value +
    '; Path=/; Max-Age=' + CONSENT_MAX_AGE_SEC +
    '; SameSite=Lax'
}

// SPA pageview: fires on route change. Guarded on gtag presence; no-ops
// when analytics is off. PII: sends page_path only. Property/geo slugs
// are public listing metadata (address is public MLS data, not user PII).
// No user identifiers, no email, no query params containing personal data.
function SpaPageviewTracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
    const qs = searchParams?.toString()
    const pagePath = qs ? pathname + '?' + qs : pathname
    window.gtag('event', 'page_view', {
      page_path: pagePath,
      send_to: measurementId,
    })
  }, [pathname, searchParams, measurementId])

  return null
}

function ConsentBanner({ onDecide }: { onDecide: (choice: 'granted' | 'denied') => void }) {
  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 720,
        marginLeft: 'auto',
        marginRight: 'auto',
        background: '#0f172a',
        color: '#f1f5f9',
        borderRadius: 12,
        padding: '14px 18px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        zIndex: 9999,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: '1 1 260px' }}>
        We use analytics cookies to improve this site.
      </span>
      <button
        type="button"
        onClick={() => onDecide('denied')}
        style={{
          background: 'transparent',
          color: '#cbd5e1',
          border: '1px solid #334155',
          padding: '6px 14px',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Decline
      </button>
      <button
        type="button"
        onClick={() => onDecide('granted')}
        style={{
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          padding: '6px 14px',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Accept
      </button>
    </div>
  )
}

interface Props {
  measurementId: string | null
}

export default function TenantAnalytics({ measurementId }: Props) {
  // FAIL-CLOSED — no ID → nothing rendered. No script, no banner, no cookies.
  if (!measurementId) return null

  // Consent state — undefined until we've read the cookie (SSR-safe).
  const [consent, setConsent] = useState<'granted' | 'denied' | null | undefined>(undefined)

  useEffect(() => {
    setConsent(readConsentCookie())
  }, [])

  const handleDecide = (choice: 'granted' | 'denied') => {
    writeConsentCookie(choice)
    setConsent(choice)
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: choice === 'granted' ? 'granted' : 'denied',
        analytics_storage: choice === 'granted' ? 'granted' : 'denied',
        ad_user_data: choice === 'granted' ? 'granted' : 'denied',
        ad_personalization: choice === 'granted' ? 'granted' : 'denied',
      })
    }
  }

  return (
    <>
      {/* Consent Mode v2 default (denied) MUST run before GA config. */}
      <Script id="ga-consent-default" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent','default',{
  ad_storage:'denied',
  analytics_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  wait_for_update:500
});
gtag('js', new Date());
gtag('config','${measurementId}', { send_page_view: false });`}
      </Script>
      <Script
        id="ga-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <SpaPageviewTracker measurementId={measurementId} />
      {/* Banner shows only when consent is unset. Cookie-based; no re-show. */}
      {consent === null && <ConsentBanner onDecide={handleDecide} />}
    </>
  )
}
