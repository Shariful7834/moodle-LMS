import { useState, useEffect } from 'react';
import {
  getPendingUploads,
  verifyUpload, rejectUpload, getAdminStats, getAdminUsers, createUser,
  deleteUser, getAuditLog, getAdminAnnouncements, getUploadFileUrl,
  moodleSearchStudents, moodleGetStudent, moodleGetStudentCredentials
} from '../services/api';
import {
  Shield, Users, Award, Bell, Upload, CheckCircle, XCircle, Clock,
  Trash2, Plus, Eye, FileText, Activity, Image, FileJson, File, Search,
  ExternalLink, Copy
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import toast from 'react-hot-toast';
import { appConfig } from '../config/appConfig';

function fileIcon(mimeType) {
  if (!mimeType) return <File className="w-5 h-5 text-gray-400" />;
  if (mimeType.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
  if (mimeType === 'application/json') return <FileJson className="w-5 h-5 text-green-500" />;
  if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
}

export default function AdminPanel() {
  const [tab, setTab] = useState('uploads');
  const [pendingUploads, setPendingUploads] = useState([]);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'student', studentId: '' });

  // Upload verification form state
  const [verifyForm, setVerifyForm] = useState(null); // { uploadId, achievementName, achievementDescription, issuerName, criteria, notes }
  const [previewUpload, setPreviewUpload] = useState(null); // upload id to preview

  // Moodle API test state
  const [moodleQuery, setMoodleQuery] = useState('');
  const [moodleApiKey, setMoodleApiKey] = useState(appConfig.defaultMoodleApiKey);
  const [moodleResults, setMoodleResults] = useState(null);
  const [moodleStudent, setMoodleStudent] = useState(null);
  const [moodleLoading, setMoodleLoading] = useState(false);

  const tabs = [
    { id: 'uploads', label: 'Pending Uploads', icon: Upload },
    { id: 'announcements', label: 'Announcements', icon: Bell },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'moodle', label: 'Moodle API', icon: ExternalLink },
    { id: 'audit', label: 'Audit Log', icon: Activity },
  ];

  const fetchTab = async () => {
    setLoading(true);
    try {
      if (tab === 'uploads') {
        const res = await getPendingUploads();
        setPendingUploads(res.data.uploads || []);
      } else if (tab === 'announcements') {
        const res = await getAdminAnnouncements();
        setAnnouncements(res.data.announcements || []);
      } else if (tab === 'users') {
        const res = await getAdminUsers();
        setUsers(res.data.users || []);
      } else if (tab === 'audit') {
        const res = await getAuditLog();
        setAuditLogs(res.data.logs || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchTab(); }, [tab]);

  // ── Upload actions ─────────────────────────────────────────
  const openVerifyForm = (u) => {
    const ann = u.announcement;
    setVerifyForm({
      uploadId: u.id,
      achievementName: ann?.achievementName || u.certificateName || '',
      achievementDescription: ann?.achievementDescription || u.description || '',
      issuerName: ann?.source || '',
      criteria: ann?.criteria || '',
      imageUrl: '',
      tags: '',
      frameworkName: '',
      frameworkCode: ann?.courseId || '',
      notes: ''
    });
  };

  const handleVerifyUpload = async () => {
    if (!verifyForm) return;
    if (!verifyForm.achievementName.trim()) {
      toast.error('Achievement name is required');
      return;
    }
    setActionLoading(verifyForm.uploadId);
    try {
      const res = await verifyUpload(verifyForm.uploadId, {
        achievementName: verifyForm.achievementName,
        achievementDescription: verifyForm.achievementDescription,
        issuerName: verifyForm.issuerName,
        criteria: verifyForm.criteria,
        imageUrl: verifyForm.imageUrl,
        tags: verifyForm.tags,
        frameworkName: verifyForm.frameworkName,
        frameworkCode: verifyForm.frameworkCode,
        notes: verifyForm.notes
      });
      toast.success('Upload verified – OB 3.0 credential issued!');
      setPendingUploads(prev => prev.filter(u => u.id !== verifyForm.uploadId));
      setVerifyForm(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setActionLoading(null); }
  };

  const onLogoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      toast.error('PNG, JPG or SVG only'); e.target.value = ''; return;
    }
    if (file.size > 200 * 1024) { toast.error('Image must be ≤ 200 KB'); e.target.value = ''; return; }
    const dataUrl = await new Promise((res) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file);
    });
    setVerifyForm(p => ({ ...p, imageUrl: dataUrl }));
    e.target.value = '';
  };

  const handleRejectUpload = async (id) => {
    if (!confirm('Are you sure you want to reject this upload?')) return; // Confirm first
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // User cancelled prompt
    setActionLoading(id);
    try {
      await rejectUpload(id, reason || 'Rejected by admin');
      toast.success('Upload rejected');
      setPendingUploads(prev => prev.filter(u => u.id !== id));
      if (verifyForm?.uploadId === id) setVerifyForm(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setActionLoading(null); }
  };

  // ── User actions ───────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.name) {
      toast.error('Fill all required fields');
      return;
    }
    try {
      await createUser(newUser);
      toast.success('User created');
      setShowNewUser(false);
      setNewUser({ email: '', password: '', name: '', role: 'student', studentId: '' });
      fetchTab();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      await deleteUser(id);
      toast.success('User deleted');
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  // ── Moodle API test ────────────────────────────────────────
  const handleMoodleSearch = async () => {
    if (!moodleQuery.trim()) return;
    if (!moodleApiKey.trim()) {
      toast.error('Enter a Moodle API key');
      return;
    }
    setMoodleLoading(true);
    setMoodleStudent(null);
    try {
      const res = await moodleSearchStudents(moodleQuery, moodleApiKey);
      setMoodleResults(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'API call failed');
      setMoodleResults(null);
    } finally { setMoodleLoading(false); }
  };

  const handleMoodleViewStudent = async (id) => {
    setMoodleLoading(true);
    try {
      const res = await moodleGetStudentCredentials(id, moodleApiKey);
      setMoodleStudent(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load student');
    } finally { setMoodleLoading(false); }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        icon={Shield}
        title="Admin Panel"
        subtitle="Verify student uploads, manage users, and test the Moodle API."
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setVerifyForm(null); setPreviewUpload(null); }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.id === 'uploads' && pendingUploads.length > 0 && tab !== 'uploads' && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{pendingUploads.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading && tab !== 'moodle' ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* ── Pending Uploads ────────────────────────── */}
            {tab === 'uploads' && (
              <div>
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-700">Student Certificates Awaiting Verification</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Students uploaded certificate files for admin review. Verify the file, then issue an OB 3.0 credential.</p>
                </div>
                {pendingUploads.length === 0 ? (
                  <div className="text-center py-12"><Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No pending uploads</p></div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {pendingUploads.map(u => (
                      <div key={u.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {fileIcon(u.fileInfo?.mimeType)}
                              <p className="text-sm font-medium text-gray-900">{u.certificateName}</p>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Student: {u.studentName} ({u.studentEmail}){u.studentId_display ? ` • ${u.studentId_display}` : ''}</p>
                            {u.description && <p className="text-xs text-gray-400 mt-0.5">{u.description}</p>}
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span>Uploaded: {new Date(u.createdAt).toLocaleString()}</span>
                              {u.fileInfo && <span>{u.fileInfo.originalName} • {(u.fileInfo.size / 1024).toFixed(1)} KB</span>}
                            </div>

                            {/* Linked Announcement Context */}
                            {u.announcement && (
                              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                                  <Bell className="w-3 h-3" />
                                  Linked Announcement: {u.announcement.achievementName}
                                </p>
                                {u.announcement.achievementDescription && (
                                  <p className="text-xs text-amber-700 mt-0.5">{u.announcement.achievementDescription}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-amber-600">
                                  {u.announcement.source && <span>Source: {u.announcement.source}</span>}
                                  {u.announcement.achievementType && <span>• Type: {u.announcement.achievementType}</span>}
                                  {u.announcement.courseId && <span>• Course: {u.announcement.courseId}</span>}
                                  {u.announcement.criteria && <span>• Criteria: {u.announcement.criteria}</span>}
                                </div>
                              </div>
                            )}

                            {/* View File Button */}
                            <div className="flex items-center gap-2 mt-3">
                              <a
                                href={getUploadFileUrl(u.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />View File
                              </a>
                              <button type="button" onClick={() => setPreviewUpload(previewUpload === u.id ? null : u.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                {previewUpload === u.id ? 'Hide Preview' : 'Preview Inline'}
                              </button>
                            </div>

                            {/* Inline Preview */}
                            {previewUpload === u.id && u.fileInfo && (
                              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                                {u.fileInfo.mimeType?.startsWith('image/') && (
                                  <img src={getUploadFileUrl(u.id)} alt="Certificate" className="max-h-80 mx-auto object-contain p-2" />
                                )}
                                {u.fileInfo.mimeType === 'application/pdf' && (
                                  <iframe src={getUploadFileUrl(u.id)} title="PDF preview" className="w-full h-96" />
                                )}
                                {u.fileInfo.mimeType === 'application/json' && (
                                  <div className="p-3 text-xs text-gray-500">JSON file — <a href={getUploadFileUrl(u.id)} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">open in new tab</a></div>
                                )}
                              </div>
                            )}

                            {/* Verify Form (expanded inline) */}
                            {verifyForm?.uploadId === u.id && (
                              <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
                                <h4 className="text-sm font-semibold text-green-800 mb-3">Create OB 3.0 Credential</h4>
                                <p className="text-xs text-green-700 mb-3">Review the uploaded certificate above, then fill in the details to create the OB 3.0 credential.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                  <div>
                                    <label className="block text-xs text-green-700 mb-1">Achievement Name *</label>
                                    <input value={verifyForm.achievementName}
                                      onChange={e => setVerifyForm(p => ({ ...p, achievementName: e.target.value }))}
                                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-green-700 mb-1">Issuer Name</label>
                                    <input value={verifyForm.issuerName}
                                      onChange={e => setVerifyForm(p => ({ ...p, issuerName: e.target.value }))}
                                      placeholder="e.g. University of Berlin"
                                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                  </div>
                                </div>
                                <div className="mb-3">
                                  <label className="block text-xs text-green-700 mb-1">Achievement Description</label>
                                  <textarea value={verifyForm.achievementDescription}
                                    onChange={e => setVerifyForm(p => ({ ...p, achievementDescription: e.target.value }))}
                                    rows="2" className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                  <div>
                                    <label className="block text-xs text-green-700 mb-1">Criteria</label>
                                    <input value={verifyForm.criteria}
                                      onChange={e => setVerifyForm(p => ({ ...p, criteria: e.target.value }))}
                                      placeholder="e.g. Pass all modules with 70%+"
                                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-green-700 mb-1">Admin Notes</label>
                                    <input value={verifyForm.notes}
                                      onChange={e => setVerifyForm(p => ({ ...p, notes: e.target.value }))}
                                      placeholder="Internal notes"
                                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                  </div>
                                </div>
                                <div className="mb-3">
                                  <label className="block text-xs text-green-700 mb-1">Badge logo (institution / block-week — issuer branding, optional)</label>
                                  <div className="flex items-center gap-3">
                                    {verifyForm.imageUrl ? (
                                      <div className="relative">
                                        <img src={verifyForm.imageUrl} alt="logo preview" className="h-12 w-12 object-contain rounded border border-green-200 bg-white" />
                                        <button type="button" onClick={() => setVerifyForm(p => ({ ...p, imageUrl: '' }))}
                                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">×</button>
                                      </div>
                                    ) : null}
                                    <label className="inline-flex items-center gap-1.5 px-3 py-2 border border-dashed border-green-300 rounded-lg text-xs text-green-700 cursor-pointer hover:bg-green-50">
                                      <Upload className="w-3.5 h-3.5" />
                                      {verifyForm.imageUrl ? 'Replace logo' : 'Upload logo (PNG/JPG ≤ 200 KB)'}
                                      <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onLogoFile} className="hidden" />
                                    </label>
                                  </div>
                                  <input value={/^data:/.test(verifyForm.imageUrl) ? '' : verifyForm.imageUrl}
                                    onChange={e => setVerifyForm(p => ({ ...p, imageUrl: e.target.value }))}
                                    placeholder="…or paste an https image URL"
                                    className="w-full mt-2 px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                </div>
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-green-800 mb-1">Recognition fields (let the LMS match this badge — Pre-check)</p>
                                  <input value={verifyForm.tags}
                                    onChange={e => setVerifyForm(p => ({ ...p, tags: e.target.value }))}
                                    placeholder="Tags (comma-separated, e.g. block-week, robotics)"
                                    className="w-full mb-2 px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input value={verifyForm.frameworkName}
                                      onChange={e => setVerifyForm(p => ({ ...p, frameworkName: e.target.value }))}
                                      placeholder="Framework name (e.g. CEFR)"
                                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                    <input value={verifyForm.frameworkCode}
                                      onChange={e => setVerifyForm(p => ({ ...p, frameworkCode: e.target.value }))}
                                      placeholder="Alignment code (e.g. B2, ROB-101)"
                                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 outline-none" />
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={handleVerifyUpload} disabled={actionLoading === u.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                                    <CheckCircle className="w-3.5 h-3.5" />{actionLoading === u.id ? 'Issuing…' : 'Verify & Issue OB 3.0 Credential'}
                                  </button>
                                  <button type="button" onClick={() => setVerifyForm(null)}
                                    className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Action buttons (right side) */}
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <button type="button" 
                              onClick={(e) => { e.stopPropagation(); openVerifyForm(u); }} 
                              disabled={actionLoading === u.id || verifyForm?.uploadId === u.id}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${
                                verifyForm?.uploadId === u.id 
                                  ? 'bg-gray-400 text-white cursor-not-allowed' 
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}>
                              <CheckCircle className="w-3.5 h-3.5" />
                              {verifyForm?.uploadId === u.id ? 'Form Open Below ↓' : 'Verify & Issue'}
                            </button>
                            <button type="button" 
                              onClick={(e) => { e.stopPropagation(); handleRejectUpload(u.id); }} 
                              disabled={actionLoading === u.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                              <XCircle className="w-3.5 h-3.5" />Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Announcements ──────────────────────────── */}
            {tab === 'announcements' && (
              <div>
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-700">Certificate Announcements from Moodle</h2>
                  <p className="text-xs text-gray-400 mt-0.5">These were sent via the REST API by external systems</p>
                </div>
                {announcements.length === 0 ? (
                  <div className="text-center py-12"><Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No announcements yet</p></div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {announcements.map(a => (
                      <div key={a.id} className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{a.achievementName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{a.achievementDescription}</p>
                        <p className="text-xs text-gray-400 mt-1">Source: {a.sourceName || a.source} • Created: {new Date(a.createdAt).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Users ──────────────────────────────────── */}
            {tab === 'users' && (
              <div>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">System Users</h2>
                  <button type="button" onClick={() => setShowNewUser(!showNewUser)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" />{showNewUser ? 'Cancel' : 'Add User'}
                  </button>
                </div>

                {showNewUser && (
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <input value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} placeholder="Full Name *" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      <input value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="Email *" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      <input value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Password *" type="password" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        <option value="student">Student</option>
                        <option value="admin">Admin</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      {newUser.role === 'student' && (
                        <input value={newUser.studentId} onChange={e => setNewUser(p => ({ ...p, studentId: e.target.value }))} placeholder="Enrollment/Student ID" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      )}
                    </div>
                    <button type="button" onClick={handleCreateUser}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                      Create User
                    </button>
                  </div>
                )}

                <div className="divide-y divide-gray-100">
                  {users.map(u => (
                    <div key={u.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.email} {u.studentId ? `• ${u.studentId}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'student' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>{u.role}</span>
                        <button type="button" onClick={() => handleDeleteUser(u.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Moodle API Test ────────────────────────── */}
            {tab === 'moodle' && (
              <div>
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-700">Moodle REST API – Student Lookup</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Search students by email or enrollment ID. This simulates how Moodle would call the wallet API.
                  </p>
                </div>
                <div className="px-6 py-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <input value={moodleApiKey} onChange={e => setMoodleApiKey(e.target.value)}
                      placeholder="Enter Moodle API key"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white w-60 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <div className="flex-1 flex items-center gap-2">
                      <input value={moodleQuery} onChange={e => setMoodleQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleMoodleSearch()}
                        placeholder="Search by email, student ID, or name…"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      <button type="button" onClick={handleMoodleSearch} disabled={moodleLoading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        <Search className="w-4 h-4" />{moodleLoading ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    Endpoints: <code className="bg-gray-100 px-1 rounded">GET /api/students/search?q=...</code> &rarr;
                    <code className="bg-gray-100 px-1 rounded">GET /api/students/:id/credentials</code>
                  </p>

                  {/* Search Results */}
                  {moodleResults && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 mb-2">Search Results ({moodleResults.students?.length || 0})</h3>
                      {moodleResults.students?.length === 0 ? (
                        <p className="text-sm text-gray-500 py-4">No students found</p>
                      ) : (
                        <div className="space-y-2">
                          {moodleResults.students?.map(s => (
                            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                                <p className="text-xs text-gray-500">{s.email} {s.studentId ? `• ${s.studentId}` : ''}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500">{s.credentialCount} credential{s.credentialCount !== 1 ? 's' : ''}</span>
                                <button type="button" onClick={() => handleMoodleViewStudent(s.id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
                                  <Eye className="w-3.5 h-3.5" />View Credentials
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Student Credentials Detail */}
                  {moodleStudent && (
                    <div className="border border-indigo-200 rounded-xl overflow-hidden">
                      <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-200">
                        <h3 className="text-sm font-semibold text-indigo-800">
                          {moodleStudent.student?.name} — OB 3.0 Credentials
                        </h3>
                        <p className="text-xs text-indigo-600">{moodleStudent.student?.email} {moodleStudent.student?.studentId ? `• ${moodleStudent.student.studentId}` : ''}</p>
                      </div>
                      {moodleStudent.credentials?.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-500">No shareable credentials</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {moodleStudent.credentials?.map(c => (
                            <div key={c.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{c.achievementName}</p>
                                  <p className="text-xs text-gray-500">Issuer: {c.issuerName} • Issued: {new Date(c.issuedDate).toLocaleDateString()}</p>
                                </div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-50 rounded">
                                  <CheckCircle className="w-3 h-3" />OB 3.0
                                </span>
                              </div>
                              {c.ob3Credential && (
                                <details className="mt-2">
                                  <summary className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">View OB 3.0 JSON-LD</summary>
                                  <div className="mt-1 relative">
                                    <pre className="bg-gray-900 text-green-400 p-3 text-xs rounded-lg overflow-x-auto max-h-48">
                                      {JSON.stringify(c.ob3Credential, null, 2)}
                                    </pre>
                                    <button type="button" onClick={() => { navigator.clipboard.writeText(JSON.stringify(c.ob3Credential, null, 2)); toast.success('Copied'); }}
                                      className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700">
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Audit Log ──────────────────────────────── */}
            {tab === 'audit' && (
              <div>
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-700">Audit Trail</h2>
                </div>
                {auditLogs.length === 0 ? (
                  <div className="text-center py-12"><Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No audit events</p></div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                    {auditLogs.map((log, i) => (
                      <div key={i} className="px-6 py-3">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{log.action}</span>
                          <span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{log.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
