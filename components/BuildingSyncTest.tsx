// components/BuildingSyncTest.tsx - CREATE THIS FOR TESTING
'use client';

import { useState } from 'react';

export function BuildingSyncTest() {
  const [address, setAddress] = useState('101 Charles St East');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const syncBuilding = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/sync-building', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">On-Demand Building Sync</h2>
      
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter building address (e.g., 101 Charles St East)"
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={syncBuilding}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Syncing...' : 'Sync Building'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
            ✅ Building synced successfully!
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-lg mb-3">Sync Summary</h3>
              <div className="space-y-2 text-sm">
                <div>Total Listings: <span className="font-semibold">{result.summary.totalListings}</span></div>
                <div>Active: <span className="font-semibold text-green-600">{result.summary.activeListings}</span></div>
                <div>Sold: <span className="font-semibold text-blue-600">{result.summary.soldListings}</span></div>
                <div>Leased: <span className="font-semibold text-purple-600">{result.summary.leasedListings}</span></div>
                <div>Sync Time: <span className="font-semibold">{new Date(result.summary.syncTime).toLocaleString()}</span></div>
              </div>
            </div>

            {result.building && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-bold text-lg mb-3">Building Info</h3>
                <div className="space-y-2 text-sm">
                  <div>Address: <span className="font-semibold">{result.building.canonical_address}</span></div>
                  <div>Slug: <span className="font-semibold">{result.building.slug}</span></div>
                  <div>Name: <span className="font-semibold">{result.building.building_name || 'N/A'}</span></div>
                  <div>Listings: <span className="font-semibold">{result.building.listingCount}</span></div>
                </div>
              </div>
            )}
          </div>

          {result.building && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-bold text-lg mb-3">Test Building Page</h3>
              <a 
                href={`/buildings/${result.building.slug}`}
                target="_blank"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                View Building Landing Page →
              </a>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-bold mb-2">How It Works:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
          <li>Enter a Toronto building address</li>
          <li>System queries PropTx RESO API for Active, Sold, and Leased listings</li>
          <li>Data is processed and stored in database (5-10 seconds)</li>
          <li>Building landing page becomes available immediately</li>
          <li>Data updates on-demand when requested</li>
        </ol>
      </div>
    </div>
  );
}