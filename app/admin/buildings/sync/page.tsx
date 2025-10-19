"use client";

import { useState } from 'react';
import { ComprehensiveSaveButton } from '@/components/admin/sync/ComprehensiveSaveButton';

export default function BuildingSyncPage() {
  const [searchForm, setSearchForm] = useState({
    streetNumber: '101',
    streetName: 'Charles St E',
    city: 'Toronto',
    buildingName: 'X2 Condos'
  });

  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<any>(null);
  const [showHistorical, setShowHistorical] = useState(false);
  
  // Generate preview slug as user types
  const generateSlug = (streetNumber: string, streetName?: string, city?: string, buildingName?: string) => {
    const parts = [];
    if (buildingName?.trim()) parts.push(buildingName.toLowerCase());
    if (streetNumber?.trim()) parts.push(streetNumber);
    if (streetName?.trim()) parts.push(streetName.toLowerCase());
    if (city?.trim()) parts.push(city.toLowerCase());
    
    return parts
      .join('-')
      .replace(/[^a-z0-9\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };
  
  const previewSlug = generateSlug(
    searchForm.streetNumber, 
    searchForm.streetName, 
    searchForm.city, 
    searchForm.buildingName
  );
  
  const handleSearch = async () => {
    if (!searchForm.streetNumber.trim()) {
      alert('Street number is required');
      return;
    }

    setSearching(true);
    setSearchResult(null);
    setSaveResult(null);

    try {
      const response = await fetch('/api/admin/buildings/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...searchForm,
          fullData: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Search failed');
      }

      const result = await response.json();
      setSearchResult(result);

    } catch (error: any) {
      console.error('Search failed:', error);
      alert(`Search failed: ${error.message}`);
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    if (!searchResult) return;
    
    setSaving(true);
    setSaveResult(null);
    
    try {
      const CHUNK_SIZE = 20;
      const totalChunks = Math.ceil(searchResult.allListings.length / CHUNK_SIZE);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, searchResult.allListings.length);
        const chunk = searchResult.allListings.slice(start, end);
        
        const response = await fetch('/api/admin/buildings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildingData: searchResult.building,
            chunkIndex: i,
            totalChunks,
            listingsChunk: chunk
          })
        });
        
        if (!response.ok) {
          throw new Error(`Chunk ${i + 1} failed`);
        }
        
        console.log(`Saved chunk ${i + 1}/${totalChunks}`);
      }
      
      setSaveResult({
        success: true,
        building: searchResult.building,
        stats: {
          listings_saved: searchResult.allListings.length
        }
      });
      
    } catch (error: any) {
      console.error('Save failed:', error);
      alert(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Building Search & Sync</h1>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Building Search</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Street Number *</label>
            <input
              type="text"
              value={searchForm.streetNumber}
              onChange={(e) => setSearchForm({...searchForm, streetNumber: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="101"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Street Name *</label>
            <input
              type="text"
              value={searchForm.streetName}
              onChange={(e) => setSearchForm({...searchForm, streetName: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Charles St E"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">City</label>
            <input
              type="text"
              value={searchForm.city}
              onChange={(e) => setSearchForm({...searchForm, city: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Toronto"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Building Name</label>
            <input
              type="text"
              value={searchForm.buildingName}
              onChange={(e) => setSearchForm({...searchForm, buildingName: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="X2 Condos"
            />
          </div>
        </div>

        {/* Live Slug Preview */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Auto-generated URL:
          </label>
          <div className="text-sm font-mono text-blue-600">
            condoleads.ca/{previewSlug}
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={searching}
          className={`px-6 py-2 rounded-lg font-medium text-white ${
            searching
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {searching ? 'Searching...' : 'Search Building'}
        </button>
      </div>
      
      {/* Saving Progress */}
      {saving && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="font-medium">Saving in progress...</p>
          <div className="mt-2 bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{width: '50%'}}></div>
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResult && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Search Results</h2>

          <div className="mb-4">
            <h3 className="text-lg font-medium">{searchResult.building.buildingName}</h3>
            <p className="text-gray-600">{searchResult.building.canonicalAddress}</p>
            <p className="text-sm text-gray-500">
              Found {searchResult.total} listings ready for sync
            </p>
            
            <p className="text-sm text-blue-600 font-mono">
              Final URL: condoleads.ca/{searchResult.building.slug}
            </p>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {searchResult.categories.activeForSale}
              </div>
              <div className="text-xs text-gray-600">For Sale</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {searchResult.categories.activeForLease}
              </div>
              <div className="text-xs text-gray-600">For Lease</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {searchResult.categories.recentlySold}
              </div>
              <div className="text-xs text-gray-600">Recently Sold</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {searchResult.categories.olderSold}
              </div>
              <div className="text-xs text-gray-600">Older Sold</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {searchResult.categories.recentlyLeased}
              </div>
              <div className="text-xs text-gray-600">Recently Leased</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {searchResult.categories.olderLeased}
              </div>
              <div className="text-xs text-gray-600">Older Leased</div>
            </div>
          </div>

          {/* Historical Statuses Section - Collapsible */}
          {searchResult.categories.historical > 0 && (
            <div className="mt-6 border-t pt-4">
              <button
                onClick={() => setShowHistorical(!showHistorical)}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium"
              >
                <span>{showHistorical ? '▼' : '▶'}</span>
                <span>Historical Statuses ({searchResult.categories.historical} records)</span>
              </button>
              
              {showHistorical && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-4">
                    Historical status breakdown for this building:
                  </p>
                  
                  {/* Breakdown by status type */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {searchResult.detailedBreakdown.historical.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-white rounded border">
                        <div>
                          <span className="font-medium">Unit {item.unit}</span>
                          <div className="text-xs text-gray-500">
                            {item.mlsStatus || item.status}
                            {item.closeDate && ` • ${new Date(item.closeDate).toLocaleDateString()}`}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                          {item.mlsStatus || item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 pt-3 border-t">
                    <p className="text-xs text-gray-500">
                      Historical statuses include: Expired, Terminated, Suspended, Deal Fell Through, Conditional Expired
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-3 rounded-lg font-medium text-white ${
              saving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {saving ? 'Saving to Database...' : 'Save to Database'}
          </button>
        </div>
      )}

      {/* Save Results */}
      {saveResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold text-green-800 mb-4">
            ✅ Save Completed
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-700">
                {saveResult.stats.listings_saved}
              </div>
              <div className="text-xs text-green-600">Listings Saved</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {saveResult.stats.media_records || 0}
              </div>
              <div className="text-xs text-blue-600">Media Records</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-purple-700">
                {saveResult.stats.room_records || 0}
              </div>
              <div className="text-xs text-purple-600">Room Records</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-orange-700">
                {saveResult.stats.open_house_records || 0}
              </div>
              <div className="text-xs text-orange-600">Open Houses</div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-medium text-green-800">Building Saved:</h3>
            <p className="text-green-700">{saveResult.building.building_name}</p>
            <p className="text-sm text-green-600">
              Slug: {saveResult.building.slug}
            </p>
          </div>

          <p className="text-green-700 font-medium">{saveResult.message || 'Successfully saved!'}</p>
        </div>
      )}
    </div>
  );
}