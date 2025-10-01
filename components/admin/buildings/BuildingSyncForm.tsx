'use client';

import { useState } from 'react';

interface SearchResult {
  success: boolean;
  building: {
    buildingName: string;
    canonicalAddress: string;
    slug: string;
    streetNumber: string;
    streetName: string;
    city: string;
    totalListings: number;
  };
  categories: {
    activeForSale: number;
    activeForLease: number;
    recentlySold: number;
    olderSold: number;
    recentlyLeased: number;
    olderLeased: number;
  };
  total: number;
  rawData: any[];
}

interface SaveResult {
  success: boolean;
  buildingId: string;
  saved: number;
  updated: number;
  total: number;
  errors: number;
  errorDetails: string[];
}

export default function BuildingSyncForm() {
  const [formData, setFormData] = useState({
    streetNumber: '101',
    streetName: 'charles',
    city: 'Toronto',
    buildingName: 'x2 condos'
  });
  
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveConfirmed, setSaveConfirmed] = useState(false);

  const generateSlug = (streetNumber: string, streetName: string, city: string, buildingName: string) => {
    const parts = [];
    if (buildingName.trim()) parts.push(buildingName.toLowerCase());
    if (streetNumber.trim()) parts.push(streetNumber);
    if (streetName.trim()) parts.push(streetName.toLowerCase());
    if (city.trim()) parts.push(city.toLowerCase());
    
    return parts
      .join('-')
      .replace(/[^a-z0-9\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSearch = async () => {
    console.log('Form data being sent:', formData);
    
    if (!formData.streetNumber || !formData.streetNumber.trim()) {
      setError('Street number is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchResult(null);
    setSaveResult(null);
    setSaveConfirmed(false);

    try {
      const payload = {
        streetNumber: formData.streetNumber.trim(),
        streetName: formData.streetName.trim(),
        city: formData.city.trim(),
        buildingName: formData.buildingName.trim()
      };

      console.log('Sending payload:', payload);

      const response = await fetch('/api/admin/buildings/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${errorData.details || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('Search result:', result);
      setSearchResult(result);
      
      // Update building name if found in listings but form is empty
      if (result.rawData?.[0]?.BuildingName && !formData.buildingName.trim()) {
        setFormData(prev => ({ ...prev, buildingName: result.rawData[0].BuildingName }));
      }

    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!searchResult) {
      setError('No search results to save');
      return;
    }

    if (!saveConfirmed) {
      setError('Please confirm you want to save to the database before proceeding');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Get full listing data with fullData flag
      const searchResponse = await fetch('/api/admin/buildings/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          streetNumber: formData.streetNumber.trim(),
          streetName: formData.streetName.trim(),
          city: formData.city.trim(),
          buildingName: formData.buildingName.trim(),
          fullData: true // Get all listings, not just preview
        })
      });

      if (!searchResponse.ok) {
        throw new Error('Failed to get full listing data');
      }

      const fullSearchResult = await searchResponse.json();

      // Save to database
      const saveResponse = await fetch('/api/admin/buildings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingInfo: {
            ...searchResult.building,
            buildingName: formData.buildingName.trim() || searchResult.building.buildingName
          },
          listings: fullSearchResult.rawData || []
        })
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || `Save failed: HTTP ${saveResponse.status}`);
      }

      const saveData = await saveResponse.json();
      setSaveResult(saveData);

    } catch (err: any) {
      setError(err.message || 'Save failed');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Sync Building from PropTx</h1>
        <p className="text-gray-600">
          Search and sync condo listings using RESO standard terms
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Building Information</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Street Number * (Exact Match)
            </label>
            <input
              type="text"
              value={formData.streetNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, streetNumber: e.target.value }))}
              placeholder="101"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Street Name * (First Word Match)
            </label>
            <input
              type="text"
              value={formData.streetName}
              onChange={(e) => setFormData(prev => ({ ...prev, streetName: e.target.value }))}
              placeholder="Charles"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || saving}
            />
            <p className="text-xs text-gray-500 mt-1">
              "charles" matches "Charles St E", "Charles Street East", etc.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              City (First Word Match)
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
              placeholder="Toronto"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || saving}
            />
            <p className="text-xs text-gray-500 mt-1">
              "toronto" matches all districts: "Toronto C01", "Toronto C08", etc.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Building Name (Optional)
            </label>
            <input
              type="text"
              value={formData.buildingName}
              onChange={(e) => setFormData(prev => ({ ...prev, buildingName: e.target.value }))}
              placeholder="X2 Condos"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || saving}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-2">
            URL Slug (Preview)
          </label>
          <input
            type="text"
            value={generateSlug(formData.streetNumber, formData.streetName, formData.city, formData.buildingName)}
            readOnly
            className="w-full px-3 py-2 bg-gray-50 border rounded-md text-gray-700"
          />
          <p className="text-xs text-gray-500 mt-1">
            Building URL: condoleads.ca/{generateSlug(formData.streetNumber, formData.streetName, formData.city, formData.buildingName)}
          </p>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSearch}
            disabled={loading || saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching PropTx...' : 'Search PropTx'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <span className="text-red-600 font-semibold mr-2"></span>
            <div>
              <h3 className="text-red-800 font-semibold">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResult && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Search Results (RESO Standard)</h2>
          
          <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
            <h3 className="font-semibold text-green-800">
               Found {searchResult.total} total listings for {searchResult.building.canonicalAddress}
            </h3>
          </div>

          {/* Separate For Sale and For Lease */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            
            {/* FOR SALE SECTION */}
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-blue-700">For Sale</h3>
              <div className="space-y-3">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-2xl font-bold text-blue-600">{searchResult.categories.activeForSale}</div>
                  <div className="text-sm text-blue-800">Active For Sale</div>
                </div>
                <div className="bg-orange-50 p-3 rounded">
                  <div className="text-xl font-bold text-orange-600">{searchResult.categories.recentlySold}</div>
                  <div className="text-sm text-orange-800">Recently Sold (90 days)</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xl font-bold text-gray-600">{searchResult.categories.olderSold}</div>
                  <div className="text-sm text-gray-800">Older Sold</div>
                </div>
              </div>
            </div>

            {/* FOR LEASE SECTION */}
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-green-700">For Lease</h3>
              <div className="space-y-3">
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-2xl font-bold text-green-600">{searchResult.categories.activeForLease}</div>
                  <div className="text-sm text-green-800">Active For Lease</div>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <div className="text-xl font-bold text-purple-600">{searchResult.categories.recentlyLeased}</div>
                  <div className="text-sm text-purple-800">Recently Leased (90 days)</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xl font-bold text-gray-600">{searchResult.categories.olderLeased}</div>
                  <div className="text-sm text-gray-800">Older Leased</div>
                </div>
              </div>
            </div>

          </div>

          {/* Sample Data Preview */}
          {searchResult.rawData && searchResult.rawData.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Sample Listing Data (RESO Fields):</h3>
              <div className="bg-gray-50 p-4 rounded text-sm font-mono max-h-40 overflow-y-auto">
                <div><strong>StandardStatus:</strong> {searchResult.rawData[0].StandardStatus}</div>
                <div><strong>TransactionType:</strong> {searchResult.rawData[0].TransactionType}</div>
                <div><strong>MlsStatus:</strong> {searchResult.rawData[0].MlsStatus}</div>
                <div><strong>CloseDate:</strong> {searchResult.rawData[0].CloseDate || 'null'}</div>
                <div><strong>ListPrice:</strong> ${searchResult.rawData[0].ListPrice?.toLocaleString()}</div>
                <div><strong>City:</strong> {searchResult.rawData[0].City}</div>
                <div><strong>StreetNumber:</strong> {searchResult.rawData[0].StreetNumber}</div>
                <div><strong>StreetName:</strong> {searchResult.rawData[0].StreetName}</div>
                <div>+ {Object.keys(searchResult.rawData[0]).length - 8} more RESO fields</div>
              </div>
            </div>
          )}

          {/* Safety Confirmation */}
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2"> Database Save Confirmation</h3>
            <p className="text-yellow-700 text-sm mb-3">
              This will save {searchResult.total} listings to the database with all RESO fields mapped. Please review the data above before proceeding.
            </p>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="saveConfirm"
                checked={saveConfirmed}
                onChange={(e) => setSaveConfirmed(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="saveConfirm" className="text-sm text-yellow-700">
                I have reviewed the data and confirm I want to save these listings to the database
              </label>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || !saveConfirmed}
            className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
          >
            {saving ? 'Saving to Database...' : 'Save to Database'}
          </button>
        </div>
      )}

      {/* Save Results */}
      {saveResult && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Save Results</h2>
          
          <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
            <h3 className="font-semibold text-green-800">
               Successfully saved {saveResult.total} listings to database
            </h3>
            <div className="mt-2 text-sm text-green-700">
               New listings created: {saveResult.saved}
               Existing listings updated: {saveResult.updated}
               Building ID: {saveResult.buildingId}
            </div>
          </div>

          {saveResult.errors > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
              <h4 className="font-semibold text-yellow-800">
                 {saveResult.errors} errors occurred during save
              </h4>
              <div className="mt-2 text-sm text-yellow-700">
                {saveResult.errorDetails.map((error, index) => (
                  <div key={index}> {error}</div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-600">
              The building and its listings have been saved using RESO standard field mapping and are now available for assignment to agents.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
