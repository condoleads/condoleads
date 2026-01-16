// app/[slug]/components/PSFTrendChart.tsx
'use client';

import { useMemo, useState } from 'react';

interface Transaction {
  id: string;
  transaction_type: 'sale' | 'lease';
  close_date: string;
  close_price: number;
  sqft: number;
  sqft_method: string;
  psf: number;
}

interface Props {
  transactions: Transaction[];
  buildingName: string;
  saleCount: number;
  leaseCount: number;
}

export default function PSFTrendChart({ transactions, buildingName, saleCount, leaseCount }: Props) {
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
    ? { primary: '#3b82f6', light: 'bg-blue-50', text: 'text-blue-600', btn: 'bg-blue-600' }
    : { primary: '#22c55e', light: 'bg-green-50', text: 'text-green-600', btn: 'bg-green-600' };

  if (!transactions || transactions.length === 0) {
    return null;
  }

  const chartWidth = 700;
  const chartHeight = 260;
  const padding = { top: 25, right: 25, bottom: 45, left: 65 };
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
    
    while (current <= end && ticks.length < 10) {
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
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Price Per Sqft Trends</h3>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewType('sale')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewType === 'sale'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sales ({saleCount})
          </button>
          <button
            onClick={() => setViewType('lease')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewType === 'lease'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leases ({leaseCount})
          </button>
        </div>
      </div>

      {currentData.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl">
          No {viewType} transactions available for this building
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 mb-3 text-sm">
            <div className={`${colorScheme.light} px-3 py-1.5 rounded-lg`}>
              <span className="text-slate-500">Avg:</span>
              <span className={`ml-1 font-bold ${colorScheme.text}`}>
                ${viewType === 'sale' ? config.avg.toFixed(0) : config.avg.toFixed(2)}{unit}
              </span>
            </div>
            <div className="text-slate-500">
              Range: <span className="font-medium text-slate-700">
                ${viewType === 'sale' ? config.min.toFixed(0) : config.min.toFixed(2)} - 
                ${viewType === 'sale' ? config.max.toFixed(0) : config.max.toFixed(2)}{unit}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
            <svg width={chartWidth} height={chartHeight} className="overflow-visible mx-auto block">
              <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#fafafa" rx={4} />

              {yTicks.map((tick, i) => (
                <g key={i}>
                  <line x1={padding.left} y1={psfToY(tick)} x2={chartWidth - padding.right} y2={psfToY(tick)} stroke="#e5e7eb" strokeWidth={1} />
                  <text x={padding.left - 10} y={psfToY(tick)} textAnchor="end" alignmentBaseline="middle" className="text-xs fill-slate-500">
                    ${viewType === 'sale' ? tick.toFixed(0) : tick.toFixed(2)}
                  </text>
                </g>
              ))}

              {xTicks.map((date, i) => (
                <text key={i} x={dateToX(date.toISOString().split('T')[0])} y={chartHeight - 12} textAnchor="middle" className="text-xs fill-slate-500">
                  {date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </text>
              ))}

              <line x1={padding.left} y1={psfToY(config.avg)} x2={chartWidth - padding.right} y2={psfToY(config.avg)} stroke={colorScheme.primary} strokeWidth={2} strokeDasharray="6,4" opacity={0.5} />

              {linePath && (
                <path d={linePath} fill="none" stroke={colorScheme.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
              )}

              {currentData.map((t, i) => (
                <g key={i}>
                  <circle
                    cx={dateToX(t.close_date)}
                    cy={psfToY(t.psf)}
                    r={5}
                    fill={t.sqft_method === 'exact' ? '#22c55e' : t.sqft_method === 'midpoint' ? '#f59e0b' : '#ef4444'}
                    stroke="#fff"
                    strokeWidth={2}
                    className="cursor-pointer"
                  >
                    <title>{`${t.close_date}\n${viewType === 'sale' ? 'Price' : 'Rent'}: $${t.close_price?.toLocaleString()}${viewType === 'lease' ? '/mo' : ''}\nSize: ${t.sqft} sqft\nPSF: $${t.psf?.toFixed(2)}${unit}`}</title>
                  </circle>
                </g>
              ))}

              <text x={18} y={chartHeight / 2} transform={`rotate(-90, 18, ${chartHeight / 2})`} textAnchor="middle" className="text-xs fill-slate-500 font-medium">
                {viewType === 'sale' ? 'Sale' : 'Lease'} PSF ($)
              </text>
            </svg>
          </div>

          <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span>Exact sqft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Estimated</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span>Fallback</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed" style={{ borderColor: colorScheme.primary }}></span>
              <span>Avg</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}