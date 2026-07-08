import Link from 'next/link'
import { Building } from '@/lib/types/building'
import { buildLocalityPhrase } from '@/lib/utils/locality-phrase'
import { generatePropertySlug } from '@/lib/utils/slugs'

type GeoNode = { name: string; slug: string } | null
interface CrawlListing {
  listing_key?: string | null
  unparsed_address?: string | null
  unit_number?: string | null
  list_price?: number | null
  transaction_type?: string | null
}

interface SEODescriptionProps {
  building: Building
  totalListings: number
  avgPrice: number
  localityName?: string | null
  // LANE-B-2 (2026-07-08): dead-end fix. Parent resolves the full geo
  // chain once (buildings.community_id → community → muni → area, with
  // slugs) — passed here so the body can emit real up-link anchors up to
  // the community / muni / area page. NULL levels → silently omitted.
  // Never fabricate slugs; every href comes from a verified row.
  geoChain?: { community: GeoNode; muni: GeoNode; area: GeoNode }
  // LANE-B-2: raw active listings on this building. Slugs computed here
  // via the same generatePropertySlug helper used across the app
  // (canonical single source). Silent-omit when list is empty. Capped in
  // the render below to avoid link-dilution.
  crawlListings?: CrawlListing[]
  buildingSlug?: string
}

const CRAWL_MAX_PER_SECTION = 8

export default function SEODescription({
  building,
  totalListings,
  avgPrice,
  localityName = null,
  geoChain,
  crawlListings,
  buildingSlug,
}: SEODescriptionProps) {
  const priceFormatted = avgPrice > 0 ? `$${Math.round(avgPrice / 1000)}K` : 'various price points'
  const localityPhrase = buildLocalityPhrase(building.canonical_address, localityName)
  const localityDistrict = localityName || building.city_district || null

  // LANE-B-2: crawlable listing anchors split by transaction. Slugs from
  // the same generator used everywhere else — never fabricated. Cap per
  // section to preserve link-equity flow (avoid link-dilution).
  const _forSale = (crawlListings || [])
    .filter(l => l.transaction_type === 'For Sale' && l.listing_key)
    .slice(0, CRAWL_MAX_PER_SECTION)
  const _forLease = (crawlListings || [])
    .filter(l => l.transaction_type === 'For Lease' && l.listing_key)
    .slice(0, CRAWL_MAX_PER_SECTION)

  const _hasUpLinks = !!(geoChain && (geoChain.community || geoChain.muni || geoChain.area))

  return (
    <section className="py-12 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="prose prose-slate max-w-none">
          {/* A-UNIT-3b (2026-07-07): H2 keyword-align — add product-type
              "Condos". Buildings table is condo-scoped by construction
              (98.6% of building-linked listings are Residential Condo &
              Other; the parent BuildingPage title/desc already treats every
              building as a "Condos" building — verified from title shape). */}
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            About {building.building_name} Condos
          </h2>

          <p className="text-slate-700 leading-relaxed mb-4">
            {building.building_name} is a premier condominium located at {building.canonical_address}{localityPhrase}.
            {building.total_units && ` This ${building.total_units}-unit building`} offers residents luxurious urban living with modern amenities and convenient access to the city&apos;s best dining, shopping, and entertainment options.
          </p>

          {totalListings > 0 && (
            <p className="text-slate-700 leading-relaxed mb-4">
              Currently, there {totalListings === 1 ? 'is' : 'are'} {totalListings} {totalListings === 1 ? 'unit' : 'units'} available
              at {building.building_name}, with prices averaging around {priceFormatted}. The building features a variety of floor plans
              to suit different lifestyles, from cozy studios to spacious multi-bedroom units.
            </p>
          )}

          {localityDistrict && (
            <p className="text-slate-700 leading-relaxed mb-4">
              {building.building_name} stands out in {localityDistrict}&apos;s competitive real estate market for its prime location.
              Residents enjoy easy access to public transit, major highways, parks, and all essential services. The building&apos;s modern design
              and well-maintained facilities make it an attractive choice for both homeowners and investors.
            </p>
          )}

          {building.year_built && (
            <p className="text-slate-700 leading-relaxed mb-4">
              {building.year_built < 2010 ? 'Established' : 'Built'} in {building.year_built}, {building.building_name} has established
              itself as a desirable address{localityDistrict ? ` in ${localityDistrict}` : ''}. The building continues to maintain high standards of quality and service,
              making it a sought-after location for condo buyers and renters alike.
            </p>
          )}

          <p className="text-slate-700 leading-relaxed">
            Whether you&apos;re looking to buy, sell, or rent at {building.building_name}, our team of experienced real estate professionals
            can help you navigate the market and find the perfect unit to match your needs. Contact us today for a free consultation
            and market analysis.
          </p>

          {_hasUpLinks && (
            <p className="text-slate-700 leading-relaxed mt-4">
              Explore more real estate in the wider area:
              {geoChain?.community && (
                <> <Link href={`/${geoChain.community.slug}`} className="text-blue-700 hover:underline">{geoChain.community.name}</Link></>
              )}
              {geoChain?.muni && (
                <>{geoChain?.community ? ',' : ''} <Link href={`/${geoChain.muni.slug}`} className="text-blue-700 hover:underline">{geoChain.muni.name}</Link></>
              )}
              {geoChain?.area && (
                <>{(geoChain?.community || geoChain?.muni) ? ' and the' : ''} <Link href={`/${geoChain.area.slug}`} className="text-blue-700 hover:underline">{geoChain.area.name}</Link> area</>
              )}
              .
            </p>
          )}

          {_forSale.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Units for Sale at {building.building_name}
              </h3>
              <ul className="list-disc list-inside space-y-1">
                {_forSale.map(l => {
                  const href = generatePropertySlug(
                    { unparsed_address: l.unparsed_address, listing_key: l.listing_key, unit_number: l.unit_number },
                    buildingSlug,
                  )
                  const label = l.unit_number
                    ? `Unit ${l.unit_number}${l.list_price ? ` — $${l.list_price.toLocaleString()}` : ''}`
                    : (l.unparsed_address?.split(',')[0] || `Listing ${l.listing_key}`)
                  return (
                    <li key={l.listing_key || href}>
                      <Link href={href} className="text-blue-700 hover:underline">{label}</Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {_forLease.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Units for Lease at {building.building_name}
              </h3>
              <ul className="list-disc list-inside space-y-1">
                {_forLease.map(l => {
                  const href = generatePropertySlug(
                    { unparsed_address: l.unparsed_address, listing_key: l.listing_key, unit_number: l.unit_number },
                    buildingSlug,
                  )
                  const label = l.unit_number
                    ? `Unit ${l.unit_number}${l.list_price ? ` — $${l.list_price.toLocaleString()}/mo` : ''}`
                    : (l.unparsed_address?.split(',')[0] || `Listing ${l.listing_key}`)
                  return (
                    <li key={l.listing_key || href}>
                      <Link href={href} className="text-blue-700 hover:underline">{label}</Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-slate-300">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              Keywords: {building.building_name}{localityDistrict ? ` ${localityDistrict}` : ''} Real Estate
            </h3>
            <p className="text-sm text-slate-600">
              {building.building_name} condos for sale, {building.building_name} units for rent,
              {building.canonical_address}{localityDistrict ? `, ${localityDistrict} condos` : ''},
              {localityDistrict ? `${localityDistrict} real estate, luxury condos ${localityDistrict}, ` : 'luxury condos, '}
              {building.building_name} building amenities{localityDistrict ? `, ${localityDistrict} condo market` : ''},
              {localityDistrict ? `buy condo ${localityDistrict}, sell condo ${localityDistrict}` : 'buy condo, sell condo'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
