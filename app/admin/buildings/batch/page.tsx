"use client";

import { useState } from 'react';

interface BuildingRow {
  id: string;
  streetNumber: string;
  streetName: string;
  city: string;
  buildingName: string;
  status: 'idle' | 'searching' | 'ready' | 'saving' | 'saved' | 'error';
  searchResult: any | null;
  saveResult: any | null;
  error: string | null;
  showHistorical: boolean;
}

export default function BatchSyncPage() {
  const [rows, setRows] = useState<BuildingRow[]>([
    {
      id: '1',
      streetNumber: '',
      streetName: '',
      city: 'Toronto',
      buildingName: '',
      status: 'idle',
      searchResult: null,
      saveResult: null,
      error: null,
      showHistorical: false
    }
  ]);

  // Generate slug (EXACT copy from sync page)
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

  const addRow = () => {
    const newRow: BuildingRow = {
      id: Date.now().toString(),
      streetNumber: '',
      streetName: '',
      city: 'Toronto',
      buildingName: '',
      status: 'idle',
      searchResult: null,
      saveResult: null,
      error: null,
      showHistorical: false
    };
    setRows([...rows, newRow]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) {
      alert('Must have at least one row');
      return;
    }
    setRows(rows.filter(row => row.id !== id));
  };

  const updateRow = (id: string, field: keyof BuildingRow, value: any) => {
    setRows(rows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  // EXACT copy of handleSearch from sync page
  const handleSearch = async (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row || !row.streetNumber.trim()) {
      alert('Street number is required');
      return;
    }

    updateRow(id, 'status', 'searching');
    updateRow(id, 'searchResult', null);
    updateRow(id, 'saveResult', null);
    updateRow(id, 'error', null);

    try {
      const response = await fetch('/api/admin/buildings/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          streetNumber: row.streetNumber,
          streetName: row.streetName,
          city: row.city,
          buildingName: row.buildingName,
          fullData: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Search failed');
      }

      const result = await response.json();
      updateRow(id, 'searchResult', result);
      updateRow(id, 'status', 'ready');

    } catch (error: any) {
      console.error('Search failed:', error);
      updateRow(id, 'error', error.message);
      updateRow(id, 'status', 'error');
    }
  };

  // Search all in parallel
  const handleSearchAll = async () => {
    const validRows = rows.filter(row => 
      row.streetNumber.trim() && (row.status === 'idle' || row.status === 'error')
    );

    if (validRows.length === 0) {
      alert('No valid rows to search');
      return;
    }

    const searchPromises = validRows.map(row => handleSearch(row.id));
    await Promise.allSettled(searchPromises);
  };

  // EXACT copy of handleSave from sync page
  const handleSave = async (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row || !row.searchResult) return;
    
    updateRow(id, 'status', 'saving');
    updateRow(id, 'saveResult', null);
    updateRow(id, 'error', null);
    
    try {
      const CHUNK_SIZE = 20;
      const totalChunks = Math.ceil(row.searchResult.allListings.length / CHUNK_SIZE);
      
      let totalMedia = 0;
      let totalRooms = 0;
      let totalOpenHouses = 0;
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, row.searchResult.allListings.length);
        const chunk = row.searchResult.allListings.slice(start, end);
        
        const response = await fetch('/api/admin/buildings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildingData: row.searchResult.building,
            chunkIndex: i,
            totalChunks,
            listingsChunk: chunk
          })
        });
        
        if (!response.ok) {
          throw new Error(`Chunk ${i + 1} failed`);
        }
        
        const chunkResult = await response.json();
        totalMedia += chunkResult.stats?.media_records || 0;
        totalRooms += chunkResult.stats?.room_records || 0;
        totalOpenHouses += chunkResult.stats?.open_house_records || 0;
        
        console.log(`Saved chunk ${i + 1}/${totalChunks}`);
      }
      
      updateRow(id, 'saveResult', {
        success: true,
        building: row.searchResult.building,
        stats: {
          listings_saved: row.searchResult.allListings.length,
          media_records: totalMedia,
          room_records: totalRooms,
          open_house_records: totalOpenHouses
        },
        message: 'Successfully saved!'
      });
      updateRow(id, 'status', 'saved');
      
    } catch (error: any) {
      console.error('Save failed:', error);
      updateRow(id, 'error', error.message);
      updateRow(id, 'status', 'error');
    }
  };

  // Save all in parallel
  const handleSaveAll = async () => {
    const readyRows = rows.filter(row => row.status === 'ready');

    if (readyRows.length === 0) {
      alert('No buildings ready to save');
      return;
    }

    const savePromises = readyRows.map(row => handleSave(row.id));
    await Promise.allSettled(savePromises);
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Batch Building Sync</h1>

      {/* Buildings List */}
      <div className="space-y-6">
        {rows.map((row, index) => (
          <div key={row.id} className="bg-white rounded-lg shadow-lg p-6">
            {/* Row Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Building #{index + 1}</h2>
              <button
                onClick={() => removeRow(row.id)}
                className="text-red-600 hover:text-red-800 font-medium"
              >
                 Remove
              </button>
            </div>

            {/* Search Form - EXACT copy from sync page */}
            <div className="bg-white rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Street Number *</label>
                  <input
                    type="text"
                    value={row.streetNumber}
                    onChange={(e) => updateRow(row.id, 'streetNumber', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="101"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Street Name *</label>
                  <input
                    type="text"
                    value={row.streetName}
                    onChange={(e) => updateRow(row.id, 'streetName', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Charles St E"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">City</label>
                  <input
                    type="text"
                    value={row.city}
                    onChange={(e) => updateRow(row.id, 'city', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Toronto"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Building Name</label>
                  <input
                    type="text"
                    value={row.buildingName}
                    onChange={(e) => updateRow(row.id, 'buildingName', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="X2 Condos"
                  />
                </div>
              </div>

              {/* Live Slug Preview - EXACT copy */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auto-generated URL:
                </label>
                <div className="text-sm font-mono text-blue-600">
                  condoleads.ca/{generateSlug(row.streetNumber, row.streetName, row.city, row.buildingName)}
                </div>
              </div>

              <button
                onClick={() => handleSearch(row.id)}
                disabled={row.status === 'searching'}
                className={`px-6 py-2 rounded-lg font-medium text-white ${
                  row.status === 'searching'
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {row.status === 'searching' ? 'Searching...' : 'Search Building'}
              </button>
            </div>
            
            {/* Saving Progress - EXACT copy */}
            {row.status === 'saving' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="font-medium">Saving in progress...</p>
                <div className="mt-2 bg-blue-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{width: '50%'}}></div>
                </div>
              </div>
            )}

            {/* Search Results - EXACT copy from sync page */}
            {row.searchResult && (
              <div className="bg-white rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Search Results</h2>

                <div className="mb-4">
                  <h3 className="text-lg font-medium">{row.searchResult.building.buildingName}</h3>
                  <p className="text-gray-600">{row.searchResult.building.canonicalAddress}</p>
                  <p className="text-sm text-gray-500">
                    Found {row.searchResult.total} listings ready for sync
                  </p>
                  
                  <p className="text-sm text-blue-600 font-mono">
                    Final URL: condoleads.ca/{row.searchResult.building.slug}
                  </p>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {row.searchResult.categories.activeForSale}
                    </div>
                    <div className="text-xs text-gray-600">For Sale</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {row.searchResult.categories.activeForLease}
                    </div>
                    <div className="text-xs text-gray-600">For Lease</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {row.searchResult.categories.recentlySold}
                    </div>
                    <div className="text-xs text-gray-600">Recently Sold</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {row.searchResult.categories.olderSold}
                    </div>
                    <div className="text-xs text-gray-600">Older Sold</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {row.searchResult.categories.recentlyLeased}
                    </div>
                    <div className="text-xs text-gray-600">Recently Leased</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">
                      {row.searchResult.categories.olderLeased}
                    </div>
                    <div className="text-xs text-gray-600">Older Leased</div>
                  </div>
                </div>

                {/* Historical Statuses Section - EXACT copy */}
                {row.searchResult.categories.historical > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <button
                      onClick={() => updateRow(row.id, 'showHistorical', !row.showHistorical)}
                      className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium"
                    >
                      <span>{row.showHistorical ? '' : ''}</span>
                      <span>Historical Statuses ({row.searchResult.categories.historical} records)</span>
                    </button>
                    
                    {row.showHistorical && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-4">
                          Historical status breakdown for this building:
                        </p>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {row.searchResult.detailedBreakdown.historical.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-white rounded border">
                              <div>
                                <span className="font-medium">Unit {item.unit}</span>
                                <div className="text-xs text-gray-500">
                                  {item.mlsStatus || item.status}
                                  {item.closeDate && `  ${new Date(item.closeDate).toLocaleDateString()}`}
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
                  onClick={() => handleSave(row.id)}
                  disabled={row.status === 'saving'}
                  className={`px-6 py-3 rounded-lg font-medium text-white ${
                    row.status === 'saving'
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {row.status === 'saving' ? 'Saving to Database...' : 'Save to Database'}
                </button>
              </div>
            )}

            {/* Save Results - EXACT copy */}
            {row.saveResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-6">
                <h2 className="text-xl font-semibold text-green-800 mb-4">
                   Save Completed
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">
                      {row.saveResult.stats.listings_saved}
                    </div>
                    <div className="text-xs text-green-600">Listings Saved</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-700">
                      {row.saveResult.stats.media_records || 0}
                    </div>
                    <div className="text-xs text-blue-600">Media Records</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-700">
                      {row.saveResult.stats.room_records || 0}
                    </div>
                    <div className="text-xs text-purple-600">Room Records</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-700">
                      {row.saveResult.stats.open_house_records || 0}
                    </div>
                    <div className="text-xs text-orange-600">Open Houses</div>
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="font-medium text-green-800">Building Saved:</h3>
                  <p className="text-green-700">{row.saveResult.building.building_name}</p>
                  <p className="text-sm text-green-600">
                    Slug: {row.saveResult.building.slug}
                  </p>
                </div>

                <p className="text-green-700 font-medium">{row.saveResult.message || 'Successfully saved!'}</p>
              </div>
            )}

            {/* Error Display */}
            {row.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                Error: {row.error}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={addRow}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
        >
           Add Row
        </button>
        <button
          onClick={handleSearchAll}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
           Search All
        </button>
        <button
          onClick={handleSaveAll}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
        >
           Save All
        </button>
      </div>
    </div>
  );
}
