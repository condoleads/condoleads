import { TrendingUp, Users, Flame, Target } from 'lucide-react'

interface StatsCardsProps {
  stats: {
    totalLeads: number
    hotLeads: number
    newLeads: number
    conversionRate: number
  }
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total Leads',
      value: stats.totalLeads,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12% from last month'
    },
    {
      title: 'Hot Leads',
      value: stats.hotLeads,
      icon: Flame,
      color: 'bg-red-500',
      change: 'Requires immediate action'
    },
    {
      title: 'New Today',
      value: stats.newLeads,
      icon: TrendingUp,
      color: 'bg-green-500',
      change: 'Fresh opportunities'
    },
    {
      title: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      icon: Target,
      color: 'bg-purple-500',
      change: 'Hot leads / Total leads'
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`${card.color} p-3 rounded-lg`}>
              <card.icon className="w-6 h-6 text-white" />
            </div>
          </div>
          
          <h3 className="text-gray-600 text-sm font-medium mb-1">
            {card.title}
          </h3>
          
          <p className="text-3xl font-bold text-gray-900 mb-2">
            {card.value}
          </p>
          
          <p className="text-xs text-gray-500">
            {card.change}
          </p>
        </div>
      ))}
    </div>
  )
}
