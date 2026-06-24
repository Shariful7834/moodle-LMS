require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const db = require('./db');
const keys = require('./keys');

const authRoutes = require('./routes/authRoutes');
const externalRoutes = require('./routes/externalRoutes');
const credentialRoutes = require('./routes/credentialRoutes');
const adminRoutes = require('./routes/adminRoutes');
const walletRoutes = require('./routes/walletRoutes');
const ob3Routes = require('./routes/ob3Routes');
const issuerRoutes = require('./routes/issuerRoutes');

const app = express();
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// ── Mandatory secrets in production ────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || 'aw-session-secret-2024-CHANGE-ME';
const JWT_SECRET_DEFAULT = 'aw-jwt-secret-2024-change-in-prod';
if (IS_PROD) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === JWT_SECRET_DEFAULT) {
    console.error('[SECURITY] JWT_SECRET must be set to a non-default value in production. Refusing to start.');
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET || SESSION_SECRET.includes('CHANGE-ME')) {
    console.error('[SECURITY] SESSION_SECRET must be set in production. Refusing to start.');
    process.exit(1);
  }
} else if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET not set — using insecure default (development only).');
}

// ── CORS allow-list ─────────────────────────────────────────
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4000', 'http://127.0.0.1:5173'];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Same-origin / curl / server-to-server (no Origin header) → allow
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes('*')) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed`), false);
  },
  credentials: true
};

// ── Middleware ──────────────────────────────────────────────
// Helmet — sane security headers (disable contentSecurityPolicy in dev so Vite works inline)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow public DID/cred fetches from anywhere
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// ── Public verifier-facing routes (open CORS, must be BEFORE strict cors middleware) ──
const publicCors = cors({ origin: '*' });

app.use('/api/badges', publicCors, issuerRoutes);

// DID document + JWKS are stable; serve them cacheable so verifiers/CDNs keep a
// working copy and key resolution survives an origin restart or slowdown.
const PUBLIC_KEY_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

app.get('/.well-known/did.json', publicCors, (req, res) => {
  res.setHeader('Cache-Control', PUBLIC_KEY_CACHE);
  res.json(keys.buildDidDocument());
});

app.get('/.well-known/jwks.json', publicCors, (req, res) => {
  res.setHeader('Cache-Control', PUBLIC_KEY_CACHE);
  const s = keys.getState();
  const pub = { kty: s.publicJwk.kty, crv: s.publicJwk.crv, x: s.publicJwk.x, y: s.publicJwk.y, alg: 'ES256', use: 'sig', kid: s.verificationMethodId };
  res.json({ keys: [pub] });
});

// ── Strict CORS for the rest (admin, student, viewer) ──────
app.use(cors(corsOptions));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PROD,
    httpOnly: true,
    sameSite: IS_PROD ? 'lax' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ── App routes ─────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api', externalRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/admin', adminRoutes);
app.use('/wallet', walletRoutes);
app.use('/ims/ob/v3p0', ob3Routes);

// ── Serve React build in production ────────────────────────
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
// SPA catch-all
app.get('*', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.sendFile(path.join(clientBuild, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Generic error handler (CORS rejection, body parser, etc.) ──
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.message?.startsWith('Origin ')) {
    return res.status(403).json({ error: err.message });
  }
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────
db.seed();

(async () => {
  try {
    await keys.init();
  } catch (err) {
    console.error('[KEYS] init failed:', err);
    process.exit(1);
  }

  const s = keys.getState();
  app.listen(PORT, () => {
    console.log(`
┌─────────────────────────────────────────────────────────┐
│     Academic Achievement Wallet – Server                │
│─────────────────────────────────────────────────────────│
│  Mode:               ${NODE_ENV}
│  API running at:     http://localhost:${PORT}              │
│  Frontend dev:       http://localhost:5173               │
│                                                         │
│  Issuer DID:         ${s.issuerDid}
│  DID document:       ${s.issuerBaseUrl}/api/badges/issuer/did.json
│                                                         │
│  Allowed CORS origins:                                  │
${ALLOWED_ORIGINS.map(o => `│    - ${o}`.padEnd(58) + '│').join('\n')}
│                                                         │
│  Demo accounts (development only — disable in prod):    │
│    admin@wallet.local     / admin123    (Admin)         │
│    student@university.edu / student123  (Student)       │
│    viewer@company.com     / viewer123   (Viewer)        │
└─────────────────────────────────────────────────────────┘
    `);
  });
})();

module.exports = app;
