// app/test-sync/all-listings.tsx - SIMPLIFIED VERSION TO SHOW ALL LISTINGS

'use client';

import { useState, useEffect } from 'react';

export default function AllListingsPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [address] = useState('101 Charles St East');
  const [city] = useState('Toronto');
  
  useEffect(() => {
    loadListings();
  }, []);
  
  const loadListings = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/sync-building', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          address: address,
          city: city,
          returnListings: true
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.listings) {
        // Combine ALL listings
        const allListings = [
          ...(data.listings.active || []),
          ...(data.listings.forLease || []),
          ...(data.listings.sold || []),
          ...(data.listings.leased || [])
        ];
        
        // Deduplicate
        const seen = new Set();
        const unique = allListings.filter((listing: any) => {
          const key = listing.ListingId || `${listing.UnparsedAddress}-${listing.ListPrice}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        setListings(unique);
        console.log(`Loaded ${unique.length} unique listings`);
      }
    } catch (error) {
      console.error('Failed to load listings:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Export to CSV function
  const exportToCSV = () => {
    const headers = ['#', 'Address', 'Unit', 'MLS#', 'Status', 'Price', 'Type', 'Date'];
    const rows = listings.map((listing, idx) => [
      idx + 1,
      listing.UnparsedAddress || '',
      listing.UnparsedAddress?.match(/\b(\d{3,4}),/)?.[1] || '',
      listing.ListingId || listing.ListingKey || '',
      `${listing.StandardStatus}/${listing.MlsStatus}`,
      listing.ListPrice || listing.ClosePrice || 0,
      listing.TransactionType || '',
      listing.ListingDate || listing.CloseDate || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listings-${address.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading all listings...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-full p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">All Listings for {address}, {city}</h1>
        <div className="flex gap-4 items-center">
          <p className="text-lg">Total Listings: <strong>{listings.length}</strong></p>
          <button
            onClick={loadListings}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Refresh
          </button>
          <button
            onClick={exportToCSV}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Export to CSV
          </button>
        </div>
      </div>
      
      {/* Simple listings display - ALL at once */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="p-4 bg-gray-100 border-b">
          <p className="font-semibold">Showing ALL {listings.length} listings</p>
        </div>
        
        <div className="overflow-auto" style={{ maxHeight: '80vh' }}>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Address</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-left">MLS#</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Price</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listings.map((listing, idx) => {
                const unit = listing.UnparsedAddress?.match(/\b(\d{3,4}),/)?.[1] || 
                            listing.UnparsedAddress?.match(/\s(\d{3,4})\s/)?.[1] || '';
                
                return (
                  <tr key={`${listing.ListingId}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-xs truncate" title={listing.UnparsedAddress}>
                        {listing.UnparsedAddress}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{unit}</td>
                    <td className="px-3 py-2">{listing.ListingId || listing.ListingKey || ''}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        listing.StandardStatus === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {listing.StandardStatus}/{listing.MlsStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      ${(listing.ListPrice || listing.ClosePrice || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{listing.TransactionType || ''}</td>
                    <td className="px-3 py-2">
                      {listing.ListingDate || listing.CloseDate || listing.StatusChangeTimestamp || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded p-4">
          <p className="text-sm text-gray-600">Active (For Sale)</p>
          <p className="text-2xl font-bold text-blue-600">
            {listings.filter(l => l.StandardStatus === 'Active' && l.TransactionType !== 'For Lease').length}
          </p>
        </div>
        <div className="bg-green-50 rounded p-4">
          <p className="text-sm text-gray-600">For Lease</p>
          <p className="text-2xl font-bold text-green-600">
            {listings.filter(l => l.StandardStatus === 'Active' && l.TransactionType === 'For Lease').length}
          </p>
        </div>
        <div className="bg-orange-50 rounded p-4">
          <p className="text-sm text-gray-600">Sold</p>
          <p className="text-2xl font-bold text-orange-600">
            {listings.filter(l => l.MlsStatus === 'Sold').length}
          </p>
        </div>
        <div className="bg-purple-50 rounded p-4">
          <p className="text-sm text-gray-600">Leased</p>
          <p className="text-2xl font-bold text-purple-600">
            {listings.filter(l => l.MlsStatus === 'Leased').length}
          </p>
        </div>
      </div>
    </div>
  );
}