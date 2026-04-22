// components/CharlieFooterLink.tsx
// Client subcomponent used by TenantFooter to trigger the Charlie overlay.
// Dispatches the same 'charlie:open' event that SiteHeader + homepage CTAs dispatch,
// so clicking a footer link opens Charlie in whatever mode is requested.

'use client'

import React from 'react'

type CharlieForm = 'buyer' | 'seller'

export default function CharlieFooterLink({
  form,
  children,
}: {
  form: CharlieForm
  children: React.ReactNode
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form } }))
    }
  }
  return (
    <a
      href="#"
      onClick={handleClick}
      style={{
        display: 'block',
        color: 'rgba(255,255,255,0.7)',
        textDecoration: 'none',
        fontSize: 13,
        marginBottom: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </a>
  )
}