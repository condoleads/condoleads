// components/property/InvestmentAnalysis.tsx
// Investment analysis and price context for property pages

'use client'

import { TrendingUp, TrendingDown, DollarSign, Calendar, Percent, Home, Building2, MapPin, Info } from 'lucide-react'
import type { InvestmentData } from '@/lib/market/get-listing-investment-data'

interface InvestmentAnalysisProps {
  data: InvestmentData
  listPrice: number
  buildingName: string
  isSale: boolean
}

export default function InvestmentAnalysis({ 
  data, 
  listPrice, 
  buildingName,
  isSale 
}: InvestmentAnalysisProps) {
  
  // Only show for sale listings (ROI makes sense for purchases)
  if (!isSale) return null
  
  // Need minimum data to show anything useful
  if (!data.listingPsf && !data.estimatedMonthlyRent) return null
  
  const formatCurrency = (val: number) => `$${val.toLocaleString()}`
  const formatPsf = (val: number) => `$${Math.round(val).toLocaleString()}`
  
  // Determine if this is a good deal
  const isGoodDeal = data.psfVsBuildingPct !== null && data.psfVsBuildingPct < -5
  const isFairDeal = data.psfVsBuildingPct !== null && data.psfVsBuildingPct >= -5 && data.psfVsBuildingPct <= 5
  const isPremium = data.psfVsBuildingPct !== null && data.psfVsBuildingPct > 5
  
  // Yield assessment
  const isStrongYield = data.grossYield !== null && data.grossYield >= 5
  const isModerateYield = data.grossYield !== null && data.grossYield >= 4 && data.grossYield < 5
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Investment Analysis</h2>
      </div>
      
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Estimated Rent */}
        {data.estimatedMonthlyRent && (
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <DollarSign className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-blue-700">
              {formatCurrency(data.estimatedMonthlyRent)}
            </div>
            <div className="text-xs text-blue-600">Est. Monthly Rent</div>
            <div className="text-xs text-gray-500 mt-1">
              Based on {formatPsf(data.buildingLeasePsf || 0)}/sqft
            </div>
          </div>
        )}
        
        {/* Gross Yield */}
        {data.grossYield && (
          <div className={`rounded-lg p-4 text-center ${
            isStrongYield ? 'bg-green-50' : isModerateYield ? 'bg-yellow-50' : 'bg-gray-50'
          }`}>
            <Percent className={`w-5 h-5 mx-auto mb-1 ${
              isStrongYield ? 'text-green-600' : isModerateYield ? 'text-yellow-600' : 'text-gray-600'
            }`} />
            <div className={`text-2xl font-bold ${
              isStrongYield ? 'text-green-700' : isModerateYield ? 'text-yellow-700' : 'text-gray-700'
            }`}>
              {data.grossYield}%
            </div>
            <div className={`text-xs ${
              isStrongYield ? 'text-green-600' : isModerateYield ? 'text-yellow-600' : 'text-gray-600'
            }`}>
              Gross Yield
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Before expenses
            </div>
          </div>
        )}
        
        {/* Net Yield */}
        {data.netYield !== null && (
          <div className={`rounded-lg p-4 text-center ${
            data.netYield >= 3 ? 'bg-green-50' : data.netYield >= 2 ? 'bg-yellow-50' : 'bg-red-50'
          }`}>
            <Percent className={`w-5 h-5 mx-auto mb-1 ${
              data.netYield >= 3 ? 'text-green-600' : data.netYield >= 2 ? 'text-yellow-600' : 'text-red-600'
            }`} />
            <div className={`text-2xl font-bold ${
              data.netYield >= 3 ? 'text-green-700' : data.netYield >= 2 ? 'text-yellow-700' : 'text-red-700'
            }`}>
              {data.netYield}%
            </div>
            <div className={`text-xs ${
              data.netYield >= 3 ? 'text-green-600' : data.netYield >= 2 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              Net Yield
            </div>
            <div className="text-xs text-gray-500 mt-1">
              After expenses
            </div>
          </div>
        )}
        
        {/* Years to Recover */}
        {data.yearsToRecover && (
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <Calendar className="w-5 h-5 text-purple-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-purple-700">
              {data.yearsToRecover}
            </div>
            <div className="text-xs text-purple-600">Years to Recover</div>
            <div className="text-xs text-gray-500 mt-1">
              Via rental income
            </div>
          </div>
        )}
      </div>
      
      {/* Yield Explanation Note */}
      <div className="bg-gray-50 rounded-lg p-3 mb-6 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-gray-600">
          <span className="font-semibold">Gross Yield:</span> Annual rent ÷ purchase price (before expenses).{' '}
          <span className="font-semibold">Net Yield:</span> After deducting 
          {data.monthlyMaintenance && ` maintenance ($${Math.round(data.monthlyMaintenance)}/mo)`}
          {data.monthlyMaintenance && data.annualTax && ' and'}
          {data.annualTax && ` property tax ($${Math.round(data.annualTax).toLocaleString()}/yr)`}
          {!data.monthlyMaintenance && !data.annualTax && ' expenses'}
          . Does not include insurance, vacancy, or repairs.
        </div>
      </div>
      
      {/* Price Comparison Section */}
      <div className="border-t border-gray-100 pt-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Home className="w-4 h-4" />
          Price Per Square Foot Comparison
        </h3>
        
        <div className="space-y-3">
          {/* This Unit */}
          {data.listingPsf && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-900">This Unit</span>
              </div>
              <span className="font-bold text-gray-900">{formatPsf(data.listingPsf)}/sqft</span>
            </div>
          )}
          
          {/* Building Average */}
          {data.buildingSalePsf && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{buildingName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">{formatPsf(data.buildingSalePsf)}/sqft</span>
                {data.psfVsBuildingPct !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    data.psfVsBuildingPct < 0 
                      ? 'bg-green-100 text-green-700' 
                      : data.psfVsBuildingPct > 0 
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {data.psfVsBuildingPct > 0 ? '+' : ''}{data.psfVsBuildingPct}%
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Community Average */}
          {data.communitySalePsf && data.communityName && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{data.communityName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">{formatPsf(data.communitySalePsf)}/sqft</span>
                {data.psfVsCommunityPct !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    data.psfVsCommunityPct < 0 
                      ? 'bg-green-100 text-green-700' 
                      : data.psfVsCommunityPct > 0 
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {data.psfVsCommunityPct > 0 ? '+' : ''}{data.psfVsCommunityPct}%
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Municipality Average */}
          {data.municipalitySalePsf && data.municipalityName && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{data.municipalityName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">{formatPsf(data.municipalitySalePsf)}/sqft</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Visual Bar */}
        {data.listingPsf && data.buildingSalePsf && data.buildingSaleMin && data.buildingSaleMax && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-500 mb-2">Building PSF Range</div>
            <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
              <div className="absolute h-full bg-gray-300 rounded-full" 
                style={{ left: '0%', width: '100%' }} 
              />
              <div 
                className="absolute w-1 h-full bg-gray-600"
                style={{ 
                  left: `${Math.min(100, Math.max(0, ((data.buildingSalePsf - data.buildingSaleMin) / (data.buildingSaleMax - data.buildingSaleMin)) * 100))}%`
                }}
              />
              <div 
                className="absolute w-3 h-3 bg-blue-500 rounded-full top-0.5 -ml-1.5 border-2 border-white shadow"
                style={{ 
                  left: `${Math.min(100, Math.max(0, ((data.listingPsf - data.buildingSaleMin) / (data.buildingSaleMax - data.buildingSaleMin)) * 100))}%`
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{formatPsf(data.buildingSaleMin)}</span>
              <span>{formatPsf(data.buildingSaleMax)}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Analysis Summary */}
      <div className={`rounded-lg p-4 ${
        isGoodDeal ? 'bg-green-50 border border-green-200' :
        isPremium ? 'bg-yellow-50 border border-yellow-200' :
        'bg-blue-50 border border-blue-200'
      }`}>
        <div className="flex items-start gap-3">
          {isGoodDeal ? (
            <TrendingDown className="w-5 h-5 text-green-600 mt-0.5" />
          ) : isPremium ? (
            <TrendingUp className="w-5 h-5 text-yellow-600 mt-0.5" />
          ) : (
            <Home className="w-5 h-5 text-blue-600 mt-0.5" />
          )}
          <div>
            <h4 className={`font-semibold ${
              isGoodDeal ? 'text-green-800' :
              isPremium ? 'text-yellow-800' :
              'text-blue-800'
            }`}>
              {isGoodDeal ? 'Below Market Value' :
               isPremium ? 'Premium Pricing' :
               'Fair Market Price'}
            </h4>
            <p className={`text-sm mt-1 ${
              isGoodDeal ? 'text-green-700' :
              isPremium ? 'text-yellow-700' :
              'text-blue-700'
            }`}>
              {isGoodDeal && data.psfVsBuildingPct && (
                <>This unit is priced {Math.abs(data.psfVsBuildingPct)}% below the building average of {formatPsf(data.buildingSalePsf || 0)}/sqft. {data.netYield && data.netYield >= 2.5 ? `With a ${data.netYield}% net yield after expenses, this could be a strong investment opportunity.` : ''}</>
              )}
              {isPremium && data.psfVsBuildingPct && (
                <>This unit is priced {data.psfVsBuildingPct}% above the building average. This may reflect premium features, views, or floor level.</>
              )}
              {isFairDeal && (
                <>This unit is priced in line with the building average of {formatPsf(data.buildingSalePsf || 0)}/sqft. {data.netYield ? `Expected net yield of ${data.netYield}% after maintenance and taxes.` : ''}</>
              )}
            </p>
          </div>
        </div>
      </div>
      
      {/* Data Source Note */}
      <p className="text-xs text-gray-400 mt-4 text-center">
        Analysis based on {data.buildingSaleCount} sales and {data.buildingLeaseCount} leases in this building.
        {data.estimatedSqft && ` Unit size estimated at ${data.estimatedSqft} sqft.`}
      </p>
    </div>
  )
}