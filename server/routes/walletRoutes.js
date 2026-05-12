/**
 * Flow 1 — Wallet Access Request/Grant System
 *
 * From thesis slide 5:
 *   1. Admin in Moodle sends POST /wallet/access/request  → needs German B2 cert
 *   2. Wallet notifies student: "Moodle requests your cert — Approve?"
 *   3. Student approves → POST /wallet/access/grant → access token issued
 *   4. Moodle reads credential → GET /ims/ob/v3p0/credentials → signed OpenBadgeCredential
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware, requireRole, apiKeyMiddleware } = require('../auth');

const router = express.Router();

// ════════════════════════════════════════════════════════════
// STEP 1: External service (Moodle) requests access
// POST /wallet/access/request
// ════════════════════════════════════════════════════════════
router.post('/access/request', apiKeyMiddleware, (req, res) => {
  const { student_email, credential_type, message } = req.body;

  if (!student_email) {
    return res.status(400).json({ error: 'student_email is required' });
  }

  // Find the student in the wallet
  const student = db.users.findByEmail(student_email);
  if (!student || student.role !== 'student') {
    return res.status(404).json({ error: 'Student not found in wallet' });
  }

  // Check for duplicate pending request from same service for same student
  const existing = db.accessRequests.getPendingByStudent(student.id).find(
    r => r.serviceId === req.externalSystem.system && r.credentialType === (credential_type || null)
  );
  if (existing) {
    return res.status(409).json({
      error: 'A pending request already exists',
      requestId: existing.id
    });
  }

  const requestId = uuidv4();
  const request = db.accessRequests.create({
    id: requestId,
    serviceId: req.externalSystem.system,
    serviceName: req.externalSystem.name,
    studentId: student.id,
    studentEmail: student_email,
    credentialType: credential_type || null,
    message: message || `${req.externalSystem.name} requests access to your credentials`,
    status: 'pending',       // pending → approved | denied
    accessToken: null,       // set when student approves
    tokenExpiresAt: null
  });

  db.audit.log({
    action: 'access_requested',
    detail: `${req.externalSystem.name} requested access to ${student_email}'s credentials (type: ${credential_type || 'all'})`
  });

  res.status(201).json({
    requestId: request.id,
    status: 'pending',
    message: `Access request sent. Student ${student_email} will be notified.`
  });
});

// ════════════════════════════════════════════════════════════
// STEP 2: Student views pending notifications
// GET /wallet/notifications
// ════════════════════════════════════════════════════════════
router.get('/notifications', authMiddleware, requireRole('student'), (req, res) => {
  const pending = db.accessRequests.getPendingByStudent(req.user.id);
  const all = db.accessRequests.getByStudent(req.user.id);

  res.json({
    pending: pending.map(r => ({
      id: r.id,
      serviceName: r.serviceName,
      serviceId: r.serviceId,
      credentialType: r.credentialType,
      message: r.message,
      createdAt: r.createdAt
    })),
    history: all.filter(r => r.status !== 'pending').map(r => ({
      id: r.id,
      serviceName: r.serviceName,
      serviceId: r.serviceId,
      credentialType: r.credentialType,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    })),
    pendingCount: pending.length
  });
});

// ════════════════════════════════════════════════════════════
// STEP 3a: Student approves access
// POST /wallet/access/grant
// ════════════════════════════════════════════════════════════
router.post('/access/grant', authMiddleware, requireRole('student'), (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  const request = db.accessRequests.findById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Access request not found' });
  }
  if (request.studentId !== req.user.id) {
    return res.status(403).json({ error: 'This request is not for you' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request already ${request.status}` });
  }

  // Generate a secure access token (simulating OAuth 2.0 token issuance)
  const accessToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.accessRequests.update(requestId, {
    status: 'approved',
    accessToken,
    tokenExpiresAt
  });

  db.audit.log({
    userId: req.user.id,
    action: 'access_granted',
    detail: `Student approved access for ${request.serviceName} (request: ${requestId})`
  });

  res.json({
    message: 'Access granted',
    accessToken,
    tokenExpiresAt,
    requestId
  });
});

// ════════════════════════════════════════════════════════════
// STEP 3b: Student denies access
// POST /wallet/access/deny
// ════════════════════════════════════════════════════════════
router.post('/access/deny', authMiddleware, requireRole('student'), (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  const request = db.accessRequests.findById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Access request not found' });
  }
  if (request.studentId !== req.user.id) {
    return res.status(403).json({ error: 'This request is not for you' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request already ${request.status}` });
  }

  db.accessRequests.update(requestId, { status: 'denied' });

  db.audit.log({
    userId: req.user.id,
    action: 'access_denied',
    detail: `Student denied access for ${request.serviceName} (request: ${requestId})`
  });

  res.json({ message: 'Access denied', requestId });
});

// ════════════════════════════════════════════════════════════
// External service checks its own request status + retrieves token
// GET /wallet/access/status/:requestId  (API key auth)
// ════════════════════════════════════════════════════════════
router.get('/access/status/:requestId', apiKeyMiddleware, (req, res) => {
  const request = db.accessRequests.findById(req.params.requestId);
  if (!request) {
    return res.status(404).json({ error: 'Access request not found' });
  }
  // Only let the service that created the request see its status
  if (request.serviceId !== req.externalSystem.system) {
    return res.status(403).json({ error: 'Not your request' });
  }

  const result = {
    requestId: request.id,
    status: request.status,
    studentEmail: request.studentEmail,
    credentialType: request.credentialType,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };

  // Include the access token only when approved
  if (request.status === 'approved' && request.accessToken) {
    result.accessToken = request.accessToken;
    result.tokenExpiresAt = request.tokenExpiresAt;
  }

  res.json(result);
});

// ════════════════════════════════════════════════════════════
// External service lists all its requests for a student
// GET /wallet/access/requests?student_email=...  (API key auth)
// ════════════════════════════════════════════════════════════
router.get('/access/requests', apiKeyMiddleware, (req, res) => {
  const { student_email } = req.query;

  let requests = db.accessRequests.getAll
    ? db.accessRequests.getAll()
    : [];

  // Filter to this service's requests only
  requests = requests.filter(r => r.serviceId === req.externalSystem.system);

  if (student_email) {
    requests = requests.filter(r => r.studentEmail === student_email);
  }

  res.json({
    requests: requests.map(r => ({
      requestId: r.id,
      status: r.status,
      studentEmail: r.studentEmail,
      credentialType: r.credentialType,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      hasToken: r.status === 'approved' && !!r.accessToken,
      tokenExpiresAt: r.status === 'approved' ? r.tokenExpiresAt : null
    }))
  });
});

// ════════════════════════════════════════════════════════════
// Student revokes a single previously granted access request
// DELETE /wallet/access/:requestId
// ════════════════════════════════════════════════════════════
router.delete('/access/:requestId', authMiddleware, requireRole('student'), (req, res) => {
  const request = db.accessRequests.findById(req.params.requestId);

  if (!request) {
    return res.status(404).json({ error: 'Access request not found' });
  }
  if (request.studentId !== req.user.id) {
    return res.status(403).json({ error: 'This request is not yours' });
  }
  if (request.status !== 'approved') {
    return res.status(400).json({ error: `Cannot revoke a request with status: ${request.status}` });
  }

  db.accessRequests.update(request.id, { status: 'revoked', accessToken: null });

  db.audit.log({
    userId: req.user.id,
    action: 'access_revoked',
    detail: `Student revoked access for ${request.serviceName} (request: ${request.id})`
  });

  res.json({ message: `Access revoked for ${request.serviceName}`, requestId: request.id });
});

module.exports = router;
