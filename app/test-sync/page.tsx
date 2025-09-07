// app/test-sync/page.tsx - FIXED TO SHOW ALL LISTINGS AND ACCEPT TORONTO DISTRICTS

'use client';

import { useState } from 'react';

export default function TestSyncPage() {
  const [address, setAddress] = useState('101 Charles St East');
  const [city, setCity] = useState('Toronto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawListings, setShowRawListings] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string>('all');
  const [showLimit, setShowLimit] = useState<number>(0); // 0 means show all
  
  const testAddresses = [
    { address: '101 Charles St East', city: 'Toronto' },
    { address: '1 Bloor St East', city: 'Toronto' },
    { address: '181 Bay Street', city: 'Toronto' },
    { address: '318 Richmond Street West', city: 'Toronto' },
    { address: '14 York Street', city: 'Toronto' }
  ];
  
  const handleSync = async () => {
    if (!address.trim()) {
      setError('Please enter an address');
      return;
    }
    
    if (!city.trim()) {
      setError('Please enter a city');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      console.log(`Starting sync for: ${address}, ${city}`);
      
      const response = await fetch('/api/sync-building', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          address: address.trim(),
          city: city.trim(),
          returnListings: true
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${data.details || 'Unknown error'}`);
      }
      
      setResult(data);
      console.log('Sync successful:', data);
      
    } catch (err: any) {
      console.error('Sync failed:', err);
      setError(err.message || 'Failed to sync building');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTestConnection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/sync-building');
      const data = await response.json();
      
      setResult({
        connection_test: data,
        message: data.proptx_connected 
          ? '✅ PropTx API connected successfully!' 
          : '❌ PropTx API connection failed - check credentials'
      });
      
    } catch (err: any) {
      setError('Failed to test connection');
    } finally {
      setLoading(false);
    }
  };
  
  // Get unique cities from listings - UPDATED to normalize Toronto districts
  const getUniqueCities = () => {
    if (!result?.listings) return [];
    const cities = new Set<string>();
    
    const allListings = [
      ...(result.listings.active || []),
      ...(result.listings.forLease || []),
      ...(result.listings.sold || []),
      ...(result.listings.leased || [])
    ];
    
    allListings.forEach((listing: any) => {
      const addr = listing.UnparsedAddress || '';
      const cityMatch = addr.match(/,\s*([^,]+),\s*ON/);
      if (cityMatch) {
        let cityName = cityMatch[1];
        // Normalize Toronto districts to just "Toronto"
        if (cityName.match(/^Toronto\s+[CEW]\d{2}$/)) {
          cityName = 'Toronto';
        }
        cities.add(cityName);
      }
    });
    
    return Array.from(cities);
  };
  
  // Check if city is Toronto (including districts)
  const isToronto = (cityName: string) => {
    return cityName === 'Toronto' || cityName.match(/^Toronto\s+[CEW]\d{2}$/) !== null;
  };
  
  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">On-Demand Building Sync</h1>
      
      {/* Input Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Building Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g., 101 Charles St East"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g., Toronto"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
        </div>
        
        {/* Three-Part Match Info */}
        <div className="bg-blue-50 rounded p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>🎯 Exact Match Criteria:</strong> The system will find listings that match ALL three:
          </p>
          <ol className="text-sm text-blue-700 mt-1 list-decimal list-inside">
            <li>Street Number (e.g., "101")</li>
            <li>Street Name (e.g., "Charles")</li>
            <li>City (e.g., "Toronto" - includes all Toronto districts like C08)</li>
          </ol>
        </div>
        
        {/* Show Raw Listings Toggle */}
        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showRawListings}
              onChange={(e) => setShowRawListings(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Show raw listing data</span>
          </label>
        </div>
        
        <div className="flex gap-4 mb-4">
          <button
            onClick={handleSync}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Syncing...' : 'Sync Building'}
          </button>
          
          <button
            onClick={handleTestConnection}
            disabled={loading}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            Test Connection
          </button>
        </div>
        
        {/* Test Addresses */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Quick Test:</p>
          <div className="flex flex-wrap gap-2">
            {testAddresses.map((test) => (
              <button
                key={test.address}
                onClick={() => {
                  setAddress(test.address);
                  setCity(test.city);
                }}
                className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full"
                disabled={loading}
              >
                {test.address}, {test.city}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <span className="text-red-600 font-semibold mr-2">❌</span>
            <div>
              <h3 className="text-red-800 font-semibold">Sync Failed</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Success Result */}
      {result && result.success && (
        <>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h3 className="text-green-800 font-semibold mb-3">✅ Sync Successful!</h3>
            
            <div className="bg-white rounded p-4 mb-4">
              <h4 className="font-semibold mb-2">Building</h4>
              <p className="text-lg">{result.building.name}</p>
              <p className="text-gray-600">{result.building.address}, {result.building.city}</p>
            </div>
            
            <div className="bg-white rounded p-4 mb-4">
              <h4 className="font-semibold mb-3">Listings Found</h4>
              <p className="text-2xl font-bold mb-4">{result.stats.total_found}</p>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded p-3">
                  <p className="text-xs text-gray-600">Active (For Sale)</p>
                  <p className="text-xl font-bold text-blue-600">{result.stats.active}</p>
                </div>
                <div className="bg-green-50 rounded p-3">
                  <p className="text-xs text-gray-600">For Lease</p>
                  <p className="text-xl font-bold text-green-600">{result.stats.for_lease}</p>
                </div>
                <div className="bg-orange-50 rounded p-3">
                  <p className="text-xs text-gray-600">Sold</p>
                  <p className="text-xl font-bold text-orange-600">{result.stats.total_sold}</p>
                </div>
                <div className="bg-purple-50 rounded p-3">
                  <p className="text-xs text-gray-600">Leased</p>
                  <p className="text-xl font-bold text-purple-600">{result.stats.total_leased}</p>
                </div>
              </div>
              
              {/* Cities Found Info */}
              {getUniqueCities().length === 1 && getUniqueCities()[0] === 'Toronto' && (
                <div className="mt-4 p-3 bg-green-100 rounded">
                  <p className="text-sm font-semibold text-green-900">
                    ✅ All listings are from Toronto (including district C08)
                  </p>
                </div>
              )}
              
              {getUniqueCities().length > 1 && (
                <div className="mt-4 p-3 bg-yellow-100 rounded">
                  <p className="text-sm font-semibold text-yellow-900">
                    ⚠️ Warning: Found listings from multiple cities: {getUniqueCities().join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Raw Listings Display */}
          {showRawListings && result.listings && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-bold mb-4">📋 Raw Listing Data</h3>
              
              {/* Category Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {['all', 'active', 'forLease', 'sold', 'leased'].map((category) => (
                  <button
                    key={category}
                    onClick={() => setExpandedCategory(category)}
                    className={`px-4 py-2 rounded ${
                      expandedCategory === category 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {category === 'all' ? `All (${result.stats.total_found})` :
                     category === 'active' ? `Active (${result.listings?.active?.length || 0})` :
                     category === 'forLease' ? `For Lease (${result.listings?.forLease?.length || 0})` :
                     category === 'sold' ? `Sold (${result.listings?.sold?.length || 0})` :
                     `Leased (${result.listings?.leased?.length || 0})`}
                  </button>
                ))}
              </div>
              
              {/* Show limit controls */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setShowLimit(0)}
                  className={`px-3 py-1 text-sm rounded ${showLimit === 0 ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
                >
                  Show All
                </button>
                <button
                  onClick={() => setShowLimit(50)}
                  className={`px-3 py-1 text-sm rounded ${showLimit === 50 ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
                >
                  Show 50
                </button>
                <button
                  onClick={() => setShowLimit(100)}
                  className={`px-3 py-1 text-sm rounded ${showLimit === 100 ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
                >
                  Show 100
                </button>
                <button
                  onClick={() => setShowLimit(200)}
                  className={`px-3 py-1 text-sm rounded ${showLimit === 200 ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
                >
                  Show 200
                </button>
              </div>
              
              {/* Listings Display */}
              <div className="bg-white rounded-lg overflow-hidden">
                {(() => {
                  let listings: any[] = [];
                  
                  if (expandedCategory === 'all') {
                    // Combine all listings
                    const allListings = [
                      ...(result.listings?.active || []),
                      ...(result.listings?.forLease || []),
                      ...(result.listings?.sold || []),
                      ...(result.listings?.leased || [])
                    ];
                    
                    // Deduplicate
                    const seen = new Set();
                    listings = allListings.filter((listing: any) => {
                      const key = listing.ListingId || listing.ListingKey || 
                                 `${listing.UnparsedAddress}-${listing.ListPrice}-${listing.ListingDate}`;
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    });
                  } else {
                    listings = result.listings?.[expandedCategory] || [];
                  }
                  
                  // Apply limit if set
                  const displayListings = showLimit > 0 ? listings.slice(0, showLimit) : listings;
                  
                  return (
                    <div>
                      {/* Summary */}
                      <div className="px-4 py-3 bg-gray-100 border-b">
                        <p className="text-sm font-semibold">
                          Showing {displayListings.length} of {listings.length} listings
                        </p>
                      </div>
                      
                      {/* Table */}
                      <div className="overflow-x-auto" style={{ maxHeight: '1200px', overflowY: 'auto' }}>
                        <table className="min-w-full">
                          <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">MLS#</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {displayListings.map((listing: any, idx: number) => {
                              // Extract city from address
                              const addr = listing.UnparsedAddress || '';
                              const cityMatch = addr.match(/,\s*([^,]+),\s*ON/);
                              const listingCity = cityMatch ? cityMatch[1] : 'Unknown';
                              
                              // Check if it's a Toronto district
                              const isTorontoDistrict = listingCity.match(/^Toronto\s+[CEW]\d{2}$/);
                              const displayCity = isTorontoDistrict ? `${listingCity} (Toronto)` : listingCity;
                              
                              // Check if city matches expected
                              const isCityMismatch = !isToronto(listingCity) && listingCity !== 'Unknown' && city === 'Toronto';
                              
                              return (
                                <tr key={`${listing.ListingId}-${idx}`} className={`hover:bg-gray-50 ${isCityMismatch ? 'bg-red-50' : ''}`}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{idx + 1}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    <div>
                                      <div className="font-medium">{listing.UnparsedAddress}</div>
                                      {listing.StreetNumber && listing.StreetName && (
                                        <div className="text-xs text-gray-500">
                                          Fields: #{listing.StreetNumber} {listing.StreetName} {listing.StreetDirSuffix}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className={`px-4 py-2 text-sm ${isCityMismatch ? 'text-red-600 font-bold' : isTorontoDistrict ? 'text-green-600' : 'text-gray-900'}`}>
                                    {displayCity}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    {listing.ListingId || listing.ListingKey || 'N/A'}
                                  </td>
                                  <td className="px-4 py-2 text-sm">
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                      listing.StandardStatus === 'Active' 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {listing.StandardStatus}/{listing.MlsStatus}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    ${(listing.ListPrice || listing.ClosePrice || 0).toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    {listing.TransactionType || 'N/A'}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    {listing.ListingDate || listing.CloseDate || listing.StatusChangeTimestamp || 'N/A'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* If more listings exist */}
                      {displayListings.length < listings.length && (
                        <div className="px-4 py-3 bg-yellow-50 text-sm text-yellow-800">
                          ⚠️ Showing {displayListings.length} of {listings.length} total listings. 
                          {showLimit === 0 ? ' All listings are displayed above.' : ' Click "Show All" to see all listings.'}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Connection Test Result */}
      {result && result.connection_test && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Connection Status</h3>
          <pre className="text-xs bg-white p-3 rounded overflow-x-auto">
            {JSON.stringify(result.connection_test, null, 2)}
          </pre>
          {result.message && (
            <p className="mt-3 font-medium">{result.message}</p>
          )}
        </div>
      )}
      
      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
}