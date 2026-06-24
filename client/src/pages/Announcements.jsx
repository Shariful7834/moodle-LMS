import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getAnnouncements } from '../services/api';
import { Bell, Award, Building, Clock, CheckCircle, XCircle, Upload, AlertCircle, ExternalLink } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    getAnnouncements()
      .then(res => setAnnouncements(res.data.announcements || []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // Refetch when returning to this page/tab so submit status is never stale.
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleSubmitCertificate = (ann) => {
    // Navigate to upload page pre-filled with announcement details
    const params = new URLSearchParams({
      announcementId: ann.id,
      name: ann.achievementName,
      description: ann.achievementDescription || '',
      source: ann.sourceName || ann.source || ''
    });
    navigate(`/upload?${params.toString()}`);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        icon={Bell}
        title="Certificate Announcements"
        subtitle="Certificates requested by Moodle and other learning platforms. If you already have one, upload it for admin verification."
      />

      {/* How it works */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-800">How it works</h3>
            <ol className="text-xs text-blue-700 mt-1 space-y-1 list-decimal list-inside">
              <li>Moodle requests proof of a certificate (shown below)</li>
              <li>If you have this certificate, click <strong>"Submit Certificate"</strong> to upload your proof (PDF, image, or JSON)</li>
              <li>Admin reviews and verifies your uploaded certificate</li>
              <li>Once verified, an OB 3.0 credential is issued and can be shared with Moodle</li>
            </ol>
          </div>
        </div>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No announcements yet"
          description="When Moodle requests a certificate, it will appear here. Meanwhile, you can import badges from Moodle or upload a certificate."
          actions={[
            { label: 'Import from Moodle', to: '/moodle-badges', icon: Award },
            { label: 'Upload Certificate', to: '/upload', icon: Upload },
          ]}
        />
      ) : (
        <div className="space-y-4">
          {announcements.map(ann => {
            const upload = ann.myUpload;
            return (
              <div key={ann.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-50 flex-shrink-0">
                      <Award className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{ann.achievementName}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{ann.achievementDescription || 'No description provided'}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Building className="w-3 h-3" />
                          {ann.sourceName || ann.source}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(ann.createdAt).toLocaleDateString()}
                        </span>
                        {ann.courseId && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                            Course: {ann.courseId}
                          </span>
                        )}
                      </div>
                      {ann.criteria && (
                        <p className="text-xs text-gray-400 mt-1">Criteria: {ann.criteria}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {!upload ? (
                      <button
                        type="button"
                        onClick={() => handleSubmitCertificate(ann)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
                      >
                        <Upload className="w-4 h-4" />
                        Submit Certificate
                      </button>
                    ) : upload.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg">
                        <Clock className="w-4 h-4" />
                        Pending Verification
                      </span>
                    ) : upload.status === 'verified' ? (
                      <div className="flex flex-col items-end gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg">
                          <CheckCircle className="w-4 h-4" />
                          Verified &amp; Issued
                        </span>
                        {upload.credentialId && (
                          <Link
                            to={`/credentials/${upload.credentialId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View Credential
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg">
                          <XCircle className="w-4 h-4" />
                          Rejected
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSubmitCertificate(ann)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Resubmit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
