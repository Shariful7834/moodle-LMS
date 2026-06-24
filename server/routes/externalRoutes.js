const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { apiKeyMiddleware, API_KEYS } = require('../auth');
const jwtVc = require('../jwtVc');
const statusList = require('../statusList');
const keys = require('../keys');
const { safeFetch } = require('../safeFetch');

const router = express.Router();

// Resolve URLs that belong to our own issuer base over loopback, so the server can
// always verify credentials it issued — even if the public issuer URL (CDN / tunnel /
// stable domain) is temporarily unreachable. Third-party URLs are fetched unchanged.
function localizeOwnIssuerUrl(url) {
  try {
    const ownBase = (keys.getState().issuerBaseUrl || '').replace(/\/$/, '');
    if (ownBase && typeof url === 'string' && url.startsWith(ownBase)) {
      return url.replace(ownBase, `http://127.0.0.1:${process.env.PORT || 4000}`);
    }
  } catch { /* keys not init — fall through */ }
  return url;
}

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
// Share-token access → render-ready shape for the public /shared page.
// API-key access → raw OB 3.0 JSON-LD for machine consumers.
router.get('/public-credentials/:id', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const shareToken = req.query.token;

  let credential;
  let viaShare = false;

  if (shareToken) {
    const share = db.shares.findByToken(shareToken);
    if (!share || share.credentialId !== req.params.id) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }
    credential = db.credentials.findById(share.credentialId);
    if (!credential || !credential.shareApproved) {
      return res.status(403).json({ error: 'Credential not approved for sharing' });
    }
    db.shares.incrementView(shareToken);
    viaShare = true;
  } else if (apiKey && API_KEYS[apiKey]) {
    credential = db.credentials.findById(req.params.id);
  } else {
    return res.status(401).json({ error: 'API key or share token required' });
  }

  if (!credential) return res.status(404).json({ error: 'Credential not found' });
  if (credential.status !== 'issued') return res.status(403).json({ error: `Credential status: ${credential.status}` });

  const ob3 = credential.ob3Json ? JSON.parse(credential.ob3Json) : null;

  // Machine consumers (API key) get the raw OB 3.0 JSON-LD.
  if (!viaShare) return res.json(ob3);

  // Human share page gets a render-ready shape (field names match SharedCredential.jsx).
  // Include the signed JWT-VC so the viewer can independently verify authenticity.
  const holder = db.users.findById(credential.holderId);
  res.json({
    credential: {
      achievementName: credential.achievementName,
      achievementDescription: credential.achievementDescription,
      issuerName: credential.issuerName,
      issuedAt: credential.issuedDate || credential.createdAt,
      source: credential.source,
      status: credential.status,
      holderName: holder?.name || null,
      holderEmail: holder?.email || null,
      ob3Credential: ob3,
      jwt: credential.jwt || null
    },
    sharedBy: holder?.name || 'Unknown'
  });
});

// ── POST /api/verify ───────────────────────────────────────
// Accepts:
//   { credential: <JSON object | JSON string | JWT compact string> }
//   { jwt: <JWT compact string> }
//   { url: <https URL returning JWT or JSON> }
router.post('/verify', async (req, res) => {
  try {
    const { credential, jwt, url } = req.body || {};
    let input = jwt || credential || url;
    if (!input) return res.status(400).json({ error: 'Provide credential, jwt, or url' });

    // 1) URL: fetch it (SSRF-protected)
    if (url || (typeof input === 'string' && /^https?:\/\//i.test(input.trim()))) {
      const fetchUrl = localizeOwnIssuerUrl(url || input.trim());
      try {
        const r = await safeFetch(fetchUrl, { headers: { Accept: 'application/vc+jwt, application/vc+ld+json, application/jwt, application/json' } });
        if (!r.ok) return res.status(400).json({ error: `Failed to fetch ${fetchUrl} (HTTP ${r.status})` });
        input = await r.text();
      } catch (e) {
        return res.status(400).json({ error: `Fetch refused: ${e.message}` });
      }
    }

    // 2) Detect: compact JWS has exactly two dots and three base64url segments
    const looksLikeJwt = typeof input === 'string'
      && input.trim().split('.').length === 3
      && !input.trim().startsWith('{');

    let vc, jwtResult = null;
    if (looksLikeJwt) {
      jwtResult = await jwtVc.verifyJwtCredential(input.trim());
      vc = jwtResult.vc;
    } else {
      vc = typeof input === 'string' ? JSON.parse(input) : input;
    }
    if (!vc) {
      return res.json({
        verified: false,
        mode: jwtResult ? 'jwt' : 'json',
        checks: [{ name: 'parse', passed: false, message: 'Could not extract a credential payload from input' }],
        errors: jwtResult?.errors || ['No credential payload found in input']
      });
    }

    const checks = [];

    // Structural checks
    const hasContext = Array.isArray(vc['@context']) && (
      vc['@context'].includes('https://www.w3.org/ns/credentials/v2') ||
      vc['@context'].includes('https://www.w3.org/2018/credentials/v1')
    );
    checks.push({ name: 'context', passed: hasContext, message: hasContext ? 'Valid W3C VC context' : 'Missing W3C VC context' });

    const hasObContext = Array.isArray(vc['@context']) && vc['@context'].some(c => typeof c === 'string' && c.includes('purl.imsglobal.org/spec/ob/v3p0'));
    checks.push({ name: 'obContext', passed: hasObContext, message: hasObContext ? 'Valid Open Badges 3.0 context' : 'Missing OB 3.0 context' });

    const hasType = Array.isArray(vc.type) && vc.type.includes('OpenBadgeCredential') && vc.type.includes('VerifiableCredential');
    checks.push({ name: 'type', passed: hasType, message: hasType ? 'type includes VerifiableCredential + OpenBadgeCredential' : 'Missing required type values' });

    const issuerObj = typeof vc.issuer === 'string' ? { id: vc.issuer } : vc.issuer;
    const hasIssuer = !!(issuerObj && issuerObj.id);
    checks.push({ name: 'issuer', passed: hasIssuer, message: hasIssuer ? `Issuer: ${issuerObj.id}` : 'Missing issuer.id' });

    const subjectHasType = vc.credentialSubject?.type === 'AchievementSubject'
      || (Array.isArray(vc.credentialSubject?.type) && vc.credentialSubject.type.includes('AchievementSubject'));
    checks.push({ name: 'subject', passed: !!subjectHasType, message: subjectHasType ? 'AchievementSubject present' : 'Missing/invalid credentialSubject' });

    const ach = vc.credentialSubject?.achievement;
    const achievementValid = ach && ach.name && ach.criteria;
    checks.push({ name: 'achievement', passed: !!achievementValid, message: achievementValid ? `Achievement: ${ach.name}` : 'Missing/incomplete achievement' });

    const hasValidFrom = !!vc.validFrom;
    checks.push({ name: 'validFrom', passed: hasValidFrom, message: hasValidFrom ? `validFrom: ${vc.validFrom}` : 'Missing validFrom' });

    // validUntil (expiry) check
    let notExpired = true;
    if (vc.validUntil) {
      notExpired = new Date(vc.validUntil).getTime() > Date.now();
    }
    checks.push({
      name: 'expiry',
      passed: notExpired,
      message: vc.validUntil ? (notExpired ? `Not expired (validUntil: ${vc.validUntil})` : `EXPIRED on ${vc.validUntil}`) : 'No validUntil (no expiry)'
    });

    const hasSchema = Array.isArray(vc.credentialSchema) && vc.credentialSchema.length > 0;
    checks.push({ name: 'credentialSchema', passed: hasSchema, message: hasSchema ? 'credentialSchema reference present' : 'Missing credentialSchema (recommended)' });

    const identifiers = vc.credentialSubject?.identifier;
    const hasIdentifier = Array.isArray(identifiers) && identifiers.length > 0;
    const hashedOk = hasIdentifier && identifiers.every(i => i.hashed === true ? typeof i.identityHash === 'string' && i.identityHash.startsWith('sha256$') : !!i.identityHash);
    checks.push({ name: 'identifier', passed: hasIdentifier && hashedOk, message: hasIdentifier ? (hashedOk ? 'IdentityObject(s) present' : 'IdentityObject hash format invalid') : 'Missing credentialSubject.identifier' });

    // Signature check (only for JWT input)
    if (jwtResult) {
      checks.push({
        name: 'signature',
        passed: jwtResult.verified,
        message: jwtResult.verified
          ? `ES256 signature verified against ${jwtResult.header?.kid}`
          : `Signature verification failed: ${(jwtResult.errors || []).join('; ')}`
      });
      checks.push({
        name: 'didResolution',
        passed: !!jwtResult.didDocument,
        message: jwtResult.didDocument ? `Resolved DID document for ${jwtResult.issuerDid}` : `Could not resolve DID document for ${jwtResult.issuerDid || '(unknown)'}`
      });
    } else {
      checks.push({ name: 'signature', passed: false, message: 'No JWT provided — cryptographic signature could not be verified (paste JWT for full verification)' });
    }

    // Status list (revocation) check — supports BitstringStatusListEntry + StatusList2021Entry
    let statusOk = true;
    let statusMessage = 'No credentialStatus present';
    let statusListSigned = null; // tri-state: null=n/a, true/false
    const cs = vc.credentialStatus;
    const supportedStatusTypes = ['BitstringStatusListEntry', 'StatusList2021Entry'];
    if (cs && supportedStatusTypes.includes(cs.type)) {
      try {
        const listCredUrl = cs.statusListCredential;
        const idx = parseInt(cs.statusListIndex, 10);
        // Fetch JWT (default content-type) and verify signature; fallback to JSON.
        // Own-issuer status lists resolve over loopback so self-verification never
        // depends on the public issuer URL being reachable.
        const r = await safeFetch(localizeOwnIssuerUrl(listCredUrl), { headers: { Accept: 'application/vc+jwt, application/vc+ld+json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        const body = await r.text();
        let listCred;
        if (ct.includes('jwt') || (body.split('.').length === 3 && !body.trim().startsWith('{'))) {
          const verifyRes = await jwtVc.verifyJwtCredential(body.trim());
          statusListSigned = verifyRes.verified;
          listCred = verifyRes.vc;
          if (!statusListSigned) {
            throw new Error(`Status list signature invalid: ${(verifyRes.errors || []).join('; ')}`);
          }
        } else {
          statusListSigned = false;
          listCred = JSON.parse(body);
        }
        const encoded = listCred?.credentialSubject?.encodedList;
        if (!encoded) throw new Error('encodedList missing');
        const buf = statusList.decodeEncodedList(encoded);
        const byteIdx = Math.floor(idx / 8);
        const bitIdx = idx % 8;
        const revoked = (buf[byteIdx] & (1 << bitIdx)) !== 0;
        statusOk = !revoked;
        statusMessage = revoked ? `REVOKED (index ${idx} in ${listCredUrl})` : `Not revoked (index ${idx}, list ${cs.type})`;
      } catch (e) {
        statusOk = false;
        statusMessage = `Status list fetch/verify failed: ${e.message}`;
      }
    } else if (cs) {
      statusOk = false;
      statusMessage = `Unsupported credentialStatus.type: ${cs.type}`;
    }
    checks.push({ name: 'status', passed: statusOk, message: statusMessage });
    if (statusListSigned !== null) {
      checks.push({
        name: 'statusListSignature',
        passed: !!statusListSigned,
        message: statusListSigned ? 'Status list itself is a signed JWT-VC' : 'Status list is NOT a signed VC (VCDM 2.0 requires signed status list)'
      });
    }

    // Local registration (informational)
    const credUuid = vc.id?.startsWith('urn:uuid:')
      ? vc.id.replace('urn:uuid:', '')
      : (vc.id?.split('/').pop() || vc.id);
    const inDb = credUuid ? db.credentials.findById(credUuid) : null;
    checks.push({ name: 'registered', passed: !!inDb, message: inDb ? `Registered in this wallet (status: ${inDb.status})` : 'Not registered in this wallet (informational)' });

    // Core required checks (signature is core when JWT was supplied)
    const coreChecks = ['context', 'obContext', 'type', 'issuer', 'subject', 'achievement', 'validFrom', 'expiry', 'identifier', 'status'];
    if (jwtResult) coreChecks.push('signature', 'didResolution');
    const verified = checks.filter(c => coreChecks.includes(c.name)).every(c => c.passed);

    res.json({
      verified,
      mode: jwtResult ? 'jwt' : 'json',
      checks,
      credentialId: vc.id || null,
      issuerName: issuerObj?.name || issuerObj?.id || null,
      issuerDid: jwtResult?.issuerDid || (typeof issuerObj?.id === 'string' && issuerObj.id.startsWith('did:') ? issuerObj.id : null),
      achievementName: ach?.name || null,
      achievementType: Array.isArray(ach?.type) ? ach.type[0] : ach?.achievementType || null,
      jwt: jwtResult ? { header: jwtResult.header, claims: { iss: jwtResult.payload?.iss, sub: jwtResult.payload?.sub, jti: jwtResult.payload?.jti, iat: jwtResult.payload?.iat, nbf: jwtResult.payload?.nbf, exp: jwtResult.payload?.exp } } : null
    });
  } catch (e) {
    console.error('verify error:', e);
    res.status(400).json({ error: 'Verification failed', detail: e.message });
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

module.exports = router;
