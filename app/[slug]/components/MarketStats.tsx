import { BuildingStats } from '@/lib/types/building'
import { formatPriceShort, formatPercentage } from '@/lib/utils/formatters'

interface MarketStatsProps {
  stats: BuildingStats
  yearBuilt: number | null
}

export default function MarketStats({ stats, yearBuilt }: MarketStatsProps) {
  return (
    <section className="max-w-7xl mx-auto px-6 -mt-8 mb-16 relative z-10">
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <h2 className="text-2xl font-bold mb-6 text-slate-900">Market Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div>
            <p className="text-sm text-slate-600 mb-1">Inventory Rate</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900">
              {stats.inventoryRate > 0 ? formatPercentage(stats.inventoryRate) : ''}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-slate-600 mb-1">Highest Sale</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900">
              {stats.highestSale > 0 ? formatPriceShort(stats.highestSale) : ''}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-slate-600 mb-1">Lowest Sale</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900">
              {stats.lowestSale > 0 ? formatPriceShort(stats.lowestSale) : ''}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-slate-600 mb-1">Avg Maintenance</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900">
              {stats.avgMaintenanceFee > 0 ? `$${Math.round(stats.avgMaintenanceFee)}` : ''}
              {stats.avgMaintenanceFee > 0 && <span className="text-sm font-normal text-slate-500">/mo</span>}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-slate-600 mb-1">Year Built</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900">
              {yearBuilt || ''}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
