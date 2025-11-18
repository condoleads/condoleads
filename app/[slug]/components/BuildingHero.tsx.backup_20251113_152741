import { Building } from '@/lib/types/building'
import { formatPriceShort } from '@/lib/utils/formatters'
import ShareSaveButtons from './ShareSaveButtons'

interface BuildingHeroProps {
  building: Building
  slug: string
  activeSalesCount: number
  activeRentalsCount: number
  closedSalesCount: number
  closedRentalsCount: number
  avgSalePrice: number
  avgDaysOnMarketSale: number
  avgDaysOnMarketLease: number
}

export default function BuildingHero({
  building,
  slug,
  activeSalesCount,
  activeRentalsCount,
  closedSalesCount,
  closedRentalsCount,
  avgSalePrice,
  avgDaysOnMarketSale,
  avgDaysOnMarketLease,
}: BuildingHeroProps) {
  return (
    <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-24">
        <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
          {building.building_name}
        </h1>
        <p className="text-xl md:text-2xl opacity-90 mb-12">
          {building.canonical_address}
        </p>
                
        <div className="mb-12">
          <ShareSaveButtons buildingName={building.building_name} slug={slug} />
        </div>
                        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:bg-white/15 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1">{building.total_units || ''}</p>
            <p className="text-sm opacity-80">Total Units</p>
          </div>
          
          <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl p-6 border border-emerald-400/30 hover:bg-emerald-500/25 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1 text-emerald-300">{activeSalesCount}</p>
            <p className="text-sm opacity-80">For Sale</p>
          </div>
          
          <div className="bg-sky-500/20 backdrop-blur-sm rounded-xl p-6 border border-sky-400/30 hover:bg-sky-500/25 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1 text-sky-300">{activeRentalsCount}</p>
            <p className="text-sm opacity-80">For Rent</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:bg-white/15 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1">{closedSalesCount}</p>
            <p className="text-sm opacity-80">Sold</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:bg-white/15 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1">{closedRentalsCount}</p>
            <p className="text-sm opacity-80">Leased</p>
          </div>
          
          <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl p-6 border border-amber-400/30 hover:bg-amber-500/25 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1 text-amber-300">
              {avgSalePrice > 0 ? formatPriceShort(avgSalePrice) : ''}
            </p>
            <p className="text-sm opacity-80">Avg Price</p>
          </div>

          <div className="bg-purple-500/20 backdrop-blur-sm rounded-xl p-6 border border-purple-400/30 hover:bg-purple-500/25 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1 text-purple-300">
              {avgDaysOnMarketSale > 0 ? Math.round(avgDaysOnMarketSale) : ''}
            </p>
            <p className="text-sm opacity-80">Days (Sale)</p>
          </div>

          <div className="bg-indigo-500/20 backdrop-blur-sm rounded-xl p-6 border border-indigo-400/30 hover:bg-indigo-500/25 transition">
            <p className="text-3xl md:text-4xl font-bold mb-1 text-indigo-300">
              {avgDaysOnMarketLease > 0 ? Math.round(avgDaysOnMarketLease) : ''}
            </p>
            <p className="text-sm opacity-80">Days (Lease)</p>
          </div>
        </div>
      </div>
    </section>
  )
}
