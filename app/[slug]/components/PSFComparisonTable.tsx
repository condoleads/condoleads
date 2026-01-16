// app/[slug]/components/PSFComparisonTable.tsx
'use client';

import { Building2, MapPin, Map, Globe } from 'lucide-react';

interface PSFData {
  avg: number | null;
  sampleSize: number;
}

interface GeoLevel {
  id: string;
  name: string;
  salePsf: PSFData | null;
  leasePsf: PSFData | null;
}

interface BuildingSummary {
  saleAvgPsf: number | null;
  saleCount: number;
  leaseAvgPsf: number | null;
  leaseCount: number;
}

interface Props {
  buildingName: string;
  buildingSummary: BuildingSummary | null;
  community: GeoLevel | null;
  municipality: GeoLevel | null;
  area: GeoLevel | null;
}

interface RowData {
  icon: React.ElementType;
  name: string;
  salePsf: number | null;
  leasePsf: number | null;
  saleCount: number;
  leaseCount: number;
  isBuilding: boolean;
  iconColor: string;
  bgColor: string;
}

function formatPsf(value: number | null, isLease: boolean = false): string {
  if (value === null) return '—';
  return isLease ? `${value.toFixed(2)}` : `${Math.round(value)}`;
}

function getDiffBadge(buildingPsf: number | null, comparePsf: number | null): JSX.Element | null {
  if (!buildingPsf || !comparePsf) return null;
  const diff = ((buildingPsf - comparePsf) / comparePsf) * 100;
  const isPositive = diff > 0;
  const absVal = Math.abs(diff).toFixed(0);
  
  if (Math.abs(diff) < 1) return null;
  
  return (
    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
      isPositive ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
    }`}>
      {isPositive ? '+' : '-'}{absVal}%
    </span>
  );
}

export default function PSFComparisonTable({ 
  buildingName, 
  buildingSummary, 
  community, 
  municipality, 
  area 
}: Props) {
  if (!buildingSummary && !community && !municipality && !area) {
    return null;
  }

  const rows: RowData[] = [
    {
      icon: Building2,
      name: buildingName,
      salePsf: buildingSummary?.saleAvgPsf || null,
      leasePsf: buildingSummary?.leaseAvgPsf || null,
      saleCount: buildingSummary?.saleCount || 0,
      leaseCount: buildingSummary?.leaseCount || 0,
      isBuilding: true,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    ...(community ? [{
      icon: MapPin,
      name: community.name,
      salePsf: community.salePsf?.avg || null,
      leasePsf: community.leasePsf?.avg || null,
      saleCount: community.salePsf?.sampleSize || 0,
      leaseCount: community.leasePsf?.sampleSize || 0,
      isBuilding: false,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    }] : []),
    ...(municipality ? [{
      icon: Map,
      name: municipality.name,
      salePsf: municipality.salePsf?.avg || null,
      leasePsf: municipality.leasePsf?.avg || null,
      saleCount: municipality.salePsf?.sampleSize || 0,
      leaseCount: municipality.leasePsf?.sampleSize || 0,
      isBuilding: false,
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-50'
    }] : []),
    ...(area ? [{
      icon: Globe,
      name: area.name,
      salePsf: area.salePsf?.avg || null,
      leasePsf: area.leasePsf?.avg || null,
      saleCount: area.salePsf?.sampleSize || 0,
      leaseCount: area.leasePsf?.sampleSize || 0,
      isBuilding: false,
      iconColor: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }] : [])
  ];

  const buildingSalePsf = buildingSummary?.saleAvgPsf || null;
  const buildingLeasePsf = buildingSummary?.leaseAvgPsf || null;

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Location Comparison</h3>
      
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Location</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600">Sale PSF</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600">Lease PSF</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600"># Sales</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600"># Leases</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr 
                  key={i} 
                  className={`border-b border-slate-100 last:border-b-0 ${
                    row.isBuilding ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${row.bgColor}`}>
                        <row.icon className={`w-4 h-4 ${row.iconColor}`} />
                      </div>
                      <span className={`font-medium ${row.isBuilding ? 'text-blue-900' : 'text-slate-700'}`}>
                        {row.name}
                      </span>
                      {row.isBuilding && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          This Building
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold ${row.isBuilding ? 'text-blue-900' : 'text-slate-900'}`}>
                      {formatPsf(row.salePsf)}
                    </span>
                    {!row.isBuilding && getDiffBadge(buildingSalePsf, row.salePsf)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold ${row.isBuilding ? 'text-blue-900' : 'text-slate-900'}`}>
                      {formatPsf(row.leasePsf, true)}
                    </span>
                    <span className="text-slate-400 text-xs">/mo</span>
                    {!row.isBuilding && getDiffBadge(buildingLeasePsf, row.leasePsf)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {row.saleCount > 0 ? row.saleCount.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {row.leaseCount > 0 ? row.leaseCount.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <p className="text-xs text-slate-500 mt-2 text-center">
        Green badges indicate the building is priced below the comparison area. Data from closed transactions.
      </p>
    </div>
  );
}