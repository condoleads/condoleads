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
}

export default function IncrementalSyncTab() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);

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
        status: 'idle' as const
      }));
      
      setBuildings(buildingsWithStatus);
    } catch (error) {
      console.error('Failed to load buildings:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncBuilding = async (buildingId: string) => {
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

      setBuildings(prev => prev.map(b => 
        b.id === buildingId 
          ? { 
              ...b, 
              status: 'success',
              syncResult: result,
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
    
    for (const building of buildings) {
      await syncBuilding(building.id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
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
                  {building.status === 'success' && (
                    <span className="text-green-600 text-sm font-medium"> Success</span>
                  )}
                  {building.status === 'error' && (
                    <span className="text-red-600 text-sm font-medium"> Error</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {buildings.some(b => b.syncResult) && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Sync Results</h3>
          {buildings
            .filter(b => b.syncResult)
            .map(building => (
              <div key={building.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-2">
                  {building.building_name}
                </h4>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-green-700 font-semibold">Active Listings:</div>
                    <div className="text-green-600">
                       {building.syncResult.active.added} added, 
                       {building.syncResult.active.updated} updated, 
                       {building.syncResult.active.removed} removed, 
                       {building.syncResult.active.unchanged} unchanged
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-green-700 font-semibold">Inactive Listings:</div>
                    <div className="text-green-600">
                       {building.syncResult.inactive.added} added, 
                       {building.syncResult.inactive.skipped} skipped
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
