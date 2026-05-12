const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

// GET /admin/stats
router.get('/stats', (req, res) => res.json(db.stats()));

// GET /admin/users
router.get('/users', (req, res) => res.json({ users: db.users.getAll() }));

// POST /admin/users
router.post('/users', (req, res) => {
  const { email, password, name, role, studentId } = req.body;
  if (!email || !password || !name || !role) return res.status(400).json({ error: 'Missing fields' });
  if (!['student', 'admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (db.users.findByEmail(email)) return res.status(409).json({ error: 'Email already exists' });

  const user = db.users.create({ email, password: bcrypt.hashSync(password, 10), name, role, studentId: studentId || null });
  db.audit.log({ userId: req.user.id, action: 'user_created', detail: `Created ${email} as ${role}` });
  const { password: _, ...safe } = user;
  res.status(201).json({ user: safe });
});

// DELETE /admin/users/:id
router.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.users.delete(id);
  db.audit.log({ userId: req.user.id, action: 'user_deleted', detail: `Deleted user ${id}` });
  res.json({ message: 'Deleted' });
});

// GET /admin/announcements
router.get('/announcements', (req, res) => {
  res.json({ announcements: db.announcements.getAll() });
});

// GET /admin/claims
router.get('/claims', (req, res) => {
  const list = db.claims.getAll().map(c => {
    const student = db.users.findById(c.studentId);
    return { ...c, studentName: student?.name, studentEmail: student?.email, studentId_display: student?.studentId };
  });
  res.json({ claims: list });
});

// GET /admin/uploads
router.get('/uploads', (req, res) => {
  const list = db.uploads.getAll().map(u => {
    const student = db.users.findById(u.studentId);
    return { ...u, studentName: student?.name, studentEmail: student?.email, studentId_display: student?.studentId };
  });
  res.json({ uploads: list });
});

// GET /admin/credentials
router.get('/credentials', (req, res) => {
  const list = db.credentials.getAll().map(c => {
    const holder = db.users.findById(c.holderId);
    return { ...c, holderName: holder?.name, holderEmail: holder?.email, holderStudentId: holder?.studentId };
  });
  res.json({ credentials: list });
});

// GET /admin/audit
router.get('/audit', (req, res) => {
  res.json({ logs: db.audit.getAll(parseInt(req.query.limit) || 50) });
});

module.exports = router;
