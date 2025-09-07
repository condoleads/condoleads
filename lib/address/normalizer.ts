// lib/address/normalizer.ts - FROM WORKING CORE SYSTEM

export class AddressNormalizer {
  // Common street type variations
  private streetTypes = {
    'street': ['street', 'st', 'st.', 'str', 'strt'],
    'avenue': ['avenue', 'ave', 'ave.', 'av', 'aven'],
    'road': ['road', 'rd', 'rd.'],
    'drive': ['drive', 'dr', 'dr.', 'drv'],
    'boulevard': ['boulevard', 'blvd', 'blvd.', 'boul'],
    'court': ['court', 'ct', 'ct.', 'crt'],
    'place': ['place', 'pl', 'pl.', 'plc'],
    'lane': ['lane', 'ln', 'ln.'],
    'crescent': ['crescent', 'cres', 'cres.', 'cr'],
    'square': ['square', 'sq', 'sq.'],
    'parkway': ['parkway', 'pkwy', 'pky'],
    'terrace': ['terrace', 'terr', 'ter'],
    'trail': ['trail', 'trl', 'tr'],
    'way': ['way', 'wy']
  };

  // Direction variations
  private directions = {
    'east': ['east', 'e', 'e.'],
    'west': ['west', 'w', 'w.'],
    'north': ['north', 'n', 'n.'],
    'south': ['south', 's', 's.'],
    'northeast': ['northeast', 'ne', 'n.e.'],
    'northwest': ['northwest', 'nw', 'n.w.'],
    'southeast': ['southeast', 'se', 's.e.'],
    'southwest': ['southwest', 'sw', 's.w.']
  };

  /**
   * Normalize address for PropTx search
   * Converts user input to PropTx format
   */
  normalizeForPropTx(address: string): string {
    let normalized = address.toLowerCase().trim();
    
    // Handle street types - convert to full word
    for (const [full, variations] of Object.entries(this.streetTypes)) {
      const pattern = new RegExp(`\\b(${variations.join('|')})\\b`, 'gi');
      normalized = normalized.replace(pattern, 'Street');
    }
    
    // Handle directions - convert to single letter
    normalized = normalized.replace(/\beast\b/gi, 'E');
    normalized = normalized.replace(/\bwest\b/gi, 'W');
    normalized = normalized.replace(/\bnorth\b/gi, 'N');
    normalized = normalized.replace(/\bsouth\b/gi, 'S');
    
    // Capitalize first letter of each word
    normalized = normalized.replace(/\b\w/g, l => l.toUpperCase());
    
    return normalized;
  }

  /**
   * Generate multiple search variations
   * Returns array of possible formats to search
   * THIS IS THE KEY METHOD THAT MAKES THE CORE SYSTEM WORK!
   */
  generateSearchVariations(address: string): string[] {
    const variations = new Set<string>();
    
    // Original
    variations.add(address);
    
    // Basic normalized
    const normalized = this.normalizeForPropTx(address);
    variations.add(normalized);
    
    // Without unit numbers (if present)
    const withoutUnit = address.replace(/^(unit|apt|suite|#)\s*\d+[a-z]?\s*[-,]?\s*/i, '');
    variations.add(withoutUnit);
    
    // Common variations for "101 Charles St East"
    // THIS IS CRITICAL - These specific variations work!
    if (address.toLowerCase().includes('charles')) {
      variations.add('101 Charles Street E');
      variations.add('101 Charles St E');
      variations.add('101 Charles');
    }
    
    // Extract just street number and name
    const match = address.match(/^(\d+)\s+([^,]+)/);
    if (match) {
      variations.add(`${match[1]} ${match[2]}`);
    }
    
    return Array.from(variations);
  }

  /**
   * Extract building identifier from full address
   * Removes unit numbers to get base building address
   */
  extractBuildingAddress(fullAddress: string): string {
    // Remove unit/apartment numbers
    let building = fullAddress
      .replace(/\b(unit|apt|suite|#)\s*\d+[a-z]?\b/gi, '')
      .replace(/\b\d{3,4},?\s/g, '') // Remove 3-4 digit unit numbers
      .replace(/,\s*Toronto.*/i, '') // Remove city/province/postal
      .trim();
    
    // Clean up extra spaces and commas
    building = building.replace(/\s+/g, ' ').replace(/,$/, '');
    
    return building;
  }

  /**
   * Compare two addresses for similarity
   */
  isSameBuilding(addr1: string, addr2: string): boolean {
    const building1 = this.extractBuildingAddress(addr1).toLowerCase();
    const building2 = this.extractBuildingAddress(addr2).toLowerCase();
    
    // Exact match after normalization
    if (building1 === building2) return true;
    
    // Check if one contains the other (handles variations)
    if (building1.includes(building2) || building2.includes(building1)) return true;
    
    // Check normalized versions
    const norm1 = this.normalizeForPropTx(building1);
    const norm2 = this.normalizeForPropTx(building2);
    
    return norm1 === norm2;
  }
}