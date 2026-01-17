// app/[slug]/components/InvestmentAnalysis.tsx
'use client'

import { TrendingUp, TrendingDown, Minus, DollarSign, Percent, Building2, MapPin, Map, Info, X } from 'lucide-react'
import { useState } from 'react'

function InfoPopover({ text, example }: { text: string; example?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ml-1 text-slate-400 hover:text-slate-600 focus:outline-none"
        aria-label="More info"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 left-0 top-6 w-64 p-3 bg-white rounded-lg shadow-lg border border-slate-200 text-left">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="text-xs text-slate-600 pr-4">{text}</p>
            {example && (
              <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
                <span className="font-medium">Example:</span> {example}
              </p>
            )}
          </div>
        </>
      )}
    </span>
  )
}

interface InvestmentMetrics {
  buildingGrossYield: number | null
  buildingNetYield: number | null
  buildingAvgMaintenance: number | null
  buildingAvgTax: number | null
  buildingAvgSqft: number | null
  communityGrossYield: number | null
  municipalityGrossYield: number | null
  yieldVsCommunity: number | null
  yieldVsMunicipality: number | null
}

interface Transaction {
  psf: number
}

interface InvestmentAnalysisProps {
  investment: InvestmentMetrics | null
  buildingName: string
  communityName: string | null
  municipalityName: string | null
  leaseAvgPsf: number | null
  saleAvgPsf: number | null
  transactions: Transaction[]
}

function YieldCard({
  label,
  value,
  description,
  isMain = false,
  infoText,
  infoExample
}: {
  label: string
  value: number | null
  description?: string
  isMain?: boolean
  infoText?: string
  infoExample?: string
}) {
  const getYieldLevel = (yld: number): { text: string; color: string } => {
    if (yld >= 6) return { text: 'Strong', color: 'text-green-600' }
    if (yld >= 4.5) return { text: 'Good', color: 'text-blue-600' }
    if (yld >= 3) return { text: 'Moderate', color: 'text-amber-600' }
    return { text: 'Low', color: 'text-slate-500' }
  }

  const level = value ? getYieldLevel(value) : null

  return (
    <div className={`p-4 rounded-xl border ${isMain ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
      <p className={`text-sm font-medium mb-1 ${isMain ? 'text-emerald-700' : 'text-slate-600'}`}>
        {label}
        {infoText && <InfoPopover text={infoText} example={infoExample} />}
      </p>
      <p className={`text-2xl font-bold ${isMain ? 'text-emerald-900' : 'text-slate-900'}`}>
        {value !== null ? `${value.toFixed(2)}%` : 'N/A'}
      </p>
      {level && (
        <p className={`text-xs font-medium mt-1 ${level.color}`}>{level.text} Yield</p>
      )}
      {description && (
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      )}
    </div>
  )
}

function ComparisonCard({
  label,
  icon: Icon,
  difference,
  baseYield
}: {
  label: string
  icon: React.ElementType
  difference: number | null
  baseYield: number | null
}) {
  if (difference === null || baseYield === null) return null

  const isPositive = difference > 0
  const isNeutral = Math.abs(difference) < 0.1

  return (
    <div className="p-4 rounded-xl border bg-white border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-600">
          vs {label}
          <InfoPopover 
            text={isPositive 
              ? `This building earns ${Math.abs(difference).toFixed(2)}% MORE than other buildings in ${label}. Better for investors!`
              : isNeutral 
                ? `This building performs about the same as other buildings in ${label}.`
                : `This building earns ${Math.abs(difference).toFixed(2)}% LESS than other buildings in ${label}. May be pricier but could appreciate more.`
            }
          />
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isNeutral ? (
          <Minus className="w-5 h-5 text-slate-400" />
        ) : isPositive ? (
          <TrendingUp className="w-5 h-5 text-green-500" />
        ) : (
          <TrendingDown className="w-5 h-5 text-red-500" />
        )}
        <span className={`text-xl font-bold ${isNeutral ? 'text-slate-600' : isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{difference.toFixed(2)}%
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {label} avg: {baseYield.toFixed(2)}%
      </p>
    </div>
  )
}

export default function InvestmentAnalysis({
  investment,
  buildingName,
  communityName,
  municipalityName,
  leaseAvgPsf,
  saleAvgPsf,
  transactions
}: InvestmentAnalysisProps) {
  if (!investment || investment.buildingGrossYield === null) {
    return null
  }

  const { 
    buildingGrossYield, 
    buildingNetYield, 
    buildingAvgMaintenance, 
    buildingAvgTax,
    buildingAvgSqft,
    communityGrossYield,
    municipalityGrossYield,
    yieldVsCommunity,
    yieldVsMunicipality
  } = investment

  // Calculate Est. Monthly Rent
  const estMonthlyRent = leaseAvgPsf && buildingAvgSqft 
    ? Math.round(leaseAvgPsf * buildingAvgSqft)
    : null

  // Calculate Years to Recover
  const yearsToRecover = buildingGrossYield && buildingGrossYield > 0
    ? parseFloat((100 / buildingGrossYield).toFixed(1))
    : null

  // Get PSF range from transactions
  const psfValues = transactions.map(t => t.psf).filter(p => p > 0)
  const minPsf = psfValues.length > 0 ? Math.min(...psfValues) : null
  const maxPsf = psfValues.length > 0 ? Math.max(...psfValues) : null

  // Generate insight text
  const getInsightText = (): string => {
    const insights: string[] = []

    if (buildingGrossYield !== null) {
      if (buildingGrossYield >= 5) {
        insights.push(`${buildingName} offers strong rental yield at ${buildingGrossYield.toFixed(2)}%, making it attractive for cash flow investors.`)
      } else if (buildingGrossYield >= 4) {
        insights.push(`${buildingName} provides moderate yield at ${buildingGrossYield.toFixed(2)}%, balancing cash flow with appreciation potential.`)
      } else {
        insights.push(`${buildingName} has a yield of ${buildingGrossYield.toFixed(2)}%, suggesting buyers may prioritize appreciation over rental income.`)
      }
    }

    if (yieldVsCommunity !== null && communityName) {
      if (yieldVsCommunity > 0.5) {
        insights.push(`This building outperforms ${communityName} average by ${yieldVsCommunity.toFixed(2)}%.`)
      } else if (yieldVsCommunity < -0.5) {
        insights.push(`Yield is ${Math.abs(yieldVsCommunity).toFixed(2)}% below ${communityName} average, likely due to premium pricing.`)
      }
    }

    if (buildingNetYield !== null && buildingGrossYield !== null) {
      const expenseImpact = buildingGrossYield - buildingNetYield
      if (expenseImpact > 1.5) {
        insights.push(`Operating costs reduce yield by ${expenseImpact.toFixed(2)}% - consider maintenance fees when evaluating.`)
      }
    }

    return insights.join(' ')
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Percent className="w-5 h-5 text-emerald-600" />
        Investment Analysis
      </h3>

      {/* Main Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {estMonthlyRent && (
          <div className="p-4 rounded-xl border bg-blue-50 border-blue-200">
            <p className="text-sm font-medium mb-1 text-blue-700">
              Est. Monthly Rent
              <InfoPopover 
                text="If you buy a typical unit here and rent it out, this is what tenants would likely pay each month."
                example={`A ${buildingAvgSqft?.toFixed(0)} sqft unit × $${leaseAvgPsf?.toFixed(2)}/sqft = $${estMonthlyRent.toLocaleString()}/mo`}
              />
            </p>
            <p className="text-2xl font-bold text-blue-900">${estMonthlyRent.toLocaleString()}</p>
            <p className="text-xs text-blue-600 mt-1">Based on ${leaseAvgPsf?.toFixed(2)}/sqft</p>
          </div>
        )}
        <YieldCard
          label="Gross Yield"
          value={buildingGrossYield}
          description="Before expenses"
          isMain
          infoText="Your return before paying any bills. This shows how much rent you collect compared to the purchase price."
          infoExample={saleAvgPsf && buildingAvgSqft ? `$${Math.round(saleAvgPsf * buildingAvgSqft).toLocaleString()} unit → ~$${Math.round((buildingGrossYield || 0) / 100 * saleAvgPsf * buildingAvgSqft).toLocaleString()}/yr rent` : undefined}
        />
        <YieldCard
          label="Net Yield"
          value={buildingNetYield}
          description="After expenses"
          infoText="Your actual profit after paying condo maintenance fees and property taxes. This is what you really keep."
          infoExample={buildingAvgMaintenance && buildingAvgTax ? `Gross rent minus $${Math.round(buildingAvgMaintenance)}/mo maintenance and $${Math.round(buildingAvgTax/12)}/mo taxes` : undefined}
        />
        {yearsToRecover && (
          <div className="p-4 rounded-xl border bg-purple-50 border-purple-200">
            <p className="text-sm font-medium mb-1 text-purple-700">
              Years to Recover
              <InfoPopover 
                text="How many years of rent it takes to equal your purchase price. After this, rental income is pure profit (and you still own the property!)."
                example={saleAvgPsf && buildingAvgSqft ? `Buy for $${Math.round(saleAvgPsf * buildingAvgSqft).toLocaleString()} → collect rent → paid back in ~${yearsToRecover} years` : undefined}
              />
            </p>
            <p className="text-2xl font-bold text-purple-900">{yearsToRecover}</p>
            <p className="text-xs text-purple-600 mt-1">Via rental income</p>
          </div>
        )}
        {yieldVsCommunity !== null && communityGrossYield !== null && (
          <ComparisonCard
            label={communityName || 'Community'}
            icon={MapPin}
            difference={yieldVsCommunity}
            baseYield={communityGrossYield}
          />
        )}
        {yieldVsMunicipality !== null && municipalityGrossYield !== null && (
          <ComparisonCard
            label={municipalityName || 'Municipality'}
            icon={Map}
            difference={yieldVsMunicipality}
            baseYield={municipalityGrossYield}
          />
        )}
      </div>

      {/* Operating Costs Summary */}
      {(buildingAvgMaintenance || buildingAvgTax) && (
        <div className="bg-slate-50 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-slate-700 mb-2">
            Avg. Monthly Operating Costs
            <InfoPopover 
              text="These are the bills you pay as an owner, even when renting out. They come out of your rental income before you see profit."
              example={buildingAvgMaintenance && buildingAvgTax ? `$${Math.round(buildingAvgMaintenance)} + $${Math.round(buildingAvgTax/12)} = $${Math.round(buildingAvgMaintenance + buildingAvgTax/12)}/mo total` : undefined}
            />
          </p>
          <div className="flex flex-wrap gap-4">
            {buildingAvgMaintenance && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">
                  Maintenance: <span className="font-semibold">${Math.round(buildingAvgMaintenance)}/mo</span>
                </span>
              </div>
            )}
            {buildingAvgTax && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">
                  Property Tax: <span className="font-semibold">${Math.round(buildingAvgTax / 12)}/mo</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PSF Range */}
      {minPsf && maxPsf && saleAvgPsf && (
        <div className="bg-slate-50 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-slate-700 mb-3">
            Building PSF Range
            <InfoPopover 
              text="Price per square foot (PSF) shows how much buyers paid for each sqft. Multiply PSF × unit size to estimate price."
              example={buildingAvgSqft ? `A ${Math.round(buildingAvgSqft)} sqft unit at avg $${Math.round(saleAvgPsf)}/sqft = $${Math.round(saleAvgPsf * buildingAvgSqft).toLocaleString()}` : undefined}
            />
          </p>
          <div className="relative h-2 bg-slate-200 rounded-full mb-2">
            <div 
              className="absolute h-2 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
              style={{
                left: '0%',
                right: '0%'
              }}
            />
            <div 
              className="absolute w-3 h-3 bg-blue-600 rounded-full -top-0.5 border-2 border-white shadow"
              style={{
                left: `${Math.min(100, Math.max(0, ((saleAvgPsf - minPsf) / (maxPsf - minPsf)) * 100))}%`,
                transform: 'translateX(-50%)'
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>${Math.round(minPsf).toLocaleString()}</span>
            <span className="text-blue-600 font-medium">Avg: ${Math.round(saleAvgPsf).toLocaleString()}/sqft</span>
            <span>${Math.round(maxPsf).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Investment Insight */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-900">
          <span className="font-semibold">💡 Investment Insight:</span> {getInsightText()}
        </p>
      </div>
    </div>
  )
}