"use client";

import { useState, useEffect } from 'react';

interface Building {
  id: string;
  building_name: string;
  canonical_address: string;
  slug: string;
  last_synced_at: string | null;
  listingCount: number;
  status: 'idle' | 'syncing' | 'success' | 'error';
  syncResult?: any;
  error?: string;
  showDetails: boolean;
}

interface SyncAllSummary {
  buildingsProcessed: number;
  totalActiveAdded: number;
  totalActiveUpdated: number;
  totalActiveRemoved: number;
  totalActiveUnchanged: number;
  totalInactiveAdded: number;
  totalInactiveSkipped: number;
  totalDuration: number;
  errors: number;
}

export default function IncrementalSyncTab() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllSummary, setSyncAllSummary] = useState<SyncAllSummary | null>(null);

  useEffect(() => {
    loadBuildings();
  }, []);

  const loadBuildings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/buildings/list');
      const data = await response.json();
      
      const buildingsWithStatus = data.buildings.map((b: any) => ({
        ...b,
        status: 'idle' as const,
        showDetails: false
      }));
      
      setBuildings(buildingsWithStatus);
    } catch (error) {
      console.error('Failed to load buildings:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDetails = (buildingId: string) => {
    setBuildings(prev => prev.map(b => 
      b.id === buildingId ? { ...b, showDetails: !b.showDetails } : b
    ));
  };

  const syncBuilding = async (buildingId: string) => {
    const startTime = Date.now();
    
    setBuildings(prev => prev.map(b => 
      b.id === buildingId ? { ...b, status: 'syncing', error: undefined } : b
    ));

    try {
      const response = await fetch('/api/admin/buildings/incremental-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId })
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const result = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      setBuildings(prev => prev.map(b => 
        b.id === buildingId 
          ? { 
              ...b, 
              status: 'success',
              syncResult: { ...result, duration },
              last_synced_at: new Date().toISOString()
            } 
          : b
      ));

    } catch (error: any) {
      setBuildings(prev => prev.map(b => 
        b.id === buildingId 
          ? { ...b, status: 'error', error: error.message } 
          : b
      ));
    }
  };

  const syncAllBuildings = async () => {
    setSyncingAll(true);
    setSyncAllSummary(null);
    const startTime = Date.now();
    
    let totalActiveAdded = 0;
    let totalActiveUpdated = 0;
    let totalActiveRemoved = 0;
    let totalActiveUnchanged = 0;
    let totalInactiveAdded = 0;
    let totalInactiveSkipped = 0;
    let errors = 0;
    
    for (const building of buildings) {
      try {
        await syncBuilding(building.id);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Accumulate results
        const syncedBuilding = buildings.find(b => b.id === building.id);
        if (syncedBuilding?.syncResult) {
          totalActiveAdded += syncedBuilding.syncResult.active.added;
          totalActiveUpdated += syncedBuilding.syncResult.active.updated;
          totalActiveRemoved += syncedBuilding.syncResult.active.removed;
          totalActiveUnchanged += syncedBuilding.syncResult.active.unchanged;
          totalInactiveAdded += syncedBuilding.syncResult.inactive.added;
          totalInactiveSkipped += syncedBuilding.syncResult.inactive.skipped;
        }
      } catch (error) {
        errors++;
      }
    }
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    setSyncAllSummary({
      buildingsProcessed: buildings.length,
      totalActiveAdded,
      totalActiveUpdated,
      totalActiveRemoved,
      totalActiveUnchanged,
      totalInactiveAdded,
      totalInactiveSkipped,
      totalDuration: parseFloat(totalDuration),
      errors
    });
    
    setSyncingAll(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-500">Loading buildings...</div>
      </div>
    );
  }

  if (buildings.length === 0) {
    return (
      <div className="text-center p-12">
        <p className="text-gray-500 mb-4">No buildings synced yet.</p>
        <p className="text-sm text-gray-400">Use the "Full Sync" tab to add new buildings first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Incremental Sync</h2>
          <p className="text-gray-600 text-sm mt-1">
            Smart updates: Only syncs changed listings, preserves historical data
          </p>
        </div>
        <button
          onClick={syncAllBuildings}
          disabled={syncingAll}
          className={`px-6 py-3 rounded-lg font-medium text-white ${
            syncingAll
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          {syncingAll ? ' Syncing All...' : ' Sync All Buildings'}
        </button>
      </div>

      {/* Buildings Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                Building
              </th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                Address
              </th>
              <th className="text-center px-6 py-3 text-sm font-semibold text-gray-700">
                Listings
              </th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                Last Synced
              </th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                Status
              </th>
              <th className="text-right px-6 py-3 text-sm font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {buildings.map((building) => (
              <>
                <tr key={building.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium">{building.building_name}</div>
                    <div className="text-xs text-gray-500">{building.slug}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {building.canonical_address}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {building.listingCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {building.last_synced_at 
                      ? new Date(building.last_synced_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    {building.status === 'idle' && (
                      <span className="text-gray-500 text-sm">Ready</span>
                    )}
                    {building.status === 'syncing' && (
                      <span className="text-blue-600 text-sm font-medium"> Syncing...</span>
                    )}
                    {building.status === 'success' && building.syncResult && (
                      <div className="text-green-600 text-sm">
                        <div className="font-medium"> Success</div>
                        <div className="text-xs">
                          Active: +{building.syncResult.active.added} {building.syncResult.active.updated} {building.syncResult.active.removed}
                        </div>
                      </div>
                    )}
                    {building.status === 'error' && (
                      <span className="text-red-600 text-sm font-medium"> Error</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => syncBuilding(building.id)}
                      disabled={building.status === 'syncing'}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${
                        building.status === 'syncing'
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {building.status === 'syncing' ? 'Syncing...' : 'Sync Now'}
                    </button>
                    {building.syncResult && (
                      <button
                        onClick={() => toggleDetails(building.id)}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                      >
                        {building.showDetails ? ' Hide' : ' Details'}
                      </button>
                    )}
                  </td>
                </tr>
                
                {/* Details Dropdown */}
                {building.showDetails && building.syncResult && (
                  <tr key={`${building.id}-details`}>
                    <td colSpan={6} className="px-6 py-4 bg-gray-50">
                      <div className="border border-gray-200 rounded-lg p-4 bg-white">
                        <h4 className="font-semibold text-gray-800 mb-3">
                          {building.building_name} - Sync Details
                        </h4>
                        
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Active Listings:
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              <div> {building.syncResult.active.added} added</div>
                              <div> {building.syncResult.active.updated} updated</div>
                              <div> {building.syncResult.active.removed} removed</div>
                              <div> {building.syncResult.active.unchanged} unchanged</div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Inactive Listings:
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              <div> {building.syncResult.inactive.added} added</div>
                              <div> {building.syncResult.inactive.skipped} skipped</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t text-xs text-gray-500">
                          <div>Synced: {new Date(building.last_synced_at!).toLocaleString()}</div>
                          {building.syncResult.duration && (
                            <div>Duration: {building.syncResult.duration}s</div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sync All Summary */}
      {syncAllSummary && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-purple-800 mb-4">
             Sync All Summary
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-700">
                {syncAllSummary.buildingsProcessed}
              </div>
              <div className="text-xs text-purple-600">Buildings Processed</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-700">
                {syncAllSummary.totalActiveAdded}
              </div>
              <div className="text-xs text-green-600">Active Added</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {syncAllSummary.totalActiveUpdated}
              </div>
              <div className="text-xs text-blue-600">Active Updated</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-red-700">
                {syncAllSummary.totalActiveRemoved}
              </div>
              <div className="text-xs text-red-600">Active Removed</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-700">
                {syncAllSummary.totalInactiveAdded}
              </div>
              <div className="text-xs text-orange-600">Inactive Added</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">
                {syncAllSummary.totalDuration}s
              </div>
              <div className="text-xs text-gray-600">Total Duration</div>
            </div>
            
            <div className="text-center">
              <div className={`text-2xl font-bold ${syncAllSummary.errors > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {syncAllSummary.errors}
              </div>
              <div className="text-xs text-gray-600">Errors</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
