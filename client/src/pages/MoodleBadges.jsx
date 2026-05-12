import { useState, useEffect } from 'react';
import { getMoodleBadges, importMoodleBadge } from '../services/api';
import { Download, CheckCircle, Loader2, AlertCircle, GraduationCap } from 'lucide-react';

export default function MoodleBadges() {
  const [badges, setBadges] = useState([]);
  const [moodleUserId, setMoodleUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchBadges = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMoodleBadges();
      setBadges(res.data.badges || []);
      setMoodleUserId(res.data.moodleUserId || null);
      if (res.data.message) setError(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load Moodle badges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBadges(); }, []);

  const handleImport = async (badge) => {
    setImporting(badge.id);
    setSuccessMsg('');
    setError('');
    try {
      await importMoodleBadge(badge.id, moodleUserId);
      setSuccessMsg(`"${badge.name}" imported successfully as OB 3.0 credential!`);
      // Refresh list to update alreadyImported status
      await fetchBadges();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import badge');
    } finally {
      setImporting(null);
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
          <GraduationCap className="w-7 h-7 text-indigo-600" />
          Moodle Badges
        </h1>
        <p className="text-gray-500 mt-1">
          Import your Moodle badges into your Academic Wallet as Open Badges 3.0 credentials
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{successMsg}</span>
        </div>
      )}

      {badges.length === 0 && !error ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No Moodle badges found for your account.</p>
          <p className="text-sm text-gray-400 mt-1">
            Make sure your wallet email matches your Moodle account email.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{badge.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{badge.description}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                    <span>Issuer: <span className="font-medium text-gray-700">{badge.issuername}</span></span>
                    {badge.dateissued && (
                      <span>Issued: <span className="font-medium text-gray-700">
                        {new Date(badge.dateissued * 1000).toLocaleDateString()}
                      </span></span>
                    )}
                    {badge.dateexpire && (
                      <span>Expires: <span className="font-medium text-gray-700">
                        {new Date(badge.dateexpire * 1000).toLocaleDateString()}
                      </span></span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {badge.alreadyImported ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      Imported
                    </span>
                  ) : (
                    <button
                      onClick={() => handleImport(badge)}
                      disabled={importing === badge.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {importing === badge.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing…
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Import to Wallet
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
