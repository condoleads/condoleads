"use client";

import { useState } from 'react';

interface CleanDatabaseButtonProps {
  onCleanComplete?: () => void;
}

export function CleanDatabaseButton({ onCleanComplete }: CleanDatabaseButtonProps) {
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleClean = async () => {
    if (!confirm('This will remove ALL building data. Are you sure?')) {
      return;
    }

    setCleaning(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/database/clean', {
        method: 'DELETE'
      });

      const data = await response.json();
      setResult(data);
      
      if (data.success && onCleanComplete) {
        onCleanComplete();
      }
    } catch (error) {
      console.error('Clean failed:', error);
      alert('Failed to clean database');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-red-900 mb-4">
         Database Cleanup
      </h3>
      <p className="text-sm text-red-700 mb-4">
        Warning: This will remove all building data from the database.
      </p>
      <button
        onClick={handleClean}
        disabled={cleaning}
        className={`px-4 py-2 rounded-lg font-medium ${
          cleaning
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
      >
        {cleaning ? 'Cleaning...' : 'Clean Database'}
      </button>
      
      {result && (
        <div className="mt-4 p-3 bg-white rounded">
          <p className="text-sm">{result.message}</p>
        </div>
      )}
    </div>
  );
}
