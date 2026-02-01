"use client";
import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Building2, MapPin, RefreshCw, Search, Save, CheckCircle, XCircle, Clock, Loader2, RotateCcw, Play } from 'lucide-react';

interface Area {
  id: string;
  name: string;
  discovery_status: string;
  buildings_discovered: number;
  buildings_synced: number;
  municipalities: Municipality[];
}

interface Municipality {
  id: string;
  name: string;
  discovery_status: string;
  buildings_discovered: number;
  buildings_synced: number;
  communities: Community[];
}

interface Community {
  id: string;
  name: string;
  discovery_status: string;
  buildings_discovered: number;
  buildings_synced: number;
}

interface DiscoveredBuilding {
  id: string;
  street_number: string;
  street_name: string;
  street_suffix: string | null;
  street_dir_suffix: string | null;
  city: string;
  building_name: string | null;
  building_name_original: string | null;
  listing_count: number;
  status: string;
  synced_at: string | null;
  building_id: string | null;
  retry_count: number;
  failed_reason: string | null;
}

function generateSlug(buildingName: string | null, streetNumber: string, streetName: string, streetSuffix: string | null, streetDirSuffix: string | null, city: string): string {
    const parts = [];
    if (buildingName?.trim()) parts.push(buildingName.toLowerCase());
    if (streetNumber?.trim()) parts.push(streetNumber);
    if (streetName?.trim()) parts.push(streetName.toLowerCase());
    if (streetSuffix?.trim()) parts.push(streetSuffix.toLowerCase());
    if (streetDirSuffix?.trim()) parts.push(streetDirSuffix.toLowerCase());
  
  let cleanCity = city || '';
  cleanCity = cleanCity.replace(/\s+(C\d+|E\d+|W\d+)$/i, '').trim();
  if (cleanCity) parts.push(cleanCity.toLowerCase());
  
  return parts
    .join('-')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function BulkDiscoveryPage() {
  const [geoTree, setGeoTree] = useState<Area[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedMunicipalities, setExpandedMunicipalities] = useState<Set<string>>(new Set());
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [discoveredBuildings, setDiscoveredBuildings] = useState<DiscoveredBuilding[]>([]);
  const [selectedBuildings, setSelectedBuildings] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, completed: 0, failed: 0 });
  const [filter, setFilter] = useState<'all' | 'pending' | 'synced' | 'failed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingBuilding, setEditingBuilding] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editedAddress, setEditedAddress] = useState('');

  useEffect(() => {
    loadGeoTree();
  }, []);

  const loadGeoTree = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/bulk-discovery/geo-tree');
      const data = await response.json();
      if (data.success) {
        setGeoTree(data.tree);
      }
    } catch (error) {
      console.error('Failed to load geo tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingBuildings = async (communityId: string | null, municipalityId: string) => {
    try {
      const params = new URLSearchParams({ municipalityId });
      if (communityId) params.append('communityId', communityId);
      
      const response = await fetch(`/api/admin/bulk-discovery/buildings?${params}`);
      const data = await response.json();
      
      if (data.success && data.buildings?.length > 0) {
        setDiscoveredBuildings(data.buildings);
        return true;
      }
      setDiscoveredBuildings([]);
      return false;
    } catch (error) {
      console.error('Failed to load existing buildings:', error);
      return false;
    }
  };

  const toggleArea = (areaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedAreas);
    if (newExpanded.has(areaId)) {
      newExpanded.delete(areaId);
    } else {
      newExpanded.add(areaId);
    }
    setExpandedAreas(newExpanded);
  };

  const toggleMunicipality = (muniId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedMunicipalities);
    if (newExpanded.has(muniId)) {
      newExpanded.delete(muniId);
    } else {
      newExpanded.add(muniId);
    }
    setExpandedMunicipalities(newExpanded);
  };

  const handleSelectMunicipality = async (municipality: Municipality, area: Area) => {
    setSelectedCommunity(null);
    setSelectedMunicipality(municipality);
    setSelectedArea(area);
    setSelectedBuildings(new Set());
    setSearchTerm('');
    await loadExistingBuildings(null, municipality.id);
  };

  const handleSelectCommunity = async (community: Community, municipality: Municipality, area: Area) => {
    setSelectedCommunity(community);
    setSelectedMunicipality(municipality);
    setSelectedArea(area);
    setSelectedBuildings(new Set());
    setSearchTerm('');
    await loadExistingBuildings(community.id, municipality.id);
  };

  const handleDiscoverCommunity = async (community: Community, municipality: Municipality, area: Area) => {
    setSelectedCommunity(community);
    setSelectedMunicipality(municipality);
    setSelectedArea(area);
    setDiscovering(true);
    setSelectedBuildings(new Set());
    setSearchTerm('');

    try {
      const response = await fetch('/api/admin/bulk-discovery/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: community.id,
          communityName: community.name,
          municipalityId: municipality.id,
          municipalityName: municipality.name
        })
      });

      const data = await response.json();
      if (data.success) {
        setDiscoveredBuildings(data.buildings);
        loadGeoTree();
      }
    } catch (error) {
      console.error('Discovery failed:', error);
    } finally {
      setDiscovering(false);
    }
  };

  const handleDiscoverArea = async (area: Area) => {
    const confirmDiscover = window.confirm(
      `Discover all ${area.municipalities.length} municipalities under ${area.name}?\n\nThis may take several minutes.`
    );
    if (!confirmDiscover) return;

    setSelectedCommunity(null);
    setSelectedMunicipality(null);
    setSelectedArea(area);
    setDiscovering(true);
    setDiscoveredBuildings([]);
    setSelectedBuildings(new Set());

    let allBuildings: DiscoveredBuilding[] = [];

    for (const muni of area.municipalities) {
      try {
        const response = await fetch('/api/admin/bulk-discovery/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            municipalityId: muni.id,
            municipalityName: muni.name
          })
        });
        const data = await response.json();
        if (data.success && data.buildings) {
          allBuildings = [...allBuildings, ...data.buildings];
          setDiscoveredBuildings([...allBuildings]);
        }
      } catch (error) {
        console.error(`Discovery failed for ${muni.name}:`, error);
      }
    }

    loadGeoTree();
    setDiscovering(false);
  };

  const handleDiscoverMunicipality = async (municipality: Municipality, area: Area) => {
    setSelectedCommunity(null);
    setSelectedMunicipality(municipality);
    setSelectedArea(area);
    setDiscovering(true);
    setSelectedBuildings(new Set());
    setSearchTerm('');

    try {
      const response = await fetch('/api/admin/bulk-discovery/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipalityId: municipality.id,
          municipalityName: municipality.name
        })
      });

      const data = await response.json();
      if (data.success) {
        setDiscoveredBuildings(data.buildings);
        loadGeoTree();
      }
    } catch (error) {
      console.error('Discovery failed:', error);
    } finally {
      setDiscovering(false);
    }
  };

  const toggleBuildingSelection = (buildingId: string) => {
    const newSelected = new Set(selectedBuildings);
    if (newSelected.has(buildingId)) {
      newSelected.delete(buildingId);
    } else {
      newSelected.add(buildingId);
    }
    setSelectedBuildings(newSelected);
  };

  const selectAllPending = () => {
    const pending = filteredBuildings.filter(b => b.status === 'pending').map(b => b.id);
    setSelectedBuildings(new Set(pending));
  };

  const selectAllFailed = () => {
    const failed = filteredBuildings.filter(b => b.status === 'failed').map(b => b.id);
    setSelectedBuildings(new Set(failed));
  };

  const unselectAll = () => {
    setSelectedBuildings(new Set());
  };

  const exportToCSV = () => {
    const headers = ['Building Name', 'Street Number', 'Street Name', 'City', 'Status', 'Listings'];
    const rows = filteredBuildings.map(b => [
      b.building_name || '',
      b.street_number || '',
      b.street_name || '',
      b.city || '',
      b.status || '',
      b.listing_count?.toString() || '0'
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const locationName = selectedCommunity?.name || selectedMunicipality?.name || selectedArea?.name || 'buildings';
    link.download = `discovery_${locationName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const addCondosToAll = async () => {
    const updated = discoveredBuildings.map(b => {
      if (!b.building_name) return b;
      const name = b.building_name.toLowerCase();
      if (name.includes('condo') || name.includes('residences') || name.includes('tower')) {
        return b;
      }
      return { ...b, building_name: `${b.building_name} Condos` };
    });
    setDiscoveredBuildings(updated);

    await fetch('/api/admin/bulk-discovery/buildings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildings: updated.map(b => ({ id: b.id, building_name: b.building_name })) })
    });
  };

  const resetFailedToRetry = async () => {
    const failedBuildings = discoveredBuildings.filter(b => b.status === 'failed');
    if (failedBuildings.length === 0) return;

    const response = await fetch('/api/admin/bulk-discovery/buildings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildings: failedBuildings.map(b => ({
          id: b.id,
          status: 'pending',
          retry_count: 0,
          failed_reason: null
        }))
      })
    });

    if (response.ok) {
      setDiscoveredBuildings(prev =>
        prev.map(b => b.status === 'failed' ? { ...b, status: 'pending', retry_count: 0, failed_reason: null } : b)
      );
    }
  };

  // Retry single building
  const retrySingleBuilding = async (buildingId: string) => {
    setRetryingId(buildingId);
    
    // First reset to pending
    await fetch('/api/admin/bulk-discovery/buildings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildings: [{
          id: buildingId,
          status: 'pending',
          retry_count: 0,
          failed_reason: null
        }]
      })
    });

    setDiscoveredBuildings(prev =>
      prev.map(b => b.id === buildingId ? { ...b, status: 'syncing' } : b)
    );

    // Now sync it
    try {
      const response = await fetch('/api/admin/bulk-discovery/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingIds: [buildingId] })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace('data:', ''));
              if (data.type === 'progress' && data.buildingId === buildingId) {
                setDiscoveredBuildings(prev =>
                  prev.map(b => b.id === buildingId ? { ...b, status: data.status } : b)
                );
              } else if (data.type === 'complete') {
                loadGeoTree();
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error('Retry failed:', error);
      setDiscoveredBuildings(prev =>
        prev.map(b => b.id === buildingId ? { ...b, status: 'failed', failed_reason: 'Retry failed' } : b)
      );
    } finally {
      setRetryingId(null);
    }
  };

  const saveEditedName = async (buildingId: string) => {
    const response = await fetch('/api/admin/bulk-discovery/buildings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildings: [{ id: buildingId, building_name: editedName }] })
    });

    if (response.ok) {
      setDiscoveredBuildings(prev =>
        prev.map(b => b.id === buildingId ? { ...b, building_name: editedName } : b)
      );
    }
    setEditingBuilding(null);
    setEditedName('');
  };

  const saveEditedAddress = async (buildingId: string) => {
    const parts = editedAddress.split(',')[0].trim();
    const words = parts.split(' ');
    
    // Parse address components
    const streetNumber = words[0] || '';
    const remainingWords = words.slice(1);
    
    // Known street suffixes and directions
    const streetSuffixes = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'boulevard', 'blvd', 'court', 'ct', 'place', 'pl', 'lane', 'ln', 'way', 'circle', 'cir', 'crescent', 'cres', 'trail', 'trl', 'parkway', 'pkwy'];
    const directions = ['e', 'w', 'n', 's', 'ne', 'nw', 'se', 'sw'];
    
    let streetName = '';
    let streetSuffix: string | null = null;
    let streetDirSuffix: string | null = null;
    
    // Check last word for direction
    if (remainingWords.length > 0 && directions.includes(remainingWords[remainingWords.length - 1].toLowerCase())) {
      streetDirSuffix = remainingWords.pop()!.toUpperCase();
    }
    
    // Check last word for street suffix
    if (remainingWords.length > 0 && streetSuffixes.includes(remainingWords[remainingWords.length - 1].toLowerCase())) {
      const suffix = remainingWords.pop()!;
      // Capitalize properly
      streetSuffix = suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase();
    }
    
    // Remaining words are the street name
    streetName = remainingWords.join(' ');

    const response = await fetch('/api/admin/bulk-discovery/buildings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildings: [{
          id: buildingId,
          street_number: streetNumber,
          street_name: streetName,
          street_suffix: streetSuffix,
          street_dir_suffix: streetDirSuffix
        }]
      })
    });

    if (response.ok) {
      setDiscoveredBuildings(prev =>
        prev.map(b => b.id === buildingId ? {
          ...b,
          street_number: streetNumber,
          street_name: streetName,
          street_suffix: streetSuffix,
          street_dir_suffix: streetDirSuffix
        } : b)
      );
    }
    setEditingAddress(null);
    setEditedAddress('');
  };

  const handleSyncSelected = async () => {
    const buildingsToSync = discoveredBuildings.filter(b => selectedBuildings.has(b.id));
    if (buildingsToSync.length === 0) return;

    setSyncing(true);
    setSyncProgress({ current: 0, total: buildingsToSync.length, completed: 0, failed: 0 });

    try {
      const response = await fetch('/api/admin/bulk-discovery/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingIds: Array.from(selectedBuildings) })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace('data:', ''));
              if (data.type === 'progress') {
                setSyncProgress(data.progress);
                if (data.buildingId && data.status) {
                  setDiscoveredBuildings(prev =>
                    prev.map(b => b.id === data.buildingId ? { ...b, status: data.status } : b)
                  );
                }
              } else if (data.type === 'complete') {
                loadGeoTree();
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
      setSelectedBuildings(new Set());
    }
  };

  const filteredBuildings = discoveredBuildings.filter(b => {
    const matchesFilter = filter === 'all' || b.status === filter;
    const matchesSearch = !searchTerm || 
      (b.building_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (b.street_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (b.street_number?.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'synced': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'syncing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (discovered: number, synced: number) => {
    if (discovered === 0) return <span className="text-xs text-gray-400">Not started</span>;
    if (synced === discovered) return <span className="text-xs text-green-600 font-medium">{synced}/{discovered}</span>;
    if (synced > 0) return <span className="text-xs text-yellow-600">{synced}/{discovered}</span>;
    return <span className="text-xs text-blue-600">{discovered}</span>;
  };

  const failedCount = discoveredBuildings.filter(b => b.status === 'failed').length;
  const pendingCount = discoveredBuildings.filter(b => b.status === 'pending').length;
  const syncedCount = discoveredBuildings.filter(b => b.status === 'synced').length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Discovery</h1>
          <p className="text-gray-600">Discover and sync buildings by geographic area</p>
        </div>
        <button
          onClick={loadGeoTree}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Geographic Tree - Left Panel */}
        <div className="col-span-3 bg-white rounded-lg border border-gray-200 p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Geographic Areas
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-1">
              {geoTree.map(area => (
                <div key={area.id} className="border-b border-gray-100 last:border-0">
                  <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded">
                    <button
                      onClick={(e) => toggleArea(area.id, e)}
                      className="flex items-center gap-2"
                    >
                      {expandedAreas.has(area.id) ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-medium text-gray-900 text-sm">{area.name}</span>
                    </button>
                    {getStatusBadge(area.buildings_discovered, area.buildings_synced)}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDiscoverArea(area); }}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded ml-1"
                      title={`Discover all municipalities in ${area.name}`}
                    >
                      <Search className="w-3 h-3" />
                    </button>
                  </div>

                  {expandedAreas.has(area.id) && (
                    <div className="ml-4 space-y-1">
                      {area.municipalities.map(muni => (
                        <div key={muni.id}>
                          <div className={`flex items-center justify-between py-1 px-2 rounded ${
                            selectedMunicipality?.id === muni.id && !selectedCommunity ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                          }`}>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => toggleMunicipality(muni.id, e)}
                                className="p-0.5"
                              >
                                {expandedMunicipalities.has(muni.id) ? (
                                  <ChevronDown className="w-3 h-3 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-gray-400" />
                                )}
                              </button>
                              <button
                                onClick={() => handleSelectMunicipality(muni, area)}
                                className="text-sm text-gray-700 hover:text-blue-600"
                              >
                                {muni.name}
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              {getStatusBadge(muni.buildings_discovered, muni.buildings_synced)}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDiscoverMunicipality(muni, area);
                                }}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                title="Discover all buildings"
                              >
                                <Search className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {expandedMunicipalities.has(muni.id) && (
                            <div className="ml-6 space-y-1">
                              {muni.communities.map(comm => (
                                <div
                                  key={comm.id}
                                  className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer ${
                                    selectedCommunity?.id === comm.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                                  }`}
                                >
                                  <button
                                    onClick={() => handleSelectCommunity(comm, muni, area)}
                                    className="text-xs text-gray-600 hover:text-blue-600 text-left"
                                  >
                                    {comm.name}
                                  </button>
                                  <div className="flex items-center gap-1">
                                    {getStatusBadge(comm.buildings_discovered, comm.buildings_synced)}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDiscoverCommunity(comm, muni, area);
                                      }}
                                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                      title="Discover/Re-discover"
                                    >
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

        {/* Buildings List - Right Panel */}
        <div className="col-span-9 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {selectedCommunity
                  ? `Buildings in ${selectedCommunity.name}`
                  : selectedMunicipality
                    ? `Buildings in ${selectedMunicipality.name}`
                    : 'Select a location to view buildings'
                }
              </h2>
              {selectedArea && (
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <span className="text-blue-600">{selectedArea.name}</span>
                  {selectedMunicipality && (
                    <>
                      <ChevronRight className="w-3 h-3" />
                      <span className={selectedCommunity ? 'text-blue-600' : 'text-blue-600 font-medium'}>{selectedMunicipality.name}</span>
                    </>
                  )}
                  {selectedCommunity && (
                    <>
                      <ChevronRight className="w-3 h-3" />
                      <span className="text-blue-600 font-medium">{selectedCommunity.name}</span>
                    </>
                  )}
                </p>
              )}
            </div>

            {discoveredBuildings.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search buildings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1 text-sm border border-gray-200 rounded w-48"
                  />
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="text-sm border border-gray-200 rounded px-2 py-1"
                >
                  <option value="all">All ({discoveredBuildings.length})</option>
                  <option value="pending">Pending ({pendingCount})</option>
                  <option value="synced">Synced ({syncedCount})</option>
                  <option value="failed">Failed ({failedCount})</option>
                </select>
              </div>
            )}
          </div>

          {discovering ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-gray-600">Discovering buildings...</p>
            </div>
          ) : discoveredBuildings.length > 0 ? (
            <>
              {/* Action Buttons */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200 flex-wrap">
                <button
                  onClick={selectAllPending}
                  className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Select Pending ({pendingCount})
                </button>
                {failedCount > 0 && (
                  <>
                    <button
                      onClick={selectAllFailed}
                      className="text-sm px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded"
                    >
                      Select Failed ({failedCount})
                    </button>
                    <button
                      onClick={resetFailedToRetry}
                      className="text-sm px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset All Failed
                    </button>
                  </>
                )}
                <button
                  onClick={unselectAll}
                  className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Unselect All
                </button>
                <button
                  onClick={addCondosToAll}
                  className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Add "Condos" to Names
                </button>
                <button
                  onClick={exportToCSV}
                  className="text-sm px-3 py-1 bg-green-100 hover:bg-green-200 text-green-800 rounded"
                >
                  Export CSV
                </button>
                <div className="flex-1" />
                <span className="text-sm text-gray-600">
                  {selectedBuildings.size} selected
                  {searchTerm && ` (showing ${filteredBuildings.length} of ${discoveredBuildings.length})`}
                </span>
                <button
                  onClick={handleSyncSelected}
                  disabled={selectedBuildings.size === 0 || syncing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing {syncProgress.current}/{syncProgress.total}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Sync Selected
                    </>
                  )}
                </button>
              </div>

              {syncing && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-900">Syncing buildings...</span>
                    <span className="text-sm text-blue-700">
                      {syncProgress.completed} completed, {syncProgress.failed} failed
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Buildings Table */}
              <div className="overflow-x-auto max-h-[calc(100vh-400px)] overflow-y-auto">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={selectedBuildings.size === filteredBuildings.filter(b => b.status !== 'synced').length && filteredBuildings.filter(b => b.status !== 'synced').length > 0}
                          onChange={() => {
                            if (selectedBuildings.size > 0) {
                              unselectAll();
                            } else {
                              selectAllPending();
                            }
                          }}
                        />
                      </th>
                      <th className="px-2 py-2 text-left">Building Name</th>
                      <th className="px-2 py-2 text-left">Address</th>
                      <th className="px-2 py-2 text-left">URL Slug</th>
                      <th className="px-2 py-2 text-center w-16">Listings</th>
                      <th className="px-2 py-2 text-left w-32">Status</th>
                      <th className="px-2 py-2 text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuildings.map(building => {
                      const currentSlug = generateSlug(building.building_name, building.street_number, building.street_name, building.street_suffix, building.street_dir_suffix, building.city);
                      const fullAddress = `${building.street_number} ${building.street_name}${building.street_suffix ? ' ' + building.street_suffix : ''}${building.street_dir_suffix ? ' ' + building.street_dir_suffix : ''}, ${building.city}`;
                      const isEditable = building.status !== 'synced' && building.status !== 'syncing';
                      const isRetrying = retryingId === building.id;
                      
                      return (
                        <tr key={building.id} className={`border-b border-gray-100 hover:bg-gray-50 ${
                          building.status === 'synced' ? 'bg-green-50' : 
                          building.status === 'failed' ? 'bg-red-50' : ''
                        }`}>
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedBuildings.has(building.id)}
                              onChange={() => toggleBuildingSelection(building.id)}
                              disabled={building.status === 'syncing' || building.status === 'synced'}
                            />
                          </td>
                          
                          <td className="px-2 py-2">
                            {editingBuilding === building.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editedName}
                                  onChange={(e) => setEditedName(e.target.value)}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditedName(building.id);
                                    if (e.key === 'Escape') { setEditingBuilding(null); setEditedName(''); }
                                  }}
                                />
                                <button onClick={() => saveEditedName(building.id)} className="text-green-600 hover:text-green-700">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setEditingBuilding(null); setEditedName(''); }} className="text-red-600 hover:text-red-700">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  if (isEditable) {
                                    setEditingBuilding(building.id);
                                    setEditedName(building.building_name || '');
                                  }
                                }}
                                className={`text-left w-full ${isEditable ? 'hover:text-blue-600' : 'cursor-default'}`}
                                disabled={!isEditable}
                              >
                                {building.building_name || <span className="text-gray-400 italic">No name</span>}
                              </button>
                            )}
                          </td>
                          
                          <td className="px-2 py-2">
                            {editingAddress === building.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editedAddress}
                                  onChange={(e) => setEditedAddress(e.target.value)}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditedAddress(building.id);
                                    if (e.key === 'Escape') { setEditingAddress(null); setEditedAddress(''); }
                                  }}
                                />
                                <button onClick={() => saveEditedAddress(building.id)} className="text-green-600 hover:text-green-700">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => { setEditingAddress(null); setEditedAddress(''); }} className="text-red-600 hover:text-red-700">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  if (isEditable) {
                                    setEditingAddress(building.id);
                                    setEditedAddress(fullAddress);
                                  }
                                }}
                                className={`text-left text-gray-600 w-full ${isEditable ? 'hover:text-blue-600' : 'cursor-default'}`}
                                disabled={!isEditable}
                              >
                                {fullAddress}
                              </button>
                            )}
                          </td>
                          
                          <td className="px-2 py-2">
                            <span className="font-mono text-xs text-blue-600">{currentSlug}</span>
                          </td>
                          
                          <td className="px-2 py-2 text-center text-gray-600">{building.listing_count}</td>
                          
                          <td className="px-2 py-2 min-w-32">
                            {building.status === 'syncing' ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                  <span className="text-xs text-blue-600">Syncing...</span>
                                </div>
                                <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
                                  <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-2/3"></div>
                                </div>
                              </div>
                            ) : building.status === 'synced' ? (
                              <div className="flex items-center gap-1">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-green-600">Synced</span>
                              </div>
                            ) : building.status === 'failed' ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1">
                                  <XCircle className="w-4 h-4 text-red-500" />
                                  <span className="text-xs text-red-600">Failed</span>
                                </div>
                                {building.failed_reason && (
                                  <span className="text-xs text-red-400 block truncate max-w-28" title={building.failed_reason}>
                                    {building.failed_reason}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4 text-yellow-500" />
                                <span className="text-xs text-yellow-600">Pending</span>
                              </div>
                            )}
                          </td>

                          {/* Action Column - Retry/Sync Button */}
                          <td className="px-2 py-2 text-center">
                            {building.status === 'syncing' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
                            ) : building.status === 'synced' ? (
                              <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <button
                                onClick={() => retrySingleBuilding(building.id)}
                                disabled={syncing}
                                className="p-1.5 rounded hover:bg-blue-100 text-blue-600 disabled:opacity-50"
                                title={building.status === 'failed' ? 'Retry sync' : 'Sync now'}
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Building2 className="w-12 h-12 mb-4 text-gray-300" />
              <p className="text-center">
                {selectedCommunity || selectedMunicipality
                  ? 'No buildings discovered yet. Click the search icon to discover buildings.'
                  : 'Select a location and click the search icon to discover buildings'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}










