const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const moodle = require('../moodle');

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

    const certificateName = req.body.certificateName;
    if (!certificateName) return res.status(400).json({ error: 'certificateName is required' });

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
  res.setHeader('Content-Disposition', `inline; filename="${uploadRec.fileInfo.originalName}"`);
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

// POST /credentials/approve-claim/:id — admin approves claim → issues OB 3.0 credential
router.post('/approve-claim/:id', requireRole('admin'), (req, res) => {
  const claim = db.claims.findById(req.params.id);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.status !== 'pending') return res.status(400).json({ error: `Already ${claim.status}` });

  const issuedDate = new Date().toISOString();
  const credId = uuidv4();
  const student = db.users.findById(claim.studentId);
  const announcement = db.announcements.findById(claim.announcementId);

  // Build OB 3.0 credential following the official 1EdTech specification
  // Reference: https://www.imsglobal.org/spec/ob/v3p0/ (skillAssertionCase example)
  const ob3 = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
    ],
    id: `urn:uuid:${credId}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: claim.achievementName,
    description: claim.achievementDescription || `Credential for completing ${claim.achievementName}`,
    issuer: {
      id: "did:web:academic-wallet.local",
      type: ["Profile"],
      name: claim.sourceName || claim.source,
      description: `${claim.sourceName || claim.source} - credential issuer`,
      url: "https://university.edu",
      email: "registrar@university.edu"
    },
    validFrom: issuedDate,
    validUntil: announcement?.expiresAt || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    credentialSubject: {
      id: student?.did || `urn:uuid:${uuidv4()}`,
      type: ["AchievementSubject"],
      identifier: [{
        type: "IdentityObject",
        identityHash: student?.email || claim.studentEmail,
        identityType: "emailAddress",
        hashed: false,
        salt: "not-used"
      }],
      achievement: {
        id: `urn:uuid:${uuidv4()}`,
        type: ["Achievement"],
        achievementType: announcement?.achievementType || "Certificate",
        name: claim.achievementName,
        description: claim.achievementDescription || `Achievement: ${claim.achievementName}`,
        criteria: {
          narrative: announcement?.criteria || `Completed ${claim.achievementName} via ${claim.sourceName || claim.source}`
        },
        creator: {
          id: "did:web:academic-wallet.local",
          type: ["Profile"],
          name: claim.sourceName || claim.source,
          url: "https://university.edu"
        },
        image: {
          id: "https://university.edu/badges/default-badge.png",
          type: "Image",
          caption: claim.achievementName
        }
      },
      awardedDate: issuedDate
    },
    credentialSchema: [{
      id: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
      type: "1EdTechJsonSchemaValidator2019"
    }]
  };

  db.claims.updateStatus(claim.id, 'approved', { approvedBy: req.user.id });

  db.credentials.create({
    id: credId,
    claimId: claim.id,
    source: 'claim',
    type: 'OpenBadgeCredential',
    issuerId: ob3.issuer.id,
    issuerName: ob3.issuer.name,
    holderId: claim.studentId,
    achievementName: claim.achievementName,
    achievementDescription: claim.achievementDescription,
    ob3Json: JSON.stringify(ob3),
    status: 'issued',
    shareApproved: true,
    issuedDate
  });

  db.audit.log({ userId: req.user.id, action: 'claim_approved', detail: `Admin approved claim "${claim.achievementName}" for ${claim.studentEmail}` });
  res.json({ message: 'Claim approved – credential issued', credentialId: credId, ob3 });
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

// POST /credentials/verify-upload/:id — admin verifies uploaded certificate → issues OB 3.0 credential
// Admin reviews the uploaded file and provides achievement details to create the OB 3.0 credential
router.post('/verify-upload/:id', requireRole('admin'), (req, res) => {
  const uploadRec = db.uploads.findById(req.params.id);
  if (!uploadRec) return res.status(404).json({ error: 'Upload not found' });
  if (uploadRec.status !== 'pending') return res.status(400).json({ error: `Already ${uploadRec.status}` });

  // Admin provides these after reviewing the uploaded file
  const {
    achievementName,
    achievementDescription,
    achievementType,
    issuerName,
    criteria,
    notes
  } = req.body;

  const finalName = achievementName || uploadRec.certificateName;
  const finalDesc = achievementDescription || uploadRec.description || `Certificate: ${finalName}`;
  const finalIssuer = issuerName || 'Verified Issuer';
  const finalCriteria = criteria || `Verified from uploaded certificate by admin`;
  const finalType = achievementType || 'Certificate';

  const credId = uuidv4();
  const issuedDate = new Date().toISOString();
  const student = db.users.findById(uploadRec.studentId);

  // Build evidence from the uploaded file
  const evidenceItems = [];
  if (uploadRec.fileInfo) {
    evidenceItems.push({
      id: `urn:uuid:${uuidv4()}`,
      type: ["Evidence"],
      name: uploadRec.fileInfo.originalName || uploadRec.certificateName,
      description: `Uploaded certificate file verified by admin. ${uploadRec.description || ''}`.trim(),
      genre: "UploadedDocument",
      audience: "Administration"
    });
  }

  // Build OB 3.0 credential from admin-verified information
  // Reference: https://www.imsglobal.org/spec/ob/v3p0/ (skillAssertionCase example)
  const ob3 = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
    ],
    id: `urn:uuid:${credId}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: finalName,
    description: finalDesc,
    issuer: {
      id: "did:web:academic-wallet.local",
      type: ["Profile"],
      name: finalIssuer,
      description: `${finalIssuer} - credential issuer`,
      url: "https://university.edu",
      email: "registrar@university.edu"
    },
    validFrom: issuedDate,
    validUntil: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    credentialSubject: {
      id: student?.did || `urn:uuid:${uuidv4()}`,
      type: ["AchievementSubject"],
      identifier: [{
        type: "IdentityObject",
        identityHash: student?.email || uploadRec.studentEmail,
        identityType: "emailAddress",
        hashed: false,
        salt: "not-used"
      }],
      achievement: {
        id: `urn:uuid:${uuidv4()}`,
        type: ["Achievement"],
        achievementType: finalType,
        name: finalName,
        description: finalDesc,
        criteria: { narrative: finalCriteria },
        creator: {
          id: "did:web:academic-wallet.local",
          type: ["Profile"],
          name: finalIssuer,
          url: "https://university.edu"
        },
        image: {
          id: "https://university.edu/badges/default-badge.png",
          type: "Image",
          caption: finalName
        }
      },
      awardedDate: issuedDate
    },
    evidence: evidenceItems.length > 0 ? evidenceItems : undefined,
    credentialSchema: [{
      id: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
      type: "1EdTechJsonSchemaValidator2019"
    }]
  };

  // Remove undefined fields for clean JSON
  if (!ob3.evidence) delete ob3.evidence;

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
    issuerId: ob3.issuer.id,
    issuerName: ob3.issuer.name,
    holderId: uploadRec.studentId,
    achievementName: finalName,
    achievementDescription: finalDesc,
    ob3Json: JSON.stringify(ob3),
    status: 'issued',
    shareApproved: true,
    issuedDate
  });

  db.audit.log({ userId: req.user.id, action: 'upload_verified', detail: `Admin verified upload "${uploadRec.certificateName}" for ${uploadRec.studentEmail} → OB 3.0 credential issued` });
  res.json({ message: 'Upload verified – OB 3.0 credential issued', credentialId: credId, ob3 });
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

    // Check if already imported
    const existingCreds = db.credentials.getByHolder(req.user.id);
    const alreadyImported = existingCreds.find(
      c => c.credential?.moodleBadgeId === badgeId
    );
    if (alreadyImported) {
      return res.status(409).json({ error: 'This badge has already been imported' });
    }

    // Fetch the badge details from Moodle
    const badges = await moodle.getUserBadges(moodleUserId);
    const badge = badges.find(b => b.id === badgeId);
    if (!badge) {
      return res.status(404).json({ error: 'Badge not found in Moodle' });
    }

    // Convert to OB 3.0 credential
    const credentialId = uuidv4();
    const ob3Credential = moodle.badgeToOB3(badge, req.user, credentialId);

    // Store in wallet DB
    const allCreds = db.credentials.getAll();
    const maxId = allCreds.reduce((max, c) => Math.max(max, c.id || 0), 0);
    const newCred = db.credentials.create({
      id: maxId + 1,
      holderId: req.user.id,
      title: badge.name,
      type: 'moodle_import',
      status: 'verified',
      issuedDate: new Date(badge.dateissued * 1000).toISOString(),
      uploadedAt: new Date().toISOString(),
      credential: {
        ...ob3Credential,
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
