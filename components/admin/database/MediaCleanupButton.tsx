"use client";

import { useState } from 'react';

export function MediaCleanupButton() {
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);

  const checkForDuplicates = async () => {
    setChecking(true);
    setCheckResult(null);
    
    try {
      const response = await fetch('/api/debug/media-check');
      const data = await response.json();
      setCheckResult(data);
    } catch (error) {
      console.error('Check failed:', error);
      alert('Failed to check for duplicates');
    } finally {
      setChecking(false);
    }
  };

  const cleanupDuplicates = async () => {
    if (!confirm('This will remove all duplicate media records. Continue?')) {
      return;
    }

    setCleaning(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/debug/media-check', {
        method: 'DELETE'
      });
      
      const data = await response.json();
      setResult(data);
      
      if (data.success) {
        alert(`Successfully cleaned up ${data.totalDeleted} duplicate media records!`);
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      alert('Failed to clean up duplicates');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-yellow-900 mb-4">
         Media Duplicate Checker
      </h3>
      
      <div className="flex gap-4 mb-4">
        <button
          onClick={checkForDuplicates}
          disabled={checking}
          className={`px-4 py-2 rounded-lg font-medium ${
            checking
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {checking ? 'Checking...' : 'Check for Duplicates'}
        </button>
        
        <button
          onClick={cleanupDuplicates}
          disabled={cleaning}
          className={`px-4 py-2 rounded-lg font-medium ${
            cleaning
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {cleaning ? 'Cleaning...' : 'Remove All Duplicates'}
        </button>
      </div>

      {checkResult && (
        <div className="bg-white rounded-lg p-4 mb-4">
          <h4 className="font-semibold mb-2">Check Results:</h4>
          <div className="text-sm space-y-1">
            <p>Sample Listing: MLS #{checkResult.listing?.listing_key}</p>
            <p className="font-semibold text-red-600">
              Total Media Records: {checkResult.totalMediaRecords}
            </p>
            <p className="font-semibold text-green-600">
              Unique URLs: {checkResult.uniqueUrls}
            </p>
            {checkResult.duplicateUrls > 0 && (
              <p className="text-red-600 font-bold">
                 Found {checkResult.duplicateUrls} duplicate URLs!
              </p>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="bg-green-50 rounded-lg p-4">
          <h4 className="font-semibold text-green-800 mb-2">Cleanup Complete!</h4>
          <p className="text-green-700">
            {result.message}
          </p>
        </div>
      )}
    </div>
  );
}
