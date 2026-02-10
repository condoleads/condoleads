"use client";
import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Home, MapPin, RefreshCw, Search, CheckCircle, Clock, Loader2, Download, Play } from 'lucide-react';

type PropertyTypeFilter = 'freehold' | 'condo' | 'both';

interface Area { id: string; name: string; homes_count: number; municipalities: Municipality[]; }
interface Municipality { id: string; name: string; homes_count: number; communities: Community[]; }
interface Community { id: string; name: string; homes_count: number; }
interface Preview { forSale: number; forLease: number; sold: number; leased: number; }
interface SyncSummary { listings: number; media: number; rooms: number; openHouses: number; skipped: number; }

const PT_LABELS: Record<PropertyTypeFilter, string> = {
  freehold: 'Freehold',
  condo: 'Condo',
  both: 'All Residential'
};

const PT_COLORS: Record<PropertyTypeFilter, string> = {
  freehold: 'bg-green-600 text-white',
  condo: 'bg-blue-600 text-white',
  both: 'bg-purple-600 text-white'
};

export default function HomesBulkSync() {
  const [geoTree, setGeoTree] = useState<Area[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedMunis, setExpandedMunis] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [selArea, setSelArea] = useState<Area | null>(null);
  const [selMuni, setSelMuni] = useState<Municipality | null>(null);
  const [selComm, setSelComm] = useState<Community | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyTypeFilter>('freehold');

  const [mode, setMode] = useState<'empty' | 'dbStats' | 'preview' | 'syncing' | 'complete'>('empty');
  const [dbStats, setDbStats] = useState<{total: number; active: number; sold: number; leased: number; subtypes: Record<string, number>} | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
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

  const loadDbStats = async (areaId?: string, muniId?: string, commId?: string) => {
    try {
      const params = new URLSearchParams();
      if (commId) params.set('communityId', commId);
      else if (muniId) params.set('municipalityId', muniId);
      else if (areaId) params.set('areaId', areaId);
      params.set('propertyType', propertyType);
      const r = await fetch('/api/admin-homes/db-stats?' + params);
      const d = await r.json();
      if (d.success) { setDbStats(d.stats); setMode('dbStats'); }
    } catch (e) { console.error('DB stats failed:', e); }
  };

  const handleSelectMuni = (muni: Municipality, area: Area) => {
    setSelArea(area); setSelMuni(muni); setSelComm(null);
    setPreview(null); setSyncLogs([]); setSyncSummary(null);
    loadDbStats(undefined, muni.id);
  };

  const handleSelectComm = (comm: Community, muni: Municipality, area: Area) => {
    setSelArea(area); setSelMuni(muni); setSelComm(comm);
    setPreview(null); setSyncLogs([]); setSyncSummary(null);
    loadDbStats(undefined, undefined, comm.id);
  };

  const handleSelectArea = (area: Area) => {
    setSelArea(area); setSelMuni(null); setSelComm(null);
    setPreview(null); setSyncLogs([]); setSyncSummary(null);
    loadDbStats(area.id);
  };

  // Re-fetch stats when property type changes
  const handlePropertyTypeChange = (pt: PropertyTypeFilter) => {
    setPropertyType(pt);
    setPreview(null); setSyncLogs([]); setSyncSummary(null);
    // Re-fetch db stats if a location is selected
    if (selComm) {
      const params = new URLSearchParams({ communityId: selComm.id, propertyType: pt });
      fetch('/api/admin-homes/db-stats?' + params).then(r => r.json()).then(d => { if (d.success) { setDbStats(d.stats); setMode('dbStats'); } });
    } else if (selMuni) {
      const params = new URLSearchParams({ municipalityId: selMuni.id, propertyType: pt });
      fetch('/api/admin-homes/db-stats?' + params).then(r => r.json()).then(d => { if (d.success) { setDbStats(d.stats); setMode('dbStats'); } });
    } else if (selArea) {
      const params = new URLSearchParams({ areaId: selArea.id, propertyType: pt });
      fetch('/api/admin-homes/db-stats?' + params).then(r => r.json()).then(d => { if (d.success) { setDbStats(d.stats); setMode('dbStats'); } });
    }
  };

  const handlePreviewMuni = async (muni: Municipality, area: Area) => {
    setSelArea(area); setSelMuni(muni); setSelComm(null);
    setSyncLogs([]); setSyncSummary(null);
    setPreviewing(true); setMode('preview');
    try {
      const r = await fetch('/api/admin-homes/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipalityName: muni.name, propertyType })
      });
      const d = await r.json();
      if (d.success) setPreview(d.counts); else setPreview(null);
    } catch (e) { console.error('Preview failed:', e); }
    finally { setPreviewing(false); }
  };

  const handlePreviewComm = async (comm: Community, muni: Municipality, area: Area) => {
    setSelArea(area); setSelMuni(muni); setSelComm(comm);
    setSyncLogs([]); setSyncSummary(null);
    setPreviewing(true); setMode('preview');
    try {
      const r = await fetch('/api/admin-homes/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipalityName: muni.name, communityName: comm.name, propertyType })
      });
      const d = await r.json();
      if (d.success) setPreview(d.counts); else setPreview(null);
    } catch (e) { console.error('Preview failed:', e); }
    finally { setPreviewing(false); }
  };

  const handleSync = async () => {
    if (!selMuni) return;
    setSyncing(true); setMode('syncing');
    setSyncLogs([]); setSyncSummary(null);
    try {
      const r = await fetch('/api/admin-homes/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipalityId: selMuni.id,
          municipalityName: selMuni.name,
          communityName: selComm?.name || undefined,
          propertyType
        })
      });
      const reader = r.body?.getReader();
      if (!reader) { setSyncing(false); return; }
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
              setSyncLogs(prev => [...prev, 'Sync complete!']);
              setMode('complete');
              loadGeoTree();
            } else if (data.type === 'error') {
              setSyncLogs(prev => [...prev, 'Error: ' + data.message]);
            }
          } catch {}
        }
      }
    } catch (e: any) { setSyncLogs(prev => [...prev, 'Error: ' + e.message]); }
    setSyncing(false);
  };

  const getHomeBadge = (count: number) => {
    if (count === 0) return <span className="text-xs text-gray-400">&mdash;</span>;
    return <span className="text-xs text-green-600 font-medium">{count.toLocaleString()}</span>;
  };

  const locationLabel = selComm?.name || selMuni?.name || selArea?.name || '';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Sync Residential Properties</h1>
          <p className="text-gray-600">Sync freehold and condo properties from PropTx by geographic area</p>
        </div>
        <button onClick={loadGeoTree} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT PANEL */}
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
                  <div className={`flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50 ${selArea?.id === area.id && !selMuni ? 'bg-green-50 border border-green-200' : ''}`}>
                    <button onClick={(e) => { toggleArea(area.id, e); handleSelectArea(area); }} className="flex items-center gap-2 flex-1 text-left">
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
                              <button onClick={(e) => { e.stopPropagation(); handlePreviewMuni(muni, area); }} className="p-1 text-green-600 hover:bg-green-50 rounded" title={'Preview in ' + muni.name}>
                                <Search className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {expandedMunis.has(muni.id) && (
                            <div className="ml-6 space-y-1">
                              {muni.communities.map(comm => (
                                <div key={comm.id} className={`flex items-center justify-between py-1 px-2 rounded ${selComm?.id === comm.id ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'}`}>
                                  <button onClick={() => handleSelectComm(comm, muni, area)} className="text-xs text-gray-600 hover:text-green-600 text-left flex-1">{comm.name}</button>
                                  <div className="flex items-center gap-1">
                                    {getHomeBadge(comm.homes_count)}
                                    <button onClick={(e) => { e.stopPropagation(); handlePreviewComm(comm, muni, area); }} className="p-1 text-green-600 hover:bg-green-50 rounded" title={'Preview in ' + comm.name}>
                                      <Search className="w-3 h-3" />
                                    </button>
                                  </div>
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

        {/* RIGHT PANEL */}
        <div className="col-span-8 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Home className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold text-gray-900">{locationLabel ? locationLabel : 'Select a location'}</h2>
            </div>

            {/* Property Type Selector */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['freehold', 'condo', 'both'] as PropertyTypeFilter[]).map(pt => (
                <button
                  key={pt}
                  onClick={() => handlePropertyTypeChange(pt)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    propertyType === pt ? PT_COLORS[pt] : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {PT_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>

          {selArea && (
            <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
              <span className="text-green-600">{selArea.name}</span>
              {selMuni && (<><ChevronRight className="w-3 h-3" /><span className={selComm ? 'text-green-600' : 'text-green-700 font-medium'}>{selMuni.name}</span></>)}
              {selComm && (<><ChevronRight className="w-3 h-3" /><span className="text-green-700 font-medium">{selComm.name}</span></>)}
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${PT_COLORS[propertyType]}`}>{PT_LABELS[propertyType]}</span>
            </p>
          )}

          {mode === 'empty' && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Home className="w-12 h-12 mb-4 text-gray-300" />
              <p>Select a location and click the search icon to preview available properties</p>
            </div>
          )}

          {mode === 'dbStats' && dbStats && (
            <div>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{dbStats.total.toLocaleString()}</p>
                  <p className="text-xs text-green-600">Total in DB</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{dbStats.active.toLocaleString()}</p>
                  <p className="text-xs text-blue-600">Active</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-700">{dbStats.sold.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Sold</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-700">{dbStats.leased.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Leased</p>
                </div>
              </div>

              {dbStats.subtypes && Object.keys(dbStats.subtypes).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">By Property Type</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(dbStats.subtypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <div key={type} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                        <span className="text-gray-700">{type.trim()}</span>
                        <span className="font-medium text-green-700">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dbStats.total === 0 && <p className="text-sm text-gray-500 mb-4">No properties synced yet. Click the search icon to preview available listings from PropTx.</p>}

              {selMuni && (
                <button onClick={() => selComm ? handlePreviewComm(selComm, selMuni!, selArea!) : handlePreviewMuni(selMuni!, selArea!)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <Search className="w-4 h-4" /> Preview from PropTx
                </button>
              )}
            </div>
          )}

          {mode === 'preview' && (
            <div>
              {previewing ? (
                <div className="flex flex-col items-center py-12"><Loader2 className="w-8 h-8 animate-spin text-green-500 mb-4" /><p className="text-gray-600">Counting properties in PropTx...</p></div>
              ) : preview ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">PropTx Preview</h3>
                  <div className="grid grid-cols-5 gap-3 mb-6">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">{preview.forSale.toLocaleString()}</p>
                      <p className="text-xs text-green-600">For Sale</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">{preview.forLease.toLocaleString()}</p>
                      <p className="text-xs text-blue-600">For Lease</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-gray-700">{preview.sold.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Sold</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-gray-700">{preview.leased.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Leased</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-800">{(preview.forSale + preview.forLease + preview.sold + preview.leased).toLocaleString()}</p>
                      <p className="text-xs text-green-600">Total</p>
                    </div>
                  </div>

                  {(preview.forSale + preview.forLease + preview.sold + preview.leased) > 5000 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                      Warning: Large dataset ({(preview.forSale + preview.forLease + preview.sold + preview.leased).toLocaleString()} listings). Sync will process in chunks of 50.
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 text-sm font-medium">
                      <Play className="w-4 h-4" /> Sync {PT_LABELS[propertyType]}
                    </button>
                    <p className="text-xs text-gray-500">Fetches full data with media, rooms, and open houses</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 py-8 text-center">No data returned from PropTx.</p>
              )}
            </div>
          )}

          {(mode === 'syncing' || mode === 'complete') && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  {syncing ? <><Loader2 className="w-4 h-4 animate-spin text-green-500" /> Sync Progress</> : <><CheckCircle className="w-4 h-4 text-green-500" /> Sync Complete</>}
                </h3>
                <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs max-h-72 overflow-y-auto">
                  {syncLogs.map((log, i) => <div key={i} className="py-0.5">{log}</div>)}
                  <div ref={logEndRef} />
                </div>
              </div>

              {syncSummary && (
                <div className="bg-green-50 rounded-lg border border-green-200 p-4">
                  <h3 className="text-sm font-semibold text-green-800 mb-3">Sync Summary</h3>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="text-center"><p className="text-xl font-bold text-green-700">{syncSummary.listings.toLocaleString()}</p><p className="text-xs text-green-600">Listings</p></div>
                    <div className="text-center"><p className="text-xl font-bold text-green-700">{syncSummary.media.toLocaleString()}</p><p className="text-xs text-green-600">Media</p></div>
                    <div className="text-center"><p className="text-xl font-bold text-green-700">{syncSummary.rooms.toLocaleString()}</p><p className="text-xs text-green-600">Rooms</p></div>
                    <div className="text-center"><p className="text-xl font-bold text-green-700">{syncSummary.openHouses.toLocaleString()}</p><p className="text-xs text-green-600">Open Houses</p></div>
                    <div className="text-center"><p className="text-xl font-bold text-gray-500">{syncSummary.skipped.toLocaleString()}</p><p className="text-xs text-gray-400">Skipped</p></div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button onClick={() => selComm ? handlePreviewComm(selComm, selMuni!, selArea!) : handlePreviewMuni(selMuni!, selArea!)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"><RefreshCw className="w-4 h-4" /> Re-sync</button>
                    <button onClick={() => { setMode('dbStats'); loadDbStats(undefined, selMuni?.id, selComm?.id); }} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"><Download className="w-4 h-4" /> View DB Stats</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}