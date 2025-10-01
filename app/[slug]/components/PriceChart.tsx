'use client'

import { MLSListing } from '@/lib/types/building'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPriceShort, formatDate } from '@/lib/utils/formatters'

interface PriceChartProps {
  closedSales: MLSListing[]
}

export default function PriceChart({ closedSales }: PriceChartProps) {
  // Need at least 5 sales with dates to show meaningful chart
  const salesWithDates = closedSales.filter(sale => sale.close_date)
  
  if (salesWithDates.length < 5) {
    return null
  }

  // Prepare chart data
  const chartData = salesWithDates
    .sort((a, b) => new Date(a.close_date!).getTime() - new Date(b.close_date!).getTime())
    .map(sale => ({
      date: formatDate(sale.close_date),
      price: sale.list_price,
      unit: sale.unit_number,
    }))

  return (
    <section className="max-w-7xl mx-auto px-6 mb-20">
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <h2 className="text-3xl font-bold text-slate-900 mb-6">Price History</h2>
        
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
                        <p className="text-2xl font-bold text-emerald-600 mb-1">
                          {formatPriceShort(data.price)}
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
                stroke="#10b981" 
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <p className="text-sm text-slate-600 mt-4 text-center">
          Showing {salesWithDates.length} completed transactions
        </p>
      </div>
    </section>
  )
}
