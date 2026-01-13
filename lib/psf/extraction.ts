// lib/psf/extraction.ts

/**
 * Square Footage Extraction Logic
 * Priority: exact (from square_foot_source)  midpoint (from living_area_range)  fallback (700)
 */

const RANGE_MIDPOINTS: Record<string, number> = {
  '0-499': 400,
  '500-599': 550,
  '600-699': 650,
  '700-799': 750,
  '800-899': 850,
  '900-999': 950,
  '1000-1199': 1100,
  '1200-1399': 1300,
  '1400-1599': 1500,
  '1600-1799': 1700,
  '1800-1999': 1900,
  '2000-2249': 2125,
  '2250-2499': 2375,
  '2500-2999': 2750,
  '3000+': 3250,
  '3000-3249': 3125,
  '3250-3499': 3375,
  '3500-3999': 3750,
  '4000+': 4250,
};

export type SqftMethod = 'exact' | 'midpoint' | 'fallback';

export interface SqftResult {
  sqft: number;
  method: SqftMethod;
}

/**
 * Extract numeric sqft from square_foot_source field
 */
function extractExactSqft(source: string | null): number | null {
  if (!source) return null;

  const cleaned = source.trim();

  // Reject patterns
  if (cleaned.startsWith('+')) return null;
  if (/3rd party/i.test(cleaned)) return null;
  if (/outdoor space/i.test(cleaned)) return null;
  if (/^\d+-\d+$/.test(cleaned)) return null; // Pure range like "500-599"
  if (/^\d+\+$/.test(cleaned)) return null; // Range like "3000+"

  // Split on + to ignore balcony additions
  const beforePlus = cleaned.split('+')[0].trim();

  // Try: number with comma (e.g., "1,410")
  const commaMatch = beforePlus.match(/(\d{1,2}),(\d{3})/);
  if (commaMatch) {
    const value = parseInt(commaMatch[1] + commaMatch[2], 10);
    if (value >= 100 && value <= 5000) return value;
  }

  // Try: 3-4 digit number
  const digitMatch = beforePlus.match(/(?<!\d)(\d{3,4})(?!\d)/);
  if (digitMatch) {
    const value = parseInt(digitMatch[1], 10);
    if (value >= 100 && value <= 5000) return value;
  }

  return null;
}

/**
 * Get sqft with method indicator
 */
export function getSqft(
  squareFootSource: string | null,
  livingAreaRange: string | null
): SqftResult {
  // Priority 1: Exact extraction
  const exact = extractExactSqft(squareFootSource);
  if (exact) {
    return { sqft: exact, method: 'exact' };
  }

  // Priority 2: Range midpoint
  if (livingAreaRange && RANGE_MIDPOINTS[livingAreaRange]) {
    return { sqft: RANGE_MIDPOINTS[livingAreaRange], method: 'midpoint' };
  }

  // Priority 3: Fallback
  return { sqft: 700, method: 'fallback' };
}

/**
 * Calculate price per square foot
 */
export function calculatePSF(closePrice: number, sqft: number): number | null {
  if (!closePrice || closePrice <= 0) return null;
  if (!sqft || sqft <= 0) return null;
  
  return Math.round((closePrice / sqft) * 100) / 100;
}
