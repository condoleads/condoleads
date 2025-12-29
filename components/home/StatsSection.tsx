import { Building2, Home, Key, TrendingUp } from 'lucide-react';

interface StatsSectionProps {
  buildingsCount: number;
  developmentsCount: number;
  totalForSale: number;
  totalForLease: number;
}

export function StatsSection({ buildingsCount, developmentsCount, totalForSale, totalForLease }: StatsSectionProps) {
  const totalBuildings = buildingsCount + developmentsCount;
  const totalListings = totalForSale + totalForLease;

  const stats = [
    {
      icon: Building2,
      value: totalBuildings,
      label: 'Condo Buildings',
      sublabel: 'In Portfolio',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      icon: Home,
      value: totalForSale,
      label: 'For Sale',
      sublabel: 'Active Listings',
      color: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
    {
      icon: Key,
      value: totalForLease,
      label: 'For Lease',
      sublabel: 'Available Now',
      color: 'from-sky-500 to-sky-600',
      bgColor: 'bg-sky-50',
      textColor: 'text-sky-600',
    },
    {
      icon: TrendingUp,
      value: totalListings,
      label: 'Total',
      sublabel: 'Active Listings',
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
  ];

  return (
    <section className="py-8 md:py-12 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobile: 2x2 Grid | Desktop: 4 columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="relative group"
            >
              <div className={`${stat.bgColor} rounded-2xl p-4 md:p-6 text-center transition-all duration-300 hover:shadow-lg hover:scale-105`}>
                {/* Icon */}
                <div className={`inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br ${stat.color} text-white mb-3 shadow-lg`}>
                  <stat.icon className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                
                {/* Number */}
                <div className={`text-3xl md:text-4xl font-black ${stat.textColor} mb-1`}>
                  {stat.value}
                </div>
                
                {/* Label */}
                <div className="text-sm md:text-base font-semibold text-gray-900">
                  {stat.label}
                </div>
                
                {/* Sublabel - Hidden on mobile */}
                <div className="hidden md:block text-xs text-gray-500 mt-1">
                  {stat.sublabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}