import axios from 'axios';
import { appConfig, buildApiUrl } from '../config/appConfig';

const api = axios.create({
  baseURL: appConfig.apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/* ── Auth ─────────────────────────────────────────────────── */
export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (data) => api.post('/auth/register', data);
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');

/* ── Announcements (from Moodle) ─────────────────────────── */
export const getAnnouncements = () => api.get('/api/credentials/announcements');

/* ── Uploads (student → admin verification) ──────────────── */
export const uploadCertificate = (formData) =>
  api.post('/api/credentials/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getMyUploads = () => api.get('/api/credentials/my-uploads');
export const updateUpload = (id, formData) =>
  api.put(`/api/credentials/uploads/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteUpload = (id) => api.delete(`/api/credentials/uploads/${id}`);
export const getUploadFileUrl = (uploadId) => {
  const token = localStorage.getItem('token');
  return buildApiUrl(`/api/credentials/uploads/${uploadId}/file${token ? `?token=${token}` : ''}`);
};

/* ── Credentials ─────────────────────────────────────────── */
export const getCredentials = () => api.get('/api/credentials');
export const getCredential = (id) => api.get(`/api/credentials/${id}`);
export const shareCredential = (id, expiresInDays) => api.post(`/api/credentials/${id}/share`, { expiresInDays });
export const getCredentialJwt = (id) => api.get(`/api/credentials/${id}/jwt`, { responseType: 'text', transformResponse: [(d) => d] });
export const getCredentialJwtUrl = (id, download = false) => {
  // Public issuer URL — credential UUIDs are unguessable; matches OB 3.0 dereferenceable id pattern
  const dl = download ? '&download=1' : '';
  return buildApiUrl(`/api/badges/credentials/${id}?format=jwt${dl}`);
};
export const revokeCredential = (id, reason) => api.post(`/api/credentials/${id}/revoke`, { reason });
export const unrevokeCredential = (id) => api.post(`/api/credentials/${id}/unrevoke`);

/* ── Issuer / DID ─────────────────────────────────────────── */
export const getDidDocument = () => api.get('/api/badges/issuer/did.json');
export const getIssuerProfile = () => api.get('/api/badges/issuer');

/* ── Admin ────────────────────────────────────────────────── */
export const getAdminStats = () => api.get('/api/admin/stats');
export const getAdminUsers = () => api.get('/api/admin/users');
export const createUser = (data) => api.post('/api/admin/users', data);
export const deleteUser = (id) => api.delete(`/api/admin/users/${id}`);
export const getAdminAnnouncements = () => api.get('/api/admin/announcements');
export const getAdminUploads = () => api.get('/api/admin/uploads');
export const getAdminCredentials = () => api.get('/api/admin/credentials');
export const getAuditLog = () => api.get('/api/admin/audit');

/* ── Admin actions on uploads ─────────────────────────────── */
export const getPendingUploads = () => api.get('/api/credentials/pending-uploads');
export const verifyUpload = (id, data) => api.post(`/api/credentials/verify-upload/${id}`, data);
export const rejectUpload = (id, reason) => api.post(`/api/credentials/reject-upload/${id}`, { reason });

/* ── Viewer ───────────────────────────────────────────────── */
export const searchStudents = (q) => api.get(`/api/credentials/search-students?q=${encodeURIComponent(q)}`);
export const getStudentCredentials = (studentId) => api.get(`/api/credentials/student/${studentId}`);

/* ── External API (testing) ───────────────────────────────── */
export const announceCertificate = (data, apiKey) =>
  api.post('/api/announce-certificate', data, { headers: { 'X-API-Key': apiKey } });
export const verifyCredential = (credential) => api.post('/api/verify', { credential });
export const verifyJwt = (jwt) => api.post('/api/verify', { jwt });
export const verifyByUrl = (url) => api.post('/api/verify', { url });
export const getPublicCredential = (id, shareToken) => api.get(`/api/public-credentials/${id}?token=${shareToken}`);
export const getApiHealth = () => api.get('/api/health');
export const getApiInfo = () => api.get('/api/info');

/* ── Moodle Badge Import (student) ─────────────────────────── */
export const getMoodleBadges = () => api.get('/api/credentials/moodle-badges');
export const importMoodleBadge = (badgeId, moodleUserId) =>
  api.post('/api/credentials/import-moodle-badge', { badgeId, moodleUserId });

/* ── Flow 1: Access Requests (student notifications) ──────── */
export const getNotifications = () => api.get('/wallet/notifications');
export const grantAccess = (requestId) => api.post('/wallet/access/grant', { requestId });
export const denyAccess = (requestId) => api.post('/wallet/access/deny', { requestId });
export const revokeAccess = (serviceId) => api.delete(`/wallet/access/${serviceId}`);

/* ── Moodle REST API (student lookup) ─────────────────────── */
export const moodleSearchStudents = (q, apiKey) =>
  api.get(`/api/students/search?q=${encodeURIComponent(q)}`, { headers: { 'X-API-Key': apiKey } });
export const moodleGetStudent = (id, apiKey) =>
  api.get(`/api/students/${id}`, { headers: { 'X-API-Key': apiKey } });
export const moodleGetStudentCredentials = (id, apiKey) =>
  api.get(`/api/students/${id}/credentials`, { headers: { 'X-API-Key': apiKey } });

export default api;
