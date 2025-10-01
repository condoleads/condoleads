import { MLSListing } from '../types/building'

export function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0
  const sum = numbers.reduce((acc, num) => acc + num, 0)
  return sum / numbers.length
}

export function calculateInventoryRate(forSale: number, totalUnits: number | null): number {
  if (!totalUnits || totalUnits === 0) return 0
  return (forSale / totalUnits) * 100
}

export function getAmenityIcon(amenity: string): string {
  const iconMap: { [key: string]: string } = {
    'Concierge': '',
    'Exercise Room': '',
    'Gym': '',
    'Fitness Center': '',
    'Outdoor Pool': '',
    'Indoor Pool': '',
    'Pool': '',
    'Party Room': '',
    'Party Room/Meeting Room': '',
    'Meeting Room': '',
    'Rooftop Deck': '',
    'Rooftop Garden': '',
    'Rooftop Deck/Garden': '',
    'Visitor Parking': '',
    'Parking': '',
    'Guest Suite': '',
    'Guest Suites': '',
    'Security': '',
    'Sauna': '',
    'Storage': '',
    'Storage Locker': '',
    'Bike Room': '',
    'Pet Wash': '',
    'Lounge': '',
    'Theater': '',
    'BBQ': '',
  }
  
  // Check for exact match first
  if (iconMap[amenity]) return iconMap[amenity]
  
  // Check for partial matches
  const amenityLower = amenity.toLowerCase()
  for (const [key, icon] of Object.entries(iconMap)) {
    if (amenityLower.includes(key.toLowerCase())) {
      return icon
    }
  }
  
  return ''
}

export function extractAmenities(listings: MLSListing[]): string[] {
  const amenitiesSet = new Set<string>()
  
  for (const listing of listings) {
    if (listing.association_amenities && Array.isArray(listing.association_amenities)) {
      listing.association_amenities.forEach(amenity => amenitiesSet.add(amenity))
    }
  }
  
  return Array.from(amenitiesSet).sort()
}

export function extractFeeIncludes(listings: MLSListing[]): string[] {
  const feeIncludesSet = new Set<string>()
  
  for (const listing of listings) {
    if (listing.association_fee_includes && Array.isArray(listing.association_fee_includes)) {
      listing.association_fee_includes.forEach(item => {
        // Clean up the text
        const cleaned = item.replace('CAC', 'A/C').replace(' Included', '')
        feeIncludesSet.add(cleaned)
      })
    }
  }
  
  return Array.from(feeIncludesSet).sort()
}


export function parseUnitSizeRange(listings: MLSListing[]): string {
  const ranges = listings
    .filter(l => l.living_area_range && l.living_area_range.trim() !== '')
    .map(l => l.living_area_range!)
  
  if (ranges.length === 0) return '—'
  
  // Filter out ranges like "5000 +" and extract valid range pairs
  const validRanges = ranges.filter(r => !r.includes('+') && r.includes('-'))
  
  if (validRanges.length === 0) return ''
  
  const allNumbers: number[] = []
  validRanges.forEach(range => {
    const parts = range.split('-').map(p => parseInt(p.trim()))
    allNumbers.push(...parts.filter(n => !isNaN(n)))
  })
  
  if (allNumbers.length === 0) return ''
  
  const min = Math.min(...allNumbers)
  const max = Math.max(...allNumbers)
  
  return `${min.toLocaleString()} - ${max.toLocaleString()} SQFT`
}


