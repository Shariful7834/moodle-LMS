import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Announcements from './pages/Announcements';
import Credentials from './pages/Credentials';
import CredentialDetail from './pages/CredentialDetail';
import UploadCertificate from './pages/UploadCertificate';
import AdminPanel from './pages/AdminPanel';
import SearchStudents from './pages/SearchStudents';
import VerifyPage from './pages/VerifyPage';
import SharedCredential from './pages/SharedCredential';
import MoodleBadges from './pages/MoodleBadges';
import Notifications from './pages/Notifications';
// ApiTester removed – Moodle communicates via its own REST API

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/shared/:id" element={<SharedCredential />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Student routes */}
        <Route path="/announcements" element={
          <ProtectedRoute roles={['student']}><Announcements /></ProtectedRoute>
        } />
        <Route path="/credentials" element={<Credentials />} />
        <Route path="/credentials/:id" element={<CredentialDetail />} />
        <Route path="/upload" element={
          <ProtectedRoute roles={['student']}><UploadCertificate /></ProtectedRoute>
        } />
        <Route path="/moodle-badges" element={
          <ProtectedRoute roles={['student']}><MoodleBadges /></ProtectedRoute>
        } />
        <Route path="/notifications" element={
          <ProtectedRoute roles={['student']}><Notifications /></ProtectedRoute>
        } />

        {/* Viewer routes */}
        <Route path="/search" element={
          <ProtectedRoute roles={['viewer']}><SearchStudents /></ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin']}><AdminPanel /></ProtectedRoute>
        } />

      </Route>

      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
