'use client';

import { Building, Phone, Mail, MapPin } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  brand_config: {
    primaryColor?: string;
  };
  agent_buildings: Array<{
    buildings: {
      id: string;
      slug: string;
      building_name: string;
      canonical_address: string;
      static_content: any;
    };
  }>;
}

export function HomePage({ agent }: { agent: Agent }) {
  const buildings = agent.agent_buildings?.map((ab) => ab.buildings) || [];
  
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-blue-600 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-4">Toronto Condo Specialist</h1>
          <h2 className="text-3xl font-light mb-6">{agent.name}</h2>
          <p className="text-xl mb-8">Your trusted guide to luxury condo living in Toronto.</p>
        </div>
      </section>
      
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Featured Buildings</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {buildings.map((building) => (
              <div key={building.id} className="bg-white rounded-lg shadow-lg p-6">
                <Building className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{building.building_name}</h3>
                <p className="text-gray-600">{building.canonical_address}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}