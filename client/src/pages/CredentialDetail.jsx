import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCredential, shareCredential, getCredentialJwt, getCredentialJwtUrl, revokeCredential, unrevokeCredential } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Award, Share2, Copy, ExternalLink, Clock, Shield, CheckCircle, ArrowLeft, FileKey, Download, Ban, RotateCcw, FileDown } from 'lucide-react';
import { generateCertificatePdf } from '../utils/certificatePdf';
import toast from 'react-hot-toast';

export default function CredentialDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cred, setCred] = useState(null);
  const [ob3, setOb3] = useState(null);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jwt, setJwt] = useState(null);

  const loadCredential = async () => {
    try {
      const res = await getCredential(id);
      setCred(res.data.credential);
      setOb3(res.data.ob3);
      setShares(res.data.shares || []);
    } catch {
      setCred(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadCredential();
    getCredentialJwt(id).then(r => setJwt(r.data)).catch(() => setJwt(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleShare = async () => {
    setSharing(true);
    try {
      const res = await shareCredential(id, 30);
      toast.success('Share link created!');
      const fullUrl = `${window.location.origin}/shared/${id}?token=${res.data.token}`;
      navigator.clipboard.writeText(fullUrl);
      toast.success('Link copied to clipboard');
      setShares(prev => [...prev, { token: res.data.token, expiresAt: res.data.expiresAt, createdAt: new Date().toISOString(), viewCount: 0 }]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Share failed');
    } finally {
      setSharing(false);
    }
  };

  const copyOb3 = () => {
    navigator.clipboard.writeText(JSON.stringify(ob3, null, 2));
    toast.success('OB 3.0 JSON copied');
  };

  const downloadJson = () => {
    if (!ob3) return;
    const blob = new Blob([JSON.stringify(ob3, null, 2)], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credential-${id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyJwt = () => {
    if (!jwt) return;
    navigator.clipboard.writeText(jwt);
    toast.success('JWT copied');
  };

  const downloadJwt = () => {
    if (!jwt) return;
    const url = getCredentialJwtUrl(id, true);
    window.open(url, '_blank', 'noopener');
  };

  const verifyOnCertLister = () => {
    if (jwt) navigator.clipboard.writeText(jwt);
    window.open('https://certlister.com/ob3-validator/', '_blank', 'noopener');
    if (jwt) toast.success('JWT copied — paste it on CertLister');
  };

  const downloadPdf = async () => {
    try {
      await generateCertificatePdf({
        cred,
        ob3,
        jwt,
        recipientName: cred.holderName || user.name || '',
        recipientEmail: cred.holderEmail || user.email || (ob3?.credentialSubject?.id || '').replace('mailto:', ''),
      });
    } catch (e) {
      toast.error(e.message || 'Could not generate PDF');
    }
  };

  const handleRevoke = async () => {
    const reason = window.prompt('Reason for revocation (optional):') || '';
    setBusy(true);
    try {
      await revokeCredential(id, reason);
      toast.success('Credential revoked');
      await loadCredential();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Revoke failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUnrevoke = async () => {
    setBusy(true);
    try {
      await unrevokeCredential(id);
      toast.success('Credential restored');
      await loadCredential();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  if (!cred) return <div className="text-center py-16"><p className="text-gray-500">Credential not found</p></div>;

  const isRevoked = cred.status === 'revoked';

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/credentials" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
        <ArrowLeft className="w-4 h-4" />
        Back to Credentials
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${isRevoked ? 'bg-red-50' : (cred.shareApproved ? 'bg-green-50' : 'bg-gray-100')}`}>
              <Award className={`w-7 h-7 ${isRevoked ? 'text-red-600' : (cred.shareApproved ? 'text-green-600' : 'text-gray-400')}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{cred.achievementName}</h1>
              <p className="text-sm text-gray-500 mt-1">Issued by: {cred.issuerName}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(cred.issuedDate || cred.createdAt).toLocaleString()}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-blue-50 text-blue-600">{cred.source === 'claim' ? 'From Announcement' : (cred.source === 'upload' ? 'Uploaded' : (cred.source === 'moodle_import' ? 'Moodle Import' : 'Issued'))}</span>
                {isRevoked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-red-50 text-red-600"><Ban className="w-3 h-3" />Revoked</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-indigo-50 text-indigo-600"><CheckCircle className="w-3 h-3" />Signed JWT-VC (ES256)</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download PDF
            </button>
            {cred.shareApproved ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg">
                <Share2 className="w-3.5 h-3.5" />
                Approved for Sharing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg">
                <Shield className="w-3.5 h-3.5" />
                Sharing Pending Approval
              </span>
            )}
          </div>
        </div>
      </div>

      {/* JWT-VC Section — present whenever a signed JWT exists */}
      {jwt && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <FileKey className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-700">Signed JWT-VC (Open Badges 3.0)</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Cryptographically signed credential (ES256). Verifiable on any 1EdTech OB 3.0 / W3C VC compliant verifier — including <a href="https://certlister.com/ob3-validator/" target="_blank" rel="noopener" className="text-indigo-600 underline">CertLister</a>.
          </p>
          <pre className="bg-gray-900 text-green-400 p-3 text-xs rounded-lg overflow-x-auto break-all whitespace-pre-wrap mb-3 max-h-32">{jwt}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copyJwt} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
              <Copy className="w-3.5 h-3.5" />Copy JWT
            </button>
            <button type="button" onClick={downloadJwt} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <Download className="w-3.5 h-3.5" />Download .jwt
            </button>
            <button type="button" onClick={verifyOnCertLister} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <ExternalLink className="w-3.5 h-3.5" />Verify on CertLister
            </button>
            <Link to="/verify" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <CheckCircle className="w-3.5 h-3.5" />Verify Locally
            </Link>
          </div>
        </div>
      )}

      {/* Admin: Revoke / Unrevoke */}
      {user.role === 'admin' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Admin Controls</h2>
          {isRevoked ? (
            <button type="button" onClick={handleUnrevoke} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition disabled:opacity-50">
              <RotateCcw className="w-4 h-4" />Restore Credential
            </button>
          ) : (
            <button type="button" onClick={handleRevoke} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition disabled:opacity-50">
              <Ban className="w-4 h-4" />Revoke Credential
            </button>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Revocation flips the bit at index <code>{cred.statusListIndex}</code> in StatusList <code>{cred.statusListId}</code>. Verifiers reading credentialStatus will see the change immediately.
          </p>
        </div>
      )}

      {/* Share Section */}
      {cred.shareApproved && !isRevoked && (user.role === 'student' || user.role === 'admin') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Share Credential</h2>
          <p className="text-xs text-gray-500 mb-4">Create a shareable link to send this credential to Moodle or other external services via REST API.</p>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            {sharing ? 'Creating…' : 'Create Share Link'}
          </button>

          {shares.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-gray-500">Active Share Links:</p>
              {shares.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <code className="flex-1 text-gray-600 truncate">{window.location.origin}/shared/{cred.id}?token={s.token}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/shared/${cred.id}?token=${s.token}`);
                      toast.success('Copied');
                    }}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-gray-400">Views: {s.viewCount || 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!cred.shareApproved && user.role === 'student' && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 mb-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Sharing Not Yet Approved</p>
            <p className="text-xs text-amber-600 mt-1">Admin must approve this credential before you can share it with external services like Moodle.</p>
          </div>
        </div>
      )}

      {/* OB 3.0 JSON */}
      {ob3 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-700">OB 3.0 / W3C VC 2.0 – JSON-LD payload</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copyOb3}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition">
                  <Copy className="w-3.5 h-3.5" />Copy JSON
                </button>
                <button type="button" onClick={downloadJson}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition">
                  <Download className="w-3.5 h-3.5" />Download .json
                </button>
                <Link to="/verify"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition">
                  <CheckCircle className="w-3.5 h-3.5" />Verify Locally
                </Link>
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
              ⚠ For external verification (CertLister), use <strong>Download .jwt</strong> or <strong>Copy JWT</strong>
              from the signed section above — <strong>not this .json</strong>. This JSON-LD has no embedded
              <code>proof</code> (our credential is secured as a JWT), so CertLister will reject it with
              "expected a JWT string." Use this JSON only for a local structure check or to inspect the fields.
            </p>
          </div>
          <pre className="bg-gray-900 text-green-400 p-4 text-xs overflow-x-auto max-h-96">
            {JSON.stringify(ob3, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
