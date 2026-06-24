const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const moodle = require('../moodle');
const jwtVc = require('../jwtVc');
const statusList = require('../statusList');
const keys = require('../keys');

const router = express.Router();

// ── File upload config ─────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/json': '.json',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_TYPES[file.mimetype] || path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Only PDF, JPG, JPEG, PNG, and JSON files are allowed'));
  },
});

// Magic-byte sniff to defeat client-spoofed Content-Type headers.
// Returns true if file content matches the claimed mime; deletes the file otherwise.
function verifyMagicBytes(filePath, claimedMime) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    if (claimedMime === 'application/pdf') {
      return buf.slice(0, 4).toString('ascii') === '%PDF';
    }
    if (claimedMime === 'image/png') {
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    }
    if (claimedMime === 'image/jpeg') {
      return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    }
    if (claimedMime === 'application/json') {
      const text = fs.readFileSync(filePath, 'utf8').trim();
      try { JSON.parse(text); return true; } catch { return false; }
    }
    return false;
  } catch {
    return false;
  }
}

function rejectAndDelete(req, res, message) {
  if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch {} }
  return res.status(400).json({ error: message });
}

router.use(authMiddleware);

// ════════════════════════════════════════════════════════════
// ANNOUNCEMENTS (from Moodle) — students view & claim
// ════════════════════════════════════════════════════════════

// GET /credentials/announcements — active announcements for students
router.get('/announcements', (req, res) => {
  const announcements = db.announcements.getActive().map(a => {
    // Check if student already uploaded a certificate for this announcement
    const myUpload = req.user.role === 'student'
      ? db.uploads.getByStudent(req.user.id).find(u => u.announcementId === a.id && u.status !== 'rejected')
        || db.uploads.getByStudent(req.user.id).find(u => u.announcementId === a.id)
      : null;
    return {
      ...a,
      myUpload: myUpload ? { id: myUpload.id, status: myUpload.status, credentialId: myUpload.credentialId || null } : null
    };
  });
  res.json({ announcements });
});

// POST /credentials/claim/:announcementId — student claims a certificate
router.post('/claim/:announcementId', requireRole('student'), (req, res) => {
  const ann = db.announcements.findById(req.params.announcementId);
  if (!ann) return res.status(404).json({ error: 'Announcement not found' });

  const existing = db.claims.getByStudent(req.user.id).find(c => c.announcementId === ann.id);
  if (existing) {
    return res.status(409).json({ error: 'Already claimed', claimId: existing.id, status: existing.status });
  }

  const user = db.users.findById(req.user.id);
  const claim = db.claims.create({
    id: uuidv4(),
    announcementId: ann.id,
    studentId: req.user.id,
    studentEmail: user.email,
    studentName: user.name,
    achievementName: ann.achievementName,
    achievementDescription: ann.achievementDescription,
    source: ann.source,
    sourceName: ann.sourceName,
    status: 'pending'
  });

  db.audit.log({ userId: req.user.id, action: 'claim_created', detail: `${user.email} claimed "${ann.achievementName}"` });
  res.status(201).json({ message: 'Claim submitted for admin verification', claim });
});

// ════════════════════════════════════════════════════════════
// UPLOADS — student uploads certificate file for verification
// ════════════════════════════════════════════════════════════

// POST /credentials/upload — student uploads a certificate file (PDF/JPG/PNG/JSON)
// Optionally linked to a Moodle announcement via announcementId
router.post('/upload', requireRole('student'), (req, res) => {
  upload.single('certificateFile')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Certificate file is required (PDF, JPG, PNG, or JSON)' });

    if (!verifyMagicBytes(req.file.path, req.file.mimetype)) {
      return rejectAndDelete(req, res, 'File content does not match its declared type');
    }

    const certificateName = req.body.certificateName;
    if (!certificateName) return rejectAndDelete(req, res, 'certificateName is required');

    const announcementId = req.body.announcementId || null;

    // If linked to an announcement, prevent duplicate uploads (allow resubmit if rejected)
    if (announcementId) {
      const existing = db.uploads.getByStudent(req.user.id).find(
        u => u.announcementId === announcementId && u.status !== 'rejected'
      );
      if (existing) {
        return res.status(409).json({
          error: 'You already submitted a certificate for this announcement',
          uploadId: existing.id,
          status: existing.status
        });
      }
    }

    // Fetch announcement details if linked
    let announcement = null;
    if (announcementId) {
      announcement = db.announcements.findById(announcementId);
    }

    const user = db.users.findById(req.user.id);
    const fileInfo = {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };

    const uploadRecord = db.uploads.create({
      id: uuidv4(),
      studentId: req.user.id,
      studentEmail: user.email,
      studentName: user.name,
      certificateName,
      description: req.body.description || '',
      fileInfo,
      status: 'pending',
      adminNotes: null,
      // Link to Moodle announcement if responding to one
      announcementId: announcementId,
      announcementName: announcement?.achievementName || null,
      announcementSource: announcement?.sourceName || announcement?.source || null
    });

    const detail = announcement
      ? `${user.email} uploaded "${certificateName}" in response to "${announcement.achievementName}" for verification`
      : `${user.email} uploaded "${certificateName}" (${fileInfo.mimeType}) for verification`;
    db.audit.log({ userId: req.user.id, action: 'upload_created', detail });
    res.status(201).json({ message: 'Certificate uploaded for admin verification', upload: { id: uploadRecord.id, status: uploadRecord.status, fileType: fileInfo.mimeType } });
  });
});

// GET /credentials/my-uploads — student's uploads
router.get('/my-uploads', requireRole('student'), (req, res) => {
  const uploads = db.uploads.getByStudent(req.user.id);
  res.json({ uploads });
});

// PUT /credentials/uploads/:id — student updates an upload (replace file and/or metadata)
// Only allowed while status is 'pending' or 'rejected'
router.put('/uploads/:id', requireRole('student'), (req, res) => {
  upload.single('certificateFile')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message });
    }
    if (err) return res.status(400).json({ error: err.message });

    const uploadRec = db.uploads.findById(req.params.id);
    if (!uploadRec) return res.status(404).json({ error: 'Upload not found' });
    if (uploadRec.studentId !== req.user.id) return res.status(403).json({ error: 'Not your upload' });
    if (uploadRec.status === 'verified') {
      return res.status(400).json({ error: 'Cannot modify a verified upload. The credential has already been issued.' });
    }

    const updates = {};

    // Update metadata if provided
    if (req.body.certificateName) updates.certificateName = req.body.certificateName.trim();
    if (req.body.description !== undefined) updates.description = req.body.description.trim();

    // Replace file if a new one is provided
    if (req.file) {
      if (!verifyMagicBytes(req.file.path, req.file.mimetype)) {
        return rejectAndDelete(req, res, 'File content does not match its declared type');
      }
      // Delete old file from disk
      if (uploadRec.fileInfo?.storedName) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(uploadRec.fileInfo.storedName));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updates.fileInfo = {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      };
    }

    // If resubmitting a rejected upload, reset to pending
    if (uploadRec.status === 'rejected') {
      updates.status = 'pending';
      updates.adminNotes = null;
    }

    db.uploads.update(uploadRec.id, updates);
    db.audit.log({ userId: req.user.id, action: 'upload_updated', detail: `Student updated upload "${updates.certificateName || uploadRec.certificateName}"` });
    res.json({ message: 'Upload updated successfully', upload: { id: uploadRec.id, status: updates.status || uploadRec.status } });
  });
});

// DELETE /credentials/uploads/:id — student deletes their upload
// Only allowed while status is 'pending' or 'rejected'
router.delete('/uploads/:id', requireRole('student'), (req, res) => {
  const uploadRec = db.uploads.findById(req.params.id);
  if (!uploadRec) return res.status(404).json({ error: 'Upload not found' });
  if (uploadRec.studentId !== req.user.id) return res.status(403).json({ error: 'Not your upload' });
  if (uploadRec.status === 'verified') {
    return res.status(400).json({ error: 'Cannot delete a verified upload. The credential has already been issued.' });
  }

  // Delete file from disk
  if (uploadRec.fileInfo?.storedName) {
    const safeName = path.basename(uploadRec.fileInfo.storedName);
    const filePath = path.join(UPLOAD_DIR, safeName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.uploads.delete(uploadRec.id);
  db.audit.log({ userId: req.user.id, action: 'upload_deleted', detail: `Student deleted upload "${uploadRec.certificateName}"` });
  res.json({ message: 'Upload deleted' });
});

// GET /credentials/uploads/:id/file — serve uploaded file (admin or file owner)
// Supports ?token=JWT query param for inline previews (<img>, <iframe>)
router.get('/uploads/:id/file', (req, res) => {
  // Allow auth via query param for inline embeds (img/iframe)
  if (!req.user && req.query.token) {
    try {
      const { verifyToken } = require('../auth');
      req.user = verifyToken(req.query.token);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const uploadRec = db.uploads.findById(req.params.id);
  if (!uploadRec) return res.status(404).json({ error: 'Upload not found' });
  if (uploadRec.studentId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!uploadRec.fileInfo || !uploadRec.fileInfo.storedName) {
    return res.status(404).json({ error: 'File not found' });
  }
  // Sanitize stored filename to prevent path traversal
  const safeName = path.basename(uploadRec.fileInfo.storedName);
  const filePath = path.join(UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from disk' });
  res.setHeader('Content-Type', uploadRec.fileInfo.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Sanitize filename for header injection: strip CR/LF and quotes
  const safeFilename = String(uploadRec.fileInfo.originalName || 'file').replace(/[\r\n"\\]/g, '_');
  // PDF/PNG/JPG safe to inline; JSON forced as attachment to prevent any rendering surprise
  const disposition = uploadRec.fileInfo.mimeType === 'application/json' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ════════════════════════════════════════════════════════════
// ADMIN — verify claims & uploads, issue credentials
// ════════════════════════════════════════════════════════════

// GET /credentials/pending-claims — admin sees all pending claims
router.get('/pending-claims', requireRole('admin'), (req, res) => {
  const claims = db.claims.getAllPending().map(c => {
    const student = db.users.findById(c.studentId);
    return { ...c, studentName: student?.name, studentEmail: student?.email, studentId_display: student?.studentId };
  });
  res.json({ claims });
});

// GET /credentials/pending-uploads — admin sees all pending uploads
router.get('/pending-uploads', requireRole('admin'), (req, res) => {
  const uploads = db.uploads.getAllPending().map(u => {
    const student = db.users.findById(u.studentId);
    const announcement = u.announcementId ? db.announcements.findById(u.announcementId) : null;
    return {
      ...u,
      studentName: student?.name,
      studentEmail: student?.email,
      studentId_display: student?.studentId,
      // Include announcement details for admin context
      announcement: announcement ? {
        id: announcement.id,
        achievementName: announcement.achievementName,
        achievementDescription: announcement.achievementDescription,
        achievementType: announcement.achievementType,
        source: announcement.sourceName || announcement.source,
        criteria: announcement.criteria,
        courseId: announcement.courseId
      } : null
    };
  });
  res.json({ uploads });
});

// POST /credentials/approve-claim/:id — admin approves claim → issues signed OB 3.0 JWT-VC
router.post('/approve-claim/:id', requireRole('admin'), async (req, res) => {
  try {
    const claim = db.claims.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'pending') return res.status(400).json({ error: `Already ${claim.status}` });

    const issuedDate = new Date().toISOString();
    const credId = uuidv4();
    const student = db.users.findById(claim.studentId);
    const announcement = db.announcements.findById(claim.announcementId);
    const studentEmail = student?.email || claim.studentEmail;

    const listId = statusList.DEFAULT_LIST_ID;
    const listIndex = statusList.nextIndex(listId);
    const identitySalt = jwtVc.generateSalt();

    const vc = jwtVc.buildAchievementCredential({
      credentialId: credId,
      achievementId: announcement?.id || credId,
      achievementName: claim.achievementName,
      achievementDescription: claim.achievementDescription,
      achievementType: announcement?.achievementType || 'Achievement',
      criteriaNarrative: announcement?.criteria || `Completed ${claim.achievementName} via ${claim.sourceName || claim.source}`,
      imageUrl: 'https://university.edu/badges/default-badge.png',
      imageCaption: claim.achievementName,
      studentEmail,
      studentName: student?.name,
      issuerName: claim.sourceName || claim.source || 'Academic Achievement Wallet',
      issuerDescription: `${claim.sourceName || claim.source || 'Academic Achievement Wallet'} - OB 3.0 issuer`,
      issuerUrl: keys.getState().issuerBaseUrl,
      issuerEmail: 'registrar@university.edu',
      validFromIso: issuedDate,
      validUntilIso: announcement?.expiresAt || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      statusListId: listId,
      statusListIndex: listIndex,
      statusListType: 'BitstringStatusListEntry',
      identitySalt,
      // Carry the announcement's course code as a framework alignment + course tag so the
      // LMS can match claim-based credentials too (Pre-check).
      alignment: announcement?.courseId
        ? [{
            targetName: announcement.achievementName || announcement.courseId,
            targetFramework: announcement.sourceName || announcement.source || 'LMS',
            targetCode: String(announcement.courseId),
            targetType: 'CFItem',
            targetUrl: `${keys.getState().issuerBaseUrl}/framework/${encodeURIComponent(String(announcement.courseId))}`
          }]
        : [],
      tag: announcement?.courseId ? [String(announcement.courseId)] : []
    });

    const { jwt, header, payload } = await jwtVc.signCredential(vc, { studentEmail });

    db.claims.updateStatus(claim.id, 'approved', { approvedBy: req.user.id });

    db.credentials.create({
      id: credId,
      claimId: claim.id,
      source: 'claim',
      type: 'OpenBadgeCredential',
      issuerId: vc.issuer.id,
      issuerName: vc.issuer.name,
      holderId: claim.studentId,
      achievementName: claim.achievementName,
      achievementDescription: claim.achievementDescription,
      vc,
      jwt,
      ob3Json: JSON.stringify(vc),
      statusListId: listId,
      statusListIndex: listIndex,
      identitySalt,
      status: 'issued',
      shareApproved: true,
      issuedDate
    });

    db.audit.log({ userId: req.user.id, action: 'claim_approved', detail: `Admin approved claim "${claim.achievementName}" for ${studentEmail} → JWT-VC issued (${credId})` });
    res.json({ message: 'Claim approved – JWT-VC credential issued', credentialId: credId, jwt, vc, header, payload });
  } catch (err) {
    console.error('approve-claim error:', err);
    res.status(500).json({ error: 'Failed to issue credential', detail: err.message });
  }
});

// POST /credentials/reject-claim/:id
router.post('/reject-claim/:id', requireRole('admin'), (req, res) => {
  const claim = db.claims.findById(req.params.id);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.status !== 'pending') return res.status(400).json({ error: `Already ${claim.status}` });

  db.claims.updateStatus(claim.id, 'rejected', { rejectedBy: req.user.id, adminNotes: req.body.reason || '' });
  db.audit.log({ userId: req.user.id, action: 'claim_rejected', detail: `Admin rejected claim "${claim.achievementName}" for ${claim.studentEmail}` });
  res.json({ message: 'Claim rejected' });
});

// POST /credentials/verify-upload/:id — admin verifies uploaded certificate → issues signed JWT-VC
router.post('/verify-upload/:id', requireRole('admin'), async (req, res) => {
  try {
    const uploadRec = db.uploads.findById(req.params.id);
    if (!uploadRec) return res.status(404).json({ error: 'Upload not found' });
    if (uploadRec.status !== 'pending') return res.status(400).json({ error: `Already ${uploadRec.status}` });

    const {
      achievementName,
      achievementDescription,
      achievementType,
      issuerName,
      criteria,
      imageUrl,
      tags,
      frameworkName,
      frameworkCode,
      validUntil,
      notes
    } = req.body;

    // Optional expiry (issuer-set). Accept a date string; default to no expiry when blank.
    let validUntilIso;
    if (validUntil && String(validUntil).trim()) {
      const d = new Date(String(validUntil).trim());
      if (!isNaN(d.getTime())) validUntilIso = d.toISOString();
    }

    // Tags: comma-separated string -> array. Alignment: a single framework code/name the
    // LMS matches on for Pre-check (optional, issuer-set).
    const tagArr = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : (Array.isArray(tags) ? tags : []);
    const alignmentArr = (frameworkCode && String(frameworkCode).trim())
      ? [{
          targetName: String(frameworkName || frameworkCode).trim(),
          targetFramework: String(frameworkName || '').trim() || undefined,
          targetCode: String(frameworkCode).trim(),
          targetType: 'CFItem',
          targetUrl: `${keys.getState().issuerBaseUrl}/framework/${encodeURIComponent(String(frameworkCode).trim())}`
        }]
      : [];

    const finalName = achievementName || uploadRec.certificateName;
    const finalDesc = achievementDescription || uploadRec.description || `Certificate: ${finalName}`;
    const finalIssuer = issuerName || 'Academic Achievement Wallet';
    const finalCriteria = criteria || 'Verified from uploaded certificate by administrator.';
    const finalType = achievementType || 'Certificate';
    // Issuer-controlled badge image (institution / block-week logo). Accepts an https URL
    // OR an uploaded image embedded as a data URI (png/jpeg/svg), capped in size so the
    // credential stays reasonable. Falls back to the default. The recipient never sets it.
    const DEFAULT_BADGE_IMAGE = 'https://university.edu/badges/default-badge.png';
    const MAX_IMAGE_CHARS = 700 * 1024; // ~512 KB image after base64
    const candidate = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    const isHttps = /^https:\/\//i.test(candidate);
    const isImageDataUri = /^data:image\/(png|jpe?g|svg\+xml);base64,/i.test(candidate);
    const finalImage = ((isHttps || isImageDataUri) && candidate.length <= MAX_IMAGE_CHARS)
      ? candidate
      : DEFAULT_BADGE_IMAGE;

    const credId = uuidv4();
    const issuedDate = new Date().toISOString();
    const student = db.users.findById(uploadRec.studentId);
    const studentEmail = student?.email || uploadRec.studentEmail;

    const baseUrl = keys.getState().issuerBaseUrl;
    const evidence = [];
    if (uploadRec.fileInfo) {
      evidence.push({
        id: `${baseUrl}/api/credentials/uploads/${uploadRec.id}/file`,
        type: ['Evidence'],
        name: uploadRec.fileInfo.originalName || uploadRec.certificateName,
        description: `Uploaded certificate file verified by admin. ${uploadRec.description || ''}`.trim(),
        genre: 'UploadedDocument',
        audience: 'Administration'
      });
    }

    const listId = statusList.DEFAULT_LIST_ID;
    const listIndex = statusList.nextIndex(listId);
    const identitySalt = jwtVc.generateSalt();

    const vc = jwtVc.buildAchievementCredential({
      credentialId: credId,
      achievementId: credId,
      achievementName: finalName,
      achievementDescription: finalDesc,
      achievementType: finalType,
      criteriaNarrative: finalCriteria,
      imageUrl: finalImage,
      imageCaption: finalName,
      studentEmail,
      studentName: student?.name,
      issuerName: finalIssuer,
      issuerDescription: `${finalIssuer} - OB 3.0 issuer`,
      issuerUrl: baseUrl,
      issuerEmail: 'registrar@university.edu',
      validFromIso: issuedDate,
      validUntilIso, // undefined = no expiry (academic default)
      statusListId: listId,
      statusListIndex: listIndex,
      statusListType: 'BitstringStatusListEntry',
      identitySalt,
      evidence,
      alignment: alignmentArr,
      tag: tagArr
    });

    const { jwt, header, payload } = await jwtVc.signCredential(vc, { studentEmail });

    db.uploads.updateStatus(uploadRec.id, 'verified', {
      verifiedBy: req.user.id,
      adminNotes: notes || 'Verified by admin',
      credentialId: credId
    });

    db.credentials.create({
      id: credId,
      uploadId: uploadRec.id,
      source: 'upload',
      type: 'OpenBadgeCredential',
      issuerId: vc.issuer.id,
      issuerName: vc.issuer.name,
      holderId: uploadRec.studentId,
      achievementName: finalName,
      achievementDescription: finalDesc,
      vc,
      jwt,
      ob3Json: JSON.stringify(vc),
      statusListId: listId,
      statusListIndex: listIndex,
      identitySalt,
      status: 'issued',
      shareApproved: true,
      issuedDate
    });

    db.audit.log({ userId: req.user.id, action: 'upload_verified', detail: `Admin verified upload "${uploadRec.certificateName}" for ${studentEmail} → JWT-VC issued (${credId})` });
    res.json({ message: 'Upload verified – JWT-VC credential issued', credentialId: credId, jwt, vc, header, payload });
  } catch (err) {
    console.error('verify-upload error:', err);
    res.status(500).json({ error: 'Failed to issue credential', detail: err.message });
  }
});

// POST /credentials/reject-upload/:id
router.post('/reject-upload/:id', requireRole('admin'), (req, res) => {
  const uploadRec = db.uploads.findById(req.params.id);
  if (!uploadRec) return res.status(404).json({ error: 'Upload not found' });
  if (uploadRec.status !== 'pending') return res.status(400).json({ error: `Already ${uploadRec.status}` });

  db.uploads.updateStatus(uploadRec.id, 'rejected', { rejectedBy: req.user.id, adminNotes: req.body.reason || 'Rejected by admin' });
  db.audit.log({ userId: req.user.id, action: 'upload_rejected', detail: `Admin rejected upload "${uploadRec.certificateName}" for ${uploadRec.studentEmail}` });
  res.json({ message: 'Upload rejected' });
});

// ════════════════════════════════════════════════════════════
// MOODLE BADGE IMPORT — student fetches & imports Moodle badges
// (Must be before /:id to avoid being caught by the param route)
// ════════════════════════════════════════════════════════════

// GET /credentials/moodle-badges — list student's available Moodle badges
router.get('/moodle-badges', requireRole('student'), async (req, res) => {
  try {
    // Look up this student's email in Moodle
    const moodleUser = await moodle.getUserByEmail(req.user.email);
    if (!moodleUser) {
      return res.json({ badges: [], message: 'No matching Moodle account found' });
    }

    // Fetch their badges from Moodle
    const badges = await moodle.getUserBadges(moodleUser.id);

    // Mark which ones are already imported
    const existingCreds = db.credentials.getByHolder(req.user.id);
    const importedBadgeIds = new Set(
      existingCreds
        .filter(c => c.credential?.moodleBadgeId)
        .map(c => String(c.credential.moodleBadgeId))
    );

    const badgeList = badges.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      issuername: b.issuername,
      dateissued: b.dateissued,
      dateexpire: b.dateexpire,
      imageUrl: b.badgeurl || null,
      alreadyImported: importedBadgeIds.has(String(b.id))
    }));

    res.json({ badges: badgeList, moodleUserId: moodleUser.id });
  } catch (err) {
    console.error('Moodle badge fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch badges from Moodle' });
  }
});

// POST /credentials/import-moodle-badge — student approves & imports a Moodle badge
router.post('/import-moodle-badge', requireRole('student'), async (req, res) => {
  try {
    const { badgeId, moodleUserId } = req.body;
    if (!badgeId || !moodleUserId) {
      return res.status(400).json({ error: 'badgeId and moodleUserId are required' });
    }

    // Check if already imported (normalize id type — Moodle ids may arrive as number or string)
    const existingCreds = db.credentials.getByHolder(req.user.id);
    const alreadyImported = existingCreds.find(
      c => String(c.credential?.moodleBadgeId) === String(badgeId)
    );
    if (alreadyImported) {
      return res.status(409).json({ error: 'This badge has already been imported' });
    }

    // Fetch the badge details from Moodle
    const badges = await moodle.getUserBadges(moodleUserId);
    const badge = badges.find(b => String(b.id) === String(badgeId));
    if (!badge) {
      return res.status(404).json({ error: 'Badge not found in Moodle' });
    }

    // Convert to OB 3.0 credential and sign as JWT-VC
    const credentialId = uuidv4();
    const { vc, jwt, statusListId, statusListIndex, identitySalt } = await moodle.importMoodleBadgeAsJwtVc(badge, req.user, credentialId);

    // Store in wallet DB
    const newCred = db.credentials.create({
      id: credentialId,
      holderId: req.user.id,
      title: badge.name,
      type: 'OpenBadgeCredential',
      source: 'moodle_import',
      status: 'issued',
      shareApproved: true,
      issuerId: vc.issuer.id,
      issuerName: vc.issuer.name,
      achievementName: badge.name,
      achievementDescription: badge.description,
      issuedDate: new Date(badge.dateissued * 1000).toISOString(),
      uploadedAt: new Date().toISOString(),
      vc,
      jwt,
      ob3Json: JSON.stringify(vc),
      statusListId,
      statusListIndex,
      identitySalt,
      credential: {
        ...vc,
        moodleBadgeId: badgeId
      }
    });
    db.audit.log({
      userId: req.user.id,
      action: 'moodle_badge_imported',
      detail: `Imported Moodle badge "${badge.name}" (id:${badgeId}) as credential ${credentialId}`
    });

    res.status(201).json({
      message: 'Badge imported successfully as OB 3.0 credential',
      credential: newCred
    });
  } catch (err) {
    console.error('Moodle badge import error:', err.message);
    res.status(502).json({ error: 'Failed to import badge from Moodle' });
  }
});

// ════════════════════════════════════════════════════════════
// VIEWER — search students and view their credentials
// (Must be before /:id to avoid being caught by the param route)
// ════════════════════════════════════════════════════════════

// GET /credentials/search-students?q=... — viewer searches by email/enrollment/name
router.get('/search-students', requireRole('viewer', 'admin'), (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json({ students: [] });
  const students = db.users.search(q);
  const enriched = students.map(s => ({
    ...s,
    credentialCount: db.credentials.getByHolder(s.id).length
  }));
  res.json({ students: enriched });
});

// GET /credentials/student/:id — viewer sees a student's credentials
router.get('/student/:id', requireRole('viewer', 'admin'), (req, res) => {
  const studentId = parseInt(req.params.id);
  const student = db.users.findById(studentId);
  if (!student || student.role !== 'student') return res.status(404).json({ error: 'Student not found' });

  const creds = db.credentials.getByHolder(studentId).map(c => ({
    id: c.id,
    achievementName: c.achievementName,
    issuerName: c.issuerName,
    source: c.source,
    status: c.status,
    issuedDate: c.issuedDate,
    shareApproved: c.shareApproved
  }));

  const { password, ...safe } = student;
  res.json({ student: safe, credentials: creds });
});

// ════════════════════════════════════════════════════════════
// CREDENTIALS — list, detail, share
// ════════════════════════════════════════════════════════════

// GET /credentials — list credentials (admin: all, student: own)
router.get('/', (req, res) => {
  let list;
  if (req.user.role === 'admin') {
    list = db.credentials.getAll().map(c => {
      const holder = db.users.findById(c.holderId);
      return { ...c, holderName: holder?.name, holderEmail: holder?.email, holderStudentId: holder?.studentId };
    });
  } else {
    const holder = db.users.findById(req.user.id);
    list = db.credentials.getByHolder(req.user.id).map(c => ({
      ...c, holderName: holder?.name, holderEmail: holder?.email
    }));
  }
  res.json({ credentials: list });
});

// GET /credentials/:id — credential detail + OB 3.0 JSON
router.get('/:id', (req, res) => {
  const cred = db.credentials.findById(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.holderId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'viewer') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const holder = db.users.findById(cred.holderId);
  const enriched = { ...cred, holderName: holder?.name, holderEmail: holder?.email, holderStudentId: holder?.studentId };
  const shares = db.shares.getByCredential(cred.id);
  res.json({ credential: enriched, ob3: cred.ob3Json ? JSON.parse(cred.ob3Json) : null, shares });
});

// GET /credentials/:id/jwt — download the signed JWT-VC for this credential
router.get('/:id/jwt', (req, res) => {
  const cred = db.credentials.findById(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.holderId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'viewer') {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!cred.jwt) return res.status(404).json({ error: 'JWT not available for this credential' });

  const filename = `credential-${cred.id}.jwt`;
  res.setHeader('Content-Type', 'application/jwt');
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  res.send(cred.jwt);
});

// POST /credentials/:id/revoke — admin revokes a credential (flips status list bit)
router.post('/:id/revoke', requireRole('admin'), (req, res) => {
  const cred = db.credentials.findById(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.status === 'revoked') return res.status(400).json({ error: 'Already revoked' });
  if (cred.statusListId === undefined || cred.statusListIndex === undefined) {
    return res.status(400).json({ error: 'Credential has no status list entry — cannot revoke' });
  }

  statusList.setRevoked(cred.statusListId, cred.statusListIndex, true);
  db.credentials.update(cred.id, { status: 'revoked', revokedAt: new Date().toISOString(), revokedBy: req.user.id, revokeReason: req.body.reason || null });
  db.audit.log({ userId: req.user.id, action: 'credential_revoked', detail: `Revoked credential ${cred.id} (${cred.achievementName})` });
  res.json({ message: 'Credential revoked', credentialId: cred.id });
});

// POST /credentials/:id/unrevoke — admin restores a revoked credential
router.post('/:id/unrevoke', requireRole('admin'), (req, res) => {
  const cred = db.credentials.findById(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.status !== 'revoked') return res.status(400).json({ error: 'Credential is not revoked' });

  statusList.setRevoked(cred.statusListId, cred.statusListIndex, false);
  db.credentials.update(cred.id, { status: 'issued', revokedAt: null, revokedBy: null, revokeReason: null });
  db.audit.log({ userId: req.user.id, action: 'credential_unrevoked', detail: `Restored credential ${cred.id}` });
  res.json({ message: 'Credential restored', credentialId: cred.id });
});

// POST /credentials/:id/share — student creates a share link
router.post('/:id/share', (req, res) => {
  const cred = db.credentials.findById(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.holderId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your credential' });
  }
  if (!cred.shareApproved) {
    return res.status(403).json({ error: 'This credential is not approved for sharing. Admin approval required.' });
  }

  const token = uuidv4();
  const { expiresInDays } = req.body;
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;

  db.shares.create({ id: uuidv4(), credentialId: cred.id, token, expiresAt });
  db.audit.log({ userId: req.user.id, action: 'credential_shared', detail: `Shared credential "${cred.achievementName}"` });

  res.json({ shareUrl: `/api/credentials/${cred.id}?token=${token}`, token, expiresAt });
});

module.exports = router;
