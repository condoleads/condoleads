"use client";
import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Home, MapPin, RefreshCw, Search, CheckCircle, Clock, Loader2, Play, AlertTriangle, Database, Cloud, BarChart3, History, XCircle } from 'lucide-react';

type PropertyTypeFilter = 'freehold' | 'condo' | 'both';

interface Area { id: string; name: string; homes_count: number; municipalities: Municipality[]; }
interface Municipality { id: string; name: string; homes_count: number; communities: Community[]; }
interface Community { id: string; name: string; homes_count: number; }
interface SyncSummary { listings: number; media: number; rooms: number; openHouses: number; skipped: number; }

interface SyncStatusBreakdown { active: number; closed: number; expired: number; other: number; }
interface LastSync { id: string; completed_at: string; duration_seconds: number; listings_found: number; listings_created: number; listings_skipped: number; media_saved: number; rooms_saved: number; sync_status: string; }
interface TypeStatus { proptx_count: number; db_count: number; gap: number | null; coverage_pct: number | null; breakdown: SyncStatusBreakdown; last_sync: LastSync | null; }
interface SyncHistoryRecord { id: string; property_type: string; sync_status: string; started_at: string; completed_at: string; duration_seconds: number; listings_found: number; listings_created: number; listings_skipped: number; media_saved: number; rooms_saved: number; error_details: string | null; triggered_by: string; }
interface SyncStatus { municipality: { id: string; name: string }; freehold: TypeStatus; condo: TypeStatus; total: { proptx_count: number | null; db_count: number }; running_syncs: any[]; recent_history: SyncHistoryRecord[]; }

const PT_LABELS: Record<PropertyTypeFilter, string> = { freehold: 'Freehold', condo: 'Condo', both: 'All Residential' };
const PT_COLORS: Record<PropertyTypeFilter, string> = { freehold: 'bg-green-600 text-white', condo: 'bg-blue-600 text-white', both: 'bg-purple-600 text-white' };

function formatDuration(seconds: number): string {
  if (seconds < 60) return seconds + 's';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + 'm ' + s + 's';
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'completed' ? 'bg-green-100 text-green-700' :
    status === 'running' ? 'bg-blue-100 text-blue-700' :
    status === 'failed' ? 'bg-red-100 text-red-700' :
    status === 'interrupted' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700';
  return <span className={'px-2 py-0.5 rounded text-xs font-medium ' + cls}>{status}</span>;
}

function CoverageBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-gray-400">No PropTx data</span>;
  const color = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">Coverage</span>
        <span className={'font-semibold ' + (pct >= 90 ? 'text-green-700' : pct >= 60 ? 'text-yellow-700' : 'text-red-700')}>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={color + ' h-2 rounded-full transition-all'} style={{ width: Math.min(pct, 100) + '%' }} />
      </div>
    </div>
  );
}

export default function HomesBulkSync() {
  const [geoTree, setGeoTree] = useState<Area[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedMunis, setExpandedMunis] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [selArea, setSelArea] = useState<Area | null>(null);
  const [selMuni, setSelMuni] = useState<Municipality | null>(null);
  const [selComm, setSelComm] = useState<Community | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [syncingType, setSyncingType] = useState<PropertyTypeFilter | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadGeoTree(); }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [syncLogs]);

  const loadGeoTree = async () => {
    try {
      setLoading(true);
      const r = await fetch('/api/admin-homes/geo-tree');
      const d = await r.json();
      if (d.success) setGeoTree(d.tree);
    } catch (e) { console.error('Geo tree failed:', e); }
    finally { setLoading(false); }
  };

  const toggleArea = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const s = new Set(expandedAreas);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedAreas(s);
  };

  const toggleMuni = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const s = new Set(expandedMunis);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedMunis(s);
  };

  const loadSyncStatus = async (muniId: string, muniName: string, commName?: string) => {
    setStatusLoading(true);
    setSyncStatus(null);
    try {
      const params = new URLSearchParams({ municipalityId: muniId, municipalityName: muniName });
      if (commName) params.set('communityName', commName);
      const r = await fetch('/api/admin-homes/sync-status?' + params);
      const d = await r.json();
      if (!d.error) setSyncStatus(d);
    } catch (e) { console.error('Sync status failed:', e); }
    finally { setStatusLoading(false); }
  };

  const handleSelectMuni = (muni: Municipality, area: Area) => {
    setSelArea(area); setSelMuni(muni); setSelComm(null);
    setSyncLogs([]); setSyncSummary(null); setSyncingType(null);
    loadSyncStatus(muni.id, muni.name);
  };

  const handleSelectComm = (comm: Community, muni: Municipality, area: Area) => {
    setSelArea(area); setSelMuni(muni); setSelComm(comm);
    setSyncLogs([]); setSyncSummary(null); setSyncingType(null);
    loadSyncStatus(muni.id, muni.name, comm.name);
  };

  const handleSync = async (pt: PropertyTypeFilter) => {
    if (!selMuni) return;
    setSyncingType(pt); setSyncLogs([]); setSyncSummary(null);
    try {
      const r = await fetch('/api/admin-homes/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipalityId: selMuni.id,
          municipalityName: selMuni.name,
          communityId: selComm?.id || undefined,
          communityName: selComm?.name || undefined,
          propertyType: pt,
          triggeredBy: 'manual-dashboard'
        })
      });
      const reader = r.body?.getReader();
      if (!reader) { setSyncingType(null); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const data = JSON.parse(line.substring(5));
            if (data.type === 'progress') setSyncLogs(prev => [...prev, data.message]);
            else if (data.type === 'complete') {
              setSyncSummary(data.summary);
              setSyncLogs(prev => [...prev, 'Sync complete! Duration: ' + (data.duration ? formatDuration(data.duration) : 'N/A')]);
              loadGeoTree();
              // Refresh sync status after completion
              loadSyncStatus(selMuni.id, selMuni.name, selComm?.name);
            } else if (data.type === 'error') {
              setSyncLogs(prev => [...prev, 'ERROR: ' + data.message]);
            }
          } catch {}
        }
      }
    } catch (e: any) { setSyncLogs(prev => [...prev, 'ERROR: ' + e.message]); }
    setSyncingType(null);
  };

  const getHomeBadge = (count: number) => {
    if (count === 0) return <span className="text-xs text-gray-400">&mdash;</span>;
    return <span className="text-xs text-green-600 font-medium">{count.toLocaleString()}</span>;
  };

  const locationLabel = selComm?.name || selMuni?.name || '';

  // Render a type status card (Freehold or Condo)
  const renderTypeCard = (label: string, typeStatus: TypeStatus, pt: PropertyTypeFilter, borderColor: string, bgColor: string) => {
    const isSyncing = syncingType === pt || syncingType === 'both';
    return (
      <div className={'rounded-lg border-2 p-4 ' + borderColor}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={'text-sm font-bold ' + (pt === 'freehold' ? 'text-green-700' : 'text-blue-700')}>{label}</h3>
          {typeStatus.last_sync && <StatusBadge status={typeStatus.last_sync.sync_status} />}
        </div>

        {/* PropTx vs DB */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className={bgColor + ' rounded p-2 text-center'}>
            <div className="flex items-center justify-center gap-1 mb-1"><Cloud className="w-3 h-3 opacity-60" /></div>
            <p className="text-lg font-bold">{typeStatus.proptx_count >= 0 ? typeStatus.proptx_count.toLocaleString() : '?'}</p>
            <p className="text-[10px] opacity-70">PropTx</p>
          </div>
          <div className={bgColor + ' rounded p-2 text-center'}>
            <div className="flex items-center justify-center gap-1 mb-1"><Database className="w-3 h-3 opacity-60" /></div>
            <p className="text-lg font-bold">{typeStatus.db_count.toLocaleString()}</p>
            <p className="text-[10px] opacity-70">In DB</p>
          </div>
          <div className={bgColor + ' rounded p-2 text-center'}>
            <div className="flex items-center justify-center gap-1 mb-1"><BarChart3 className="w-3 h-3 opacity-60" /></div>
            <p className={'text-lg font-bold ' + (typeStatus.gap && typeStatus.gap > 0 ? 'text-red-600' : 'text-green-600')}>
              {typeStatus.gap !== null ? (typeStatus.gap > 0 ? '+' + typeStatus.gap.toLocaleString() : typeStatus.gap.toLocaleString()) : '?'}
            </p>
            <p className="text-[10px] opacity-70">Gap</p>
          </div>
        </div>

        <CoverageBar pct={typeStatus.coverage_pct} />

        {/* DB Breakdown */}
        <div className="flex gap-2 mt-3 text-[10px]">
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Active: {typeStatus.breakdown.active}</span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Closed: {typeStatus.breakdown.closed}</span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Expired: {typeStatus.breakdown.expired}</span>
        </div>

        {/* Last sync info */}
        {typeStatus.last_sync && (
          <div className="mt-3 text-[10px] text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last sync: {formatDate(typeStatus.last_sync.completed_at)} ({formatDuration(typeStatus.last_sync.duration_seconds)})
            — {typeStatus.last_sync.listings_created} saved, {typeStatus.last_sync.media_saved} media
          </div>
        )}
        {!typeStatus.last_sync && (
          <div className="mt-3 text-[10px] text-yellow-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Never synced
          </div>
        )}

        {/* Sync button */}
        <button
          onClick={() => handleSync(pt)}
          disabled={isSyncing || syncingType !== null}
          className={'mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ' +
            (pt === 'freehold' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-blue-600 text-white hover:bg-blue-700')}
        >
          {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isSyncing ? 'Syncing...' : 'Sync ' + label}
        </button>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Sync — Residential Properties</h1>
          <p className="text-gray-600">PropTx vs Database — full coverage dashboard</p>
        </div>
        <button onClick={loadGeoTree} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: Geo Tree */}
        <div className="col-span-4 bg-white rounded-lg border border-gray-200 p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" /> Geographic Areas
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (
            <div className="space-y-1">
              {geoTree.map(area => (
                <div key={area.id} className="border-b border-gray-100 last:border-0">
                  <div className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50">
                    <button onClick={(e) => toggleArea(area.id, e)} className="flex items-center gap-2 flex-1 text-left">
                      {expandedAreas.has(area.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <span className="font-medium text-gray-900 text-sm">{area.name}</span>
                    </button>
                    {getHomeBadge(area.homes_count)}
                  </div>
                  {expandedAreas.has(area.id) && (
                    <div className="ml-4 space-y-1">
                      {area.municipalities.map(muni => (
                        <div key={muni.id}>
                          <div className={`flex items-center justify-between py-1 px-2 rounded ${selMuni?.id === muni.id && !selComm ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'}`}>
                            <div className="flex items-center gap-1 flex-1">
                              <button onClick={(e) => toggleMuni(muni.id, e)} className="p-0.5">
                                {expandedMunis.has(muni.id) ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                              </button>
                              <button onClick={() => handleSelectMuni(muni, area)} className="text-sm text-gray-700 hover:text-green-600">{muni.name}</button>
                            </div>
                            <div className="flex items-center gap-1">
                              {getHomeBadge(muni.homes_count)}
                            </div>
                          </div>
                          {expandedMunis.has(muni.id) && (
                            <div className="ml-6 space-y-1">
                              {muni.communities.map(comm => (
                                <div key={comm.id} className={`flex items-center justify-between py-1 px-2 rounded ${selComm?.id === comm.id ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'}`}>
                                  <button onClick={() => handleSelectComm(comm, muni, area)} className="text-xs text-gray-600 hover:text-green-600 text-left flex-1">{comm.name}</button>
                                  {getHomeBadge(comm.homes_count)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Dashboard */}
        <div className="col-span-8 space-y-4">
          {/* Header + breadcrumb */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Home className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold text-gray-900 text-lg">{locationLabel || 'Select a municipality'}</h2>
              {statusLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            {selArea && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <span className="text-green-600">{selArea.name}</span>
                {selMuni && (<><ChevronRight className="w-3 h-3" /><span className={selComm ? 'text-green-600' : 'text-green-700 font-medium'}>{selMuni.name}</span></>)}
                {selComm && (<><ChevronRight className="w-3 h-3" /><span className="text-green-700 font-medium">{selComm.name}</span></>)}
              </p>
            )}
          </div>

          {!selMuni && (
            <div className="bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-500">
              <Home className="w-12 h-12 mb-4 text-gray-300" />
              <p>Click any municipality to see PropTx vs DB coverage</p>
            </div>
          )}

          {/* Sync Status Cards */}
          {syncStatus && (
            <>
              {/* Running sync warning */}
              {syncStatus.running_syncs.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm text-blue-800">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sync in progress for {syncStatus.running_syncs.map(s => s.property_type).join(', ')} — started {formatDate(syncStatus.running_syncs[0].started_at)}
                </div>
              )}

              {/* Total summary bar */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1"><Cloud className="w-3 h-3" /> PropTx Total</p>
                    <p className="text-2xl font-bold text-gray-800">{syncStatus.total.proptx_count !== null ? syncStatus.total.proptx_count.toLocaleString() : '?'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1"><Database className="w-3 h-3" /> DB Total</p>
                    <p className="text-2xl font-bold text-green-700">{syncStatus.total.db_count.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Overall Gap</p>
                    <p className={'text-2xl font-bold ' + (syncStatus.total.proptx_count !== null && syncStatus.total.proptx_count - syncStatus.total.db_count > 0 ? 'text-red-600' : 'text-green-600')}>
                      {syncStatus.total.proptx_count !== null ? (syncStatus.total.proptx_count - syncStatus.total.db_count > 0 ? '+' : '') + (syncStatus.total.proptx_count - syncStatus.total.db_count).toLocaleString() : '?'}
                    </p>
                  </div>
                </div>
                {/* Sync All button */}
                <div className="mt-4 pt-3 border-t flex justify-center">
                  <button
                    onClick={() => handleSync('both')}
                    disabled={syncingType !== null}
                    className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {syncingType === 'both' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {syncingType === 'both' ? 'Syncing All...' : 'Sync All Residential'}
                  </button>
                </div>
              </div>

              {/* Freehold + Condo side by side */}
              <div className="grid grid-cols-2 gap-4">
                {renderTypeCard('Freehold', syncStatus.freehold, 'freehold', 'border-green-200', 'bg-green-50')}
                {renderTypeCard('Condo', syncStatus.condo, 'condo', 'border-blue-200', 'bg-blue-50')}
              </div>

              {/* Sync Logs (when syncing) */}
              {(syncingType || syncSummary) && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    {syncingType ? <><Loader2 className="w-4 h-4 animate-spin text-green-500" /> Sync Progress</> : <><CheckCircle className="w-4 h-4 text-green-500" /> Sync Complete</>}
                  </h3>
                  <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs max-h-60 overflow-y-auto">
                    {syncLogs.map((log, i) => (
                      <div key={i} className={'py-0.5 ' + (log.startsWith('ERROR') ? 'text-red-400' : log.startsWith('---') ? 'text-yellow-300 font-bold' : '')}>
                        {log}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                  {syncSummary && (
                    <div className="mt-3 grid grid-cols-5 gap-2 bg-green-50 rounded-lg p-3">
                      <div className="text-center"><p className="text-lg font-bold text-green-700">{syncSummary.listings.toLocaleString()}</p><p className="text-[10px] text-green-600">Listings</p></div>
                      <div className="text-center"><p className="text-lg font-bold text-green-700">{syncSummary.media.toLocaleString()}</p><p className="text-[10px] text-green-600">Media</p></div>
                      <div className="text-center"><p className="text-lg font-bold text-green-700">{syncSummary.rooms.toLocaleString()}</p><p className="text-[10px] text-green-600">Rooms</p></div>
                      <div className="text-center"><p className="text-lg font-bold text-green-700">{syncSummary.openHouses.toLocaleString()}</p><p className="text-[10px] text-green-600">Open Houses</p></div>
                      <div className="text-center"><p className="text-lg font-bold text-gray-500">{syncSummary.skipped.toLocaleString()}</p><p className="text-[10px] text-gray-400">Skipped</p></div>
                    </div>
                  )}
                </div>
              )}

              {/* Sync History */}
              {syncStatus.recent_history.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" /> Sync History — {locationLabel}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="py-2 text-left font-medium">Date</th>
                          <th className="py-2 text-left font-medium">Type</th>
                          <th className="py-2 text-left font-medium">Status</th>
                          <th className="py-2 text-right font-medium">Found</th>
                          <th className="py-2 text-right font-medium">Saved</th>
                          <th className="py-2 text-right font-medium">Media</th>
                          <th className="py-2 text-right font-medium">Skipped</th>
                          <th className="py-2 text-right font-medium">Duration</th>
                          <th className="py-2 text-left font-medium">Trigger</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncStatus.recent_history.map(h => (
                          <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 text-gray-600">{formatDate(h.started_at)}</td>
                            <td className="py-2">
                              <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (h.property_type === 'Residential Freehold' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                                {h.property_type === 'Residential Freehold' ? 'Freehold' : 'Condo'}
                              </span>
                            </td>
                            <td className="py-2"><StatusBadge status={h.sync_status} /></td>
                            <td className="py-2 text-right text-gray-700">{(h.listings_found || 0).toLocaleString()}</td>
                            <td className="py-2 text-right text-green-700 font-medium">{(h.listings_created || 0).toLocaleString()}</td>
                            <td className="py-2 text-right text-gray-600">{(h.media_saved || 0).toLocaleString()}</td>
                            <td className="py-2 text-right text-gray-400">{(h.listings_skipped || 0).toLocaleString()}</td>
                            <td className="py-2 text-right text-gray-600">{h.duration_seconds ? formatDuration(h.duration_seconds) : '—'}</td>
                            <td className="py-2 text-gray-400">{h.triggered_by || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {syncStatus.recent_history.some(h => h.error_details) && (
                    <div className="mt-2">
                      {syncStatus.recent_history.filter(h => h.error_details).map(h => (
                        <div key={h.id} className="text-[10px] text-red-600 bg-red-50 rounded p-2 mt-1 flex items-start gap-1">
                          <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          {formatDate(h.started_at)}: {h.error_details}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}