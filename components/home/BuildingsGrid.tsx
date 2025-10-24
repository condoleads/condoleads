import Link from 'next/link';
import { Building2, Home, Key } from 'lucide-react';

interface Building {
  id: string;
  building_name: string;
  slug: string;
  canonical_address: string;
  street_number: string;
  street_name: string;
  city_district: string;
  forSale: number;
  forLease: number;
  isFeatured?: boolean;
  photoUrl?: string | null;
}

interface BuildingsGridProps {
  buildings: Building[];
  agentName: string;
}

export function BuildingsGrid({ buildings, agentName }: BuildingsGridProps) {
  return (
    <div id="buildings" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            My Building Portfolio
          </h2>
          <p className="text-xl text-gray-600">
            {buildings.length} premium buildings in Toronto
          </p>
        </div>

        {buildings.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No buildings assigned yet</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {buildings.map((building) => (
              <Link
                key={building.id}
                href={`/${building.slug}`}
                className="group bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 hover:border-blue-500"
              >
                {/* Building Photo */}
                <div className="relative h-48 overflow-hidden">
                  {building.photoUrl ? (
                    <img 
                      src={building.photoUrl} 
                      alt={building.building_name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                      <Building2 className="w-20 h-20 text-white/30" />
                    </div>
                  )}
                  {building.isFeatured && (
                    <div className="absolute top-4 right-4 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-sm font-bold">
                       Featured
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {building.building_name}
                  </h3>
                  <p className="text-gray-600 mb-4 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {building.street_number} {building.street_name}
                  </p>

                  {/* Listing Counts */}
                  <div className="flex gap-4 mb-4">
                    {building.forSale > 0 && (
                      <div className="flex items-center gap-2 text-green-600">
                        <Home className="w-5 h-5" />
                        <div>
                          <span className="font-bold text-lg">{building.forSale}</span>
                          <span className="text-sm text-gray-600 ml-1">For Sale</span>
                        </div>
                      </div>
                    )}
                    
                    {building.forLease > 0 && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <Key className="w-5 h-5" />
                        <div>
                          <span className="font-bold text-lg">{building.forLease}</span>
                          <span className="text-sm text-gray-600 ml-1">For Lease</span>
                        </div>
                      </div>
                    )}
                    
                    {building.forSale === 0 && building.forLease === 0 && (
                      <p className="text-gray-500 text-sm">No active listings</p>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="pt-4 border-t border-gray-200">
                    <span className="text-blue-600 font-semibold group-hover:text-blue-700 flex items-center gap-2">
                      View Building Details
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
