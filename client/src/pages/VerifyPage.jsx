import { useState } from 'react';
import { verifyCredential } from '../services/api';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VerifyPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text); // validate
      setJsonInput(text);
      toast.success('File loaded');
    } catch {
      toast.error('Invalid JSON file');
    }
  };

  const handleVerify = async () => {
    if (!jsonInput.trim()) { toast.error('Paste or upload a credential JSON'); return; }
    try { JSON.parse(jsonInput); } catch { toast.error('Invalid JSON format'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await verifyCredential(jsonInput);
      setResult(res.data);
    } catch (err) {
      setResult(err.response?.data || { valid: false, errors: ['Verification request failed'] });
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-indigo-600" />
          Verify OB 3.0 Credential
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Verify if a credential follows the Open Badges 3.0 / W3C Verifiable Credentials standard
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Credential JSON</label>
        <textarea
          value={jsonInput}
          onChange={e => setJsonInput(e.target.value)}
          rows="12"
          placeholder='{"@context": ["https://www.w3.org/ns/credentials/v2", ...], "type": ["VerifiableCredential", "OpenBadgeCredential"], ...}'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleVerify} disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
            <ShieldCheck className="w-4 h-4" />{loading ? 'Verifying…' : 'Verify Credential'}
          </button>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer transition">
            <Upload className="w-4 h-4" />Upload JSON
            <input type="file" accept=".json" onChange={handleFile} className="hidden" />
          </label>
        </div>
      </div>

      {result && (
        <div className={`rounded-xl border p-6 ${result.verified ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            {result.verified ? (
              <><CheckCircle className="w-6 h-6 text-green-600" /><h2 className="text-lg font-bold text-green-800">Valid Credential</h2></>
            ) : (
              <><XCircle className="w-6 h-6 text-red-600" /><h2 className="text-lg font-bold text-red-800">Invalid Credential</h2></>
            )}
          </div>

          {result.checks && result.checks.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Validation Checks</h3>
              <div className="space-y-1.5">
                {result.checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {check.passed ? (
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className={check.passed ? 'text-green-700' : 'text-red-700'}>{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-red-700 mb-2">Errors</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          {(result.issuerName || result.achievementName || result.credentialId) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Credential Details</h3>
              <div className="bg-white rounded-lg p-4 text-sm space-y-2 border border-gray-200">
                {result.issuerName && <p><span className="font-medium">Issuer:</span> {result.issuerName}</p>}
                {result.achievementName && <p><span className="font-medium">Achievement:</span> {result.achievementName}</p>}
                {result.credentialId && <p><span className="font-medium">Credential ID:</span> {result.credentialId}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* OB 3.0 format info */}
      <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-800 flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4" />Expected OB 3.0 Format
        </h3>
        <p className="text-xs text-indigo-700 mb-2">A valid Open Badges 3.0 credential must include:</p>
        <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside">
          <li>@context with W3C credentials/v2 and OB 3.0 context</li>
          <li>type array with "VerifiableCredential" and "OpenBadgeCredential"</li>
          <li>issuer with id and name</li>
          <li>credentialSubject with achievement details</li>
          <li>validFrom date</li>
        </ul>
      </div>
    </div>
  );
}
