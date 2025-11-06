'use client';

import { useState } from 'react';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('kingshahrealtor@gmail.com');
  const [password, setPassword] = useState('Test123!');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const resetPassword = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      // Call API route with service role
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '604f1751-3ff6-468a-9f1d-2b43f18b7906',
          password: password
        })
      });

      const data = await response.json();

      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(' Password updated successfully! Try logging in now.');
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6">Reset John's Password</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              className="w-full px-4 py-2 border rounded-lg bg-gray-50"
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <button
            onClick={resetPassword}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Updating...' : 'Reset Password'}
          </button>

          {message && (
            <div className={`p-4 rounded-lg ${message.includes('') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message}
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <p className="text-sm font-medium mb-2">After reset, login with:</p>
          <p className="text-sm">Email: {email}</p>
          <p className="text-sm">Password: {password}</p>
        </div>
      </div>
    </div>
  );
}