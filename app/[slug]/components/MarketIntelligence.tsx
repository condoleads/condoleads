'use client'

import { TrendingUp, TrendingDown, Car, Package, Building2, MapPin, Map } from 'lucide-react'

interface PSFData {
  avg: number | null
  median: number | null
  sampleSize: number
  periodYear: number
  periodMonth: number
}

interface GeoLevel {
  id: string
  name: string
  psf: PSFData | null
}

interface MarketData {
  building: {
    id: string
    name: string
    psf: PSFData | null
  }
  community: GeoLevel | null
  municipality: GeoLevel | null
  area: GeoLevel | null
  parking: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  locker: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  hasData: boolean
}

interface MarketIntelligenceProps {
  data: MarketData
}

function formatCurrency(value: number | null, short = false): string {
  if (value === null) return 'N/A'
  if (short && value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toLocaleString()}`
}

function formatPsf(value: number | null): string {
  if (value === null) return 'N/A'
  return `$${Math.round(value)}`
}

function getMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[month - 1] || ''
}

function PSFCard({ 
  label, 
  icon: Icon, 
  data, 
  isBuilding = false,
  comparisonValue 
}: { 
  label: string
  icon: React.ElementType
  data: PSFData | null
  isBuilding?: boolean
  comparisonValue?: number | null
}) {
  const diff = data?.avg && comparisonValue ? ((data.avg - comparisonValue) / comparisonValue) * 100 : null
  
  return (
    <div className={`p-4 rounded-xl border ${isBuilding ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${isBuilding ? 'text-blue-600' : 'text-slate-500'}`} />
        <span className={`text-sm font-medium ${isBuilding ? 'text-blue-900' : 'text-slate-600'}`}>{label}</span>
      </div>
      
      {data?.avg ? (
        <>
          <p className={`text-2xl font-bold ${isBuilding ? 'text-blue-900' : 'text-slate-900'}`}>
            {formatPsf(data.avg)}<span className="text-sm font-normal text-slate-500">/sqft</span>
          </p>
          {diff !== null && !isBuilding && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {diff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs building</span>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">
            {data.sampleSize} sales - {getMonthName(data.periodMonth)} {data.periodYear}
          </p>
        </>
      ) : (
        <p className="text-lg text-slate-400">No data</p>
      )}
    </div>
  )
}

function ValueCard({
  label,
  icon: Icon,
  saleValue,
  leaseValue,
  level,
}: {
  label: string
  icon: React.ElementType
  saleValue: number | null
  leaseValue: number | null
  level: string
}) {
  if (!saleValue && !leaseValue) return null

  return (
    <div className="p-4 rounded-xl border bg-white border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ml-auto">{level}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Purchase</p>
          <p className="text-lg font-bold text-slate-900">
            {saleValue ? formatCurrency(saleValue, true) : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Monthly Lease</p>
          <p className="text-lg font-bold text-slate-900">
            {leaseValue ? `$${leaseValue}/mo` : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function MarketIntelligence({ data }: MarketIntelligenceProps) {
  if (!data.hasData) {
    return null
  }

  const buildingPsfValue = data.building.psf?.avg || data.community?.psf?.avg || data.municipality?.psf?.avg || null

  return (
    <section className="max-w-7xl mx-auto px-6 mb-12">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-6 md:p-8 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-600 rounded-lg">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Market Intelligence</h2>
            <p className="text-sm text-slate-600">Price per sqft comparison across locations</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <PSFCard 
            label={data.building.name} 
            icon={Building2} 
            data={data.building.psf} 
            isBuilding={true}
          />
          {data.community && (
            <PSFCard 
              label={data.community.name} 
              icon={MapPin} 
              data={data.community.psf}
              comparisonValue={buildingPsfValue}
            />
          )}
          {data.municipality && (
            <PSFCard 
              label={data.municipality.name} 
              icon={Map} 
              data={data.municipality.psf}
              comparisonValue={buildingPsfValue}
            />
          )}
          {data.area && (
            <PSFCard 
              label={data.area.name} 
              icon={Map} 
              data={data.area.psf}
              comparisonValue={buildingPsfValue}
            />
          )}
        </div>

        {(data.parking.sale || data.parking.lease || data.locker.sale || data.locker.lease) && (
          <>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Parking and Locker Values</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data.parking.sale || data.parking.lease) && (
                <ValueCard
                  label="Parking"
                  icon={Car}
                  saleValue={data.parking.sale?.value || null}
                  leaseValue={data.parking.lease?.value || null}
                  level={data.parking.sale?.level || data.parking.lease?.level || 'N/A'}
                />
              )}
              {(data.locker.sale || data.locker.lease) && (
                <ValueCard
                  label="Locker"
                  icon={Package}
                  saleValue={data.locker.sale?.value || null}
                  leaseValue={data.locker.lease?.value || null}
                  level={data.locker.sale?.level || data.locker.lease?.level || 'N/A'}
                />
              )}
            </div>
          </>
        )}

        <p className="text-xs text-slate-500 mt-4 text-center">
          Data based on recent closed transactions. PSF = Price per Square Foot.
        </p>
      </div>
    </section>
  )
}