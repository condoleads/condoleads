// lib/utils/dom.ts

/**
 * Calculate Days on Market for active listings
 * For closed listings, use the provided days_on_market from MLS
 * For active listings, calculate from listing_contract_date to today
 */
export function calculateDaysOnMarket(
  daysOnMarket: number | null | undefined,
  listingContractDate: string | null | undefined,
  standardStatus: string | null | undefined
): number | null {
  // If we have DOM from MLS (closed listings), use it
  if (daysOnMarket !== null && daysOnMarket !== undefined) {
    return daysOnMarket
  }

  // For active listings, calculate from listing_contract_date
  if (standardStatus === 'Active' && listingContractDate) {
    const listDate = new Date(listingContractDate)
    const today = new Date()
    const diffTime = today.getTime() - listDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays >= 0 ? diffDays : 0
  }

  return null
}

/**
 * Get status display info (label and color classes)
 */
export function getStatusDisplay(
  standardStatus: string | null | undefined,
  mlsStatus: string | null | undefined,
  transactionType: string | null | undefined
): { label: string; bgColor: string; textColor: string } {
  const isSale = transactionType === 'For Sale'

  // Determine label based on mls_status first, then standard_status
  const status = mlsStatus || standardStatus || 'Unknown'

  switch (status) {
    case 'Sold':
      return { label: 'Sold', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' }
    case 'Leased':
      return { label: 'Leased', bgColor: 'bg-sky-100', textColor: 'text-sky-700' }
    case 'Expired':
      return { label: 'Expired', bgColor: 'bg-amber-100', textColor: 'text-amber-700' }
    case 'Price Change':
      return { label: 'Price Change', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' }
    case 'New':
      return isSale 
        ? { label: 'New', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' }
        : { label: 'New', bgColor: 'bg-sky-100', textColor: 'text-sky-700' }
    case 'Sold Conditional':
      return { label: 'Sold Conditional', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600' }
    case 'Suspended':
      return { label: 'Suspended', bgColor: 'bg-red-100', textColor: 'text-red-700' }
    case 'Deal Fell Through':
      return { label: 'Deal Fell Through', bgColor: 'bg-red-100', textColor: 'text-red-700' }
    case 'Extension':
      return { label: 'Extension', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' }
    case 'Active':
      return isSale
        ? { label: 'Active', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' }
        : { label: 'Active', bgColor: 'bg-sky-100', textColor: 'text-sky-700' }
    case 'Closed':
      return isSale
        ? { label: 'Sold', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' }
        : { label: 'Leased', bgColor: 'bg-sky-100', textColor: 'text-sky-700' }
    default:
      return { label: status, bgColor: 'bg-slate-100', textColor: 'text-slate-700' }
  }
}