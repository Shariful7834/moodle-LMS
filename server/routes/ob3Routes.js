/**
 * OB 3.0 Standard Endpoints — /ims/ob/v3p0/*
 *
 * Step 4 of Flow 1: After student grants access, Moodle uses the accessToken
 * to read credentials via the standard OB 3.0 API.
 *
 * Also provides direct API-key access for authorized external systems.
 */

const express = require('express');
const db = require('../db');
const { apiKeyMiddleware } = require('../auth');

const router = express.Router();

/**
 * Middleware: accept either accessToken (from Flow 1 grant) or API key
 */
function accessTokenOrApiKey(req, res, next) {
  // 1. Check Bearer token (access token from student approval)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const request = db.accessRequests.getByToken(token);
    if (!request) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }
    if (request.tokenExpiresAt && new Date(request.tokenExpiresAt) < new Date()) {
      return res.status(401).json({ error: 'Access token has expired' });
    }
    req.accessGrant = request;
    return next();
  }

  // 2. Fall back to API key
  const key = req.headers['x-api-key'];
  if (key) {
    return apiKeyMiddleware(req, res, next);
  }

  return res.status(401).json({ error: 'Authorization required (Bearer token or X-API-Key)' });
}

// ════════════════════════════════════════════════════════════
// GET /ims/ob/v3p0/credentials
// Returns OB 3.0 credentials for the authorized student
// ════════════════════════════════════════════════════════════
router.get('/credentials', accessTokenOrApiKey, (req, res) => {
  let credentials;

  if (req.accessGrant) {
    // Flow 1: access token from student approval — only return that student's credentials
    const studentId = req.accessGrant.studentId;
    const credentialType = req.accessGrant.credentialType;

    credentials = db.credentials.getByHolder(studentId).map(c => {
      // Return the embedded OB 3.0 JSON if available
      if (c.credential) return c.credential;
      if (c.ob3Json) {
        try { return JSON.parse(c.ob3Json); } catch { return null; }
      }
      return null;
    }).filter(Boolean);

    // Filter by credential type if specified in the request
    if (credentialType) {
      credentials = credentials.filter(c =>
        c.name?.toLowerCase().includes(credentialType.toLowerCase()) ||
        c.credentialSubject?.achievement?.name?.toLowerCase().includes(credentialType.toLowerCase()) ||
        c.credentialSubject?.achievement?.achievementType?.toLowerCase() === credentialType.toLowerCase()
      );
    }
  } else if (req.externalSystem) {
    // API key access — require student_email query param
    const email = req.query.student_email;
    if (!email) {
      return res.status(400).json({ error: 'student_email query parameter required when using API key' });
    }
    const student = db.users.findByEmail(email);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found' });
    }

    credentials = db.credentials.getByHolder(student.id).map(c => {
      if (c.credential) return c.credential;
      if (c.ob3Json) {
        try { return JSON.parse(c.ob3Json); } catch { return null; }
      }
      return null;
    }).filter(Boolean);
  } else {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Return in OB 3.0 format
  res.json({
    credentials,
    total: credentials.length
  });
});

// ════════════════════════════════════════════════════════════
// GET /ims/ob/v3p0/credentials/:id
// Returns a single OB 3.0 credential by its urn:uuid:... id
// ════════════════════════════════════════════════════════════
router.get('/credentials/:id', accessTokenOrApiKey, (req, res) => {
  const targetId = req.params.id;

  // Determine which student's credentials we can access
  let studentId;
  if (req.accessGrant) {
    studentId = req.accessGrant.studentId;
  } else if (req.externalSystem) {
    const email = req.query.student_email;
    if (!email) {
      return res.status(400).json({ error: 'student_email query parameter required' });
    }
    const student = db.users.findByEmail(email);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    studentId = student.id;
  } else {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const allCreds = db.credentials.getByHolder(studentId);
  let credential = null;

  for (const c of allCreds) {
    let ob3 = c.credential;
    if (!ob3 && c.ob3Json) {
      try { ob3 = JSON.parse(c.ob3Json); } catch { continue; }
    }
    if (!ob3) continue;

    // Match by urn:uuid:... id or by numeric wallet id
    if (ob3.id === targetId || ob3.id === `urn:uuid:${targetId}` || String(c.id) === targetId) {
      credential = ob3;
      break;
    }
  }

  if (!credential) {
    return res.status(404).json({ error: 'Credential not found' });
  }

  res.json(credential);
});

// ════════════════════════════════════════════════════════════
// GET /ims/ob/v3p0/profile
// Returns the student profile for the authorized access token
// ════════════════════════════════════════════════════════════
router.get('/profile', accessTokenOrApiKey, (req, res) => {
  let student;

  if (req.accessGrant) {
    student = db.users.findById(req.accessGrant.studentId);
  } else if (req.externalSystem) {
    const email = req.query.student_email;
    if (!email) return res.status(400).json({ error: 'student_email query parameter required' });
    student = db.users.findByEmail(email);
  }

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json({
    id: `urn:uuid:student-${student.id}`,
    type: ['Profile'],
    name: student.name,
    email: student.email,
    studentId: student.studentId
  });
});

module.exports = router;
