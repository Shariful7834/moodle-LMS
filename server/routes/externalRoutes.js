const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { apiKeyMiddleware, API_KEYS } = require('../auth');

const router = express.Router();

// ── POST /api/announce-certificate ─────────────────────────
// Moodle announces a course certificate is available → ALL students see it
router.post('/announce-certificate', apiKeyMiddleware, (req, res) => {
  const { achievement_name, achievement_description, achievement_type, course_id, criteria, issuer_name } = req.body;
  if (!achievement_name) {
    return res.status(400).json({ error: 'achievement_name is required' });
  }

  // Prevent duplicate active announcements for same achievement from same system
  const duplicate = db.announcements.getActive().find(
    a => a.achievementName === achievement_name && a.source === req.externalSystem.system
  );
  if (duplicate) {
    return res.status(409).json({
      error: 'Duplicate announcement',
      message: `An active announcement for "${achievement_name}" already exists`,
      announcementId: duplicate.id
    });
  }

  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.announcements.create({
    id,
    source: req.externalSystem.system,
    sourceName: issuer_name || req.externalSystem.name,
    achievementName: achievement_name,
    achievementDescription: achievement_description || '',
    achievementType: achievement_type || 'OpenBadgeCredential',
    courseId: course_id || null,
    criteria: criteria || null,
    expiresAt
  });

  db.audit.log({
    action: 'announcement_created',
    detail: `${req.externalSystem.system} announced "${achievement_name}" – all students notified`
  });

  res.status(201).json({
    announcementId: id,
    message: `Certificate "${achievement_name}" announced to all students`,
    expiresAt
  });
});

// ── GET /api/announcements ─────────────────────────────────
router.get('/announcements', apiKeyMiddleware, (req, res) => {
  res.json({ announcements: db.announcements.getActive() });
});

// ── POST /api/share-credential ─────────────────────────────
// External system retrieves a shared credential from this wallet
router.post('/share-credential', apiKeyMiddleware, (req, res) => {
  const { credential_id, share_token } = req.body;
  if (!credential_id && !share_token) {
    return res.status(400).json({ error: 'credential_id or share_token required' });
  }

  let credential;
  if (share_token) {
    const share = db.shares.findByToken(share_token);
    if (!share || (share.expiresAt && new Date(share.expiresAt) < new Date())) {
      return res.status(404).json({ error: 'Invalid or expired share token' });
    }
    credential = db.credentials.findById(share.credentialId);
    db.shares.incrementView(share_token);
  } else {
    credential = db.credentials.findById(credential_id);
  }

  if (!credential) return res.status(404).json({ error: 'Credential not found' });
  if (credential.status !== 'issued') return res.status(403).json({ error: `Credential status: ${credential.status}` });
  if (!credential.shareApproved) return res.status(403).json({ error: 'Credential not approved for sharing' });

  res.json(JSON.parse(credential.ob3Json));
});

// ── GET /api/public-credentials/:id ─────────────────────────
// Returns OB 3.0 JSON-LD credential (API key OR share token)
router.get('/public-credentials/:id', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const shareToken = req.query.token;

  let credential;

  if (shareToken) {
    const share = db.shares.findByToken(shareToken);
    if (!share || (share.expiresAt && new Date(share.expiresAt) < new Date())) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }
    credential = db.credentials.findById(share.credentialId);
    if (!credential || !credential.shareApproved) {
      return res.status(403).json({ error: 'Credential not approved for sharing' });
    }
    db.shares.incrementView(shareToken);
  } else if (apiKey && API_KEYS[apiKey]) {
    credential = db.credentials.findById(req.params.id);
  } else {
    return res.status(401).json({ error: 'API key or share token required' });
  }

  if (!credential) return res.status(404).json({ error: 'Credential not found' });
  if (credential.status !== 'issued') return res.status(403).json({ error: `Credential status: ${credential.status}` });

  res.json(JSON.parse(credential.ob3Json));
});

// ── POST /api/verify ───────────────────────────────────────
router.post('/verify', (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'credential field required' });

  try {
    const data = typeof credential === 'string' ? JSON.parse(credential) : credential;
    const checks = [];

    // 1. Check @context (required by W3C VC 2.0 and OB 3.0)
    const hasContext = data['@context'] && (
      data['@context'].includes('https://www.w3.org/ns/credentials/v2') ||
      data['@context'].includes('https://www.w3.org/2018/credentials/v1')
    );
    checks.push({ name: 'context', passed: hasContext, message: hasContext ? 'Valid W3C Verifiable Credentials context' : 'Missing valid W3C VC context' });

    // 2. Check OB 3.0 context
    const hasObContext = data['@context'] && data['@context'].some(c =>
      typeof c === 'string' && c.includes('purl.imsglobal.org/spec/ob/v3p0')
    );
    checks.push({ name: 'obContext', passed: hasObContext, message: hasObContext ? 'Valid Open Badges 3.0 context' : 'Missing OB 3.0 context' });

    // 3. Check type includes OpenBadgeCredential
    const hasType = data.type && data.type.includes('OpenBadgeCredential');
    checks.push({ name: 'type', passed: hasType, message: hasType ? 'Valid OpenBadgeCredential type' : 'Missing OpenBadgeCredential type' });

    // 4. Check issuer (Profile)
    const hasIssuer = !!(data.issuer && (data.issuer.id || typeof data.issuer === 'string'));
    const issuerHasProfile = data.issuer && data.issuer.type && data.issuer.type.includes('Profile');
    checks.push({ name: 'issuer', passed: hasIssuer && issuerHasProfile, message: hasIssuer && issuerHasProfile ? 'Issuer Profile present with id and type' : 'Missing or incomplete issuer Profile' });

    // 5. Check credentialSubject
    const hasSubject = !!data.credentialSubject;
    const subjectHasType = data.credentialSubject?.type?.includes('AchievementSubject');
    checks.push({ name: 'subject', passed: hasSubject && subjectHasType, message: hasSubject && subjectHasType ? 'AchievementSubject present' : 'Missing or invalid credentialSubject' });

    // 6. Check achievement
    const hasAchievement = !!(data.credentialSubject && data.credentialSubject.achievement);
    const achievementValid = hasAchievement && data.credentialSubject.achievement.name && data.credentialSubject.achievement.criteria;
    checks.push({ name: 'achievement', passed: !!achievementValid, message: achievementValid ? 'Achievement with name and criteria present' : 'Missing or incomplete achievement' });

    // 7. Check validFrom
    const hasValidFrom = !!data.validFrom;
    checks.push({ name: 'validFrom', passed: hasValidFrom, message: hasValidFrom ? `validFrom: ${data.validFrom}` : 'Missing validFrom date' });

    // 8. Check credentialSchema (recommended for interoperability)
    const hasSchema = !!(data.credentialSchema && data.credentialSchema.length > 0);
    checks.push({ name: 'credentialSchema', passed: hasSchema, message: hasSchema ? 'credentialSchema reference present (1EdTechJsonSchemaValidator2019)' : 'Missing credentialSchema (recommended for interoperability)' });

    // 9. Check subject identifier (recommended for binding to person)
    const hasIdentifier = !!(data.credentialSubject?.identifier && data.credentialSubject.identifier.length > 0);
    checks.push({ name: 'identifier', passed: hasIdentifier, message: hasIdentifier ? 'Subject identity binding present (IdentityObject)' : 'Missing credentialSubject.identifier (recommended)' });

    // 10. Check if registered in this wallet
    const credUuid = data.id?.startsWith('urn:uuid:') ? data.id.replace('urn:uuid:', '') : data.id;
    const inDb = credUuid ? db.credentials.findById(credUuid) : null;
    checks.push({ name: 'registered', passed: !!inDb, message: inDb ? `Registered in wallet (status: ${inDb.status})` : 'Not registered in this wallet' });

    // Core checks (context, type, issuer, subject, achievement, validFrom) must all pass
    const coreChecks = ['context', 'type', 'issuer', 'subject', 'achievement', 'validFrom'];
    const verified = checks.filter(c => coreChecks.includes(c.name)).every(c => c.passed);

    res.json({
      verified,
      checks,
      credentialId: data.id || null,
      issuerName: data.issuer?.name || data.issuer?.id || null,
      achievementName: data.credentialSubject?.achievement?.name || null,
      achievementType: data.credentialSubject?.achievement?.achievementType || null
    });
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON', detail: e.message });
  }
});

// ── GET /api/health ────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Academic Achievement Wallet', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ── GET /api/info ──────────────────────────────────────────
router.get('/info', (req, res) => {
  res.json({
    name: 'Academic Achievement Wallet API',
    version: '2.0.0',
    spec: 'Open Badges 3.0 / W3C Verifiable Credentials 2.0',
    endpoints: [
      'POST /api/announce-certificate  – Moodle announces certificate (API key)',
      'GET  /api/announcements         – List active announcements (API key)',
      'POST /api/share-credential      – Fetch shared credential (API key)',
      'GET  /api/public-credentials/:id – Fetch OB 3.0 credential (API key / share token)',
      'POST /api/verify                – Verify any OB 3.0 credential',
      'GET  /api/students/search       – Search students by email/ID (API key)',
      'GET  /api/students/:id          – Get student info + credentials (API key)',
      'GET  /api/students/:id/credentials – Get student OB 3.0 credentials (API key)',
      'GET  /api/health                – Health check'
    ]
  });
});

// ════════════════════════════════════════════════════════════
// MOODLE / External: Student lookup by email or enrollment ID
// ════════════════════════════════════════════════════════════

// GET /api/students/search?q=email_or_id — Search students
router.get('/students/search', apiKeyMiddleware, (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json({ students: [] });

  const students = db.users.search(q).map(s => ({
    id: s.id,
    name: s.name,
    email: s.email,
    studentId: s.studentId,
    credentialCount: db.credentials.getByHolder(s.id).filter(c => c.status === 'issued' && c.shareApproved).length
  }));

  res.json({ students });
});

// GET /api/students/:id — Student profile + credentials summary
router.get('/students/:id', apiKeyMiddleware, (req, res) => {
  const studentId = parseInt(req.params.id);
  const student = db.users.findById(studentId);
  if (!student || student.role !== 'student') {
    return res.status(404).json({ error: 'Student not found' });
  }

  const creds = db.credentials.getByHolder(studentId)
    .filter(c => c.status === 'issued' && c.shareApproved)
    .map(c => ({
      id: c.id,
      achievementName: c.achievementName,
      issuerName: c.issuerName,
      issuedDate: c.issuedDate,
      source: c.source,
      type: c.type
    }));

  res.json({
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      studentId: student.studentId
    },
    credentials: creds,
    totalCredentials: creds.length
  });
});

// GET /api/students/:id/credentials — Full OB 3.0 JSON for all shareable credentials
router.get('/students/:id/credentials', apiKeyMiddleware, (req, res) => {
  const studentId = parseInt(req.params.id);
  const student = db.users.findById(studentId);
  if (!student || student.role !== 'student') {
    return res.status(404).json({ error: 'Student not found' });
  }

  const creds = db.credentials.getByHolder(studentId)
    .filter(c => c.status === 'issued' && c.shareApproved)
    .map(c => {
      let ob3 = null;
      try { ob3 = JSON.parse(c.ob3Json); } catch {}
      return {
        id: c.id,
        achievementName: c.achievementName,
        issuerName: c.issuerName,
        issuedDate: c.issuedDate,
        ob3Credential: ob3
      };
    });

  res.json({
    student: { id: student.id, name: student.name, email: student.email, studentId: student.studentId },
    credentials: creds
  });
});

// ── GET /api/public-credentials/:id?token=... ──────────────
// Public (no auth) – view a shared credential via share token
router.get('/public-credentials/:id', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Share token required' });

  const share = db.shares.findByToken(token);
  if (!share || share.credentialId !== req.params.id) {
    return res.status(404).json({ error: 'Share link not found or expired' });
  }
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return res.status(410).json({ error: 'This share link has expired' });
  }

  const cred = db.credentials.findById(share.credentialId);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });

  const holder = db.users.findById(cred.holderId);
  db.shares.incrementView(token);

  res.json({
    credential: {
      achievementName: cred.achievementName,
      achievementDescription: cred.achievementDescription,
      issuerName: cred.issuerName,
      issuedDate: cred.issuedDate,
      source: cred.source,
      ob3Credential: cred.ob3Json ? JSON.parse(cred.ob3Json) : null
    },
    sharedBy: holder?.name || 'Unknown'
  });
});

module.exports = router;
