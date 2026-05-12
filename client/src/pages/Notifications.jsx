import { useState, useEffect } from 'react';
import { getNotifications, grantAccess, denyAccess, revokeAccess } from '../services/api';
import { Bell, CheckCircle, XCircle, ShieldOff, Loader2, AlertCircle, Clock, ShieldCheck } from 'lucide-react';

export default function Notifications() {
  const [data, setData] = useState({ pending: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getNotifications();
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleGrant = async (requestId, serviceName) => {
    setProcessing(requestId);
    setSuccess('');
    setError('');
    try {
      const res = await grantAccess(requestId);
      setSuccess(`Access granted to ${serviceName}. Token issued (expires ${new Date(res.data.tokenExpiresAt).toLocaleDateString()}).`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
    } finally {
      setProcessing(null);
    }
  };

  const handleDeny = async (requestId, serviceName) => {
    setProcessing(requestId);
    setSuccess('');
    setError('');
    try {
      await denyAccess(requestId);
      setSuccess(`Access denied for ${serviceName}.`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deny access');
    } finally {
      setProcessing(null);
    }
  };

  const handleRevoke = async (requestId, serviceName) => {
    setProcessing(requestId);
    setSuccess('');
    setError('');
    try {
      await revokeAccess(requestId);
      setSuccess(`Access revoked for ${serviceName}.`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke access');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="w-7 h-7 text-indigo-600" />
          Access Requests
        </h1>
        <p className="text-gray-500 mt-1">
          External services requesting access to your credentials (Flow 1)
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Pending Requests */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-500" />
          Pending Requests
          {data.pending.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              {data.pending.length}
            </span>
          )}
        </h2>

        {data.pending.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No pending access requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.pending.map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{req.serviceName}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">Pending</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{req.message}</p>
                    {req.credentialType && (
                      <p className="text-xs text-gray-500">
                        Requesting: <span className="font-medium text-gray-700">{req.credentialType}</span>
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Requested: {new Date(req.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleGrant(req.id, req.serviceName)}
                      disabled={processing === req.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {processing === req.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(req.id, req.serviceName)}
                      disabled={processing === req.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {data.history.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gray-500" />
            History
          </h2>
          <div className="space-y-2">
            {data.history.map(req => (
              <div key={req.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900 text-sm">{req.serviceName}</span>
                  {req.credentialType && (
                    <span className="text-xs text-gray-500 ml-2">({req.credentialType})</span>
                  )}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                    req.status === 'approved' ? 'bg-green-100 text-green-700' :
                    req.status === 'denied' ? 'bg-red-100 text-red-700' :
                    req.status === 'revoked' ? 'bg-gray-100 text-gray-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {req.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(req.updatedAt || req.createdAt).toLocaleString()}
                  </p>
                </div>

                {req.status === 'approved' && (
                  <button
                    onClick={() => handleRevoke(req.id, req.serviceName)}
                    disabled={processing === req.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
