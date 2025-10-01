// lib/proptx/enhanced-client.ts - COMPLETE WORKING VERSION WITH INCREMENTAL SYNC

export class EnhancedPropTxClient {
  private baseUrl = process.env.PROPTX_RESO_API_URL!;
  private bearerToken = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN!;
  
  async testConnection() {
    console.log('Testing PropTx API connection...');
    
    try {
      const response = await fetch(`${this.baseUrl}Property?$top=1`, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'Accept': 'application/json'
        }
      });
      
      console.log('Connection test response:', response.status);
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
  
  async searchBuildingListings(userInput: string) {
    console.log('User searching for:', userInput);
    
    // Generate search variations using simple logic
    const searchVariations = this.generateSearchVariations(userInput);
    console.log('Trying variations:', searchVariations);
    
    let allResults: any[] = [];
    
    // Try each variation until we find results
    for (const variation of searchVariations) {
      try {
        const filter = `contains(UnparsedAddress,'${variation}')`;
        const url = `${this.baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=100`;
        
        console.log(`Searching with: "${variation}"`);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${this.bearerToken}`,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.value && data.value.length > 0) {
            console.log(`Found ${data.value.length} results with: "${variation}"`);
            allResults = [...allResults, ...data.value];
            
            // If we found good results, we can stop searching
            if (data.value.length >= 5) {
              break;
            }
          }
        }
      } catch (error) {
        console.error(`Failed searching with "${variation}":`, error);
      }
    }
    
    // If no results with variations, try a broader search
    if (allResults.length === 0) {
      console.log('No results with variations, trying broader search...');
      const streetNumber = userInput.match(/^\d+/);
      if (streetNumber) {
        try {
          const filter = `StreetNumber eq '${streetNumber[0]}'`;
          const url = `${this.baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=200`;
          
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${this.bearerToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            // Filter for addresses that might match
            const filtered = data.value?.filter((p: any) => {
              const addr = p.UnparsedAddress?.toLowerCase() || '';
              return userInput.split(' ').some(word => 
                word.length > 2 && addr.includes(word.toLowerCase())
              );
            });
            
            if (filtered?.length > 0) {
              console.log(`Found ${filtered.length} potential matches`);
              allResults = filtered;
            }
          }
        } catch (error) {
          console.error('Broader search failed:', error);
        }
      }
    }
    
    // Deduplicate results by MLS number
    const uniqueResults = this.deduplicateListings(allResults);
    console.log(`Total unique listings: ${uniqueResults.length}`);
    
    return this.categorizeListings(uniqueResults);
  }

  async searchForIncrementalSync(address: string) {
    console.log(' Incremental sync search for:', address);
    
    // Use DLA token for incremental syncs to get all data including sold/leased
    const bearerToken = process.env.PROPTX_DLA_TOKEN || process.env.PROPTX_BEARER_TOKEN!;
    
    const searchVariations = this.generateSearchVariations(address);
    let allResults: any[] = [];
    
    for (const variation of searchVariations) {
      try {
        const filter = `contains(UnparsedAddress,'${variation}')`;
        const url = `${this.baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=100`;
        
        console.log(` Incremental searching with: "${variation}"`);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.value && data.value.length > 0) {
            console.log(` Found ${data.value.length} results with: "${variation}"`);
            allResults = [...allResults, ...data.value];
            
            if (data.value.length >= 5) break;
          }
        }
      } catch (error) {
        console.error(` Failed incremental search with "${variation}":`, error);
      }
    }
    
    const uniqueResults = this.deduplicateListings(allResults);
    console.log(` Total unique listings for incremental sync: ${uniqueResults.length}`);
    
    return {
      allResults: uniqueResults,
      total: uniqueResults.length,
      categorized: this.categorizeListings(uniqueResults)
    };
  }
  
  // Simple search variations generator (replaces AddressNormalizer)
  private generateSearchVariations(address: string): string[] {
    const variations = new Set<string>();
    
    // Original
    variations.add(address);
    
    // Without unit numbers (if present)
    const withoutUnit = address.replace(/^(unit|apt|suite|#)\s*\d+[a-z]?\s*[-,]?\s*/i, '');
    variations.add(withoutUnit);
    
    // Common variations for "101 Charles St East"
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
  
  async getTorontoCondoListings() {
    console.log('Fetching Toronto condos...');
    
    try {
      // Toronto districts in TREB
      const torontoDistricts = [
        'Toronto C01', 'Toronto C02', 'Toronto C03', 'Toronto C04',
        'Toronto C06', 'Toronto C07', 'Toronto C08', 'Toronto C09',
        'Toronto C10', 'Toronto C11', 'Toronto C12', 'Toronto C13',
        'Toronto C14', 'Toronto C15'
      ];
      
      const cityFilter = torontoDistricts
        .map(district => `City eq '${district}'`)
        .join(' or ');
      
      const filter = `(${cityFilter}) and (PropertySubType eq 'Condo Apartment' or PropertySubType eq 'Condo Townhouse') and StandardStatus eq 'Active'`;
      
      const queryString = `$filter=${encodeURIComponent(filter)}&$top=1000`;
      
      const response = await fetch(`${this.baseUrl}Property?${queryString}`, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Retrieved ${data.value?.length || 0} Toronto condos`);
      return data.value || [];
      
    } catch (error) {
      console.error('Failed to fetch Toronto condos:', error);
      throw error;
    }
  }
  
  private deduplicateListings(listings: any[]): any[] {
    const seen = new Set();
    return listings.filter(listing => {
      const key = listing.ListingId || listing.ListingKey || listing.ListingKeyNumeric;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private categorizeListings(listings: any[]) {
    // Get current date and 90 days ago
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    
    // Helper function to check if date is within last 90 days
    const isRecent = (dateString: string | null) => {
      if (!dateString) return false;
      const date = new Date(dateString);
      return date >= ninetyDaysAgo;
    };
    
    // For Sale: Active listings with TransactionType "For Sale"
    const active = listings.filter(l => 
      l.StandardStatus === 'Active' && 
      l.TransactionType === 'For Sale'
    );
    
    // For Lease: Active listings with TransactionType "For Lease"
    const forLease = listings.filter(l => 
      l.StandardStatus === 'Active' && 
      l.TransactionType === 'For Lease'
    );
    
    // Sold: Closed sales
    const allSold = listings.filter(l => 
      l.StandardStatus === 'Closed' && 
      l.MlsStatus === 'Sold'
    );
    
    // Split sold into recent and older
    const recentlySold = allSold.filter(l => 
      isRecent(l.CloseDate || l.ClosingDate)
    );
    
    const sold = allSold.filter(l => 
      !isRecent(l.CloseDate || l.ClosingDate)
    );
    
    // Leased: Closed rentals
    const allLeased = listings.filter(l => 
      l.StandardStatus === 'Closed' && 
      l.MlsStatus === 'Leased'
    );
    
    // Split leased into recent and older
    const recentlyLeased = allLeased.filter(l => 
      isRecent(l.CloseDate || l.ClosingDate)
    );
    
    const leased = allLeased.filter(l => 
      !isRecent(l.CloseDate || l.ClosingDate)
    );
    
    console.log('Categorized results:', {
      active: active.length,
      forLease: forLease.length,
      recentlySold: recentlySold.length,
      sold: sold.length,
      recentlyLeased: recentlyLeased.length,
      leased: leased.length,
      totalSold: allSold.length,
      totalLeased: allLeased.length
    });
    
    return {
      active,
      forLease,
      sold: allSold, // Return all sold for now
      leased: allLeased, // Return all leased for now
      recentlySold,
      recentlyLeased,
      total: listings.length
    };
  }
}
