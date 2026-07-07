import { Building } from '@/lib/types/building'
import { buildLocalityPhrase } from '@/lib/utils/locality-phrase'

interface SEODescriptionProps {
  building: Building
  totalListings: number
  avgPrice: number
  // LANE-B-2 (2026-07-07): real locality resolved by parent via
  // buildings.community_id → communities.municipality_id → municipalities.name.
  // NULL when unresolvable; every locality-scoped phrase in this component
  // omits or falls back cleanly. Never emits "Toronto" as a fabricated
  // default (prior hardcodes at :34/:42/:55/:59/:60/:62 were Rule Zero #1
  // — verified live on non-Toronto buildings).
  localityName?: string | null
}

export default function SEODescription({ building, totalListings, avgPrice, localityName = null }: SEODescriptionProps) {
  const priceFormatted = avgPrice > 0 ? `$${Math.round(avgPrice / 1000)}K` : 'various price points'
  // LANE-B-2: use the shared helper so the phrase is skipped when the
  // canonical address already contains the locality (avoids doublings).
  const localityPhrase = buildLocalityPhrase(building.canonical_address, localityName)
  const localityDistrict = localityName || building.city_district || null

  return (
    <section className="py-12 bg-slate-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="prose prose-slate max-w-none">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            About {building.building_name}
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
