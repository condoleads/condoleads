// app/admin/psf-analytics/building-psf-chart.tsx
'use client';

import { useMemo, useState } from 'react';

interface Transaction {
  close_date: string;
  transaction_type: 'sale' | 'lease';
  close_price: number;
  sqft: number;
  psf: number;
  sqft_method: string;
}

interface Props {
  transactions: Transaction[];
  buildingName: string;
}

export default function BuildingPSFChart({ transactions, buildingName }: Props) {
  const [viewType, setViewType] = useState<'sale' | 'lease'>('sale');

  const { sales, leases, chartConfig } = useMemo(() => {
    const sales = transactions.filter(t => t.transaction_type === 'sale' && t.psf > 0);
    const leases = transactions.filter(t => t.transaction_type === 'lease' && t.psf > 0);
    
    const sortedSales = [...sales].sort((a, b) => new Date(a.close_date).getTime() - new Date(b.close_date).getTime());
    const sortedLeases = [...leases].sort((a, b) => new Date(a.close_date).getTime() - new Date(b.close_date).getTime());

    const allDates = transactions.map(t => t.close_date).sort();
    const minDate = allDates[0] || '';
    const maxDate = allDates[allDates.length - 1] || '';

    const salePsfs = sales.map(t => t.psf);
    const leasePsfs = leases.map(t => t.psf);

    return {
      sales: sortedSales,
      leases: sortedLeases,
      chartConfig: {
        minDate,
        maxDate,
        sale: {
          min: salePsfs.length > 0 ? Math.floor(Math.min(...salePsfs) * 0.9) : 500,
          max: salePsfs.length > 0 ? Math.ceil(Math.max(...salePsfs) * 1.1) : 1500,
          avg: salePsfs.length > 0 ? salePsfs.reduce((a, b) => a + b, 0) / salePsfs.length : 0,
        },
        lease: {
          min: leasePsfs.length > 0 ? Math.floor(Math.min(...leasePsfs) * 0.9) : 2,
          max: leasePsfs.length > 0 ? Math.ceil(Math.max(...leasePsfs) * 1.1) : 10,
          avg: leasePsfs.length > 0 ? leasePsfs.reduce((a, b) => a + b, 0) / leasePsfs.length : 0,
        },
      },
    };
  }, [transactions]);

  const currentData = viewType === 'sale' ? sales : leases;
  const config = chartConfig[viewType];
  const unit = viewType === 'sale' ? '/sqft' : '/sqft/mo';
  const colorScheme = viewType === 'sale' 
    ? { primary: '#3b82f6', bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-600' }
    : { primary: '#22c55e', bg: 'bg-green-500', light: 'bg-green-50', text: 'text-green-600' };

  if (!transactions || transactions.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 bg-gray-50 rounded-lg">
        No transaction data available
      </div>
    );
  }

  const chartWidth = 750;
  const chartHeight = 280;
  const padding = { top: 30, right: 30, bottom: 50, left: 70 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const dateToX = (dateStr: string) => {
    const date = new Date(dateStr);
    const minDate = new Date(chartConfig.minDate);
    const maxDate = new Date(chartConfig.maxDate);
    const range = maxDate.getTime() - minDate.getTime() || 1;
    return padding.left + ((date.getTime() - minDate.getTime()) / range) * plotWidth;
  };

  const psfToY = (psf: number) => {
    const range = config.max - config.min || 1;
    return padding.top + plotHeight - ((psf - config.min) / range) * plotHeight;
  };

  const yTicks = useMemo(() => {
    const range = config.max - config.min;
    const step = viewType === 'sale' 
      ? Math.ceil(range / 5 / 50) * 50 || 100
      : Math.ceil(range / 5 * 10) / 10 || 1;
    const ticks: number[] = [];
    let v = Math.floor(config.min / step) * step;
    while (v <= config.max && ticks.length < 7) {
      if (v >= config.min) ticks.push(v);
      v += step;
    }
    return ticks;
  }, [config.min, config.max, viewType]);

  const xTicks = useMemo(() => {
    if (!chartConfig.minDate || !chartConfig.maxDate) return [];
    const start = new Date(chartConfig.minDate);
    const end = new Date(chartConfig.maxDate);
    const ticks: Date[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const interval = monthDiff > 24 ? 6 : monthDiff > 12 ? 3 : monthDiff > 6 ? 2 : 1;
    
    while (current <= end && ticks.length < 12) {
      ticks.push(new Date(current));
      current.setMonth(current.getMonth() + interval);
    }
    return ticks;
  }, [chartConfig.minDate, chartConfig.maxDate]);

  const linePath = currentData.length > 1
    ? currentData.map((t, i) => {
        const x = dateToX(t.close_date);
        const y = psfToY(t.psf);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')
    : '';

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-gray-800">Price per Square Foot Trends</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewType('sale')}
            className={`px-4 py-1.5 rounded-l-lg text-sm font-medium transition-all ${
              viewType === 'sale'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Sales ({sales.length})
          </button>
          <button
            onClick={() => setViewType('lease')}
            className={`px-4 py-1.5 rounded-r-lg text-sm font-medium transition-all ${
              viewType === 'lease'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Leases ({leases.length})
          </button>
        </div>
      </div>

      {currentData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-gray-400 bg-gray-50 rounded">
          No {viewType} transactions available
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 mb-4 text-sm">
            <div className={`${colorScheme.light} px-3 py-1.5 rounded-lg`}>
              <span className="text-gray-500">Avg:</span>
              <span className={`ml-1 font-bold ${colorScheme.text}`}>
                ${viewType === 'sale' ? config.avg.toFixed(0) : config.avg.toFixed(2)}{unit}
              </span>
            </div>
            <div className="text-gray-500">
              Range: <span className="font-medium text-gray-700">
                ${viewType === 'sale' ? config.min.toFixed(0) : config.min.toFixed(2)} - 
                ${viewType === 'sale' ? config.max.toFixed(0) : config.max.toFixed(2)}{unit}
              </span>
            </div>
            <div className="text-gray-500">
              Transactions: <span className="font-medium text-gray-700">{currentData.length}</span>
            </div>
          </div>

          <svg width={chartWidth} height={chartHeight} className="overflow-visible">
            <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#fafafa" rx={4} />

            {yTicks.map((tick, i) => (
              <g key={i}>
                <line x1={padding.left} y1={psfToY(tick)} x2={chartWidth - padding.right} y2={psfToY(tick)} stroke="#e5e7eb" strokeWidth={1} />
                <text x={padding.left - 12} y={psfToY(tick)} textAnchor="end" alignmentBaseline="middle" className="text-xs fill-gray-500">
                  ${viewType === 'sale' ? tick.toFixed(0) : tick.toFixed(2)}
                </text>
              </g>
            ))}

            {xTicks.map((date, i) => (
              <text key={i} x={dateToX(date.toISOString().split('T')[0])} y={chartHeight - 15} textAnchor="middle" className="text-xs fill-gray-500">
                {date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
              </text>
            ))}

            <line x1={padding.left} y1={psfToY(config.avg)} x2={chartWidth - padding.right} y2={psfToY(config.avg)} stroke={colorScheme.primary} strokeWidth={2} strokeDasharray="8,4" opacity={0.6} />

            {linePath && (
              <path d={linePath} fill="none" stroke={colorScheme.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
            )}

            {currentData.map((t, i) => (
              <g key={i}>
                <circle
                  cx={dateToX(t.close_date)}
                  cy={psfToY(t.psf)}
                  r={6}
                  fill={t.sqft_method === 'exact' ? '#22c55e' : t.sqft_method === 'midpoint' ? '#f59e0b' : '#ef4444'}
                  stroke="#fff"
                  strokeWidth={2}
                  className="cursor-pointer"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
                >
                  <title>{`${t.close_date}\n${viewType === 'sale' ? 'Price' : 'Rent'}: $${t.close_price?.toLocaleString()}${viewType === 'lease' ? '/mo' : ''}\nSqFt: ${t.sqft} (${t.sqft_method})\nPSF: $${t.psf?.toFixed(2)}${unit}`}</title>
                </circle>
              </g>
            ))}

            <text x={20} y={chartHeight / 2} transform={`rotate(-90, 20, ${chartHeight / 2})`} textAnchor="middle" className="text-xs fill-gray-500 font-medium">
              {viewType === 'sale' ? 'Sale Price' : 'Lease Price'} per SqFt ($)
            </text>
          </svg>

          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-gray-600">Exact SqFt</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <span className="text-gray-600">Midpoint</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-gray-600">Fallback</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-6 border-t-2 border-dashed" style={{ borderColor: colorScheme.primary }}></span>
              <span className="text-gray-600">Average</span>
              <span className="w-6 border-t-2 ml-3" style={{ borderColor: colorScheme.primary }}></span>
              <span className="text-gray-600">Trend</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
