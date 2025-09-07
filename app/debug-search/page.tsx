'use client';

import { useState } from 'react';

export default function DebugSearchPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runDebugSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/debug-proptx-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: '101 Charles St East' })
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: 'Failed to run debug search' });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">PropTx Search Debug</h1>
      
      <button 
        onClick={runDebugSearch}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-6"
      >
        {loading ? 'Running Debug...' : 'Debug PropTx Search'}
      </button>

      {result && (
        <div className="bg-gray-100 p-4 rounded">
          <pre className="text-xs overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}