// app/[slug]/components/MarketIntelligence.tsx
'use client'

import { TrendingUp, Car, Package, Building2, MapPin, Map } from 'lucide-react'
import PSFTrendChart from './PSFTrendChart'
import PSFComparisonTable from './PSFComparisonTable'
import PSFAnalysis from './PSFAnalysis'
import InvestmentAnalysis from './InvestmentAnalysis'

interface PSFData {
  avg: number | null
  median: number | null
  sampleSize: number
  periodYear: number
  periodMonth: number
}

interface GeoLevelData {
  id: string
  name: string
  salePsf: PSFData | null
  leasePsf: PSFData | null
}

interface BuildingSummary {
  saleAvgPsf: number | null
  saleMedianPsf: number | null
  saleCount: number
  leaseAvgPsf: number | null
  leaseMedianPsf: number | null
  leaseCount: number
  earliestTransaction: string | null
  latestTransaction: string | null
}

interface Transaction {
  id: string
  transaction_type: 'sale' | 'lease'
  close_date: string
  close_price: number
  sqft: number
  sqft_method: string
  psf: number
  has_parking: boolean
  parking_spaces: number
  living_area_range: string | null
}

interface MarketData {
  building: {
    id: string
    name: string
    salePsf: PSFData | null
    leasePsf: PSFData | null
    summary: BuildingSummary | null
    transactions: Transaction[]
  }
  community: GeoLevelData | null
  municipality: GeoLevelData | null
  area: GeoLevelData | null
  parking: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  locker: {
    sale: { value: number | null; level: string; source: string } | null
    lease: { value: number | null; level: string; source: string } | null
  }
  investment: {
    buildingGrossYield: number | null
    buildingNetYield: number | null
    buildingAvgMaintenance: number | null
    buildingAvgTax: number | null
    buildingAvgSqft: number | null
    communityGrossYield: number | null
    municipalityGrossYield: number | null
    yieldVsCommunity: number | null
    yieldVsMunicipality: number | null
  } | null
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

function PSFCard({
  label,
  icon: Icon,
  salePsf,
  leasePsf,
  isBuilding = false,
  saleCount,
  leaseCount
}: {
  label: string
  icon: React.ElementType
  salePsf: number | null
  leasePsf: number | null
  isBuilding?: boolean
  saleCount?: number
  leaseCount?: number
}) {
  return (
    <div className={`p-4 rounded-xl border ${isBuilding ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${isBuilding ? 'text-blue-600' : 'text-slate-500'}`} />
        <span className={`text-sm font-medium truncate ${isBuilding ? 'text-blue-900' : 'text-slate-600'}`}>{label}</span>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs text-slate-500">Sale PSF</p>
          <p className={`text-xl font-bold ${isBuilding ? 'text-blue-900' : 'text-slate-900'}`}>
            {salePsf ? formatPsf(salePsf) : 'N/A'}
            {salePsf && <span className="text-xs font-normal text-slate-500">/sqft</span>}
          </p>
          {saleCount !== undefined && saleCount > 0 && (
            <p className="text-xs text-slate-400">{saleCount} sales</p>
          )}
        </div>
        
        <div>
          <p className="text-xs text-slate-500">Lease PSF</p>
          <p className={`text-lg font-semibold ${isBuilding ? 'text-blue-800' : 'text-slate-800'}`}>
            {leasePsf ? `$${leasePsf.toFixed(2)}` : 'N/A'}
            {leasePsf && <span className="text-xs font-normal text-slate-500">/sqft/mo</span>}
          </p>
          {leaseCount !== undefined && leaseCount > 0 && (
            <p className="text-xs text-slate-400">{leaseCount} leases</p>
          )}
        </div>
      </div>
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

  return (
    <section className="max-w-7xl mx-auto px-6 mb-12">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-6 md:p-8 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-600 rounded-lg">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Market Intelligence</h2>
            <p className="text-sm text-slate-600">Price per sqft analysis and trends</p>
          </div>
        </div>

        {/* PSF Cards - Quick Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <PSFCard
            label={data.building.name}
            icon={Building2}
            salePsf={data.building.summary?.saleAvgPsf || null}
            leasePsf={data.building.summary?.leaseAvgPsf || null}
            isBuilding={true}
            saleCount={data.building.summary?.saleCount}
            leaseCount={data.building.summary?.leaseCount}
          />
          {data.community && (
            <PSFCard
              label={data.community.name}
              icon={MapPin}
              salePsf={data.community.salePsf?.avg || null}
              leasePsf={data.community.leasePsf?.avg || null}
              saleCount={data.community.salePsf?.sampleSize}
              leaseCount={data.community.leasePsf?.sampleSize}
            />
          )}
          {data.municipality && (
            <PSFCard
              label={data.municipality.name}
              icon={Map}
              salePsf={data.municipality.salePsf?.avg || null}
              leasePsf={data.municipality.leasePsf?.avg || null}
              saleCount={data.municipality.salePsf?.sampleSize}
              leaseCount={data.municipality.leasePsf?.sampleSize}
            />
          )}
          {data.area && (
            <PSFCard
              label={data.area.name}
              icon={Map}
              salePsf={data.area.salePsf?.avg || null}
              leasePsf={data.area.leasePsf?.avg || null}
              saleCount={data.area.salePsf?.sampleSize}
              leaseCount={data.area.leasePsf?.sampleSize}
            />
          )}
        </div>

        {/* PSF Trend Chart */}
        {data.building.transactions.length > 0 && (
          <PSFTrendChart
            transactions={data.building.transactions}
            buildingName={data.building.name}
            saleCount={data.building.summary?.saleCount || 0}
            leaseCount={data.building.summary?.leaseCount || 0}
          />
        )}

        {/* Comparison Table */}
        <PSFComparisonTable
          buildingName={data.building.name}
          buildingSummary={data.building.summary}
          community={data.community}
          municipality={data.municipality}
          area={data.area}
        />

        {/* Written Analysis */}
        <PSFAnalysis
          buildingName={data.building.name}
          buildingSummary={data.building.summary}
          community={data.community}
          municipality={data.municipality}
          area={data.area}
        />

        {/* Investment Analysis */}
        {data.investment && (
          <InvestmentAnalysis
            investment={data.investment}
            buildingName={data.building.name}
            communityName={data.community?.name || null}
            municipalityName={data.municipality?.name || null}
            leaseAvgPsf={data.building.summary?.leaseAvgPsf || null}
            saleAvgPsf={data.building.summary?.saleAvgPsf || null}
            transactions={data.building.transactions}
          />
        )}

        {/* Parking and Locker Values */}
        {(data.parking.sale || data.parking.lease || data.locker.sale || data.locker.lease) && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Parking & Locker Values</h3>
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
          </div>
        )}

        <p className="text-xs text-slate-500 mt-6 text-center">
          Data based on closed transactions. PSF = Price per Square Foot. Yields calculated as annual rent / sale price.
        </p>
      </div>
    </section>
  )
}