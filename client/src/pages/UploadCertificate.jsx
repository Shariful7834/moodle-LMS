import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { uploadCertificate, getMyUploads, getUploadFileUrl, updateUpload, deleteUpload } from '../services/api';
import { Upload, FileText, Clock, CheckCircle, XCircle, AlertCircle, Image, FileJson, File, Award, Trash2, Pencil, ExternalLink } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import toast from 'react-hot-toast';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/json'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function fileIcon(mimeType) {
  if (!mimeType) return <File className="w-5 h-5 text-gray-400" />;
  if (mimeType.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
  if (mimeType === 'application/json') return <FileJson className="w-5 h-5 text-green-500" />;
  if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function UploadCertificate() {
  const [searchParams] = useSearchParams();
  const announcementId = searchParams.get('announcementId');
  const announcementName = searchParams.get('name') || '';
  const announcementDesc = searchParams.get('description') || '';
  const announcementSource = searchParams.get('source') || '';

  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [certificateName, setCertificateName] = useState(announcementName);
  const [description, setDescription] = useState(announcementDesc);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const fetchUploads = () => {
    setLoading(true);
    getMyUploads()
      .then(res => setUploads(res.data.uploads || []))
      .catch(() => setUploads([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUploads(); }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only PDF, JPG, JPEG, PNG, and JSON files are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('File too large (max 10 MB)');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    if (!certificateName) setCertificateName(file.name.replace(/\.[^/.]+$/, ''));

    // Preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview({ type: 'image', url: ev.target.result });
      reader.readAsDataURL(file);
    } else if (file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target.result);
          setPreview({ type: 'json', content: JSON.stringify(json, null, 2) });
        } catch {
          setPreview({ type: 'text', content: ev.target.result.slice(0, 2000) });
        }
      };
      reader.readAsText(file);
    } else if (file.type === 'application/pdf') {
      setPreview({ type: 'pdf', url: URL.createObjectURL(file) });
    } else {
      setPreview(null);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!certificateName.trim()) { toast.error('Certificate name is required'); return; }
    if (!selectedFile) { toast.error('Please select a certificate file'); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('certificateFile', selectedFile);
      formData.append('certificateName', certificateName.trim());
      formData.append('description', description.trim());
      if (announcementId) formData.append('announcementId', announcementId);
      await uploadCertificate(formData);
      toast.success('Certificate uploaded for admin verification!');
      setCertificateName('');
      setDescription('');
      clearFile();
      fetchUploads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: { icon: Clock, color: 'text-amber-700 bg-amber-50', text: 'Pending Verification' },
      verified: { icon: CheckCircle, color: 'text-green-700 bg-green-50', text: 'Verified' },
      rejected: { icon: XCircle, color: 'text-red-700 bg-red-50', text: 'Rejected' },
    };
    const s = map[status] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${s.color}`}>
        <s.icon className="w-3.5 h-3.5" />
        {s.text}
      </span>
    );
  };

  const [actionLoading, setActionLoading] = useState(null);

  const handleDeleteUpload = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setActionLoading(id);
    try {
      await deleteUpload(id);
      toast.success('Upload deleted');
      fetchUploads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally { setActionLoading(null); }
  };

  const handleUpdateFile = async (id, file) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { toast.error('Invalid file type'); return; }
    if (file.size > MAX_SIZE) { toast.error('File too large (max 10 MB)'); return; }
    setActionLoading(id);
    try {
      const formData = new FormData();
      formData.append('certificateFile', file);
      await updateUpload(id, formData);
      toast.success('File replaced! Status reset to pending.');
      fetchUploads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally { setActionLoading(null); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        icon={Upload}
        title="Upload Certificate"
        subtitle="Upload a certificate file (PDF, JPG, PNG, or JSON) for admin verification. Once verified, you get an OB 3.0 credential you can share."
      />

      {/* Upload Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Submit Certificate for Verification</h2>

        {/* Announcement context banner */}
        {announcementId && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <Award className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Submitting for: {announcementName}
                </p>
                {announcementDesc && (
                  <p className="text-xs text-amber-700 mt-0.5">{announcementDesc}</p>
                )}
                {announcementSource && (
                  <p className="text-xs text-amber-600 mt-0.5">Requested by: {announcementSource}</p>
                )}
                <Link to="/announcements" className="text-xs text-amber-700 underline hover:text-amber-900 mt-1 inline-block">
                  ← Back to announcements
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Certificate Name *</label>
            <input
              value={certificateName}
              onChange={e => setCertificateName(e.target.value)}
              placeholder="e.g. Web Development Fundamentals"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Description (optional)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the certificate"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* File Picker */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">Certificate File * (PDF, JPG, PNG, or JSON — max 10 MB)</label>

            {!selectedFile ? (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-500 font-medium">Click to select a file</span>
                <span className="text-xs text-gray-400 mt-1">PDF, JPG, JPEG, PNG, or JSON</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {fileIcon(selectedFile.type)}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-xs text-gray-400">{formatSize(selectedFile.size)} • {selectedFile.type}</p>
                    </div>
                  </div>
                  <button type="button" onClick={clearFile}
                    className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">
                    Remove
                  </button>
                </div>

                {/* Preview */}
                {preview?.type === 'image' && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={preview.url} alt="Certificate preview" className="max-h-64 mx-auto object-contain" />
                  </div>
                )}
                {preview?.type === 'json' && (
                  <pre className="mt-2 bg-gray-900 text-green-400 p-3 text-xs rounded-lg overflow-x-auto max-h-48">
                    {preview.content}
                  </pre>
                )}
                {preview?.type === 'pdf' && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                    <iframe src={preview.url} title="PDF preview" className="w-full h-64" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Admin will review your uploaded certificate and verify its authenticity.
              Upon approval, an OB 3.0 (Open Badges 3.0) credential will be created
              that can be shared with Moodle and other external services via REST API.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !selectedFile}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {submitting ? 'Uploading…' : 'Submit for Verification'}
          </button>
        </div>
      </form>

      {/* My Uploads */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">My Uploads</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No uploads yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {uploads.map(u => {
              const canModify = u.status === 'pending' || u.status === 'rejected';
              return (
                <div key={u.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {fileIcon(u.fileInfo?.mimeType)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{u.certificateName}</p>
                        {u.description && <p className="text-xs text-gray-500 mt-0.5">{u.description}</p>}
                        {u.announcementName && (
                          <p className="text-xs text-amber-600 mt-0.5">For: {u.announcementName}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          <span>{new Date(u.createdAt).toLocaleString()}</span>
                          {u.fileInfo && (
                            <>
                              <span>•</span>
                              <span>{u.fileInfo.originalName} ({formatSize(u.fileInfo.size)})</span>
                            </>
                          )}
                        </div>
                        {u.adminNotes && u.status === 'rejected' && (
                          <p className="text-xs text-red-500 mt-1">Reason: {u.adminNotes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {statusBadge(u.status)}
                      <div className="flex items-center gap-2">
                        {u.fileInfo && (
                          <a
                            href={getUploadFileUrl(u.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            View File
                          </a>
                        )}
                        {u.status === 'verified' && u.credentialId && (
                          <Link
                            to={`/credentials/${u.credentialId}`}
                            className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Credential
                          </Link>
                        )}
                        {canModify && (
                          <>
                            <label className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium cursor-pointer">
                              <Pencil className="w-3 h-3" />
                              Replace File
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.json"
                                className="hidden"
                                onChange={e => { handleUpdateFile(u.id, e.target.files[0]); e.target.value = ''; }}
                                disabled={actionLoading === u.id}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleDeleteUpload(u.id, u.certificateName)}
                              disabled={actionLoading === u.id}
                              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
