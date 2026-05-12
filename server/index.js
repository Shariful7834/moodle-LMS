const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/authRoutes');
const externalRoutes = require('./routes/externalRoutes');
const credentialRoutes = require('./routes/credentialRoutes');
const adminRoutes = require('./routes/adminRoutes');
const walletRoutes = require('./routes/walletRoutes');
const ob3Routes = require('./routes/ob3Routes');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(session({
  secret: 'aw-session-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Routes ─────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api', externalRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/admin', adminRoutes);
app.use('/wallet', walletRoutes);
app.use('/ims/ob/v3p0', ob3Routes);

// ── Serve React build in production ────────────────────────
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
// SPA catch-all: serve index.html for browser navigation requests
// API calls (Accept: application/json) that don't match any route get 404
app.get('*', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.sendFile(path.join(clientBuild, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Start ──────────────────────────────────────────────────
db.seed();

app.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────────────┐
│     Academic Achievement Wallet – Server                │
│─────────────────────────────────────────────────────────│
│  API running at:  http://localhost:${PORT}                  │
│  Frontend dev:    http://localhost:5173                  │
│                                                         │
│  Demo accounts:                                         │
│    admin@wallet.local     / admin123    (Admin)         │
│    student@university.edu / student123  (Student)       │
│    viewer@company.com     / viewer123   (Viewer)        │
│                                                         │
│  External API keys:                                     │
│    Moodle:   moodle-api-key-2024                        │
│    dee-core: dee-core-api-key-2024                      │
└─────────────────────────────────────────────────────────┘
  `);
});

module.exports = app;
