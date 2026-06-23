'use client';
import { useState } from 'react';
import SearchBar from '@/components/navigation/SearchBar';

const BROWSE_EXAMPLES = [
  'One Bloor East',
  '25 Capreol Ct #2701',
  'The Well',
  'Mississauga',
  '155 Yorkville Ave',
  'Toronto',
  'Maple Leaf Square',
  '88 Harbour St #2501',
  'Whitby',
];


// Popular GTA quick-chip targets. Some entries are Toronto sub-district
// neighbourhoods (North York, Etobicoke) -- stored in the neighbourhoods
// table, accessed at /toronto/<slug> (NOT a flat /<slug>). The /[slug] router
// also redirects bare neighbourhood slugs to /toronto/<slug>, but linking the
// chips directly to the canonical path avoids the redirect hop.
const QUICK_CHIPS = [
  { name: 'Downtown Toronto', href: '/toronto/downtown' },
  { name: 'North York', href: '/toronto/north-york' },
  { name: 'Mississauga', href: '/mississauga' },
  { name: 'Whitby', href: '/whitby' },
  { name: 'Etobicoke', href: '/toronto/etobicoke' },
  { name: 'Oakville', href: '/oakville' },
  { name: 'Markham', href: '/markham' },
];

// W-AILY-HOMEPAGE-UI (2026-06-23): mega-menu lifted to the parent
// (HomePageComprehensiveClientV2) so VIPAIAccess can render BETWEEN the
// chips and the mega-menu. This component now renders only the search
// bar + caption + chips. The neighbourhood mega-menu is mounted by the
// parent in the same browse-mode conditional.
export default function BrowseListingsView() {
  const [searchFocused, setSearchFocused] = useState(false);
  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
      {/* Search bar - gradient border (violet -> pink -> cyan) */}
      <div style={{
        maxWidth: 720,
        margin: '0 auto 18px',
        borderRadius: 20,
        padding: 2,
        background: searchFocused
          ? 'linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4)'
          : 'linear-gradient(135deg, rgba(139,92,246,0.55), rgba(236,72,153,0.55), rgba(6,182,212,0.55))',
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
        boxShadow: searchFocused
          ? '0 0 50px rgba(139,92,246,0.25), 0 12px 40px rgba(0,0,0,0.4)'
          : '0 0 28px rgba(139,92,246,0.12), 0 8px 32px rgba(0,0,0,0.35)',
      }}>
        <div style={{ borderRadius: 18, background: 'rgba(8,15,26,0.95)' }}>
          <SearchBar
            variant="dark"
            placeholder=""
            typingPlaceholders={BROWSE_EXAMPLES}
            onFocusChange={setSearchFocused}
          />
        </div>
      </div>

      {/* Caption */}
      <p style={{
        textAlign: 'center',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        margin: '0 0 20px',
      }}>
        Search by address, building, or neighbourhood
      </p>

      {/* Quick-chip regions */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        margin: '0 auto 40px',
        maxWidth: 720,
      }}>
        {QUICK_CHIPS.map((chip) => (
          <a
            key={chip.href}
            href={chip.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '9px 18px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.03)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.85)',
              textDecoration: 'none',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.3)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.03)';
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.18)';
            }}
          >
            {chip.name}
          </a>
        ))}
      </div>
    </div>
  );
}
