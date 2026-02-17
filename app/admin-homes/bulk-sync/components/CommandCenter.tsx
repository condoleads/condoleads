"use client";
import { useState, useEffect, useRef } from 'react';
import { Globe, Play, Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight, BarChart3, Zap, Clock, Database, AlertTriangle } from 'lucide-react';

interface AreaOverview {
  id: string; name: string; municipality_count: number; municipalities_synced: number;
  freehold_db: number; condo_db: number; total_db: number;
}
interface MuniDetail {
  id: string; name: string; total_db: number; is_synced: boolean; is_running: boolean;
  freehold: { db_count: number; last_sync: any }; condo: { db_count: number; last_sync: any };
}
interface AreaDetail { area: { id: string; name: string }; municipalities: MuniDetail[]; totals: any; }

type PropertyTypeFilter = 'freehold' | 'condo' | 'both';
const PT_LABELS: Record<PropertyTypeFilter, string> = { freehold: 'Freehold', condo: 'Condo', both: 'All Residential' };

interface SyncQueueItem {
  municipalityId: string; municipalityName: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  message?: string; stats?: any;
}

function formatNum(n: number): string { return n.toLocaleString(); }
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}
function formatDuration(s: number): string { return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }

export default function CommandCenter() {
  const [areas, setAreas] = useState<AreaOverview[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [areaDetail, setAreaDetail] = useState<AreaDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [propertyType, setPropertyType] = useState<PropertyTypeFilter>('both');
  const [concurrency, setConcurrency] = useState(3);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [grandTotal, setGrandTotal] = useState<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [syncLogs]);

  async function loadOverview() {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin-homes/area-sync-status');
      const data = await resp.json();
      setAreas(data.areas || []);
      setTotals(data.totals || null);
    } catch (err) { console.error('Failed to load overview:', err); }
    setLoading(false);
  }

  async function loadAreaDetail(areaId: string) {
    if (expandedArea === areaId) { setExpandedArea(null); setAreaDetail(null); return; }
    setExpandedArea(areaId);
    setLoadingDetail(true);
    try {
      const resp = await fetch('/api/admin-homes/area-sync-status?areaId=' + areaId);
      const data = await resp.json();
      setAreaDetail(data);
    } catch (err) { console.error('Failed to load area detail:', err); }
    setLoadingDetail(false);
  }

  async function syncArea(areaId: string) {
    if (isSyncing) return;
    // Load area detail to get municipality list with areaIds
    const resp = await fetch('/api/admin-homes/area-sync-status?areaId=' + areaId);
    const detail = await resp.json();
    if (!detail.municipalities) return;

    const munis = detail.municipalities.map((m: any) => ({ id: m.id, name: m.name, areaId }));
    startParallelSync(munis);
  }

  async function syncSelected(munis: { id: string; name: string; areaId: string }[]) {
    if (isSyncing || munis.length === 0) return;
    startParallelSync(munis);
  }

  async function startParallelSync(munis: { id: string; name: string; areaId: string }[]) {
    setIsSyncing(true);
    setSyncLogs([]);
    setGrandTotal(null);
    setSyncQueue(munis.map(m => ({ municipalityId: m.id, municipalityName: m.name, status: 'queued' })));

    try {
      const resp = await fetch('/api/admin-homes/parallel-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipalities: munis, propertyType, concurrency }),
      });

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5));
            handleSyncEvent(event);
          } catch {}
        }
      }
    } catch (err: any) {
      setSyncLogs(prev => [...prev, 'CONNECTION ERROR: ' + err.message]);
    }
    setIsSyncing(false);
    loadOverview(); // Refresh counts
  }

  function handleSyncEvent(event: any) {
    switch (event.type) {
      case 'queue':
        setSyncLogs(prev => [...prev, 'Queued ' + event.total + ' municipalities (concurrency: ' + event.concurrency + ', type: ' + event.propertyType + ')']);
        break;
      case 'municipality_start':
        setSyncQueue(prev => prev.map(q => q.municipalityId === event.municipalityId ? { ...q, status: 'running' } : q));
        setSyncLogs(prev => [...prev, ' STARTED: ' + event.municipalityName]);
        break;
      case 'municipality_progress':
        setSyncQueue(prev => prev.map(q => q.municipalityId === event.municipalityId ? { ...q, message: event.message } : q));
        setSyncLogs(prev => [...prev, '[' + event.municipalityName + '] ' + event.message]);
        break;
      case 'municipality_complete':
        setSyncQueue(prev => prev.map(q => q.municipalityId === event.municipalityId ? { ...q, status: 'complete', stats: event.stats } : q));
        setSyncLogs(prev => [...prev, ' COMPLETE: ' + event.municipalityName + '  ' + (event.stats?.listings || 0) + ' listings']);
        break;
      case 'municipality_error':
        setSyncQueue(prev => prev.map(q => q.municipalityId === event.municipalityId ? { ...q, status: 'error', message: event.error } : q));
        setSyncLogs(prev => [...prev, ' FAILED: ' + event.municipalityName + '  ' + event.error]);
        break;
      case 'complete':
        setGrandTotal(event);
        setSyncLogs(prev => [...prev, '', ' SYNC COMPLETE ', 'Total: ' + (event.grandTotal?.listings || 0) + ' listings | ' + (event.grandTotal?.media || 0) + ' media | Duration: ' + formatDuration(event.totalDuration || 0), 'Succeeded: ' + event.succeeded + ' | Failed: ' + event.failed]);
        break;
    }
  }

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      {/* GRAND TOTALS BAR */}
      {totals && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Globe className="w-4 h-4" /> MLS Sync Command Center</h3>
            <button onClick={loadOverview} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Loader2 className="w-3 h-3" /> Refresh</button>
          </div>
          <div className="grid grid-cols-6 gap-3">
            <div className="text-center bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Areas</p>
              <p className="text-lg font-bold text-gray-800">{totals.total_areas}</p>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Municipalities</p>
              <p className="text-lg font-bold text-gray-800">{totals.total_municipalities}</p>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Munis Synced</p>
              <p className="text-lg font-bold text-blue-700">{totals.total_synced_munis}</p>
            </div>
            <div className="text-center bg-green-50 rounded-lg p-2">
              <p className="text-xs text-green-600">Freehold</p>
              <p className="text-lg font-bold text-green-700">{formatNum(totals.total_freehold)}</p>
            </div>
            <div className="text-center bg-blue-50 rounded-lg p-2">
              <p className="text-xs text-blue-600">Condo</p>
              <p className="text-lg font-bold text-blue-700">{formatNum(totals.total_condo)}</p>
            </div>
            <div className="text-center bg-purple-50 rounded-lg p-2">
              <p className="text-xs text-purple-600">Total Listings</p>
              <p className="text-lg font-bold text-purple-700">{formatNum(totals.total_listings)}</p>
            </div>
          </div>
        </div>
      )}

      {/* CONTROLS ROW */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 font-medium">Property Type:</label>
          <select value={propertyType} onChange={e => setPropertyType(e.target.value as PropertyTypeFilter)} className="text-xs border border-gray-300 rounded px-2 py-1" disabled={isSyncing}>
            <option value="both">All Residential</option>
            <option value="freehold">Freehold Only</option>
            <option value="condo">Condo Only</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 font-medium">Parallel:</label>
          <select value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} className="text-xs border border-gray-300 rounded px-2 py-1" disabled={isSyncing}>
            <option value={1}>1 (Sequential)</option>
            <option value={2}>2 Parallel</option>
            <option value={3}>3 Parallel</option>
            <option value={5}>5 Parallel</option>
          </select>
        </div>
        {isSyncing && <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Sync in progress...</span>}
      </div>

      {/* AREA TABLE */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-600">
              <th className="py-2 px-3 text-left font-medium w-8"></th>
              <th className="py-2 px-3 text-left font-medium">Area</th>
              <th className="py-2 px-3 text-right font-medium">Munis</th>
              <th className="py-2 px-3 text-right font-medium">Synced</th>
              <th className="py-2 px-3 text-right font-medium text-green-700">Freehold</th>
              <th className="py-2 px-3 text-right font-medium text-blue-700">Condo</th>
              <th className="py-2 px-3 text-right font-medium">Total</th>
              <th className="py-2 px-3 text-center font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {areas.filter(a => a.municipality_count > 0).sort((a, b) => b.total_db - a.total_db).map(area => (
              <>
                <tr key={area.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => loadAreaDetail(area.id)}>
                  <td className="py-2 px-3">
                    {expandedArea === area.id ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                  </td>
                  <td className="py-2 px-3 font-medium text-gray-800">{area.name}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{area.municipality_count}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={area.municipalities_synced > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>{area.municipalities_synced}/{area.municipality_count}</span>
                  </td>
                  <td className="py-2 px-3 text-right text-green-700">{formatNum(area.freehold_db)}</td>
                  <td className="py-2 px-3 text-right text-blue-700">{formatNum(area.condo_db)}</td>
                  <td className="py-2 px-3 text-right font-medium text-gray-800">{formatNum(area.total_db)}</td>
                  <td className="py-2 px-3 text-center">
                    <button onClick={(e) => { e.stopPropagation(); syncArea(area.id); }} disabled={isSyncing}
                      className="px-2 py-1 bg-purple-600 text-white rounded text-[10px] font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1 mx-auto">
                      <Zap className="w-3 h-3" /> Sync Area
                    </button>
                  </td>
                </tr>
                {expandedArea === area.id && areaDetail && (
                  <tr key={area.id + '-detail'}>
                    <td colSpan={8} className="p-0">
                      <div className="bg-gray-50 border-t px-6 py-3">
                        {loadingDetail ? (
                          <div className="flex items-center gap-2 text-gray-500 text-xs py-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading municipalities...</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-500"><th className="py-1 text-left font-medium">Municipality</th><th className="py-1 text-right font-medium text-green-600">Freehold</th><th className="py-1 text-right font-medium text-blue-600">Condo</th><th className="py-1 text-right font-medium">Total</th><th className="py-1 text-right font-medium">Last Sync</th><th className="py-1 text-center font-medium">Status</th></tr></thead>
                            <tbody>
                              {areaDetail.municipalities.sort((a: MuniDetail, b: MuniDetail) => b.total_db - a.total_db).map((m: MuniDetail) => (
                                <tr key={m.id} className="border-b border-gray-100">
                                  <td className="py-1.5 text-gray-700 font-medium">{m.name}</td>
                                  <td className="py-1.5 text-right text-green-700">{formatNum(m.freehold.db_count)}</td>
                                  <td className="py-1.5 text-right text-blue-700">{formatNum(m.condo.db_count)}</td>
                                  <td className="py-1.5 text-right font-medium">{formatNum(m.total_db)}</td>
                                  <td className="py-1.5 text-right text-gray-500">
                                    {m.freehold.last_sync?.completed_at ? formatDate(m.freehold.last_sync.completed_at) : m.condo.last_sync?.completed_at ? formatDate(m.condo.last_sync.completed_at) : ''}
                                  </td>
                                  <td className="py-1.5 text-center">
                                    {m.is_running ? <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">Running</span> :
                                     m.is_synced ? <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">Synced</span> :
                                     <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">Not synced</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* LIVE SYNC QUEUE */}
      {syncQueue.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-purple-600" /> Sync Queue ({syncQueue.filter(q => q.status === 'complete').length}/{syncQueue.length})</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {syncQueue.map(q => (
              <div key={q.municipalityId} className={'rounded-lg p-2 border text-xs flex items-center gap-2 ' +
                (q.status === 'complete' ? 'bg-green-50 border-green-200' :
                 q.status === 'running' ? 'bg-blue-50 border-blue-200' :
                 q.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
                {q.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-shrink-0" /> :
                 q.status === 'complete' ? <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" /> :
                 q.status === 'error' ? <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" /> :
                 <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{q.municipalityName}</p>
                  {q.message && <p className="text-[10px] text-gray-500 truncate">{q.message}</p>}
                  {q.stats && <p className="text-[10px] text-green-600">{formatNum(q.stats.listings)} listings</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Live Logs */}
          <div className="bg-gray-900 text-green-400 rounded-lg p-3 font-mono text-[10px] max-h-48 overflow-y-auto">
            {syncLogs.map((log, i) => (
              <div key={i} className={
                log.startsWith('') ? 'text-green-400 font-bold' :
                log.startsWith('') ? 'text-red-400 font-bold' :
                log.startsWith('') ? 'text-yellow-300 font-bold' :
                log.startsWith('') ? 'text-purple-400 font-bold mt-1' :
                'text-gray-400'
              }>{log}</div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Grand Total Summary */}
          {grandTotal && (
            <div className="mt-3 grid grid-cols-6 gap-2 bg-purple-50 rounded-lg p-3">
              <div className="text-center"><p className="text-sm font-bold text-purple-700">{formatNum(grandTotal.grandTotal?.listings || 0)}</p><p className="text-[9px] text-purple-600">Listings</p></div>
              <div className="text-center"><p className="text-sm font-bold text-purple-700">{formatNum(grandTotal.grandTotal?.media || 0)}</p><p className="text-[9px] text-purple-600">Media</p></div>
              <div className="text-center"><p className="text-sm font-bold text-purple-700">{formatNum(grandTotal.grandTotal?.rooms || 0)}</p><p className="text-[9px] text-purple-600">Rooms</p></div>
              <div className="text-center"><p className="text-sm font-bold text-green-700">{grandTotal.succeeded}</p><p className="text-[9px] text-green-600">Succeeded</p></div>
              <div className="text-center"><p className="text-sm font-bold text-red-700">{grandTotal.failed}</p><p className="text-[9px] text-red-600">Failed</p></div>
              <div className="text-center"><p className="text-sm font-bold text-gray-700">{formatDuration(grandTotal.totalDuration || 0)}</p><p className="text-[9px] text-gray-600">Duration</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
