import { useState, useEffect } from 'react';
import { verifyCredential, verifyJwt, verifyByUrl } from '../services/api';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Upload, FileJson, FileKey, Link as LinkIcon, ExternalLink, Copy } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'jwt', label: 'Paste JWT', icon: FileKey },
  { id: 'json', label: 'Paste JSON', icon: FileJson },
  { id: 'url', label: 'Fetch by URL', icon: LinkIcon }
];

export default function VerifyPage() {
  const [tab, setTab] = useState('jwt');
  const [jwtInput, setJwtInput] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const loadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = (await file.text()).trim();
    if (file.name.endsWith('.jwt') || (text.split('.').length === 3 && !text.startsWith('{'))) {
      setJwtInput(text);
      setTab('jwt');
      toast.success('JWT loaded');
    } else {
      try {
        JSON.parse(text);
        setJsonInput(text);
        setTab('json');
        toast.success('JSON loaded');
      } catch {
        toast.error('File is neither valid JWT nor JSON');
      }
    }
  };

  // Run verification for an explicit mode+value (used by the button and by QR deep-links).
  const runVerifyValue = async (mode, value) => {
    setLoading(true);
    setResult(null);
    try {
      let res;
      if (mode === 'jwt') res = await verifyJwt(value.trim());
      else if (mode === 'json') res = await verifyCredential(value);
      else res = await verifyByUrl(value.trim());
      setResult(res.data);
    } catch (err) {
      setResult(err.response?.data || { verified: false, errors: [err.message || 'Verification failed'] });
    } finally {
      setLoading(false);
    }
  };

  const runVerify = async () => {
    if (tab === 'jwt') {
      if (!jwtInput.trim()) { toast.error('Paste a JWT'); return; }
      return runVerifyValue('jwt', jwtInput);
    }
    if (tab === 'json') {
      if (!jsonInput.trim()) { toast.error('Paste a JSON credential'); return; }
      try { JSON.parse(jsonInput); } catch { toast.error('Invalid JSON'); return; }
      return runVerifyValue('json', jsonInput);
    }
    if (!urlInput.trim()) { toast.error('Enter a URL'); return; }
    return runVerifyValue('url', urlInput);
  };

  // Auto-verify from a deep link (e.g. a scanned QR code): /verify?url=... or /verify?jwt=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const jwt = params.get('jwt');
    if (url) { setTab('url'); setUrlInput(url); runVerifyValue('url', url); }
    else if (jwt) { setTab('jwt'); setJwtInput(jwt); runVerifyValue('jwt', jwt); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyResult = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast.success('Result copied');
  };

  const openCertLister = () => {
    window.open('https://certlister.com/ob3-validator/', '_blank', 'noopener');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        icon={ShieldCheck}
        title="Verify OB 3.0 Credential"
        subtitle="Verify a JWT-VC, JSON-LD credential, or fetch one by URL. Validates structure, expiry, status list, and cryptographic signature (ES256 over did:web)."
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition border ${tab === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        {tab === 'jwt' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">JWT-VC (compact form: header.payload.signature)</label>
            <textarea
              value={jwtInput}
              onChange={e => setJwtInput(e.target.value)}
              rows="8"
              placeholder="eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRpZDp3ZWI6Li4uIn0.eyJpc3MiOi..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono break-all focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
            />
          </>
        )}
        {tab === 'json' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">Credential JSON-LD</label>
            <textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              rows="12"
              placeholder='{"@context": ["https://www.w3.org/ns/credentials/v2", ...], "type": ["VerifiableCredential", "OpenBadgeCredential"], ...}'
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
            />
          </>
        )}
        {tab === 'url' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">Credential URL</label>
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://wallet.example.com/api/badges/credentials/<uuid>"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
            />
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={runVerify} disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
            <ShieldCheck className="w-4 h-4" />{loading ? 'Verifying…' : 'Verify Credential'}
          </button>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer transition">
            <Upload className="w-4 h-4" />Upload .jwt or .json
            <input type="file" accept=".json,.jwt,application/json,application/jwt" onChange={loadFile} className="hidden" />
          </label>
          <button type="button" onClick={openCertLister}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition ml-auto">
            <ExternalLink className="w-4 h-4" />Verify on CertLister
          </button>
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
            {result.mode && (
              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-gray-200 text-gray-600">
                mode: {result.mode}
              </span>
            )}
            <button type="button" onClick={copyResult}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded">
              <Copy className="w-3 h-3" />JSON
            </button>
          </div>

          {result.checks && result.checks.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Validation Checks</h3>
              <div className="space-y-1.5">
                {result.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {check.passed ? (
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className={check.passed ? 'text-green-700' : 'text-red-700'}>
                        <strong>{check.name}:</strong> {check.message}
                      </span>
                    </div>
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

          {(result.issuerName || result.achievementName || result.credentialId || result.issuerDid) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Credential Details</h3>
              <div className="bg-white rounded-lg p-4 text-sm space-y-2 border border-gray-200">
                {result.issuerName && <p><span className="font-medium">Issuer:</span> {result.issuerName}</p>}
                {result.issuerDid && <p className="break-all"><span className="font-medium">Issuer DID:</span> <code className="text-xs">{result.issuerDid}</code></p>}
                {result.achievementName && <p><span className="font-medium">Achievement:</span> {result.achievementName}</p>}
                {result.achievementType && <p><span className="font-medium">Type:</span> {result.achievementType}</p>}
                {result.credentialId && <p className="break-all"><span className="font-medium">Credential ID:</span> <code className="text-xs">{result.credentialId}</code></p>}
              </div>
            </div>
          )}

          {result.jwt && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">JWT Claims</h3>
              <pre className="bg-gray-900 text-green-400 p-3 text-xs rounded-lg overflow-x-auto">
{JSON.stringify(result.jwt, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* OB 3.0 format info */}
      <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-indigo-800 flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4" />Expected OB 3.0 Format
        </h3>
        <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside">
          <li>JWT-VC (ES256) signed by did:web issuer with kid header</li>
          <li>@context with W3C credentials/v2 + OB 3.0 context-3.0.3.json</li>
          <li>type: ["VerifiableCredential", "OpenBadgeCredential"]</li>
          <li>credentialSubject.identifier with hashed:true + sha256$&lt;hex&gt;</li>
          <li>credentialStatus → StatusList2021Entry (revocation)</li>
          <li>HTTPS dereferenceable id, achievement.id, issuer DID document</li>
        </ul>
      </div>
    </div>
  );
}
