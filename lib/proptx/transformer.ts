// lib/proptx/transformer.ts - Create this file
export class MLSDataTransformer {
  transformListing(propTxListing: any) {
    return {
      mls_number: propTxListing.ListingId,
      building_address: this.standardizeAddress(propTxListing.UnparsedAddress),
      price: Math.round(propTxListing.ListPrice),
      beds: propTxListing.BedroomsTotal,
      baths: propTxListing.BathroomsTotalDecimal,
      sqft: propTxListing.LivingArea,
      unit_number: this.extractUnitNumber(propTxListing.UnparsedAddress),
      status: this.mapStatus(propTxListing.StandardStatus),
      photos: this.extractPhotos(propTxListing.Media || []),
      description: propTxListing.PublicRemarks,
      listing_date: propTxListing.OnMarketDate
    };
  }
  
  private standardizeAddress(address: string): string {
    if (!address) return '';
    
    return address
      .toUpperCase()
      .replace(/\b(STREET|ST\.?)\b/g, 'ST')
      .replace(/\b(AVENUE|AVE\.?)\b/g, 'AVE')
      .replace(/\b(EAST|E\.?)\b/g, 'E')
      .replace(/\b(WEST|W\.?)\b/g, 'W')
      .replace(/\b(NORTH|N\.?)\b/g, 'N')
      .replace(/\b(SOUTH|S\.?)\b/g, 'S')
      .replace(/\b(BOULEVARD|BLVD\.?)\b/g, 'BLVD')
      .replace(/[,.\s]+/g, ' ')
      .trim();
  }
  
  private extractUnitNumber(address: string): string | null {
    if (!address) return null;
    
    // Match patterns like "UNIT 1205", "#1205", "APT 1205"
    const unitMatch = address.match(/(?:UNIT|#|APT\.?)\s*([0-9A-Z]+)/i);
    return unitMatch ? unitMatch[1] : null;
  }
  
  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'Active': 'A',
      'Active Under Contract': 'A',
      'Sold': 'S',
      'Expired': 'E',
      'Cancelled': 'C',
      'Withdrawn': 'W'
    };
    return statusMap[status] || 'A';
  }
  
  private extractPhotos(media: any[]): string[] {
    return media
      .filter(m => m.MediaType?.toLowerCase().includes('photo'))
      .map(m => m.MediaURL)
      .filter(url => url) // Remove null/undefined URLs
      .slice(0, 15); // Limit to 15 photos
  }
  
  extractBuildingInfo(propTxListing: any) {
    const address = this.standardizeAddress(propTxListing.UnparsedAddress);
    const buildingName = this.extractBuildingName(propTxListing.UnparsedAddress);
    
    return {
      canonical_address: address,
      building_name: buildingName,
      slug: this.generateSlug(address, buildingName),
      static_content: {
        year_built: propTxListing.YearBuilt,
        total_units: propTxListing.UnitsInBuilding,
        building_type: propTxListing.PropertySubType,
        neighborhood: propTxListing.Neighborhood
      }
    };
  }
  
  private extractBuildingName(address: string): string | null {
    if (!address) return null;
    
    // Extract building names from patterns like:
    // "The Ritz Carlton Residences - 183 Wellington St W"
    // "One Bloor East - 1 Bloor St E"
    
    const patterns = [
      /^(.+?)\s*-\s*\d+\s+/,  // "Name - 123 Street"
      /^((?:THE\s+)?[A-Z\s]+?)\s+(?:CONDOS?|TOWERS?|RESIDENCES?)/i,  // "THE BUILDING CONDOS"
      /^((?:ONE|TWO|THREE)\s+[A-Z\s]+?)(?:\s+\d|\s+-)/i  // "ONE BLOOR EAST"
    ];
    
    for (const pattern of patterns) {
      const match = address.match(pattern);
      if (match && match[1].length > 3) {
        return match[1].trim();
      }
    }
    
    return null;
  }
  
  private generateSlug(address: string, buildingName?: string | null): string {
    const base = buildingName || address;
    return base
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }
}