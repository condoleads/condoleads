"use client";

import { useState, useEffect } from 'react';

interface SyncStats {
  totalBuildings: number;
  lastSyncTime: string;
  recentChanges: number;
  activeListings: number;
  priceChanges: number;
  statusChanges: number;
}

interface RecentSync {
  id: string;
  building_name: string;
  sync_status: string;
  listings_created: number;
  listings_updated: number;
  completed_at: string;
  feed_type: string;
}

export function SyncAnalytics() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<RecentSync[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/analytics/sync-stats');
      const data = await response.json();
      setStats(data.stats);
      setRecentSyncs(data.recentSyncs);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerIncrementalSync = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/buildings/incremental-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        await fetchAnalytics(); // Refresh data
        alert('Incremental sync completed successfully');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Sync failed');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Sync Analytics</h2>
          <button
            onClick={triggerIncrementalSync}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Run Incremental Sync
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-600">
              {stats?.totalBuildings || 0}
            </div>
            <div className="text-sm text-blue-700 font-medium">Total Buildings</div>
          </div>

          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-600">
              {stats?.activeListings || 0}
            </div>
            <div className="text-sm text-green-700 font-medium">Active Listings</div>
          </div>

          <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
            <div className="text-2xl font-bold text-orange-600">
              {stats?.priceChanges || 0}
            </div>
            <div className="text-sm text-orange-700 font-medium">Price Changes (24h)</div>
          </div>

          <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-600">
              {stats?.statusChanges || 0}
            </div>
            <div className="text-sm text-purple-700 font-medium">Status Changes (24h)</div>
          </div>
        </div>

        {stats?.lastSyncTime && (
          <div className="text-sm text-gray-600 text-center">
            Last sync: {new Date(stats.lastSyncTime).toLocaleString()}
          </div>
        )}
      </div>

      {/* Recent Syncs */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Sync Activity</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-700">Building</th>
                <th className="text-left py-2 font-medium text-gray-700">Type</th>
                <th className="text-left py-2 font-medium text-gray-700">Status</th>
                <th className="text-left py-2 font-medium text-gray-700">Changes</th>
                <th className="text-left py-2 font-medium text-gray-700">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentSyncs.map((sync) => (
                <tr key={sync.id} className="border-b border-gray-100">
                  <td className="py-3 font-medium text-gray-900">
                    {sync.building_name}
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      sync.feed_type === 'dla' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {sync.feed_type === 'dla' ? 'Complete' : 'Incremental'}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      sync.sync_status === 'success' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {sync.sync_status}
                    </span>
                  </td>
                  <td className="py-3 text-gray-600">
                    {sync.listings_created > 0 && (
                      <span className="text-green-600">+{sync.listings_created} new</span>
                    )}
                    {sync.listings_created > 0 && sync.listings_updated > 0 && ', '}
                    {sync.listings_updated > 0 && (
                      <span className="text-blue-600">{sync.listings_updated} updated</span>
                    )}
                    {sync.listings_created === 0 && sync.listings_updated === 0 && (
                      <span className="text-gray-500">No changes</span>
                    )}
                  </td>
                  <td className="py-3 text-gray-500">
                    {new Date(sync.completed_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
