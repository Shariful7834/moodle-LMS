import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getAnnouncements } from '../services/api';
import { Bell, Award, Building, Clock, CheckCircle, XCircle, Upload, AlertCircle, ExternalLink } from 'lucide-react';

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

  useEffect(() => { fetchData(); }, []);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Certificate Announcements</h1>
        <p className="text-gray-500 text-sm mt-1">
          Certificates requested by Moodle and other learning platforms. If you already have this certificate, upload it for admin verification.
        </p>
      </div>

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
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No announcements yet</p>
          <p className="text-gray-400 text-sm mt-1">When Moodle requests a certificate, it will appear here</p>
        </div>
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
