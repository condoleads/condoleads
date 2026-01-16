// app/admin/psf-analytics/psf-dashboard.tsx

'use client';

import { useState, useEffect } from 'react';
import PSFChart from './psf-chart';
import GeoTree from './geo-tree';

interface Stats {
  sale: { totalRecords: number; exactCount: number; midpointCount: number; fallbackCount: number; periodCount: number };
  lease: { totalRecords: number; exactCount: number; midpointCount: number; fallbackCount: number; periodCount: number };
  geography: { areas: number; municipalities: number; communities: number };
}

interface Log {
  id: string;
  calculation_type: string;
  geo_level: string;
  geo_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  sale_records_processed: number;
  lease_records_processed: number;
  duration_seconds: number | null;
}

interface Props {
  stats: Stats;
  logs: Log[];
}

export default function PSFDashboard({ stats, logs }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'sale' | 'lease' | 'calculate'>('overview');
  const [selectedGeo, setSelectedGeo] = useState<{ level: string; id: string; name: string } | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  
  // Calculate tab
  const [level, setLevel] = useState('municipalities');
  const [type, setType] = useState('both');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGeoSelect = async (level: string, id: string, name: string) => {
    setSelectedGeo({ level, id, name });
    await loadChartData(level, id, activeTab === 'lease' ? 'lease' : 'sale');
  };

  const loadChartData = async (level: string, geoId: string, type: string) => {
    setLoadingChart(true);
    try {
      const params = new URLSearchParams({
        type,
        level,
        geoId,
        months: '24',
      });
      const res = await fetch(`/api/admin/psf-analytics/results?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setChartData(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setLoadingChart(false);
    }
  };

  const handleCalculate = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/psf-analytics/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, type }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Calculation error:', err);
      setResult({ success: false, error: 'Calculation failed' });
    } finally {
      setIsRunning(false);
    }
  };

  // Load chart when tab changes
  useEffect(() => {
    if ((activeTab === 'sale' || activeTab === 'lease') && selectedGeo) {
      loadChartData(selectedGeo.level, selectedGeo.id, activeTab);
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['overview', 'sale', 'lease', 'calculate'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize transition ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'calculate' ? 'Run Calculations' : tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Areas" value={stats.geography.areas} />
            <StatCard label="Municipalities" value={stats.geography.municipalities} />
            <StatCard label="Communities" value={stats.geography.communities} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Sale Stats */}
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Sale PSF Data</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <StatCard label="Total Records" value={stats.sale.totalRecords.toLocaleString()} small />
                <StatCard label="Periods" value={stats.sale.periodCount} small />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MethodCard method="Exact" count={stats.sale.exactCount} color="green" />
                <MethodCard method="Midpoint" count={stats.sale.midpointCount} color="yellow" />
                <MethodCard method="Fallback" count={stats.sale.fallbackCount} color="red" />
              </div>
            </div>

            {/* Lease Stats */}
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Lease PSF Data</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <StatCard label="Total Records" value={stats.lease.totalRecords.toLocaleString()} small />
                <StatCard label="Periods" value={stats.lease.periodCount} small />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MethodCard method="Exact" count={stats.lease.exactCount} color="green" />
                <MethodCard method="Midpoint" count={stats.lease.midpointCount} color="yellow" />
                <MethodCard method="Fallback" count={stats.lease.fallbackCount} color="red" />
              </div>
            </div>
          </div>

          {/* Recent Calculations */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Calculations</h2>
            {logs.length === 0 ? (
              <p className="text-gray-500">No calculations run yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Level</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Records</th>
                    <th className="text-left py-2">Duration</th>
                    <th className="text-left py-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b">
                      <td className="py-2">{log.calculation_type}</td>
                      <td className="py-2">{log.geo_level}</td>
                      <td className="py-2">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-2">{(log.sale_records_processed || 0) + (log.lease_records_processed || 0)}</td>
                      <td className="py-2">{log.duration_seconds ? `${log.duration_seconds}s` : '-'}</td>
                      <td className="py-2">{new Date(log.started_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Sale/Lease Tabs */}
      {(activeTab === 'sale' || activeTab === 'lease') && (
        <div className="grid grid-cols-4 gap-6">
          {/* Left: Geo Tree */}
          <div className="col-span-1">
            <h3 className="font-semibold mb-3">Select Location</h3>
            <GeoTree
              onSelect={handleGeoSelect}
              selectedId={selectedGeo?.id || null}
              type={activeTab}
            />
          </div>

          {/* Right: Chart & Data */}
          <div className="col-span-3 space-y-6">
            {selectedGeo ? (
              <>
                <div className="bg-white border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">
                    {selectedGeo.name} - {activeTab === 'sale' ? 'Sale' : 'Lease'} PSF Trend
                  </h3>
                  {loadingChart ? (
                    <div className="h-64 flex items-center justify-center text-gray-500">
                      Loading chart...
                    </div>
                  ) : (
                    <PSFChart
                      data={chartData}
                      type={activeTab}
                      title=""
                    />
                  )}
                </div>

                {/* Data Table */}
                <div className="bg-white border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Monthly Data</h3>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b">
                          <th className="text-left py-2">Month</th>
                          <th className="text-right py-2">Avg PSF</th>
                          <th className="text-right py-2">Sample</th>
                          <th className="text-right py-2">w/ Parking</th>
                          <th className="text-right py-2">w/o Parking</th>
                          <th className="text-right py-2">Premium</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.map((row, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2">{row.period_year}-{row.period_month.toString().padStart(2, '0')}</td>
                            <td className="text-right py-2 font-medium">
                              ${row.all_avg_psf?.toFixed(2) || '-'}
                            </td>
                            <td className="text-right py-2">{row.all_sample_size}</td>
                            <td className="text-right py-2">${row.parking_avg_psf?.toFixed(2) || '-'}</td>
                            <td className="text-right py-2">${row.no_parking_avg_psf?.toFixed(2) || '-'}</td>
                            <td className="text-right py-2">
                              {row.parking_premium_psf ? (
                                <span className={row.parking_premium_psf > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {row.parking_premium_psf > 0 ? '+' : ''}${row.parking_premium_psf?.toFixed(2)}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-500">
                Select a location from the tree to view PSF data
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calculate Tab */}
      {activeTab === 'calculate' && (
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Run PSF Calculation</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Geographic Level</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  disabled={isRunning}
                >
                  <option value="gta">GTA (All)</option>
                  <option value="areas">All Areas</option>
                  <option value="municipalities">All Municipalities</option>
                  <option value="communities">All Communities</option>
                  <option value="buildings">All Buildings</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  disabled={isRunning}
                >
                  <option value="both">Both (Sale & Lease)</option>
                  <option value="sale">Sale Only</option>
                  <option value="lease">Lease Only</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleCalculate}
              disabled={isRunning}
              className={`px-6 py-3 rounded-lg font-medium transition ${
                isRunning ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isRunning ? 'Calculating... (This may take several minutes)' : 'Run Calculation'}
            </button>

            {result && (
              <div className={`mt-6 p-4 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <h3 className="font-semibold mb-3">
                  {result.success ? ' Calculation Complete' : ' Calculation Failed'}
                </h3>
                {result.success && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Sale Results:</p>
                      <p>Records: {result.sale?.processed?.toLocaleString() || 0}</p>
                      <p>Geographies: {result.sale?.geographies || 0}</p>
                      <p>Periods: {result.sale?.periods || 0}</p>
                    </div>
                    <div>
                      <p className="font-medium">Lease Results:</p>
                      <p>Records: {result.lease?.processed?.toLocaleString() || 0}</p>
                      <p>Geographies: {result.lease?.geographies || 0}</p>
                      <p>Periods: {result.lease?.periods || 0}</p>
                    </div>
                    <div className="col-span-2">
                      <p>Duration: {result.duration}s</p>
                    </div>
                  </div>
                )}
                {!result.success && <p className="text-red-600">{result.error}</p>}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-800 mb-2">Estimated Processing Time</h3>
            <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
              <li>GTA aggregate (~30 seconds)</li>
              <li>All Areas (~1 minute)</li>
              <li>All Municipalities (~5-10 minutes)</li>
              <li>All Communities (~20-30 minutes)</li>
              <li>All Buildings (~60+ minutes)</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className={`bg-gray-50 border rounded-lg ${small ? 'p-3' : 'p-4'}`}>
      <p className={`text-gray-500 ${small ? 'text-xs' : 'text-sm'}`}>{label}</p>
      <p className={`font-semibold ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}

function MethodCard({ method, count, color }: { method: string; count: number; color: string }) {
  const colors = {
    green: 'bg-green-100 border-green-300 text-green-800',
    yellow: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    red: 'bg-red-100 border-red-300 text-red-800',
  };
  return (
    <div className={`border rounded-lg p-2 text-center ${colors[color as keyof typeof colors]}`}>
      <p className="text-xs font-medium">{method}</p>
      <p className="text-sm font-bold">{count.toLocaleString()}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    completed: 'bg-green-100 text-green-700',
    running: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs ${styles[status as keyof typeof styles] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
}
