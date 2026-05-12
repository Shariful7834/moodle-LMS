const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aw-jwt-secret-2024-change-in-prod';
const JWT_EXPIRES = '24h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── Express middleware ─────────────────────────────────────
function authMiddleware(req, res, next) {
  // Try Authorization header first
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7));
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Try session
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  return res.status(401).json({ error: 'Authentication required' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// ── API-key middleware for external systems ─────────────────
const API_KEYS = {
  'moodle-api-key-2024': { system: 'moodle', name: 'Moodle LMS' },
  'dee-core-api-key-2024': { system: 'dee-core', name: 'DEE Core System' },
  'test-api-key': { system: 'test', name: 'Test Client' }
};

function apiKeyMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'X-API-Key header required' });
  const info = API_KEYS[key];
  if (!info) return res.status(401).json({ error: 'Invalid API key' });
  req.externalSystem = info;
  next();
}

module.exports = {
  JWT_SECRET,
  signToken,
  verifyToken,
  authMiddleware,
  requireRole,
  apiKeyMiddleware,
  API_KEYS
};
