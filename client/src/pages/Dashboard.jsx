import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCredentials, getAnnouncements, getMyUploads, getAdminStats } from '../services/api';
import { Award, Bell, Upload, Users, ArrowRight, CheckCircle, Clock, Search, GraduationCap, Share2 } from 'lucide-react';
import GuidanceBanner from '../components/ui/GuidanceBanner';

function StatCard({ icon: Icon, label, value, color, to }) {
  const card = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {to && <ArrowRight className="w-4 h-4 text-gray-400" />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        if (user.role === 'admin') {
          const res = await getAdminStats();
          setStats(res.data);
        } else if (user.role === 'student') {
          const [credRes, annRes, upRes] = await Promise.all([
            getCredentials(), getAnnouncements(), getMyUploads()
          ]);
          setStats({
            credentials: credRes.data.credentials?.length || 0,
            announcements: annRes.data.announcements?.length || 0,
            uploads: upRes.data.uploads?.length || 0,
            pendingUploads: (upRes.data.uploads || []).filter(u => u.status === 'pending').length,
          });
        } else {
          const credRes = await getCredentials();
          setStats({ credentials: credRes.data.credentials?.length || 0 });
        }
      } catch { setStats(null); }
      finally { setLoading(false); }
    };
    fetch();
  }, [user.role]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user.name}</h1>
        <p className="text-gray-500 mt-1">
          {user.role === 'admin'
            ? 'Verify credentials and manage the wallet system'
            : user.role === 'student'
            ? 'View announcements, manage credentials, and share your achievements'
            : 'Search and view student achievements'}
        </p>
      </div>

      {/* Admin Stats */}
      {user.role === 'admin' && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Upload} label="Pending Uploads" value={stats.uploads?.pending || 0} color="bg-orange-500" to="/admin" />
          <StatCard icon={Award} label="Issued Credentials" value={stats.credentials?.issued || 0} color="bg-green-500" to="/admin" />
          <StatCard icon={Bell} label="Active Announcements" value={stats.announcements?.active || 0} color="bg-amber-500" to="/admin" />
          <StatCard icon={Users} label="Total Users" value={stats.users?.total || 0} color="bg-blue-500" to="/admin" />
        </div>
      )}

      {/* Student: single clearest next step */}
      {user.role === 'student' && stats && (
        <div className="mb-8">
          {stats.credentials === 0 ? (
            <GuidanceBanner
              icon={GraduationCap}
              title="Start here: get your first credential"
              description="Import a badge from Moodle, or upload a certificate for verification."
              action={{ label: 'Import from Moodle', to: '/moodle-badges' }}
            />
          ) : stats.pendingUploads > 0 ? (
            <GuidanceBanner
              icon={Clock}
              title={`${stats.pendingUploads} certificate${stats.pendingUploads > 1 ? 's' : ''} awaiting verification`}
              description="An admin reviews uploads. Approved ones become verifiable credentials."
              action={{ label: 'View Uploads', to: '/upload' }}
            />
          ) : (
            <GuidanceBanner
              icon={Share2}
              title="Your credentials are ready to share"
              description="Open a credential to share it, export the signed JWT, or verify it externally."
              action={{ label: 'View My Credentials', to: '/credentials' }}
            />
          )}
        </div>
      )}

      {/* Student Stats */}
      {user.role === 'student' && stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Bell} label="Available Certificates" value={stats.announcements} color="bg-amber-500" to="/announcements" />
            <StatCard icon={Award} label="My Credentials" value={stats.credentials} color="bg-indigo-500" to="/credentials" />
            <StatCard icon={Upload} label="My Uploads" value={stats.uploads} color="bg-purple-500" to="/upload" />
            <StatCard icon={Clock} label="Pending Verification" value={stats.pendingUploads} color="bg-orange-500" to="/upload" />
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/announcements" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 transition">
                <Bell className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">View Announcements</p>
                  <p className="text-xs text-gray-500">Submit certificates for verification</p>
                </div>
              </Link>
              <Link to="/moodle-badges" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 transition">
                <GraduationCap className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Moodle Badges</p>
                  <p className="text-xs text-gray-500">Import badges from Moodle</p>
                </div>
              </Link>
              <Link to="/upload" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 transition">
                <Upload className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Upload Certificate</p>
                  <p className="text-xs text-gray-500">Submit for admin verification</p>
                </div>
              </Link>
              <Link to="/credentials" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 transition">
                <Award className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">My Credentials</p>
                  <p className="text-xs text-gray-500">View and share credentials</p>
                </div>
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Viewer Stats */}
      {user.role === 'viewer' && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <StatCard icon={Search} label="Search Students" value="→" color="bg-indigo-500" to="/search" />
          <StatCard icon={CheckCircle} label="Verify Credentials" value="→" color="bg-green-500" to="/verify" />
        </div>
      )}
    </div>
  );
}
