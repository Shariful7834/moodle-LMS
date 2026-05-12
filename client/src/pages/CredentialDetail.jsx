import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCredential, shareCredential } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Award, Share2, Copy, ExternalLink, Clock, Shield, CheckCircle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CredentialDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cred, setCred] = useState(null);
  const [ob3, setOb3] = useState(null);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    getCredential(id)
      .then(res => {
        setCred(res.data.credential);
        setOb3(res.data.ob3);
        setShares(res.data.shares || []);
      })
      .catch(() => setCred(null))
      .finally(() => setLoading(false));
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  if (!cred) return <div className="text-center py-16"><p className="text-gray-500">Credential not found</p></div>;

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
            <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${cred.shareApproved ? 'bg-green-50' : 'bg-gray-100'}`}>
              <Award className={`w-7 h-7 ${cred.shareApproved ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{cred.achievementName}</h1>
              <p className="text-sm text-gray-500 mt-1">Issued by: {cred.issuerName}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(cred.issuedDate || cred.createdAt).toLocaleString()}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-blue-50 text-blue-600">{cred.source === 'claim' ? 'From Announcement' : 'Uploaded'}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-indigo-50 text-indigo-600"><CheckCircle className="w-3 h-3" />OB 3.0 Verified</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
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

      {/* Share Section */}
      {cred.shareApproved && (user.role === 'student' || user.role === 'admin') && (
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
          <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Sharing Not Yet Approved</p>
            <p className="text-xs text-amber-600 mt-1">Admin must approve this credential before you can share it with external services like Moodle.</p>
          </div>
        </div>
      )}

      {/* OB 3.0 JSON */}
      {ob3 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">OB 3.0 / W3C VC 2.0 – JSON-LD</h2>
            <button
              type="button"
              onClick={copyOb3}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy JSON
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 p-4 text-xs overflow-x-auto max-h-96">
            {JSON.stringify(ob3, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
