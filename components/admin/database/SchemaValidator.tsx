"use client";

import { useState } from 'react';

export default function SchemaValidator() {
  const [schema, setSchema] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [testRecord, setTestRecord] = useState('');
  const [tableName, setTableName] = useState('buildings');
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/database/validate-schema');
      const data = await response.json();
      
      if (data.success) {
        setSchema(data);
      } else {
        setError(data.error || 'Failed to fetch schema');
      }
    } catch (error) {
      console.error('Failed to fetch schema:', error);
      setError('Failed to fetch schema');
    } finally {
      setLoading(false);
    }
  };

  const validateRecord = async () => {
    if (!testRecord.trim()) {
      alert('Please enter a test record');
      return;
    }
    
    try {
      const recordData = JSON.parse(testRecord);
      const response = await fetch('/api/admin/database/validate-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tableName,
          recordData
        })
      });
      
      const result = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Validation failed:', error);
      alert('Invalid JSON in test record or validation failed');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Database Schema Validator</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Schema Display */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Database Schema</h2>
          
          <button
            onClick={fetchSchema}
            disabled={loading}
            className="mb-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Fetch Current Schema'}
          </button>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          {schema && schema.schema && (
            <div className="space-y-4">
              {Object.entries(schema.schema).map(([table, columns]: [string, any]) => {
                // Ensure columns is an array
                const columnArray = Array.isArray(columns) ? columns : [];
                
                return (
                  <div key={table} className="border rounded p-3">
                    <h3 className="font-bold text-lg mb-2">{table}</h3>
                    <div className="text-sm space-y-1">
                      {columnArray.map((col: any, idx: number) => (
                        <div key={idx} className="flex justify-between">
                          <span className="font-mono">{col.column_name || col.column}</span>
                          <span className="text-gray-600">
                            {col.data_type || col.type} {(col.is_nullable || col.nullable) ? '(nullable)' : '(required)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Record Validation */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Validate Record</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Table Name</label>
            <select
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="buildings">buildings</option>
              <option value="mls_listings">mls_listings</option>
              <option value="media">media</option>
              <option value="property_rooms">property_rooms</option>
              <option value="agents">agents</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Test Record (JSON)</label>
            <textarea
              value={testRecord}
              onChange={(e) => setTestRecord(e.target.value)}
              placeholder='{"field1": "value1", "field2": "value2"}'
              className="w-full h-32 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          <button
            onClick={validateRecord}
            className="mb-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Validate Record
          </button>

          {validationResult && (
            <div className={`border rounded p-4 ${
              validationResult.validation?.isValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}>
              <h3 className="font-bold mb-2">{validationResult.message}</h3>
              
              <div className="text-sm space-y-2">
                <div>
                  <strong>Valid Fields:</strong> {validationResult.validation?.validCount || 0}
                </div>
                <div>
                  <strong>Invalid Fields:</strong> {validationResult.validation?.invalidCount || 0}
                </div>
                
                {validationResult.validation?.invalidFields?.length > 0 && (
                  <div className="mt-3">
                    <strong className="text-red-700">Invalid Fields:</strong>
                    <ul className="mt-1 space-y-1">
                      {validationResult.validation.invalidFields.map((field: any, idx: number) => (
                        <li key={idx} className="text-red-600 text-sm">
                          <span className="font-mono">{field.field}</span>: {field.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationResult.validation?.missingFields?.length > 0 && (
                  <div className="mt-3">
                    <strong className="text-red-700">Missing Required Fields:</strong>
                    <ul className="mt-1 space-y-1">
                      {validationResult.validation.missingFields.map((field: any, idx: number) => (
                        <li key={idx} className="text-red-600 text-sm">
                          <span className="font-mono">{field.field}</span> ({field.type}): {field.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Test Section */}
      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Building Record Test</h2>
        <button
          onClick={() => setTestRecord('{"slug": "test-building", "building_name": "Test Building", "canonical_address": "123 Test St"}')}
          className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 mr-4"
        >
          Load Test Building Record
        </button>
        <button
          onClick={() => setTestRecord('{"invalid_field": "value", "another_invalid": "test"}')}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Load Invalid Record
        </button>
      </div>
    </div>
  );
}
