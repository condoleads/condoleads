'use client';
import { useState } from 'react';
import SearchBar from '@/components/navigation/SearchBar';
import BrowseMegaMenuContent from '@/components/navigation/BrowseMegaMenuContent';
import type { NeighbourhoodMenuItem } from '@/components/navigation/SiteHeader';

const BROWSE_EXAMPLES = [
  'Toronto',
  'Mississauga',
  'Vaughan',
  'Markham',
  'Oakville',
  'Whitby',
  'Burlington',
  'Richmond Hill',
];

interface BrowseListingsViewProps {
  neighbourhoods: NeighbourhoodMenuItem[];
}

// Popular GTA quick-chip targets - links to municipality slugs
const QUICK_CHIPS = [
  { name: 'Downtown Toronto', slug: 'toronto' },
  { name: 'North York', slug: 'north-york' },
  { name: 'Mississauga', slug: 'mississauga' },
  { name: 'Whitby', slug: 'whitby' },
  { name: 'Etobicoke', slug: 'etobicoke' },
  { name: 'Oakville', slug: 'oakville' },
  { name: 'Markham', slug: 'markham' },
];

export default function BrowseListingsView({ neighbourhoods }: BrowseListingsViewProps) {
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
          : 'rgba(255,255,255,0.18)',
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
        boxShadow: searchFocused
          ? '0 0 50px rgba(139,92,246,0.25), 0 12px 40px rgba(0,0,0,0.4)'
          : '0 8px 32px rgba(0,0,0,0.35)',
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
            key={chip.slug}
            href={`/${chip.slug}`}
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

      {/* Full Browse mega-menu inline */}
      {neighbourhoods.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <BrowseMegaMenuContent neighbourhoods={neighbourhoods} openInNewTab />
        </div>
      )}
    </div>
  );
}
