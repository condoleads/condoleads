'use client'
import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPriceShort, formatDate } from '@/lib/utils/formatters'

interface PriceChartProps {
  closedSales: MLSListing[]
  closedRentals: MLSListing[]
}

export default function PriceChart({ closedSales, closedRentals }: PriceChartProps) {
  const [activeTab, setActiveTab] = useState<'sales' | 'rentals'>('sales')
  
  const isSales = activeTab === 'sales'
  const currentData = isSales ? closedSales : closedRentals
  
  // Need at least 5 transactions with dates to show meaningful chart
  const transactionsWithDates = currentData.filter(item => item.close_date)
  
  if (transactionsWithDates.length < 5) {
    return null
  }
  
  // Prepare chart data
  const chartData = transactionsWithDates
    .sort((a, b) => new Date(a.close_date!).getTime() - new Date(b.close_date!).getTime())
    .map(item => ({
      date: formatDate(item.close_date),
      price: item.close_price || item.list_price,
      unit: item.unit_number,
    }))
  
  return (
    <section className="max-w-7xl mx-auto px-6 mb-20">
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        {/* Tab Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-slate-900">
            {isSales ? 'Sale' : 'Lease'} History
          </h2>
          
          {/* Tab Switcher */}
          <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-6 py-2 rounded-md font-semibold text-sm transition-colors ${
                activeTab === 'sales'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sale History
            </button>
            <button
              onClick={() => setActiveTab('rentals')}
              className={`px-6 py-2 rounded-md font-semibold text-sm transition-colors ${
                activeTab === 'rentals'
                  ? 'bg-white text-sky-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lease History
            </button>
          </div>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#64748b"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatPriceShort(value)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-white p-4 rounded-lg shadow-lg border border-slate-200">
                        <p className="font-semibold text-slate-900 mb-1">Unit {data.unit}</p>
                        <p className={`text-2xl font-bold mb-1 ${isSales ? 'text-emerald-600' : 'text-sky-600'}`}>
                          {formatPriceShort(data.price)}{!isSales && '/mo'}
                        </p>
                        <p className="text-sm text-slate-600">{data.date}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={isSales ? '#10b981' : '#0ea5e9'}
                strokeWidth={3}
                dot={{ fill: isSales ? '#10b981' : '#0ea5e9', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <p className="text-sm text-slate-600 mt-4 text-center">
          Showing {transactionsWithDates.length} completed {isSales ? 'sales' : 'leases'}
        </p>
      </div>
    </section>
  )
}