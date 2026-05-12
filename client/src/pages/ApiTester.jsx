import { useState, useRef } from 'react';
import { announceCertificate, verifyCredential, getApiHealth, getApiInfo } from '../services/api';
import { Zap, Send, CheckCircle, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { appConfig } from '../config/appConfig';

export default function ApiTester() {
  const [apiKey, setApiKey] = useState(appConfig.defaultMoodleApiKey);
  const [activeTest, setActiveTest] = useState('announce');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const sending = useRef(false);

  const [annForm, setAnnForm] = useState({
    achievement_name: 'Web Development Fundamentals',
    achievement_description: 'Completed the Full-Stack Web Development course with distinction',
    issuer_name: 'Moodle Learning Platform',
    course_id: 'CS101',
    criteria: 'Pass all course modules with 70% or above',
  });

  const [verifyForm, setVerifyForm] = useState('');

  const handleAnnounce = async () => {
    if (sending.current) return;
    if (!apiKey.trim()) { toast.error('Enter an API key'); return; }
    sending.current = true;
    setLoading(true);
    setResponse(null);
    try {
      const res = await announceCertificate(annForm, apiKey);
      setResponse(res.data);
      toast.success('Announcement sent!');
    } catch (err) {
      setResponse(err.response?.data || { error: 'Request failed' });
    } finally {
      setLoading(false);
      sending.current = false;
    }
  };

  const handleVerify = async () => {
    if (!verifyForm.trim()) { toast.error('Paste a credential JSON'); return; }
    setLoading(true);
    setResponse(null);
    try {
      const res = await verifyCredential(verifyForm);
      setResponse(res.data);
    } catch (err) {
      setResponse(err.response?.data || { error: 'Verification failed' });
    } finally { setLoading(false); }
  };

  const handleHealth = async () => {
    setLoading(true); setResponse(null);
    try { const res = await getApiHealth(); setResponse(res.data); }
    catch (err) { setResponse(err.response?.data || { error: 'Failed' }); }
    finally { setLoading(false); }
  };

  const handleInfo = async () => {
    setLoading(true); setResponse(null);
    try { const res = await getApiInfo(); setResponse(res.data); }
    catch (err) { setResponse(err.response?.data || { error: 'Failed' }); }
    finally { setLoading(false); }
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    toast.success('Copied');
  };

  const tests = [
    { id: 'announce', label: 'Announce Certificate (Moodle)' },
    { id: 'verify', label: 'Verify Credential' },
    { id: 'health', label: 'Health Check' },
    { id: 'info', label: 'API Info' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">API Tester</h1>
        <p className="text-gray-500 text-sm mt-1">
          Simulate Moodle sending certificate announcements and test other API endpoints
        </p>
      </div>

      {/* API Key */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">API Key (X-API-Key)</label>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder="Enter API key"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>

      {/* Test Selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tests.map(t => (
          <button key={t.id} type="button" onClick={() => { setActiveTest(t.id); setResponse(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTest === t.id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Test Forms */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        {activeTest === 'announce' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">POST /api/announce-certificate</h3>
            <p className="text-xs text-gray-500">Simulates Moodle announcing a course certificate. ALL students in the wallet will see it.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Achievement Name *</label>
                <input value={annForm.achievement_name} onChange={e => setAnnForm(p => ({ ...p, achievement_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Issuer Name</label>
                <input value={annForm.issuer_name} onChange={e => setAnnForm(p => ({ ...p, issuer_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Course ID</label>
                <input value={annForm.course_id} onChange={e => setAnnForm(p => ({ ...p, course_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Criteria</label>
                <input value={annForm.criteria} onChange={e => setAnnForm(p => ({ ...p, criteria: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea value={annForm.achievement_description} onChange={e => setAnnForm(p => ({ ...p, achievement_description: e.target.value }))}
                rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <button type="button" onClick={handleAnnounce} disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
              <Send className="w-4 h-4" />{loading ? 'Sending…' : 'Send Announcement'}
            </button>
          </div>
        )}

        {activeTest === 'verify' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">POST /api/verify</h3>
            <p className="text-xs text-gray-500">Verify an OB 3.0 credential JSON</p>
            <textarea value={verifyForm} onChange={e => setVerifyForm(e.target.value)} rows="8" placeholder="Paste OB 3.0 JSON here…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
            <button type="button" onClick={handleVerify} disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
              <CheckCircle className="w-4 h-4" />{loading ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        )}

        {activeTest === 'health' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">GET /api/health</h3>
            <button type="button" onClick={handleHealth} disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50">
              <CheckCircle className="w-4 h-4" />{loading ? 'Checking…' : 'Check Health'}
            </button>
          </div>
        )}

        {activeTest === 'info' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">GET /api/info</h3>
            <button type="button" onClick={handleInfo} disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition disabled:opacity-50">
              <Zap className="w-4 h-4" />{loading ? 'Loading…' : 'Get Info'}
            </button>
          </div>
        )}
      </div>

      {/* Response */}
      {response && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">API Response</h3>
            <button type="button" onClick={copyResponse}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50">
              <Copy className="w-3.5 h-3.5" />Copy
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 p-4 text-xs overflow-x-auto max-h-96">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
