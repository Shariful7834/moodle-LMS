import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicCredential, verifyJwt } from '../services/api';
import { Award, CheckCircle, XCircle, ExternalLink, AlertTriangle, Copy, ShieldCheck, FileDown, Loader2 } from 'lucide-react';
import { generateCertificatePdf } from '../utils/certificatePdf';
import toast from 'react-hot-toast';

export default function SharedCredential() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [credential, setCredential] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getPublicCredential(id, token);
        setCredential(res.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Credential not found or not available for sharing');
      } finally { setLoading(false); }
    })();
  }, [id, token]);

  const copyJson = () => {
    const ob3 = credential?.credential?.ob3Credential || credential?.credential?.ob3;
    if (ob3) {
      navigator.clipboard.writeText(JSON.stringify(ob3, null, 2));
      toast.success('Copied');
    }
  };

  const runVerify = async () => {
    const jwt = credential?.credential?.jwt;
    if (!jwt) { toast.error('No signed credential available to verify'); return; }
    setVerifying(true);
    try {
      const res = await verifyJwt(jwt);
      setVerifyResult(res.data);
    } catch (err) {
      setVerifyResult({ verified: false, checks: [{ name: 'error', passed: false, message: err.response?.data?.error || 'Verification failed' }] });
    } finally {
      setVerifying(false);
    }
  };

  const copyJwt = () => {
    const jwt = credential?.credential?.jwt;
    if (!jwt) return;
    navigator.clipboard.writeText(jwt);
    toast.success('Signed credential (JWT) copied');
  };

  const verifyOnCertLister = () => {
    const jwt = credential?.credential?.jwt;
    if (jwt) navigator.clipboard.writeText(jwt);
    window.open('https://certlister.com/ob3-validator/', '_blank', 'noopener');
    if (jwt) toast.success('JWT copied — paste it on CertLister');
  };

  const downloadPdf = async () => {
    const c = credential?.credential;
    if (!c) return;
    try {
      await generateCertificatePdf({
        cred: {
          achievementName: c.achievementName,
          achievementDescription: c.achievementDescription,
          issuerName: c.issuerName,
          issuedDate: c.issuedAt,
          status: c.status,
        },
        ob3: c.ob3Credential || c.ob3,
        jwt: c.jwt,
        recipientName: c.holderName || '',
        recipientEmail: c.holderEmail || '',
      });
    } catch (e) {
      toast.error(e.message || 'Could not generate PDF');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Credential Unavailable</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const cred = credential?.credential;
  const ob3 = cred?.ob3Credential || cred?.ob3;

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <CheckCircle className="w-4 h-4" />Verified Open Badge 3.0 Credential
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{cred?.achievementName || 'Achievement'}</h1>
          {credential?.sharedBy && (
            <p className="text-gray-500 text-sm mt-2">Shared by {credential.sharedBy}</p>
          )}
        </div>

        {/* Credential Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-linear-to-r from-indigo-600 to-purple-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <Award className="w-8 h-8 text-white" />
              <div>
                <p className="text-white font-bold text-lg">{cred?.achievementName}</p>
                <p className="text-indigo-200 text-sm">{cred?.issuerName || 'Academic Achievement Wallet'}</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {cred?.achievementDescription && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Description</label>
                <p className="text-sm text-gray-700 mt-1">{cred.achievementDescription}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Holder</label>
                <p className="text-sm text-gray-700 mt-1">{cred?.holderName || cred?.holderEmail || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Issued</label>
                <p className="text-sm text-gray-700 mt-1">
                  {cred?.issuedAt ? new Date(cred.issuedAt).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Source</label>
                <p className="text-sm text-gray-700 mt-1 capitalize">{cred?.source || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Status</label>
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full mt-1">
                  <CheckCircle className="w-3.5 h-3.5" />Verified
                </span>
              </div>
            </div>

            {/* Recognition chips (type / alignment / tags) */}
            {(() => {
              const ach = ob3?.credentialSubject?.achievement || {};
              const aligns = Array.isArray(ach.alignment) ? ach.alignment : [];
              const tags = Array.isArray(ach.tag) ? ach.tag : [];
              if (!ach.achievementType && aligns.length === 0 && tags.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {ach.achievementType && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700">Type: {ach.achievementType}</span>
                  )}
                  {aligns.map((a, i) => (
                    <span key={`al-${i}`} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700">Aligned: {a.targetCode || a.targetName}{a.targetFramework ? ` (${a.targetFramework})` : ''}</span>
                  ))}
                  {tags.map((t, i) => (
                    <span key={`tg-${i}`} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">#{t}</span>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* OB 3.0 JSON */}
        {ob3 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <button type="button" onClick={() => setShowJson(!showJson)}
                className="text-sm font-semibold text-gray-700 hover:text-indigo-600 transition">
                {showJson ? 'Hide' : 'Show'} OB 3.0 JSON-LD
              </button>
              <button type="button" onClick={copyJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50">
                <Copy className="w-3.5 h-3.5" />Copy JSON
              </button>
            </div>
            {showJson && (
              <pre className="bg-gray-900 text-green-400 p-4 text-xs overflow-x-auto max-h-96">
                {JSON.stringify(ob3, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Verify authenticity — lets an employer/university confirm this independently */}
        {cred?.jwt && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-6">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Verify authenticity</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Confirm this credential is genuine and unaltered — checked cryptographically against the issuer's published key. No account needed.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={runVerify} disabled={verifying}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {verifying ? 'Verifying…' : 'Verify this credential'}
              </button>
              <button type="button" onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                <FileDown className="w-4 h-4" />Download PDF
              </button>
              <button type="button" onClick={copyJwt}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                <Copy className="w-4 h-4" />Copy JWT
              </button>
              <button type="button" onClick={verifyOnCertLister}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                <ExternalLink className="w-4 h-4" />Verify on CertLister
              </button>
            </div>

            {verifyResult && (
              <div className="mt-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium mb-3 ${
                  verifyResult.verified ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {verifyResult.verified ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {verifyResult.verified ? 'Verified — authentic and unaltered' : 'Could not fully verify'}
                </div>
                <div className="space-y-1.5">
                  {(verifyResult.checks || []).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {c.passed
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />}
                      <span className="text-gray-600"><span className="font-medium text-gray-800">{c.name}:</span> {c.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-400">
            Powered by Academic Achievement Wallet &middot; Open Badges 3.0 &middot; W3C Verifiable Credentials
          </p>
        </div>
      </div>
    </div>
  );
}
