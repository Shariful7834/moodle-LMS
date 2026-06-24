import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCredentials } from '../services/api';
import { Award, Share2, CheckCircle, Clock, Shield, GraduationCap, Bell, Upload } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

export default function Credentials() {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCredentials()
      .then(res => setCredentials(res.data.credentials || []))
      .catch(() => setCredentials([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        icon={Award}
        title={user.role === 'admin' ? 'All Credentials' : 'My Credentials'}
        subtitle={user.role === 'admin'
          ? 'All issued credentials in the wallet'
          : 'Your verified Open Badges 3.0 credentials. Tap any credential to share it or verify it externally.'}
        action={user.role === 'student'
          ? { label: 'Import from Moodle', to: '/moodle-badges', icon: GraduationCap }
          : null}
      />

      {credentials.length === 0 ? (
        user.role === 'student' ? (
          <EmptyState
            icon={Award}
            title="No credentials yet"
            description="Get your first credential in one of three ways, then you can share and verify it."
            actions={[
              { label: 'Import from Moodle', to: '/moodle-badges', icon: GraduationCap },
              { label: 'View Announcements', to: '/announcements', icon: Bell },
              { label: 'Upload Certificate', to: '/upload', icon: Upload },
            ]}
          />
        ) : (
          <EmptyState
            icon={Award}
            title="No credentials yet"
            description="No credentials have been issued in the wallet yet."
          />
        )
      ) : (
        <div className="space-y-4">
          {credentials.map(cred => (
            <Link
              key={cred.id}
              to={`/credentials/${cred.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0 ${
                    cred.shareApproved ? 'bg-green-50' : 'bg-gray-50'
                  }`}>
                    <Award className={`w-6 h-6 ${cred.shareApproved ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{cred.achievementName}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Issued by: {cred.issuerName}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(cred.issuedDate || cred.createdAt).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                        {cred.source === 'claim' ? 'From Announcement' : 'Uploaded'}
                      </span>
                      {user.role === 'admin' && cred.holderName && (
                        <span className="text-gray-500">Holder: {cred.holderName} ({cred.holderEmail})</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {cred.shareApproved ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg">
                      <Share2 className="w-3.5 h-3.5" />
                      Shareable
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-50 rounded-lg">
                      <Shield className="w-3.5 h-3.5" />
                      Not shareable
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded">
                    <CheckCircle className="w-3 h-3" />
                    OB 3.0
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
