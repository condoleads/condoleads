'use client';

import { useState, useEffect } from 'react';
import { Building, Phone, Mail, MapPin, Bed, Bath, Square } from 'lucide-react';
import { DatabaseClient } from '@/lib/supabase/client';
import { formatPrice } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  brand_config: any;
  agent_buildings: Array<{
    buildings: {
      id: string;
      slug: string;
      building_name: string;
      canonical_address: string;
      neighborhood?: string;
      year_built?: number;
      total_units?: number;
    }
  }>;
}

interface Listing {
  id: string;
  mls_number: string;
  price: number;
  beds: number;
  baths: number;
  sqft?: number;
  unit_number: string;
  description: string;
}

export function HomePage({ agent }: { agent: Agent }) {
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  const buildings = agent.agent_buildings?.map(ab => ab.buildings) || [];
  const primaryColor = agent.brand_config?.primaryColor || '#2563eb';

  const loadListings = async (buildingId: string) => {
    setLoading(true);
    try {
      const db = new DatabaseClient();
      const buildingListings = await db.getBuildingListings(buildingId);
      setListings(buildingListings);
    } catch (error) {
      console.error('Failed to load listings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (buildings.length > 0 && !selectedBuilding) {
      setSelectedBuilding(buildings[0].id);
      loadListings(buildings[0].id);
    }
  }, [buildings, selectedBuilding]);

  return (
    <div className="min-h-screen bg-white">
      <style jsx global>{`
        :root {
          --brand-primary: ${primaryColor};
        }
      `}</style>
      
      {/* Hero Section */}
      <section 
        className="bg-gradient-to-br from-blue-600 to-blue-700 text-white py-20"
        style={{ background: `linear-gradient(to bottom right, ${primaryColor}, ${primaryColor}dd)` }}
      >
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-4">Toronto Condo Specialist</h1>
          <h2 className="text-3xl font-light mb-6">{agent.name}</h2>
          <p className="text-xl mb-8 max-w-3xl mx-auto">
            Your trusted guide to luxury condo living in Toronto. 
            Exclusive access to {buildings.length} premium buildings.
          </p>
          
          <div className="flex justify-center space-x-6 mb-8">
            {agent.phone && (
              <a href={`tel:${agent.phone}`} className="flex items-center space-x-2 text-white/90 hover:text-white">
                <Phone className="h-5 w-5" />
                <span>{agent.phone}</span>
              </a>
            )}
            <a href={`mailto:${agent.email}`} className="flex items-center space-x-2 text-white/90 hover:text-white">
              <Mail className="h-5 w-5" />
              <span>{agent.email}</span>
            </a>
          </div>
        </div>
      </section>
      
      {/* Buildings Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Featured Buildings</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {buildings.map((building) => (
              <div 
                key={building.id}
                className={`bg-white rounded-lg shadow-lg p-6 cursor-pointer transition-all ${
                  selectedBuilding === building.id ? 'ring-2 ring-blue-500 shadow-xl' : 'hover:shadow-xl'
                }`}
                onClick={() => {
                  setSelectedBuilding(building.id);
                  loadListings(building.id);
                }}
              >
                <h3 className="text-xl font-bold mb-2">{building.building_name}</h3>
                <div className="flex items-start space-x-2 text-gray-600 mb-3">
                  <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
                  <span className="text-sm">{building.canonical_address}</span>
                </div>
                {building.neighborhood && (
                  <p className="text-sm text-gray-500 mb-2">{building.neighborhood}</p>
                )}
                <div className="flex justify-between text-sm text-gray-500">
                  {building.year_built && <span>Built {building.year_built}</span>}
                  {building.total_units && <span>{building.total_units} units</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Listings Section */}
      {selectedBuilding && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Available Units</h2>
            
            {loading ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading listings...</p>
              </div>
            ) : listings.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {listings.map((listing) => (
                  <div key={listing.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="h-48 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <Building className="h-16 w-16 text-white/80" />
                    </div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-2xl font-bold text-blue-600">
                          {formatPrice(listing.price)}
                        </h3>
                        <span className="text-sm text-gray-500">
                          Unit {listing.unit_number}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-4 mb-4 text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Bed className="h-4 w-4" />
                          <span>{listing.beds}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Bath className="h-4 w-4" />
                          <span>{listing.baths}</span>
                        </div>
                        {listing.sqft && (
                          <div className="flex items-center space-x-1">
                            <Square className="h-4 w-4" />
                            <span>{listing.sqft} sqft</span>
                          </div>
                        )}
                      </div>
                      
                      {listing.description && (
                        <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                          {listing.description}
                        </p>
                      )}
                      
                      <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">
                        Contact Agent
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-600">
                <Building className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p>No active listings in this building at the moment.</p>
                <p className="text-sm mt-2">Contact {agent.name} for off-market opportunities.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}