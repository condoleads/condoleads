'use client';
import SearchBar from '@/components/navigation/SearchBar';
import BrowseMegaMenuContent from '@/components/navigation/BrowseMegaMenuContent';
import type { NeighbourhoodMenuItem } from '@/components/navigation/SiteHeader';

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
  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
      {/* Search bar - enhanced dark variant */}
      <div style={{ maxWidth: 720, margin: '0 auto 18px' }}>
        <SearchBar
          variant="dark"
          placeholder="Try 10 De Boers, Yonge and Eglinton, or Whitby"
        />
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
