'use client';

import { useState } from 'react';
import { Calculator, ArrowRight } from 'lucide-react';

interface Building {
  id: string;
  building_name: string;
  slug: string;
}

interface EstimatorBannerProps {
  buildings: Building[];
}

export function EstimatorBanner({ buildings }: EstimatorBannerProps) {
  const [selectedBuilding, setSelectedBuilding] = useState('');

  const handleGetEstimate = () => {
    if (selectedBuilding) {
      const building = buildings.find(b => b.id === selectedBuilding);
      if (building) {
        window.location.href = `/${building.slug}#estimator`;
      }
    }
  };

  return (
    <div id="estimate" className="py-20 bg-gradient-to-r from-green-600 to-blue-600">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-6">
          <Calculator className="w-8 h-8 text-white" />
        </div>
        
        <h2 className="text-4xl font-bold text-white mb-4">
          What's Your Unit Worth?
        </h2>
        <p className="text-xl text-white/90 mb-8">
          Select your building and get an instant digital estimate
        </p>
        
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg p-2 shadow-2xl">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                className="flex-1 px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-700 font-medium"
              >
                <option value="">Select your building...</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.building_name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleGetEstimate}
                disabled={!selectedBuilding}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Get Estimate
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
        
        <p className="text-white/80 text-sm mt-6">
           Instant results   Based on real market data   100% free
        </p>
      </div>
    </div>
  );
}
