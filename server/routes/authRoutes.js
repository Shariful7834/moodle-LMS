const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signToken, authMiddleware } = require('../auth');

const router = express.Router();

// Protect login + register from brute force. Default 10 attempts / 15 min (strict).
// Raise via AUTH_RATE_LIMIT_MAX in .env during heavy local testing so you don't lock out.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' }
});

// POST /auth/login
router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.users.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = signToken(payload);

  req.session.user = payload;

  db.audit.log({ userId: user.id, action: 'login', detail: `${user.email} logged in` });

  res.json({ token, user: payload });
});

// POST /auth/register
router.post('/register', authLimiter, (req, res) => {
  const { email, password, name, role, studentId } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name are required' });

  if (db.users.findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

  const validRole = ['student', 'viewer'].includes(role) ? role : 'student';
  const hashed = bcrypt.hashSync(password, 10);

  const user = db.users.create({ email, password: hashed, name, role: validRole, studentId: studentId || null });
  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = signToken(payload);

  db.audit.log({ userId: user.id, action: 'register', detail: `${user.email} registered as ${validRole}` });

  res.status(201).json({ token, user: payload });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ message: 'Logged out' });
});

// GET /auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safe } = user;
  res.json({ user: safe });
});

module.exports = router;
