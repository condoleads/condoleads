import { Search, Calculator, UserCheck } from 'lucide-react';

export function HowItWorks() {
  return (
    <div className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-xl text-gray-600">
            Get started in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="relative">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-600 text-white mb-6">
                <Search className="w-10 h-10" />
              </div>
              <div className="absolute top-8 left-1/2 w-full h-0.5 bg-blue-200 hidden md:block -z-10"></div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                1. Browse Condos
              </h3>
              <p className="text-gray-600 text-lg">
                Explore available listings in my curated Toronto buildings
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-600 text-white mb-6">
                <Calculator className="w-10 h-10" />
              </div>
              <div className="absolute top-8 left-1/2 w-full h-0.5 bg-blue-200 hidden md:block -z-10"></div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                2. Get Instant Digital Estimates
              </h3>
              <p className="text-gray-600 text-lg">
                Know what your unit is worth based on real market data
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-600 text-white mb-6">
                <UserCheck className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                3. Contact Agent for Service
              </h3>
              <p className="text-gray-600 text-lg">
                Get personalized advice and schedule viewings
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
