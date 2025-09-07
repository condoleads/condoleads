// lib/proptx/enhanced-client.ts - COMPLETE FIXED VERSION FOR SOLD/LEASED

import { AddressNormalizer } from '../address/normalizer';

export class EnhancedPropTxClient {
  private baseUrl = process.env.PROPTX_RESO_API_URL!;
  private bearerToken = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN!;
  private normalizer = new AddressNormalizer();
  
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
  
  async searchBuildingListings(userInput: string, city: string = 'Toronto') {
    console.log('=================================');
    console.log('🎯 THREE-PART EXACT MATCH SEARCH');
    console.log('=================================');
    console.log('Input:', userInput);
    console.log('City:', city);
    
    // Parse street number and name - PRESERVED LOGIC
    const parts = userInput.trim().split(/\s+/);
    const streetNumber = parts[0];  // "101"
    const streetName = parts[1];    // "Charles"
    
    console.log(`Exact match criteria:`);
    console.log(`  1. Street Number: "${streetNumber}"`);
    console.log(`  2. Street Name: "${streetName}"`);
    console.log(`  3. City: "${city}"`);
    
    let allResults: any[] = [];
    
    // Search for exact street number
    try {
      const filter = `StreetNumber eq '${streetNumber}'`;
      const url = `${this.baseUrl}Property?$filter=${encodeURIComponent(filter)}&$top=3000`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Found ${data.value?.length || 0} listings with street number ${streetNumber}`);
        
        if (data.value && data.value.length > 0) {
          // THREE-PART EXACT MATCH FILTER - PRESERVED
          const filtered = data.value.filter((listing: any) => {
            const addr = (listing.UnparsedAddress || '').trim();
            const addrParts = addr.split(/\s+/);
            
            // PART 1: Street number must match exactly
            if (addrParts[0] !== streetNumber) {
              return false;
            }
            
            // PART 2: Street name must match exactly (case insensitive)
            if (addrParts[1]?.toLowerCase() !== streetName.toLowerCase()) {
              return false;
            }
            
            // PART 3: City must match - PRESERVED TORONTO DISTRICT LOGIC
            const listingCity = listing.City || '';
            const unparsedAddr = listing.UnparsedAddress || '';
            
            let cityMatch = false;
            
            if (city.toLowerCase() === 'toronto') {
              // Accept ANY Toronto district code
              cityMatch = listingCity.toLowerCase().includes('toronto') || 
                         listingCity.match(/^Toronto\s+[CEW]\d{2}$/i) !== null ||
                         unparsedAddr.includes('Toronto');
              
              // Explicitly reject other cities
              const isOtherCity = unparsedAddr.includes('Kingston') || 
                                 unparsedAddr.includes('Kitchener') ||
                                 unparsedAddr.includes('Mississauga') ||
                                 unparsedAddr.includes('Markham') ||
                                 unparsedAddr.includes('Vaughan') ||
                                 unparsedAddr.includes('Richmond Hill') ||
                                 unparsedAddr.includes('Oakville') ||
                                 unparsedAddr.includes('Burlington') ||
                                 unparsedAddr.includes('Hamilton') ||
                                 unparsedAddr.includes('Brampton') ||
                                 unparsedAddr.includes('Ajax') ||
                                 unparsedAddr.includes('Pickering') ||
                                 unparsedAddr.includes('Whitby') ||
                                 unparsedAddr.includes('Oshawa') ||
                                 unparsedAddr.includes('Barrie') ||
                                 unparsedAddr.includes('London') ||
                                 unparsedAddr.includes('Ottawa') ||
                                 unparsedAddr.includes('Windsor');
              
              if (isOtherCity) {
                console.log(`Rejecting non-Toronto listing: ${unparsedAddr}`);
                return false;
              }
            } else {
              // For other cities, exact match
              cityMatch = listingCity.toLowerCase().includes(city.toLowerCase()) ||
                         unparsedAddr.toLowerCase().includes(`, ${city.toLowerCase()},`);
            }
            
            if (!cityMatch) {
              return false;
            }
            
            return true;
          });
          
          console.log(`Filtered to ${filtered.length} exact matches (${streetNumber} ${streetName}, ${city})`);
          allResults = filtered;
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
    
    // Deduplicate
    const uniqueResults = this.deduplicateListings(allResults);
    console.log('=================================');
    console.log(`✅ FINAL: ${uniqueResults.length} unique listings`);
    console.log('=================================');
    
    // Categorize and add analytics
    const categorized = this.categorizeListings(uniqueResults);
    return {
      ...categorized,
      analytics: this.calculateAnalytics(categorized)
    };
  }
  
  async getTorontoCondoListings() {
    console.log('Fetching Toronto condos...');
    
    try {
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
      const key = listing.ListingId || listing.ListingKey || listing.ListingKeyNumeric ||
                  `${listing.UnparsedAddress}-${listing.ListPrice}-${listing.ListingDate}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private categorizeListings(listings: any[]) {
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    
    const isRecent = (dateString: string | null) => {
      if (!dateString || dateString === 'N/A') return false;
      try {
        const date = new Date(dateString);
        return date >= ninetyDaysAgo && date <= today;
      } catch {
        return false;
      }
    };
    
    // Initialize arrays for each category
    let active: any[] = [];
    let forLease: any[] = [];
    let allSold: any[] = [];
    let allLeased: any[] = [];
    
    // CRITICAL FIX: Process each listing based on ACTUAL field values from your data
    listings.forEach(listing => {
      // Get the actual field values from YOUR data structure
      const status = listing.StandardStatus || listing.MlsStatus || '';
      const transactionType = listing.TransactionType || '';
      
      // Debug first few listings to see actual values
      if (listings.indexOf(listing) < 3) {
        console.log('Sample listing data:', {
          status: status,
          transactionType: transactionType,
          fields: Object.keys(listing).join(', ')
        });
      }
      
      // ACTIVE LISTINGS
      if (status === 'Active' || status.includes('Active')) {
        if (transactionType === 'For Sale' || transactionType === 'Sale' || !transactionType) {
          active.push(listing);
        } else if (transactionType === 'For Lease' || transactionType === 'Lease' || transactionType === 'Rent') {
          forLease.push(listing);
        }
      }
      // CLOSED/SOLD LISTINGS
      else if (status === 'Closed' || status.includes('Closed')) {
        // Check MlsStatus for Sold/Leased
        const mlsStatus = listing.MlsStatus || '';
        if (mlsStatus === 'Sold' || status.includes('Sold')) {
          allSold.push(listing);
        } else if (mlsStatus === 'Leased' || status.includes('Leased')) {
          allLeased.push(listing);
        }
      }
      // SOLD LISTINGS (direct status)
      else if (status === 'Sold' || listing.MlsStatus === 'Sold') {
        allSold.push(listing);
      }
      // LEASED LISTINGS (direct status)
      else if (status === 'Leased' || listing.MlsStatus === 'Leased') {
        allLeased.push(listing);
      }
    });
    
    // Split sold by date
    const recentlySold = allSold.filter(l => {
      const closeDate = l.CloseDate || l.ClosingDate || l.StatusChangeTimestamp || l.ClosePriceDate;
      return isRecent(closeDate);
    });
    
    const sold = allSold.filter(l => {
      const closeDate = l.CloseDate || l.ClosingDate || l.StatusChangeTimestamp || l.ClosePriceDate;
      return !isRecent(closeDate);
    });
    
    // Split leased by date
    const recentlyLeased = allLeased.filter(l => {
      const closeDate = l.CloseDate || l.ClosingDate || l.StatusChangeTimestamp || l.ClosePriceDate;
      return isRecent(closeDate);
    });
    
    const leased = allLeased.filter(l => {
      const closeDate = l.CloseDate || l.ClosingDate || l.StatusChangeTimestamp || l.ClosePriceDate;
      return !isRecent(closeDate);
    });
    
    console.log('=== CATEGORIZATION RESULTS ===');
    console.log('Active (For Sale):', active.length);
    console.log('For Lease:', forLease.length);
    console.log('Sold (Total):', allSold.length, '(Recent:', recentlySold.length, 'Older:', sold.length, ')');
    console.log('Leased (Total):', allLeased.length, '(Recent:', recentlyLeased.length, 'Older:', leased.length, ')');
    console.log('Total Listings:', listings.length);
    
    // Log sample of each category for debugging
    if (allSold.length > 0) {
      console.log('Sample Sold listing:', {
        status: allSold[0].StandardStatus,
        mlsStatus: allSold[0].MlsStatus,
        transactionType: allSold[0].TransactionType
      });
    }
    
    if (allLeased.length > 0) {
      console.log('Sample Leased listing:', {
        status: allLeased[0].StandardStatus,
        mlsStatus: allLeased[0].MlsStatus,
        transactionType: allLeased[0].TransactionType
      });
    }
    
    return {
      active,
      forLease,
      sold: allSold,
      leased: allLeased,
      recentlySold,
      recentlyLeased,
      total: listings.length
    };
  }
  
  // Calculate market analytics
  private calculateAnalytics(categorized: any) {
    const { active, forLease, sold, leased } = categorized;
    
    // Average sale prices
    const avgSalePrice = active.length > 0
      ? Math.round(active.reduce((sum: number, l: any) => sum + (l.ListPrice || 0), 0) / active.length)
      : 0;
    
    // Average lease prices
    const avgLeasePrice = forLease.length > 0
      ? Math.round(forLease.reduce((sum: number, l: any) => sum + (l.ListPrice || 0), 0) / forLease.length)
      : 0;
    
    // Average sold price
    const avgSoldPrice = sold.length > 0
      ? Math.round(sold.reduce((sum: number, l: any) => sum + (l.ClosePrice || l.ListPrice || 0), 0) / sold.length)
      : 0;
    
    // Average leased price
    const avgLeasedPrice = leased.length > 0
      ? Math.round(leased.reduce((sum: number, l: any) => sum + (l.ClosePrice || l.ListPrice || 0), 0) / leased.length)
      : 0;
    
    // Days on market for sold properties
    const soldWithDOM = sold.filter((l: any) => l.DaysOnMarket && l.DaysOnMarket > 0);
    const avgDaysOnMarket = soldWithDOM.length > 0
      ? Math.round(soldWithDOM.reduce((sum: number, l: any) => sum + l.DaysOnMarket, 0) / soldWithDOM.length)
      : 0;
    
    // Market activity level
    const totalActivity = categorized.total;
    const activityLevel = totalActivity > 200 ? 'very high' :
                         totalActivity > 100 ? 'high' : 
                         totalActivity > 50 ? 'moderate' : 
                         totalActivity > 20 ? 'low' : 'very low';
    
    // Price ranges for active listings
    const salePrices = active.map((l: any) => l.ListPrice).filter((p: any) => p > 0);
    const minSalePrice = salePrices.length > 0 ? Math.min(...salePrices) : 0;
    const maxSalePrice = salePrices.length > 0 ? Math.max(...salePrices) : 0;
    
    const leasePrices = forLease.map((l: any) => l.ListPrice).filter((p: any) => p > 0);
    const minLeasePrice = leasePrices.length > 0 ? Math.min(...leasePrices) : 0;
    const maxLeasePrice = leasePrices.length > 0 ? Math.max(...leasePrices) : 0;
    
    // Historical price ranges
    const soldPrices = sold.map((l: any) => l.ClosePrice || l.ListPrice).filter((p: any) => p > 0);
    const minSoldPrice = soldPrices.length > 0 ? Math.min(...soldPrices) : 0;
    const maxSoldPrice = soldPrices.length > 0 ? Math.max(...soldPrices) : 0;
    
    const leasedPrices = leased.map((l: any) => l.ClosePrice || l.ListPrice).filter((p: any) => p > 0);
    const minLeasedPrice = leasedPrices.length > 0 ? Math.min(...leasedPrices) : 0;
    const maxLeasedPrice = leasedPrices.length > 0 ? Math.max(...leasedPrices) : 0;
    
    return {
      // Current market
      avgSalePrice,
      avgLeasePrice,
      
      // Historical market
      avgSoldPrice,
      avgLeasedPrice,
      avgDaysOnMarket,
      
      // Market activity
      activityLevel,
      
      // Price ranges
      priceRange: {
        sale: { 
          min: minSalePrice, 
          max: maxSalePrice,
          avg: avgSalePrice
        },
        lease: { 
          min: minLeasePrice, 
          max: maxLeasePrice,
          avg: avgLeasePrice
        },
        sold: {
          min: minSoldPrice,
          max: maxSoldPrice,
          avg: avgSoldPrice,
          count: sold.length
        },
        leased: {
          min: minLeasedPrice,
          max: maxLeasedPrice,
          avg: avgLeasedPrice,
          count: leased.length
        }
      },
      
      // Inventory summary
      inventory: {
        forSale: active.length,
        forLease: forLease.length,
        totalActive: active.length + forLease.length
      },
      
      // Historical activity
      historicalActivity: {
        totalSold: sold.length,
        totalLeased: leased.length,
        last90Days: {
          sold: categorized.recentlySold?.length || 0,
          leased: categorized.recentlyLeased?.length || 0
        }
      },
      
      // Market insights
      insights: {
        saleToLeaseRatio: active.length > 0 ? (forLease.length / active.length).toFixed(2) : 0,
        turnoverRate: sold.length > 0 ? ((sold.length / (sold.length + active.length)) * 100).toFixed(1) : 0,
        priceSpread: maxSalePrice > 0 ? ((maxSalePrice - minSalePrice) / minSalePrice * 100).toFixed(1) : 0,
        marketStatus: this.getMarketStatus(active.length, sold.length, avgSalePrice, avgSoldPrice)
      }
    };
  }
  
  private getMarketStatus(activeCount: number, soldCount: number, avgActive: number, avgSold: number): string {
    if (activeCount === 0) return 'No active inventory';
    if (soldCount === 0) return 'No recent sales';
    
    const inventoryRatio = activeCount / soldCount;
    const priceDirection = avgActive > avgSold ? 'rising' : avgActive < avgSold ? 'falling' : 'stable';
    
    if (inventoryRatio < 0.5) return `Seller's market - prices ${priceDirection}`;
    if (inventoryRatio > 2) return `Buyer's market - prices ${priceDirection}`;
    return `Balanced market - prices ${priceDirection}`;
  }
}