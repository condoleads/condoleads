"use client";

import { useState } from 'react';

interface SaveButtonProps {
  searchResult: any;
  onSaveComplete: (result: any) => void;
}

export function ComprehensiveSaveButton({ searchResult, onSaveComplete }: SaveButtonProps) {
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const listings = searchResult.allListings || searchResult.enhancedData || [];
      const BATCH_SIZE = 30; // Smaller batches to avoid header size limit
      const batches = [];
      
      // Split into batches
      for (let i = 0; i < listings.length; i += BATCH_SIZE) {
        batches.push(listings.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`Saving ${listings.length} listings in ${batches.length} batches of ${BATCH_SIZE}`);
      
      let totalSaved = 0;
      
      for (let i = 0; i < batches.length; i++) {
        setProgress({ current: i + 1, total: batches.length });
        
        const payload = {
          building: searchResult.building,
          allListings: batches[i],
          isFirstBatch: i === 0,
          isLastBatch: i === batches.length - 1
        };
        
        const response = await fetch('/api/admin/buildings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.details || `Batch ${i + 1} failed`);
        }
        
        const result = await response.json();
        totalSaved += result.stats.listings_saved;
        
        console.log(` Batch ${i + 1}/${batches.length} saved: ${result.stats.listings_saved} listings`);
      }
      
      onSaveComplete({ 
        success: true, 
        building: searchResult.building,
        stats: { 
          listings_saved: totalSaved,
          media_records: 0,
          room_records: 0,
          open_house_records: 0
        },
        message: `Successfully saved ${totalSaved} listings`
      });
      
    } catch (error: any) {
      console.error('Save failed:', error);
      alert(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4">Save to Database</h3>
      
      {progress.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Progress</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving 
          ? `Saving batch ${progress.current}/${progress.total}...` 
          : ' Save All to Database'
        }
      </button>
    </div>
  );
}
