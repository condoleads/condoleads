// app/admin/psf-analytics/geo-tree.tsx

'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Building2, MapPin, Map, Globe } from 'lucide-react';

interface Area {
  id: string;
  name: string;
  saleCount: number;
  leaseCount: number;
}

interface Municipality {
  id: string;
  name: string;
  area_id: string;
  saleCount: number;
  leaseCount: number;
}

interface Community {
  id: string;
  name: string;
  municipality_id: string;
  saleCount: number;
  leaseCount: number;
}

interface Props {
  onSelect: (level: string, id: string, name: string) => void;
  selectedId: string | null;
  type: 'sale' | 'lease';
}

export default function GeoTree({ onSelect, selectedId, type }: Props) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedMunis, setExpandedMunis] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadGeoTree();
  }, []);

  const loadGeoTree = async () => {
    try {
      const res = await fetch('/api/admin/psf-analytics/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'geo-tree' }),
      });
      const data = await res.json();
      
      if (data.success) {
        setAreas(data.areas || []);
        setMunicipalities(data.municipalities || []);
        setCommunities(data.communities || []);
      }
    } catch (error) {
      console.error('Failed to load geo tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleArea = (areaId: string) => {
    const next = new Set(expandedAreas);
    if (next.has(areaId)) next.delete(areaId);
    else next.add(areaId);
    setExpandedAreas(next);
  };

  const toggleMuni = (muniId: string) => {
    const next = new Set(expandedMunis);
    if (next.has(muniId)) next.delete(muniId);
    else next.add(muniId);
    setExpandedMunis(next);
  };

  const getCount = (item: { saleCount: number; leaseCount: number }) => {
    return type === 'sale' ? item.saleCount : item.leaseCount;
  };

  const filteredAreas = areas.filter(a => 
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  const getMunisForArea = (areaId: string) => 
    municipalities.filter(m => m.area_id === areaId);

  const getCommsForMuni = (muniId: string) =>
    communities.filter(c => c.municipality_id === muniId);

  if (loading) {
    return <div className="p-4 text-gray-500">Loading geography...</div>;
  }

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className="p-3 border-b">
        <input
          type="text"
          placeholder="Filter locations..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
      </div>

      {/* Tree */}
      <div className="max-h-96 overflow-y-auto p-2">
        {/* GTA Level */}
        <TreeItem
          icon={<Globe className="w-4 h-4" />}
          label="GTA (All)"
          count={areas.reduce((sum, a) => sum + getCount(a), 0)}
          isSelected={selectedId === 'gta'}
          onClick={() => onSelect('gta', 'gta', 'GTA')}
          level={0}
        />

        {/* Areas */}
        {filteredAreas.map(area => (
          <div key={area.id}>
            <TreeItem
              icon={<Map className="w-4 h-4" />}
              label={area.name}
              count={getCount(area)}
              isSelected={selectedId === area.id}
              isExpanded={expandedAreas.has(area.id)}
              hasChildren={getMunisForArea(area.id).length > 0}
              onClick={() => onSelect('area', area.id, area.name)}
              onToggle={() => toggleArea(area.id)}
              level={0}
            />

            {/* Municipalities */}
            {expandedAreas.has(area.id) && getMunisForArea(area.id).map(muni => (
              <div key={muni.id}>
                <TreeItem
                  icon={<MapPin className="w-4 h-4" />}
                  label={muni.name}
                  count={getCount(muni)}
                  isSelected={selectedId === muni.id}
                  isExpanded={expandedMunis.has(muni.id)}
                  hasChildren={getCommsForMuni(muni.id).length > 0}
                  onClick={() => onSelect('municipality', muni.id, muni.name)}
                  onToggle={() => toggleMuni(muni.id)}
                  level={1}
                />

                {/* Communities */}
                {expandedMunis.has(muni.id) && getCommsForMuni(muni.id).map(comm => (
                  <TreeItem
                    key={comm.id}
                    icon={<Building2 className="w-4 h-4" />}
                    label={comm.name}
                    count={getCount(comm)}
                    isSelected={selectedId === comm.id}
                    onClick={() => onSelect('community', comm.id, comm.name)}
                    level={2}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface TreeItemProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  isSelected?: boolean;
  isExpanded?: boolean;
  hasChildren?: boolean;
  onClick: () => void;
  onToggle?: () => void;
  level: number;
}

function TreeItem({
  icon,
  label,
  count,
  isSelected,
  isExpanded,
  hasChildren,
  onClick,
  onToggle,
  level,
}: TreeItemProps) {
  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm ${
        isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
      }`}
      style={{ paddingLeft: `${level * 16 + 8}px` }}
    >
      {hasChildren ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className="p-0.5 hover:bg-gray-200 rounded"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      ) : (
        <span className="w-5" />
      )}
      
      <span onClick={onClick} className="flex items-center gap-2 flex-1">
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="text-xs text-gray-400">({count})</span>
        )}
      </span>
    </div>
  );
}
