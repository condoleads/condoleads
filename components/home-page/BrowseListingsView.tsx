'use client';
import SearchBar from '@/components/navigation/SearchBar';
import type { AreaCard } from '@/lib/comprehensive/types';

interface AccessInfo {
  isAllMLS: boolean;
  buildings_access: boolean;
  condo_access: boolean;
  homes_access: boolean;
}

interface BrowseListingsViewProps {
  topAreas: AreaCard[];
  access: AccessInfo;
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

export default function BrowseListingsView({ topAreas, access }: BrowseListingsViewProps) {
  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
      {/* Search bar - reuses the existing autocomplete */}
      <div style={{ marginBottom: 28, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
        <SearchBar placeholder="Search neighbourhoods, buildings, addresses" />
      </div>

      {/* Caption */}
      <p style={{
        textAlign: 'center',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        margin: '0 0 24px',
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

      {/* Popular neighbourhoods section - real data from topAreas */}
      {topAreas.length > 0 && (
        <>
          <p style={{
            textAlign: 'left',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            margin: '0 0 14px',
          }}>
            Popular Neighbourhoods
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 40,
          }}>
            {topAreas.map((area) => (
              <a
                key={area.id}
                href={`/${area.slug}`}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  textAlign: 'left',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  display: 'block',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 500, color: '#fff', margin: '0 0 4px' }}>
                  {area.name}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
                  {area.buildingCount > 0
                    ? `${area.buildingCount} building${area.buildingCount === 1 ? '' : 's'}`
                    : 'Browse listings'}
                  {area.condoCount > 0 && ` · ${area.condoCount} condo${area.condoCount === 1 ? '' : 's'}`}
                  {area.homeCount > 0 && ` · ${area.homeCount} home${area.homeCount === 1 ? '' : 's'}`}
                </p>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
